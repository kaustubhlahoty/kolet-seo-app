import Anthropic from '@anthropic-ai/sdk';
import { sql } from '@/lib/db';
import { PROMPT_ENGINEER_SYSTEM, PROMPT_ENGINEER_HUMAN_SYSTEM } from '@/lib/prompts';
import { getAdminSetting } from '@/lib/admin-settings';

export const maxDuration = 300;

const HF_PLATFORM = 'https://platform.higgsfield.ai'; // API key auth — separate billing
const HF_CLOUD    = 'https://fnf.higgsfield.ai';       // Session token auth — Ultra Plan credits

// ─── Model routing ───────────────────────────────────────────────────────────

const HUMAN_SCENE_RE = /\b(person|people|travell?er|tourist|man|woman|couple|family|crowd|market|vendor|merchant|shoppers?|bazaar|street scene|customer|visitor|portrait|face|silhouette|group|locals?|commuter|pedestrian|backpacker|passerby)\b/i;

type ImageCategory = 'human' | 'scene';

function classifyImage(description: string): ImageCategory {
  return HUMAN_SCENE_RE.test(description) ? 'human' : 'scene';
}

// ─── Auth ────────────────────────────────────────────────────────────────────

type HFAuth =
  | { mode: 'session'; token: string }                    // Ultra Plan via fnf.higgsfield.ai
  | { mode: 'apikey'; apiKey: string; apiSecret: string }; // platform.higgsfield.ai

async function getHiggsfieldAuth(): Promise<HFAuth> {
  // 1. Device-auth access token (Ultra Plan) — auto-refresh if expired
  const [accessToken, refreshToken, expiryStr] = await Promise.all([
    getAdminSetting('hf_access_token'),
    getAdminSetting('hf_refresh_token'),
    getAdminSetting('hf_token_expiry'),
  ]);

  if (accessToken) {
    const expiry = expiryStr ? parseInt(expiryStr, 10) : 0;
    const expired = expiry > 0 && Date.now() > expiry - 60_000; // refresh 1 min early

    if (!expired) return { mode: 'session', token: accessToken };

    // Try to refresh
    if (refreshToken) {
      try {
        const res = await fetch('https://fnf-device-auth.higgsfield.ai/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.access_token) {
            await Promise.all([
              sql`INSERT INTO kv_store (key, value, updated_at) VALUES ('hf_access_token', ${data.access_token}, NOW())
                        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
              data.expires_in
                ? sql`INSERT INTO kv_store (key, value, updated_at) VALUES ('hf_token_expiry', ${String(Date.now() + data.expires_in * 1000)}, NOW())
                      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`
                : Promise.resolve(),
              data.refresh_token
                ? sql`INSERT INTO kv_store (key, value, updated_at) VALUES ('hf_refresh_token', ${data.refresh_token}, NOW())
                      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`
                : Promise.resolve(),
            ]);
            return { mode: 'session', token: data.access_token };
          }
        }
      } catch {}
      // Refresh failed — fall through to API key credentials below instead of
      // retrying a token we already know is expired.
    }
  }

  // 2. Fall back to API key credentials (platform.higgsfield.ai)
  const [dbKey, dbSecret] = await Promise.all([
    getAdminSetting('higgsfield_api_key_id'),
    getAdminSetting('higgsfield_secret_key'),
  ]);
  const apiKey    = dbKey    || process.env.HIGGSFIELD_API_KEY_ID || '';
  const apiSecret = dbSecret || process.env.HIGGSFIELD_SECRET_KEY || '';
  if (!apiKey || !apiSecret) throw new Error('Higgsfield not connected. Go to Admin → Settings to connect your account.');
  return { mode: 'apikey', apiKey, apiSecret };
}

function hfHeaders(auth: HFAuth): Record<string, string> {
  if (auth.mode === 'session') {
    return { 'Authorization': `Bearer ${auth.token}`, 'Content-Type': 'application/json' };
  }
  return { 'hf-api-key': auth.apiKey, 'hf-secret': auth.apiSecret, 'Content-Type': 'application/json' };
}

// ─── Job submit / poll ───────────────────────────────────────────────────────

async function submitJob(prompt: string, auth: HFAuth): Promise<{ id: string | null; error?: string }> {
  try {
    let url: string;
    let body: object;

    if (auth.mode === 'session') {
      url = `${HF_CLOUD}/agents/jobs`;
      body = {
        job_set_type: 'text2image_soul_v2',
        params: { prompt, aspect_ratio: '16:9', quality: '2k', medias: [], reference_elements: [] },
      };
    } else {
      url = `${HF_PLATFORM}/v1/text2image/soul`;
      body = { params: { prompt, width_and_height: '2048x1152', quality: '720p', batch_size: 1 } };
    }

    const res = await fetch(url, { method: 'POST', headers: hfHeaders(auth), body: JSON.stringify(body) });
    const text = await res.text();
    if (!res.ok) {
      const snippet = text.slice(0, 300).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      return { id: null, error: `HTTP ${res.status} from ${url}: ${snippet}` };
    }
    let parsed: any;
    try { parsed = JSON.parse(text); } catch {
      return { id: null, error: `Non-JSON response from ${url}: ${text.slice(0, 200)}` };
    }

    if (auth.mode === 'session') {
      const id = Array.isArray(parsed) ? parsed[0] : (parsed?.id ?? parsed?.job_id ?? null);
      return { id };
    }
    return { id: parsed?.id ?? null };
  } catch (e: any) {
    return { id: null, error: `submitJob threw: ${e.message}` };
  }
}

async function pollJob(jobId: string, auth: HFAuth): Promise<{ url: string | null; error?: string }> {
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 5000));
    try {
      const pollUrl = auth.mode === 'session'
        ? `${HF_CLOUD}/agents/jobs/${jobId}`
        : `${HF_PLATFORM}/v1/job-sets/${jobId}`;

      const res = await fetch(pollUrl, { headers: hfHeaders(auth) });
      const data: any = await res.json();
      console.log(`poll[${i}] ${jobId}:`, JSON.stringify(data).slice(0, 300));

      if (auth.mode === 'session') {
        const status = data.status ?? data.state;
        if (status === 'completed' || status === 'done' || status === 'success') {
          const url = data.result_url ?? data.result ?? data.output_url ?? data.output?.[0]
            ?? data.results?.[0]?.url ?? data.results?.[0] ?? data.assets?.[0]?.url ?? data.assets?.[0] ?? null;
          if (url && typeof url === 'string') return { url };
          return { url: null, error: 'Job completed but no image URL returned' };
        }
        if (status === 'failed' || status === 'error') return { url: null, error: data.error ?? data.message ?? 'Job failed' };
      } else {
        const jobs: any[] = data.jobs ?? [];
        const completed = jobs.find((j: any) => j.status === 'completed');
        const failed    = jobs.find((j: any) => j.status === 'failed' || j.status === 'nsfw' || j.status === 'canceled');
        if (completed) {
          const url = completed.results?.raw?.url ?? completed.results?.min?.url ?? completed.result_url ?? null;
          if (url) return { url };
          return { url: null, error: 'Job completed but no image URL returned' };
        }
        if (failed) return { url: null, error: failed.error ?? failed.message ?? `Job ${failed.status}` };
      }
    } catch (e) { console.error('pollJob error', e); }
  }
  return { url: null, error: 'Timed out after 150s waiting for image' };
}

// ─── Prompt engineering ──────────────────────────────────────────────────────

async function refinePrompt(
  description: string,
  headline: string,
  zone: string,
  category: ImageCategory,
): Promise<string> {
  const fallback = category === 'human'
    ? `Candid travel photography of a solo traveller ${zone && zone !== 'global' ? 'exploring ' + zone : 'at an international airport'}, natural light, golden hour, authentic moment, no text anywhere, no logos, no readable signage, 16:9.`
    : `Breathtaking travel destination photo — ${zone && zone !== 'global' ? zone + ' landscape' : 'scenic coastal cliffs'}, vibrant colors, golden hour light, no text, no people, no logos, high-resolution, 16:9.`;

  if (!description || description.length < 8) return fallback;

  const systemPrompt = category === 'human' ? PROMPT_ENGINEER_HUMAN_SYSTEM : PROMPT_ENGINEER_SYSTEM;
  const guardrails = category === 'human'
    ? 'HARD RULES: No text anywhere. No SIM cards or physical SIM props. No comparison tables. No logos. Any background signage must be blurred or out-of-focus. If Kolet app UI is needed, output NEEDS_ASSET: [description] instead.'
    : 'HARD RULES: No text anywhere. No phones showing SIM card trays. No comparison tables. No text-only images. No logos. No people. If Kolet app UI is needed, output NEEDS_ASSET: [description] instead.';

  try {
    const ac = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await ac.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `Article title: ${headline}\nZone: ${zone || 'global'}\nImage description: ${description}\n${guardrails}\n\nWrite the image generation prompt:`,
      }],
    });
    return (msg.content[0] as any).text.trim();
  } catch {
    return fallback;
  }
}

// ─── Route handler ───────────────────────────────────────────────────────────

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { prompts } = await request.json();
  const encoder = new TextEncoder();
  const sse = (obj: object) => encoder.encode(`data: ${JSON.stringify(obj)}\n\n`);

  const stream = new ReadableStream({
    async start(controller) {
      const tryEnqueue = (obj: object) => { try { controller.enqueue(sse(obj)); } catch {} };

      try {
        const rows = await sql`SELECT slug, title, images FROM articles WHERE id=${id}`;
        if (!rows.length) {
          tryEnqueue({ type: 'error', message: 'Article not found' });
          controller.close();
          return;
        }
        const { slug, title, images: existingImagesRaw } = rows[0] as any;
        let existingImages: Record<string, string> = {};
        try {
          if (existingImagesRaw) {
            const parsed = JSON.parse(existingImagesRaw);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) existingImages = parsed;
          }
        } catch {}

        let auth: HFAuth;
        try {
          auth = await getHiggsfieldAuth();
        } catch (e: any) {
          tryEnqueue({ type: 'error', message: `Higgsfield auth: ${e.message}` });
          controller.close();
          return;
        }

        const classified = prompts.map(({ placeholder, prompt, description }: any) => ({
          placeholder,
          prompt,
          description: description || '',
          category: classifyImage(description || prompt || ''),
        }));

        const humanCount = classified.filter((c: any) => c.category === 'human').length;
        const sceneCount = classified.filter((c: any) => c.category === 'scene').length;
        const modeLabel  = auth.mode === 'session' ? 'Ultra Plan' : 'API key';
        tryEnqueue({
          type: 'status',
          message: `Routing ${classified.length} images via ${modeLabel} — ${humanCount > 0 ? `${humanCount} portrait` : ''}${humanCount > 0 && sceneCount > 0 ? ', ' : ''}${sceneCount > 0 ? `${sceneCount} scene` : ''}…`,
        });

        const ANGLES = ['wide establishing shot', 'close-up detail', 'medium shot', 'aerial perspective', 'ground-level perspective', 'over-the-shoulder view'];
        const TIMES  = ['golden hour', 'soft morning light', 'midday bright', 'overcast diffused light', 'blue hour dusk', 'warm afternoon sun'];
        const MOODS  = ['vibrant and energetic', 'calm and serene', 'adventurous and spontaneous', 'intimate and personal', 'bold and graphic'];

        const submitted = await Promise.all(
          classified.map(async ({ placeholder, prompt, description, category }: any, idx: number) => {
            let basePrompt = prompt || await refinePrompt(description, title || slug || '', '', category);

            if (basePrompt.startsWith('NEEDS_ASSET:')) {
              const message = basePrompt.replace(/^NEEDS_ASSET:\s*/i, '').trim();
              tryEnqueue({ type: 'needs_asset', placeholder, message });
              return null;
            }

            const angle = ANGLES[idx % ANGLES.length];
            const time  = TIMES[idx % TIMES.length];
            const mood  = MOODS[idx % MOODS.length];
            const finalPrompt = `${basePrompt} — ${angle}, ${time}, ${mood} mood.`;

            const { id: jobId, error: submitError } = await submitJob(finalPrompt, auth);
            if (jobId) {
              tryEnqueue({ type: 'status', message: `[Soul] ${placeholder} submitted (${angle})` });
            } else {
              tryEnqueue({ type: 'error', message: `Failed to submit job for ${placeholder}: ${submitError ?? 'unknown error'}` });
            }
            return jobId ? { placeholder, jobId } : null;
          })
        );

        const validJobs = submitted.filter(Boolean) as { placeholder: string; jobId: string }[];
        tryEnqueue({ type: 'status', message: `${validJobs.length}/${classified.length} jobs submitted — polling (up to 150s each)…` });

        const imageMap: Record<string, string> = {};

        await Promise.all(
          validJobs.map(async ({ placeholder, jobId }) => {
            const result = await pollJob(jobId, auth);
            if (result.url) {
              imageMap[placeholder] = result.url;
              tryEnqueue({ type: 'image', url: result.url, placeholder });
            } else {
              tryEnqueue({ type: 'error', message: `${placeholder}: ${result.error ?? 'Unknown error'}` });
            }
          })
        );

        const mergedImages = { ...existingImages, ...imageMap };
        await sql`UPDATE articles SET images=${JSON.stringify(mergedImages)} WHERE id=${id}`;
        tryEnqueue({ type: 'images_done', images: mergedImages });
      } catch (e: any) {
        tryEnqueue({ type: 'error', message: e.message });
      } finally {
        try { controller.close(); } catch {}
      }
    }
  });

  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
}

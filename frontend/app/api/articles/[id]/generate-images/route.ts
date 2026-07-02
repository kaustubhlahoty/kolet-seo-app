import Anthropic from '@anthropic-ai/sdk';
import { sql } from '@/lib/db';
import { PROMPT_ENGINEER_SYSTEM, PROMPT_ENGINEER_HUMAN_SYSTEM } from '@/lib/prompts';

export const maxDuration = 300;

const HF_API  = 'https://fnf.higgsfield.ai';
const HF_AUTH = 'https://fnf-device-auth.higgsfield.ai';

// ─── Model routing ───────────────────────────────────────────────────────────
// Human/market scenes → Higgsfield Soul 2 (photorealistic, no text)
// Everything else     → GPT Image 2 (handles text/UI well)

const HUMAN_SCENE_RE = /\b(person|people|travell?er|tourist|man|woman|couple|family|crowd|market|vendor|merchant|shoppers?|bazaar|street scene|customer|visitor|portrait|face|silhouette|group|locals?|commuter|pedestrian|backpacker|passerby)\b/i;

type ImageCategory = 'human' | 'text_ui';

function classifyImage(description: string): ImageCategory {
  return HUMAN_SCENE_RE.test(description) ? 'human' : 'text_ui';
}

function jobSetType(category: ImageCategory): string {
  return category === 'human' ? 'soul_2' : 'gpt_image_2';
}

// ─── Higgsfield auth ─────────────────────────────────────────────────────────

async function getHiggsfieldToken(): Promise<string> {
  try {
    const rows = await sql`SELECT key, value FROM kv_store WHERE key IN ('higgsfield_access_token', 'higgsfield_access_expires', 'higgsfield_refresh_token')`;
    const kv: Record<string, string> = {};
    for (const r of rows) kv[(r as any).key] = (r as any).value;

    const expiresAt = kv['higgsfield_access_expires'] ? Number(kv['higgsfield_access_expires']) : 0;
    if (kv['higgsfield_access_token'] && Date.now() < expiresAt - 5 * 60 * 1000) {
      return kv['higgsfield_access_token'];
    }

    const refreshToken = kv['higgsfield_refresh_token'] || process.env.HIGGSFIELD_REFRESH_TOKEN || '';
    if (!refreshToken) throw new Error('HIGGSFIELD_REFRESH_TOKEN not configured');

    const res = await fetch(`${HF_AUTH}/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) throw new Error(`Higgsfield auth failed: ${await res.text()}`);
    const data: any = await res.json();

    const expiresMs = Date.now() + (data.expires_in ?? 3600) * 1000;
    await sql`
      INSERT INTO kv_store (key, value, updated_at) VALUES
        ('higgsfield_access_token',   ${data.access_token},                  NOW()),
        ('higgsfield_access_expires', ${String(expiresMs)},                  NOW()),
        ('higgsfield_refresh_token',  ${data.refresh_token || refreshToken}, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `;

    return data.access_token as string;
  } catch (e: any) {
    // Fallback: refresh directly from env var
    const refreshToken = process.env.HIGGSFIELD_REFRESH_TOKEN || '';
    if (!refreshToken) throw e;
    const res = await fetch(`${HF_AUTH}/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) throw new Error(`Higgsfield auth failed: ${await res.text()}`);
    const data: any = await res.json();
    return data.access_token as string;
  }
}

// ─── Job submit / poll ───────────────────────────────────────────────────────

async function submitJob(prompt: string, category: ImageCategory, token: string): Promise<string | null> {
  try {
    const res = await fetch(`${HF_API}/agents/jobs`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job_set_type: jobSetType(category),
        params: { prompt, aspect_ratio: '16:9', quality: 'medium', resolution: '1k', medias: [], reference_elements: [] },
      }),
    });
    const body = await res.text();
    if (!res.ok) {
      console.error('submitJob failed', res.status, body);
      return null;
    }
    let parsed: any;
    try { parsed = JSON.parse(body); } catch { console.error('submitJob non-JSON:', body); return null; }
    // Higgsfield returns an array of job IDs
    if (Array.isArray(parsed)) return parsed[0] ?? null;
    // Or an object with id/job_id
    return parsed?.id ?? parsed?.job_id ?? null;
  } catch (e) { console.error('submitJob threw', e); return null; }
}

async function pollJob(jobId: string, token: string): Promise<{ url: string | null; error?: string }> {
  // Poll for up to 150 seconds (30 × 5s) — Soul 2 typically takes 60-120s
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 5000));
    try {
      const res = await fetch(`${HF_API}/agents/jobs/${jobId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const job: any = await res.json();
      console.log(`poll[${i}] ${jobId}:`, JSON.stringify(job).slice(0, 300));

      if (job.status === 'completed' || job.status === 'done' || job.status === 'success') {
        // Try every plausible field name Higgsfield might use
        const url =
          job.result_url ??
          job.result ??
          job.output_url ??
          job.output?.[0] ??
          job.results?.[0]?.url ??
          job.results?.[0] ??
          job.assets?.[0]?.url ??
          job.assets?.[0] ??
          null;
        if (url && typeof url === 'string') return { url };
        console.error('pollJob: completed but no URL found in', JSON.stringify(job));
        return { url: null, error: 'Job completed but no image URL returned' };
      }
      if (job.status === 'failed' || job.status === 'error') {
        return { url: null, error: job.error ?? job.message ?? 'Job failed' };
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
  // Fallbacks per category — used if description is too short or Claude fails
  const fallback = category === 'human'
    ? `Candid travel photography of a solo traveller ${zone && zone !== 'global' ? 'exploring ' + zone : 'at an international airport'}, natural light, golden hour, authentic moment, no text anywhere, no logos, no readable signage, 16:9.`
    : `Modern travel-tech editorial visual — smartphone on a clean surface, soft shadows, muted travel-inspired color palette, no text, no labels, no people, no logos, high-resolution, 16:9.`;

  if (!description || description.length < 8) return fallback;

  const systemPrompt = category === 'human' ? PROMPT_ENGINEER_HUMAN_SYSTEM : PROMPT_ENGINEER_SYSTEM;

  // Add hard guardrails to every user message regardless of category
  const guardrails = category === 'human'
    ? 'HARD RULES: No text anywhere. No SIM cards or physical SIM props. No random tech illustrations. No comparison tables. No logos. Any background signage must be blurred or out-of-focus. If Kolet app UI is needed, output NEEDS_ASSET: [description] instead.'
    : 'HARD RULES: No text anywhere. No phones showing SIM card trays or generic eSIM tech props. No comparison tables. No text-only images. No logos. No people. If Kolet app UI is needed, output NEEDS_ASSET: [description] instead.';

  try {
    const ac = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await ac.messages.create({
      model: 'claude-haiku-4-5-20251001',
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

        let token: string;
        try {
          token = await getHiggsfieldToken();
        } catch (e: any) {
          tryEnqueue({ type: 'error', message: `Higgsfield auth: ${e.message}` });
          controller.close();
          return;
        }

        // Classify each image and show the routing decision in status
        const classified = prompts.map(({ placeholder, prompt, description }: any) => ({
          placeholder,
          prompt,
          description: description || '',
          category: classifyImage(description || prompt || ''),
        }));

        const humanCount = classified.filter((c: any) => c.category === 'human').length;
        const textCount  = classified.filter((c: any) => c.category === 'text_ui').length;
        tryEnqueue({
          type: 'status',
          message: `Routing ${classified.length} images — ${humanCount > 0 ? `${humanCount} human (Soul 2)` : ''}${humanCount > 0 && textCount > 0 ? ', ' : ''}${textCount > 0 ? `${textCount} text/scene (GPT Image 2)` : ''}…`,
        });

        // Variation seeds so each image looks different from others
        const ANGLES = ['wide establishing shot', 'close-up detail', 'medium shot', 'aerial perspective', 'ground-level perspective', 'over-the-shoulder view'];
        const TIMES  = ['golden hour', 'soft morning light', 'midday bright', 'overcast diffused light', 'blue hour dusk', 'warm afternoon sun'];
        const MOODS  = ['vibrant and energetic', 'calm and serene', 'adventurous and spontaneous', 'intimate and personal', 'bold and graphic'];

        // Step 1 — refine prompts + submit all jobs in parallel
        const submitted = await Promise.all(
          classified.map(async ({ placeholder, prompt, description, category }: any, idx: number) => {
            let basePrompt = prompt || await refinePrompt(description, title || slug || '', '', category);

            // Claude flagged this as needing a real Kolet asset — skip generation
            if (basePrompt.startsWith('NEEDS_ASSET:')) {
              const message = basePrompt.replace(/^NEEDS_ASSET:\s*/i, '').trim();
              tryEnqueue({ type: 'needs_asset', placeholder, message });
              return null;
            }

            // Append variation hint so images don't all look the same
            const angle = ANGLES[idx % ANGLES.length];
            const time  = TIMES[idx % TIMES.length];
            const mood  = MOODS[idx % MOODS.length];
            const finalPrompt = `${basePrompt} — ${angle}, ${time}, ${mood} mood.`;

            const jobId = await submitJob(finalPrompt, category, token);
            if (jobId) {
              tryEnqueue({ type: 'status', message: `[${category === 'human' ? 'Soul 2' : 'GPT-img2'}] ${placeholder} submitted (${angle})` });
            } else {
              tryEnqueue({ type: 'error', message: `Failed to submit job for ${placeholder}` });
            }
            return jobId ? { placeholder, jobId } : null;
          })
        );

        const validJobs = submitted.filter(Boolean) as { placeholder: string; jobId: string }[];
        tryEnqueue({ type: 'status', message: `${validJobs.length}/${classified.length} jobs submitted — polling (up to 150s each)…` });

        // Step 2 — poll all jobs in parallel; emit each image as it completes
        const imageMap: Record<string, string> = {};

        await Promise.all(
          validJobs.map(async ({ placeholder, jobId }) => {
            const result = await pollJob(jobId, token);
            if (result.url) {
              imageMap[placeholder] = result.url;
              tryEnqueue({ type: 'image', url: result.url, placeholder });
            } else {
              tryEnqueue({ type: 'error', message: `${placeholder}: ${result.error ?? 'Unknown error'}` });
            }
          })
        );

        // Merge with existing images (don't erase other placeholders)
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

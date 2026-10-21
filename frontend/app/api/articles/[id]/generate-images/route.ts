import Anthropic from '@anthropic-ai/sdk';
import { sql } from '@/lib/db';
import { PROMPT_ENGINEER_SYSTEM, PROMPT_ENGINEER_HUMAN_SYSTEM } from '@/lib/prompts';
import { getAdminSetting } from '@/lib/admin-settings';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const maxDuration = 300;

const execFile = promisify(execFileCb);

const HF_PLATFORM    = 'https://platform.higgsfield.ai'; // API key auth — separate billing
const HF_CLI_BINARY  = path.join(process.cwd(), 'vendor', 'higgsfield', 'hf'); // Ultra Plan via the real CLI

// ─── Model routing ───────────────────────────────────────────────────────────

const HUMAN_SCENE_RE = /\b(person|people|travell?er|tourist|man|woman|couple|family|crowd|market|vendor|merchant|shoppers?|bazaar|street scene|customer|visitor|portrait|face|silhouette|group|locals?|commuter|pedestrian|backpacker|passerby)\b/i;

type ImageCategory = 'human' | 'scene';

function classifyImage(description: string): ImageCategory {
  return HUMAN_SCENE_RE.test(description) ? 'human' : 'scene';
}

// ─── Auth ────────────────────────────────────────────────────────────────────

type HFAuth =
  | { mode: 'session'; token: string; refreshToken: string; expiresAtSec: number } // Ultra Plan via the real `hf` CLI
  | { mode: 'apikey'; apiKey: string; apiSecret: string };                         // platform.higgsfield.ai

async function getHiggsfieldAuth(): Promise<HFAuth> {
  const [accessToken, refreshToken, expiryStr] = await Promise.all([
    getAdminSetting('hf_access_token'),
    getAdminSetting('hf_refresh_token'),
    getAdminSetting('hf_token_expiry'),
  ]);

  if (accessToken && refreshToken) {
    // hf_token_expiry is stored in epoch-ms; the CLI's own credentials file
    // uses epoch-seconds. Unknown expiry defaults to 0 (already expired) so
    // the CLI refreshes it before use rather than trusting an unknown age.
    const expiresAtSec = expiryStr ? Math.floor(parseInt(expiryStr, 10) / 1000) : 0;
    return { mode: 'session', token: accessToken, refreshToken, expiresAtSec };
  }

  // Fall back to API key credentials (platform.higgsfield.ai)
  const [dbKey, dbSecret] = await Promise.all([
    getAdminSetting('higgsfield_api_key_id'),
    getAdminSetting('higgsfield_secret_key'),
  ]);
  const apiKey    = dbKey    || process.env.HIGGSFIELD_API_KEY_ID || '';
  const apiSecret = dbSecret || process.env.HIGGSFIELD_SECRET_KEY || '';
  if (!apiKey || !apiSecret) throw new Error('Higgsfield not connected. Go to Admin → Settings to connect your account.');
  return { mode: 'apikey', apiKey, apiSecret };
}

function hfHeaders(auth: Extract<HFAuth, { mode: 'apikey' }>): Record<string, string> {
  return { 'hf-api-key': auth.apiKey, 'hf-secret': auth.apiSecret, 'Content-Type': 'application/json' };
}

// ─── Ultra Plan via the real Higgsfield CLI ─────────────────────────────────
//
// fnf.higgsfield.ai rejects a bare `Authorization: Bearer <token>` — the
// official CLI also sends undocumented headers (X-Fnf-User-Id,
// X-Fnf-Workspace-Id, X-Fnf-Surface) that aren't part of any published
// contract. Rather than reverse-engineer them, the actual `hf` binary is
// bundled (vendor/higgsfield/hf) and run as a subprocess per request, with
// per-call credentials written to a throwaway temp HOME so concurrent
// requests never collide.

type CliSession = { accessToken: string; refreshToken: string; expiresAtSec: number };

async function runHfCli(session: CliSession, args: string[], timeoutMs = 60_000): Promise<{ stdout: string; updated?: CliSession }> {
  const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'hf-home-'));
  const configDir = path.join(home, '.config', 'higgsfield');
  await fsp.mkdir(configDir, { recursive: true });
  const credentialsPath = path.join(configDir, 'credentials.json');

  await fsp.writeFile(credentialsPath, JSON.stringify({
    auth_version: 2,
    access_token: session.accessToken,
    refresh_token: session.refreshToken,
    expires_at: session.expiresAtSec,
    token_type: 'bearer',
    scope: 'email profile offline_access user:org:read',
  }));

  const workspaceId = await getAdminSetting('hf_workspace_id');
  if (workspaceId) {
    await fsp.writeFile(path.join(configDir, 'config.json'), JSON.stringify({ workspace_id: workspaceId }));
  }

  try { await fsp.chmod(HF_CLI_BINARY, 0o755); } catch {}

  try {
    const { stdout } = await execFile(HF_CLI_BINARY, [...args, '--json'], {
      env: {
        ...process.env,
        HOME: home,
        HIGGSFIELD_NO_UPDATE_CHECK: '1',
        HIGGSFIELD_DISABLE_TELEMETRY: '1',
      },
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024,
    });

    // Pick up any refresh the CLI performed so we can persist it.
    let updated: CliSession | undefined;
    try {
      const data = JSON.parse(await fsp.readFile(credentialsPath, 'utf8'));
      if (data.access_token && data.access_token !== session.accessToken) {
        updated = {
          accessToken: data.access_token,
          refreshToken: data.refresh_token ?? session.refreshToken,
          expiresAtSec: data.expires_at ?? 0,
        };
      }
    } catch {}

    return { stdout, updated };
  } finally {
    fsp.rm(home, { recursive: true, force: true }).catch(() => {});
  }
}

async function persistCliSession(session: CliSession): Promise<void> {
  await Promise.all([
    sql`INSERT INTO kv_store (key, value, updated_at) VALUES ('hf_access_token', ${session.accessToken}, NOW())
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    sql`INSERT INTO kv_store (key, value, updated_at) VALUES ('hf_refresh_token', ${session.refreshToken}, NOW())
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    sql`INSERT INTO kv_store (key, value, updated_at) VALUES ('hf_token_expiry', ${String(session.expiresAtSec * 1000)}, NOW())
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
  ]);
}

// Resolves and caches the billing workspace on first use. Every account seen
// so far exposes exactly one workspace; the first one returned is selected.
async function ensureWorkspaceSelected(session: CliSession): Promise<CliSession> {
  const existing = await getAdminSetting('hf_workspace_id');
  if (existing) return session;

  const { stdout, updated } = await runHfCli(session, ['workspace', 'list']);
  if (updated) await persistCliSession(updated);

  const workspaces = JSON.parse(stdout);
  const ws = Array.isArray(workspaces) ? workspaces[0] : null;
  if (ws?.id) {
    await sql`INSERT INTO kv_store (key, value, updated_at) VALUES ('hf_workspace_id', ${ws.id}, NOW())
              ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`;
  }
  return updated ?? session;
}

// ─── Job submit / poll ───────────────────────────────────────────────────────

async function submitJob(prompt: string, auth: HFAuth): Promise<{ id: string | null; error?: string }> {
  if (auth.mode === 'session') {
    try {
      let session: CliSession = { accessToken: auth.token, refreshToken: auth.refreshToken, expiresAtSec: auth.expiresAtSec };
      session = await ensureWorkspaceSelected(session);

      const { stdout, updated } = await runHfCli(session, [
        'generate', 'create', 'text2image_soul_v2',
        '--prompt', prompt,
        '--aspect-ratio', '16:9',
        '--quality', '2k',
      ]);
      if (updated) await persistCliSession(updated);

      const ids = JSON.parse(stdout);
      const id = Array.isArray(ids) ? ids[0] ?? null : null;
      return id ? { id } : { id: null, error: `Unexpected CLI output: ${stdout.slice(0, 200)}` };
    } catch (e: any) {
      const detail = (e.stderr || e.message || 'unknown error').toString().trim().slice(0, 300);
      return { id: null, error: `hf generate create failed: ${detail}` };
    }
  }

  try {
    const url = `${HF_PLATFORM}/v1/text2image/soul`;
    const body = { params: { prompt, width_and_height: '2048x1152', quality: '720p', batch_size: 1 } };
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
    return { id: parsed?.id ?? null };
  } catch (e: any) {
    return { id: null, error: `submitJob threw: ${e.message}` };
  }
}

async function pollJob(jobId: string, auth: HFAuth): Promise<{ url: string | null; error?: string }> {
  if (auth.mode === 'session') {
    try {
      const session: CliSession = { accessToken: auth.token, refreshToken: auth.refreshToken, expiresAtSec: auth.expiresAtSec };
      const { stdout, updated } = await runHfCli(session, ['generate', 'wait', jobId, '--timeout', '200s'], 210_000);
      if (updated) await persistCliSession(updated);

      const data = JSON.parse(stdout);
      if (data.status === 'completed') {
        const url = data.result_url ?? data.min_result_url ?? null;
        return url ? { url } : { url: null, error: 'Job completed but no image URL returned' };
      }
      return { url: null, error: data.error ?? data.message ?? `Job ${data.status ?? 'did not complete'}` };
    } catch (e: any) {
      const detail = (e.stderr || e.message || 'unknown error').toString().trim().slice(0, 300);
      return { url: null, error: `hf generate wait failed: ${detail}` };
    }
  }

  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 5000));
    try {
      const pollUrl = `${HF_PLATFORM}/v1/job-sets/${jobId}`;
      const res = await fetch(pollUrl, { headers: hfHeaders(auth) });
      const data: any = await res.json();
      console.log(`poll[${i}] ${jobId}:`, JSON.stringify(data).slice(0, 300));

      const jobs: any[] = data.jobs ?? [];
      const completed = jobs.find((j: any) => j.status === 'completed');
      const failed    = jobs.find((j: any) => j.status === 'failed' || j.status === 'nsfw' || j.status === 'canceled');
      if (completed) {
        const url = completed.results?.raw?.url ?? completed.results?.min?.url ?? completed.result_url ?? null;
        if (url) return { url };
        return { url: null, error: 'Job completed but no image URL returned' };
      }
      if (failed) return { url: null, error: failed.error ?? failed.message ?? `Job ${failed.status}` };
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

import Anthropic from '@anthropic-ai/sdk';
import { sql } from '@/lib/db';
import { PROMPT_ENGINEER_SYSTEM } from '@/lib/prompts';

export const maxDuration = 60;

const HF_API  = 'https://fnf.higgsfield.ai';
const HF_AUTH = 'https://fnf-device-auth.higgsfield.ai';

async function getHiggsfieldToken(): Promise<string> {
  let refreshToken = process.env.HIGGSFIELD_REFRESH_TOKEN || '';
  try {
    const rows = await sql`SELECT value FROM kv_store WHERE key='higgsfield_refresh_token'`;
    if (rows.length && rows[0].value) refreshToken = rows[0].value as string;
  } catch {}

  if (!refreshToken) throw new Error('HIGGSFIELD_REFRESH_TOKEN not configured');

  const res = await fetch(`${HF_AUTH}/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!res.ok) throw new Error(`Higgsfield auth failed: ${await res.text()}`);
  const data: any = await res.json();

  if (data.refresh_token) {
    try {
      await sql`
        INSERT INTO kv_store (key, value, updated_at)
        VALUES ('higgsfield_refresh_token', ${data.refresh_token}, NOW())
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
      `;
    } catch {}
  }
  return data.access_token as string;
}

async function submitJob(prompt: string, token: string): Promise<string | null> {
  try {
    const res = await fetch(`${HF_API}/agents/jobs`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job_set_type: 'gpt_image_2',
        params: { prompt, aspect_ratio: '16:9', quality: 'medium', resolution: '1k', medias: [], reference_elements: [] },
      }),
    });
    if (!res.ok) return null;
    const jobIds: string[] = await res.json();
    return jobIds[0] ?? null;
  } catch { return null; }
}

async function pollJob(jobId: string, token: string): Promise<string | null> {
  // Poll up to 50s (10 × 5s) — leaves room for submit + overhead within 60s limit
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 5000));
    try {
      const res = await fetch(`${HF_API}/agents/jobs/${jobId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const job: any = await res.json();
      if (job.status === 'completed') return job.result_url as string;
      if (job.status === 'failed') return null;
    } catch {}
  }
  return null;
}

async function refinePrompt(description: string, headline: string, zone: string): Promise<string> {
  if (!description || description.length < 8) {
    return `Solo traveller ${zone && zone !== 'global' ? 'in ' + zone : 'at an international airport'} checking smartphone for connectivity, editorial travel photography, blue and white tones, natural light, 16:9.`;
  }
  try {
    const ac = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await ac.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 250, system: PROMPT_ENGINEER_SYSTEM,
      messages: [{ role: 'user', content: `Article title: ${headline}\nZone: ${zone}\nImage description: ${description}\n\nWrite the image generation prompt:` }],
    });
    return (msg.content[0] as any).text.trim();
  } catch {
    return `Editorial travel-tech visual. Scene: ${description}. Style: modern, minimal, blue and white palette. 16:9.`;
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { prompts } = await request.json();
  const encoder = new TextEncoder();
  const sse = (obj: object) => encoder.encode(`data: ${JSON.stringify(obj)}\n\n`);

  const stream = new ReadableStream({
    async start(controller) {
      const tryEnqueue = (obj: object) => { try { controller.enqueue(sse(obj)); } catch {} };

      try {
        const rows = await sql`SELECT slug, title FROM articles WHERE id=${id}`;
        if (!rows.length) {
          tryEnqueue({ type: 'error', message: 'Article not found' });
          controller.close();
          return;
        }
        const { slug, title } = rows[0] as any;

        let token: string;
        try {
          token = await getHiggsfieldToken();
        } catch (e: any) {
          tryEnqueue({ type: 'error', message: `Higgsfield auth: ${e.message}` });
          controller.close();
          return;
        }

        tryEnqueue({ type: 'status', message: `Preparing ${prompts.length} image prompts…` });

        // Step 1 — refine prompts + submit all jobs in parallel
        const submitted = await Promise.all(
          prompts.map(async ({ placeholder, prompt, description }: any) => {
            const finalPrompt = prompt || await refinePrompt(description || '', title || slug || '', '');
            const jobId = await submitJob(finalPrompt, token);
            return jobId ? { placeholder, jobId } : null;
          })
        );

        const validJobs = submitted.filter(Boolean) as { placeholder: string; jobId: string }[];
        tryEnqueue({ type: 'status', message: `${validJobs.length} jobs submitted, polling…` });

        // Step 2 — poll all jobs in parallel; emit each image as it completes
        const imageMap: Record<string, string> = {};

        await Promise.all(
          validJobs.map(async ({ placeholder, jobId }) => {
            const url = await pollJob(jobId, token);
            if (url) {
              imageMap[placeholder] = url;
              tryEnqueue({ type: 'image', url, placeholder });
            }
          })
        );

        await sql`UPDATE articles SET images=${JSON.stringify(imageMap)} WHERE id=${id}`;
        tryEnqueue({ type: 'images_done', images: imageMap });
      } catch (e: any) {
        tryEnqueue({ type: 'error', message: e.message });
      } finally {
        try { controller.close(); } catch {}
      }
    }
  });

  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
}

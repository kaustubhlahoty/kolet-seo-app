import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { sql } from '@/lib/db';
import { QUALITY_PROMPT } from '@/lib/prompts';

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = await sql`SELECT content,title,focus_keyword FROM articles WHERE id=${id}`;
  if (!rows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { content, title, focus_keyword } = rows[0] as any;
  const kw    = (focus_keyword || '').toLowerCase();
  const words = (content || '').split(/\s+/);
  const body  = (content || '').replace(/^---\n[\s\S]*?\n---\n/, '');

  const checks = {
    kw_in_title:     kw && (title || '').toLowerCase().includes(kw),
    kw_in_first_100: kw && words.slice(0, 100).join(' ').toLowerCase().includes(kw),
    word_count_ok:   words.length > 800,
    has_h2:          /^##\s/m.test(body),
    no_bad_opener:   !/(in today's|in this article)/i.test(body.slice(0, 200)),
  };
  const seoScore = Math.round(Object.values(checks).filter(Boolean).length / Object.keys(checks).length * 100);

  let ai: any = { eeat_score: 70, verdict: 'NEEDS_REVISION', issues: [], fixes: [] };
  try {
    const ac = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await ac.messages.create({ model: 'claude-sonnet-4-6', max_tokens: 600, system: QUALITY_PROMPT, messages: [{ role: 'user', content: `Review:\n\n${(content||'').slice(0, 4000)}` }] });
    let raw = (msg.content[0] as any).text.trim();
    if (raw.startsWith('```')) { const parts = raw.split('\n'); raw = parts.slice(1, parts.at(-1) === '```' ? -1 : undefined).join('\n'); }
    ai = JSON.parse(raw.trim());
  } catch {}

  await sql`UPDATE articles SET seo_score=${seoScore},eeat_score=${ai.eeat_score||70},status=${ai.verdict==='PASS'?'reviewed':'needs_revision'} WHERE id=${id}`;

  return NextResponse.json({ seo_score: seoScore, eeat_score: ai.eeat_score||70, verdict: ai.verdict||'NEEDS_REVISION', seo_checks: checks, issues: ai.issues||[], fixes: ai.fixes||[] });
}

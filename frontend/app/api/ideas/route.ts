import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { sql } from '@/lib/db';
import { IDEAS_SYSTEM } from '@/lib/prompts';
import { randomUUID } from 'crypto';

export async function POST(request: Request) {
  const { keywords, lang = 'en' } = await request.json();
  if (!keywords?.length) return NextResponse.json({ error: 'No keywords' }, { status: 400 });

  const kwSummary = keywords.slice(0, 25).map((kw: any) =>
    `- ${kw.keyword} | vol: ${kw.volume?.toLocaleString() || 0} | comp: ${kw.competition || 0} | score: ${kw.opportunity_score || 0}`
  ).join('\n');

  try {
    const ac = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await ac.messages.create({
      model: 'claude-sonnet-4-6', max_tokens: 2500, system: IDEAS_SYSTEM,
      messages: [{ role: 'user', content: `Language: ${lang}\n\nKeywords:\n${kwSummary}\n\nGenerate 5 article topics. Return only JSON array.` }],
    });
    let raw = (msg.content[0] as any).text.trim();
    if (raw.startsWith('```')) { const parts = raw.split('\n'); raw = parts.slice(1, parts.at(-1) === '```' ? -1 : undefined).join('\n'); }

    const topics = JSON.parse(raw.trim());
    const result = [];
    for (const t of topics) {
      t.id = `topic-${randomUUID().slice(0, 8)}`;
      t.status = 'pending';
      await sql`
        INSERT INTO topics (id,headline,focus_keyword,secondary_keywords,content_format,kolet_angle,word_count,difficulty,target_zone,lang,rationale,status)
        VALUES (${t.id},${t.headline},${t.focus_keyword},${JSON.stringify(t.secondary_keywords||[])},${t.content_format},${t.kolet_angle},${t.word_count||1200},${t.difficulty},${t.target_zone||'global'},${t.lang},${t.rationale||''},'pending')
        ON CONFLICT (id) DO UPDATE SET headline=EXCLUDED.headline
      `;
      result.push(t);
    }
    return NextResponse.json({ topics: result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

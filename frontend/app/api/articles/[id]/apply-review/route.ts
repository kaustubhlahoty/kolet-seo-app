import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { sql } from '@/lib/db';

export const maxDuration = 120;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { voice_rewrites = [], fact_issues = [] } = await request.json();

  const rows = await sql`SELECT content FROM articles WHERE id = ${id}`;
  if (!rows.length) return NextResponse.json({ error: 'Article not found' }, { status: 404 });

  let content = (rows[0] as any).content || '';

  // 1. Apply voice rewrites — exact string replacement (original → suggestion)
  for (const rw of voice_rewrites) {
    if (rw.original && rw.suggestion && content.includes(rw.original)) {
      content = content.split(rw.original).join(rw.suggestion);
    }
  }

  // 2. Apply fact fixes via Claude (targeted patches only)
  if (fact_issues.length > 0) {
    const ac = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await ac.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 8000,
      messages: [{
        role: 'user',
        content: `You are editing a travel eSIM article to fix specific factual errors. Apply ONLY the targeted fixes listed below. Do NOT rewrite any other text, do NOT change structure, do NOT touch IMAGE_PLACEHOLDER tags or markdown formatting.

FACTUAL ISSUES TO FIX:
${fact_issues.map((f: any, i: number) => `${i + 1}. Problematic claim: "${f.claim}"\n   How to fix: ${f.issue}`).join('\n\n')}

FULL ARTICLE (fix only the specific claims above, leave everything else exactly as-is):
${content}

Return the COMPLETE updated article content. No preamble, no explanation.`,
      }],
    });
    const fixed = (msg.content[0] as any).text.trim();
    if (fixed && fixed.length > content.length * 0.5) content = fixed;
  }

  await sql`UPDATE articles SET content = ${content} WHERE id = ${id}`;

  return NextResponse.json({ content });
}

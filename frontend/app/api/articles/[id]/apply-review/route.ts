import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { sql } from '@/lib/db';
import { saveRevision } from '@/lib/revisions';

export const maxDuration = 300;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { voice_rewrites = [], fact_issues = [] } = await request.json();

    const rows = await sql`SELECT content FROM articles WHERE id = ${id}`;
    if (!rows.length) return NextResponse.json({ error: 'Article not found' }, { status: 404 });

    const originalContent = (rows[0] as any).content || '';
    let content = originalContent;

    for (const rw of voice_rewrites) {
      if (rw.original && rw.suggestion && content.includes(rw.original)) {
        content = content.split(rw.original).join(rw.suggestion);
      }
    }

    if (fact_issues.length > 0) {
      const ac = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const stream = await ac.messages.stream({
        model: 'claude-sonnet-4-6',
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
      const finalMsg = await stream.finalMessage();
      const fixed = (finalMsg.content[0] as { type: string; text: string }).text.trim();
      if (fixed && fixed.length > content.length * 0.5) content = fixed;
    }

    if (content !== originalContent) await saveRevision(id, originalContent, 'apply_review');
    await sql`UPDATE articles SET content = ${content} WHERE id = ${id}`;

    return NextResponse.json({ content });
  } catch (e: any) {
    console.error('[apply-review] ERROR:', e?.message, e?.stack);
    return NextResponse.json({ error: e?.message ?? 'Internal server error' }, { status: 500 });
  }
}

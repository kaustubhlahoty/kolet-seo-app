import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { sql } from '@/lib/db';

export const maxDuration = 120;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { instruction } = await request.json();

  if (!instruction?.trim()) return NextResponse.json({ error: 'instruction required' }, { status: 400 });

  const rows = await sql`SELECT content, lang, title, focus_keyword FROM articles WHERE id = ${id}`;
  if (!rows.length) return NextResponse.json({ error: 'Article not found' }, { status: 404 });

  const { content, lang, title, focus_keyword } = rows[0] as any;

  const ac = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const msg = await ac.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8000,
    system: `You are editing a Kolet eSIM travel brand article based on specific instructions.

Rules:
- Apply ONLY the changes requested in the instruction below
- Preserve the exact article structure and format (all section headers, CMS metadata lines like POST TITLE, POST CONTENT, SEO METADATA, etc.)
- Keep all IMAGE_PLACEHOLDER_xxx tags exactly as-is — never remove or modify them
- Keep all markdown formatting (headings, bold, links, lists) intact
- Keep Kolet's voice: warm, direct, like a well-travelled friend — NOT corporate
- Do NOT add unsolicited content, sections, or disclaimers
- Return the COMPLETE updated article (not just the changed parts)`,
    messages: [{
      role: 'user',
      content: `Article title: ${title}
Focus keyword: ${focus_keyword}
Language: ${lang}

INSTRUCTION: ${instruction}

FULL ARTICLE:
${content}

Apply the instruction above and return the complete updated article.`,
    }],
  });

  const updated = (msg.content[0] as any).text.trim();
  if (!updated || updated.length < content.length * 0.4) {
    return NextResponse.json({ error: 'Claude returned unexpectedly short content — changes not applied' }, { status: 500 });
  }

  await sql`UPDATE articles SET content = ${updated} WHERE id = ${id}`;
  return NextResponse.json({ content: updated });
}

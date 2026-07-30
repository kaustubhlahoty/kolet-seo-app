import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { sql } from '@/lib/db';
import { getKoletKnowledgeBrief } from '@/lib/kolet-knowledge';

export const maxDuration = 60;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { selection, instruction } = await request.json();

  if (!selection?.trim()) return NextResponse.json({ error: 'selection required' }, { status: 400 });

  const rows = await sql`SELECT content, lang, title, focus_keyword FROM articles WHERE id = ${id}`;
  if (!rows.length) return NextResponse.json({ error: 'Article not found' }, { status: 404 });

  const { content, lang, title, focus_keyword } = rows[0] as any;

  // Grab a little surrounding context so the rewrite fits grammatically, without sending the whole article
  const idx = (content || '').indexOf(selection);
  const CONTEXT_CHARS = 200;
  const before = idx > -1 ? (content as string).slice(Math.max(0, idx - CONTEXT_CHARS), idx) : '';
  const after  = idx > -1 ? (content as string).slice(idx + selection.length, idx + selection.length + CONTEXT_CHARS) : '';

  const ac = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const msg = await ac.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    system: `You are rewriting one highlighted passage inside a Kolet eSIM travel brand article (title: "${title}", focus keyword: "${focus_keyword}", language: ${lang}).

${getKoletKnowledgeBrief()}

Rules:
- Rewrite ONLY the passage inside <selection> below — never the <context_before>/<context_after> text, which is shown purely so the rewrite fits grammatically.
- Keep Kolet's voice: warm, direct, like a well-travelled friend — NOT corporate, NOT AI-sounding.
- Preserve markdown formatting present in the selection (bold, links, list markers) unless the instruction says otherwise.
- Keep the language the same as the original (${lang}).
- Unless told otherwise, keep roughly the same length.
- Never invent Kolet facts, prices, or features not in the brand facts above.
- Return ONLY the replacement text for the selection — no preamble, no quotes, no explanation, no markdown fences.`,
    messages: [{
      role: 'user',
      content: `<context_before>${before}</context_before>
<selection>${selection}</selection>
<context_after>${after}</context_after>

INSTRUCTION: ${instruction?.trim() || 'Polish this passage — improve clarity and flow without changing its meaning.'}

Return only the rewritten replacement for <selection>.`,
    }],
  });

  let replacement = (msg.content[0] as any).text.trim();
  if (replacement.startsWith('```')) {
    const lines = replacement.split('\n');
    replacement = lines.slice(1, lines.at(-1) === '```' ? -1 : undefined).join('\n').trim();
  }
  // Strip wrapping quotes Claude sometimes adds
  replacement = replacement.replace(/^["'“]([\s\S]*)["'”]$/, '$1').trim();

  if (!replacement) return NextResponse.json({ error: 'Claude returned an empty rewrite' }, { status: 500 });

  return NextResponse.json({ replacement });
}

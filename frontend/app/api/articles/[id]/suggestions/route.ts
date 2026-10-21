import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { auth } from '@/auth';
import { randomUUID } from 'crypto';
import { placeholdersPreserved } from '@/lib/image-placeholders';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = await sql`SELECT * FROM article_suggestions WHERE article_id=${id} ORDER BY created_at DESC`;
  return NextResponse.json({ suggestions: rows });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { original_text, proposed_text, source = 'direct_edit' } = await req.json().catch(() => ({}));

  if (!original_text?.trim() || !proposed_text?.trim()) {
    return NextResponse.json({ error: 'original_text and proposed_text are required' }, { status: 400 });
  }
  if (original_text === proposed_text) {
    return NextResponse.json({ error: 'No change to suggest' }, { status: 400 });
  }
  const placeholderCheck = placeholdersPreserved(original_text, proposed_text);
  if (!placeholderCheck.ok) {
    return NextResponse.json({
      error: `This edit removes an image reference (${placeholderCheck.missing.join(', ')}) — keep the placeholder intact and only change the surrounding text.`,
    }, { status: 400 });
  }

  const session = await auth();
  const author = session?.user?.name || session?.user?.email || 'Unknown';

  const suggestionId = `sug-${randomUUID().slice(0, 8)}`;
  await sql`
    INSERT INTO article_suggestions (id, article_id, source, original_text, proposed_text, author)
    VALUES (${suggestionId}, ${id}, ${source}, ${original_text}, ${proposed_text}, ${author})
  `;

  // A proposed edit is real reviewer feedback, same as a comment — flip out of the
  // "awaiting first look" state so the writer knows something needs their attention.
  await sql`UPDATE articles SET status='needs_revision' WHERE id=${id} AND status='needs_proofreading'`.catch(() => {});

  return NextResponse.json({ id: suggestionId, status: 'pending' });
}

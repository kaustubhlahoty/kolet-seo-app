import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { auth } from '@/auth';
import { saveRevision } from '@/lib/revisions';

/** Admin-only (not on the reviewer API allowlist). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string; revisionId: string }> }) {
  const { id, revisionId } = await params;

  const revisionRows = await sql`SELECT content FROM article_revisions WHERE id = ${revisionId} AND article_id = ${id}`;
  if (!revisionRows.length) return NextResponse.json({ error: 'Revision not found' }, { status: 404 });
  const { content: revisionContent } = revisionRows[0] as any;

  const articleRows = await sql`SELECT content FROM articles WHERE id = ${id}`;
  if (!articleRows.length) return NextResponse.json({ error: 'Article not found' }, { status: 404 });
  const { content: currentContent } = articleRows[0] as any;

  if (currentContent === revisionContent) {
    return NextResponse.json({ error: 'That is already the current content' }, { status: 400 });
  }

  const session = await auth();
  const author = session?.user?.name || session?.user?.email || undefined;

  // Snapshot what's live right now before overwriting — restoring is itself reversible.
  await saveRevision(id, currentContent, 'pre_restore', author);
  await sql`UPDATE articles SET content = ${revisionContent} WHERE id = ${id}`;

  return NextResponse.json({ content: revisionContent });
}

import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { auth } from '@/auth';
import { placeholdersPreserved } from '@/lib/image-placeholders';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string; suggestionId: string }> }) {
  const { id, suggestionId } = await params;

  const rows = await sql`SELECT * FROM article_suggestions WHERE id=${suggestionId} AND article_id=${id}`;
  if (!rows.length) return NextResponse.json({ error: 'Suggestion not found' }, { status: 404 });
  const suggestion = rows[0] as any;
  if (suggestion.status !== 'pending') {
    return NextResponse.json({ error: `Suggestion already ${suggestion.status}` }, { status: 400 });
  }

  const articleRows = await sql`SELECT content FROM articles WHERE id=${id}`;
  if (!articleRows.length) return NextResponse.json({ error: 'Article not found' }, { status: 404 });
  const { content } = articleRows[0] as any;

  if (!content.includes(suggestion.original_text)) {
    return NextResponse.json({
      error: 'Original text no longer found in the article — it may have changed since this suggestion was submitted.',
    }, { status: 409 });
  }

  const placeholderCheck = placeholdersPreserved(suggestion.original_text, suggestion.proposed_text);
  if (!placeholderCheck.ok) {
    return NextResponse.json({
      error: `Cannot merge — this would remove an image reference (${placeholderCheck.missing.join(', ')}).`,
    }, { status: 409 });
  }

  const updated = content.replace(suggestion.original_text, suggestion.proposed_text);
  const session = await auth();
  const resolvedBy = session?.user?.name || session?.user?.email || 'Unknown';

  await sql`UPDATE articles SET content=${updated} WHERE id=${id}`;
  await sql`UPDATE article_suggestions SET status='approved', resolved_at=NOW(), resolved_by=${resolvedBy} WHERE id=${suggestionId}`;

  return NextResponse.json({ status: 'approved', content: updated });
}

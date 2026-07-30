import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const rows = await sql`SELECT status FROM articles WHERE id=${id}`;
  if (!rows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { status } = rows[0] as any;

  if (status !== 'needs_proofreading' && status !== 'needs_revision') {
    return NextResponse.json({ error: `Cannot approve from status "${status}".` }, { status: 400 });
  }

  if (status === 'needs_revision') {
    const open = await sql`SELECT COUNT(*)::int AS n FROM article_comments WHERE article_id=${id} AND resolved = FALSE`;
    if ((open[0] as any)?.n > 0) {
      return NextResponse.json({ error: 'Resolve all open comments before approving.' }, { status: 400 });
    }
  }

  await sql`UPDATE articles SET status='approved' WHERE id=${id}`;

  return NextResponse.json({ status: 'approved', article_id: id });
}

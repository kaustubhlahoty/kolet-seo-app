import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = await sql`SELECT status FROM articles WHERE id=${id}`;
  if (!rows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { status } = rows[0] as any;
  if (!['reviewed','draft'].includes(status)) return NextResponse.json({ error: `Status is '${status}' — run audit first` }, { status: 400 });
  await sql`UPDATE articles SET status='published', published_at=NOW() WHERE id=${id}`;
  return NextResponse.json({ status: 'published', article_id: id });
}

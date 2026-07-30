import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { notifyNeedsProofreading } from '@/lib/notify';

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const rows = await sql`SELECT title, status FROM articles WHERE id=${id}`;
  if (!rows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { title, status } = rows[0] as any;

  if (status !== 'draft') {
    return NextResponse.json({ error: `Cannot send for proofreading from status "${status}".` }, { status: 400 });
  }

  await sql`UPDATE articles SET status='needs_proofreading' WHERE id=${id}`;

  await notifyNeedsProofreading({
    title: title as string,
    url: `${APP_URL}/library/${id}`,
  }).catch(() => null);

  return NextResponse.json({ status: 'needs_proofreading', article_id: id });
}

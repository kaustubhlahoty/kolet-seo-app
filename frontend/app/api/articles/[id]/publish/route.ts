import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { notifySlackPublished } from '@/lib/notify';

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const live_url: string = (body.live_url ?? '').trim();

  const rows = await sql`SELECT title, status FROM articles WHERE id=${id}`;
  if (!rows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { title, status } = rows[0] as any;

  if (status === 'published') {
    return NextResponse.json({ error: 'Already published.' }, { status: 400 });
  }
  if (status !== 'approved') {
    return NextResponse.json({ error: `Cannot publish from status "${status}" — it must be approved first.` }, { status: 400 });
  }

  await sql`ALTER TABLE articles ADD COLUMN IF NOT EXISTS published_url TEXT`;
  await sql`UPDATE articles SET status='published', published_at=NOW(), published_url=${live_url || null} WHERE id=${id}`;

  const app_url = `${APP_URL}/library/${id}`;

  await notifySlackPublished({
    title:        title as string,
    url:          app_url,
    storyblok_url: live_url || undefined,
  }).catch(() => null);

  return NextResponse.json({ status: 'published', article_id: id });
}

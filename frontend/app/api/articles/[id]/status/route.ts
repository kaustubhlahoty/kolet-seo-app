import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { notifyNeedsProofreading } from '@/lib/notify';

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');
const VALID_STATUSES = ['draft', 'needs_proofreading', 'needs_revision', 'approved', 'published'];

/**
 * PATCH /api/articles/[id]/status — manual admin override, no from-status restriction.
 * Not on the reviewer middleware whitelist, so this is implicitly admin-only.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { status } = await req.json().catch(() => ({}));

  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: `Invalid status "${status}"` }, { status: 400 });
  }

  const rows = await sql`SELECT title, status, published_at FROM articles WHERE id=${id}`;
  if (!rows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { title, published_at } = rows[0] as any;

  if (status === 'published' && !published_at) {
    await sql`UPDATE articles SET status=${status}, published_at=NOW() WHERE id=${id}`;
  } else {
    await sql`UPDATE articles SET status=${status} WHERE id=${id}`;
  }

  if (status === 'needs_proofreading') {
    await notifyNeedsProofreading({
      title: title as string,
      url: `${APP_URL}/library/${id}`,
    }).catch(() => null);
  }

  return NextResponse.json({ status, article_id: id });
}

import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; commentId: string }> }) {
  const { commentId } = await params;
  const { resolved } = await req.json();
  const rows = await sql`
    UPDATE article_comments
    SET resolved = ${resolved}, resolved_at = ${resolved ? new Date().toISOString() : null}
    WHERE id = ${commentId}
    RETURNING id, article_id, author, body, quote, created_at, resolved, resolved_at
  `;
  if (!rows.length) return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
  return NextResponse.json({ comment: rows[0] });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; commentId: string }> }) {
  const { commentId } = await params;
  await sql`DELETE FROM article_comments WHERE id = ${commentId}`;
  return NextResponse.json({ ok: true });
}

import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { auth } from '@/auth';
import { saveRevision } from '@/lib/revisions';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = await sql`SELECT * FROM articles WHERE id=${id}`;
  if (!rows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(rows[0]);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  if (body.images !== undefined) {
    await sql`UPDATE articles SET images=${JSON.stringify(body.images)} WHERE id=${id}`;
  }
  if (body.content !== undefined) {
    const rows = await sql`SELECT content FROM articles WHERE id=${id}`;
    const previous = (rows[0] as any)?.content;
    if (previous && previous !== body.content) {
      const session = await auth();
      const author = session?.user?.name || session?.user?.email || undefined;
      await saveRevision(id, previous, 'save', author);
    }
    await sql`UPDATE articles SET content=${body.content} WHERE id=${id}`;
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await sql`DELETE FROM articles WHERE id=${id}`;
  return NextResponse.json({ deleted: id });
}

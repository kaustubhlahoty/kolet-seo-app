import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = await sql`
    SELECT id, content, source, author, created_at
    FROM article_revisions
    WHERE article_id = ${id}
    ORDER BY created_at DESC
    LIMIT 50
  `;
  return NextResponse.json({ revisions: rows });
}

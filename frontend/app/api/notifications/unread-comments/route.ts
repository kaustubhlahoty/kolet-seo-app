import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function GET() {
  const rows = await sql`
    SELECT COUNT(*)::int AS count
    FROM article_comments
    WHERE resolved IS NOT TRUE
      AND parent_id IS NULL
  `;
  return NextResponse.json({ count: rows[0]?.count ?? 0 });
}

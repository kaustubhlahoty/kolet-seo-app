import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const source = searchParams.get('source');

  let rows;
  if (status && source) {
    rows = await sql`SELECT * FROM topics WHERE status = ${status} AND source = ${source} ORDER BY created_at DESC`;
  } else if (status) {
    rows = await sql`SELECT * FROM topics WHERE status = ${status} ORDER BY created_at DESC`;
  } else if (source) {
    rows = await sql`SELECT * FROM topics WHERE source = ${source} ORDER BY created_at DESC`;
  } else {
    rows = await sql`SELECT * FROM topics ORDER BY created_at DESC LIMIT 100`;
  }

  const topics = rows.map((r: any) => ({
    ...r,
    secondary_keywords: (() => {
      try { return JSON.parse(r.secondary_keywords || '[]'); } catch { return []; }
    })(),
  }));

  return NextResponse.json({ topics });
}

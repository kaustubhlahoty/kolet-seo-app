import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function POST(request: Request) {
  const { ids } = await request.json();
  const deleted: string[] = [];
  for (const id of ids) {
    await sql`DELETE FROM articles WHERE id=${id}`;
    deleted.push(id);
  }
  return NextResponse.json({ deleted });
}

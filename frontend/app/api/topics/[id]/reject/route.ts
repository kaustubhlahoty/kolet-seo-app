import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await sql`UPDATE topics SET status = 'rejected' WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}

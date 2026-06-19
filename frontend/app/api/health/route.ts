import { initDb } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  await initDb();
  return NextResponse.json({ status: 'ok' });
}

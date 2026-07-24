import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

// Keys the admin UI can write
const WRITABLE_KEYS = [
  'higgsfield_api_key_id',
  'higgsfield_secret_key',
];

// Keys we report status for (read-only for some)
const STATUS_KEYS = [
  'higgsfield_api_key_id',
  'higgsfield_secret_key',
  'hf_access_token',   // device-auth token (Ultra Plan) — written by higgsfield-auth route
  'hf_refresh_token',
];

export async function GET() {
  try {
    // Ensure kv_store exists
    await sql`CREATE TABLE IF NOT EXISTS kv_store (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW()
    )`;

    const rows = await sql`SELECT key, updated_at FROM kv_store WHERE key = ANY(${STATUS_KEYS})`;
    // Return which keys are set + when (not the values — never expose secrets to frontend)
    const configured: Record<string, { set: boolean; updated_at?: string }> = {};
    for (const key of STATUS_KEYS) {
      const row = rows.find((r: any) => r.key === key);
      configured[key] = { set: !!row, updated_at: row?.updated_at ?? undefined };
    }
    return NextResponse.json({ configured });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Ensure kv_store exists
    await sql`CREATE TABLE IF NOT EXISTS kv_store (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW()
    )`;

    const updated: string[] = [];

    for (const key of WRITABLE_KEYS) {
      const value = body[key];
      if (typeof value === 'string' && value.trim()) {
        await sql`
          INSERT INTO kv_store (key, value, updated_at)
          VALUES (${key}, ${value.trim()}, NOW())
          ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
        `;
        updated.push(key);
      }
    }

    return NextResponse.json({ updated });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

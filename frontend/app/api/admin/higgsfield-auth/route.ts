import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

const DEVICE_AUTH = 'https://fnf-device-auth.higgsfield.ai';

// GET — start a new device auth flow, return verification URL + device_code
export async function GET() {
  try {
    const res = await fetch(`${DEVICE_AUTH}/authorize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: `Auth server error: ${text}` }, { status: 502 });
    }
    const data = await res.json();
    // { device_code, verification_uri, expires_in, interval }
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST — poll for token using device_code, store on success
export async function POST(request: Request) {
  try {
    const { device_code } = await request.json();
    if (!device_code) return NextResponse.json({ error: 'device_code required' }, { status: 400 });

    const res = await fetch(`${DEVICE_AUTH}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_code }),
    });

    const data = await res.json();

    if (!res.ok) {
      // "authorization_pending" is not an error — user hasn't approved yet
      const detail = data?.detail ?? '';
      if (detail === 'authorization_pending') {
        return NextResponse.json({ status: 'pending' });
      }
      if (detail === 'expired_token') {
        return NextResponse.json({ status: 'expired' });
      }
      return NextResponse.json({ status: 'error', message: detail || 'Unknown error' });
    }

    // Success — store access_token and refresh_token
    const { access_token, refresh_token, expires_in } = data;
    if (!access_token) {
      return NextResponse.json({ status: 'error', message: 'No access token in response' });
    }

    await sql`CREATE TABLE IF NOT EXISTS kv_store (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW()
    )`;

    await Promise.all([
      sql`INSERT INTO kv_store (key, value, updated_at) VALUES ('hf_access_token', ${access_token}, NOW())
          ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      refresh_token
        ? sql`INSERT INTO kv_store (key, value, updated_at) VALUES ('hf_refresh_token', ${refresh_token}, NOW())
              ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`
        : Promise.resolve(),
      expires_in
        ? sql`INSERT INTO kv_store (key, value, updated_at) VALUES ('hf_token_expiry', ${String(Date.now() + expires_in * 1000)}, NOW())
              ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`
        : Promise.resolve(),
    ]);

    return NextResponse.json({ status: 'connected' });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

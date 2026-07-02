import { NextResponse } from 'next/server';

export const maxDuration = 60;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const base = process.env.NEXT_PUBLIC_APP_URL || 'https://kolet-seo-app.vercel.app';
  const res = await fetch(`${base}/api/suggestions/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lang: 'en', count: 7 }),
  });

  if (!res.ok) {
    return NextResponse.json({ error: `Generate failed: ${res.status}` }, { status: 500 });
  }

  const data = await res.json();
  return NextResponse.json({ ok: true, count: data.topics?.length ?? 0, generated_at: data.generated_at });
}

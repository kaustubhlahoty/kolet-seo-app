import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const keyword    = searchParams.get('keyword') || '';
  const article_id = searchParams.get('article_id') || '';

  const rows = article_id
    ? await sql`SELECT id,title,slug,focus_keyword,lang,status FROM articles WHERE id != ${article_id}`
    : await sql`SELECT id,title,slug,focus_keyword,lang,status FROM articles`;

  const kwLower = keyword.toLowerCase().trim();
  const kwWords = new Set(kwLower.split(' '));

  const similar = (rows as any[]).filter(r => {
    const existing = (r.focus_keyword || '').toLowerCase().trim();
    if (!existing) return false;
    if (existing === kwLower) { r.match_type = 'exact'; return true; }
    const exWords = new Set(existing.split(' '));
    const intersection = [...kwWords].filter(w => exWords.has(w)).length;
    const union = new Set([...kwWords, ...exWords]).size;
    if (union && intersection / union >= 0.6) { r.match_type = 'similar'; return true; }
    return false;
  });

  return NextResponse.json({ similar });
}

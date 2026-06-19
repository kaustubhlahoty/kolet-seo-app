import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const lang   = searchParams.get('lang');

  let rows;
  if (status && lang) {
    rows = await sql`SELECT id,topic_id,title,slug,lang,focus_keyword,target_zone,status,meta_description,seo_score,eeat_score,images,drive_url,created_at,published_at FROM articles WHERE status=${status} AND lang=${lang} ORDER BY created_at DESC`;
  } else if (status) {
    rows = await sql`SELECT id,topic_id,title,slug,lang,focus_keyword,target_zone,status,meta_description,seo_score,eeat_score,images,drive_url,created_at,published_at FROM articles WHERE status=${status} ORDER BY created_at DESC`;
  } else if (lang) {
    rows = await sql`SELECT id,topic_id,title,slug,lang,focus_keyword,target_zone,status,meta_description,seo_score,eeat_score,images,drive_url,created_at,published_at FROM articles WHERE lang=${lang} ORDER BY created_at DESC`;
  } else {
    rows = await sql`SELECT id,topic_id,title,slug,lang,focus_keyword,target_zone,status,meta_description,seo_score,eeat_score,images,drive_url,created_at,published_at FROM articles ORDER BY created_at DESC`;
  }
  return NextResponse.json({ articles: rows });
}

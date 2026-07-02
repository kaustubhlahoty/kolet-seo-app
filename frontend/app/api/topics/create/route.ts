import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { randomUUID } from 'crypto';

export async function POST(request: Request) {
  const body = await request.json();
  const {
    headline, focus_keyword, secondary_keywords = [],
    content_format = 'comparison', kolet_angle = '',
    word_count = 1200, difficulty = 'Medium',
    target_zone = 'global', lang = 'en',
    rationale = '', source = 'manual',
  } = body;

  if (!headline || !focus_keyword) {
    return NextResponse.json({ error: 'headline and focus_keyword required' }, { status: 400 });
  }

  const id = `topic-${randomUUID().slice(0, 8)}`;
  await sql`
    INSERT INTO topics (id,headline,focus_keyword,secondary_keywords,content_format,kolet_angle,word_count,difficulty,target_zone,lang,rationale,status,source)
    VALUES (${id},${headline},${focus_keyword},${JSON.stringify(secondary_keywords)},${content_format},${kolet_angle},${word_count},${difficulty},${target_zone},${lang},${rationale},${'pending'},${source})
  `;

  return NextResponse.json({ id, headline, focus_keyword, secondary_keywords, content_format, kolet_angle, word_count, difficulty, target_zone, lang, rationale, status: 'pending', source });
}

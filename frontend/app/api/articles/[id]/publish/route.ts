import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = await sql`SELECT status, content, eeat_score FROM articles WHERE id=${id}`;
  if (!rows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { status, content, eeat_score } = rows[0] as any;

  // Must be reviewed before publishing
  if (status !== 'reviewed') {
    return NextResponse.json(
      { error: `Cannot publish: status is '${status}'. Run the audit review first.` },
      { status: 400 }
    );
  }

  // Block if unresolved image placeholders remain
  if (content && /IMAGE_PLACEHOLDER_/i.test(content)) {
    return NextResponse.json(
      { error: 'Cannot publish: article still contains unresolved IMAGE_PLACEHOLDERs. Generate images first.' },
      { status: 400 }
    );
  }

  // Warn (but don't block) if eeat score is below threshold
  const warnings: string[] = [];
  if (eeat_score !== null && eeat_score < 60) {
    warnings.push(`Low quality score (${eeat_score}/100) — consider a rewrite before publishing.`);
  }

  await sql`UPDATE articles SET status='published', published_at=NOW() WHERE id=${id}`;
  return NextResponse.json({ status: 'published', article_id: id, warnings });
}

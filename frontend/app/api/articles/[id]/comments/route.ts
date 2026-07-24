import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { notifyNewComment } from '@/lib/notify';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await sql`ALTER TABLE article_comments ADD COLUMN IF NOT EXISTS parent_id UUID`;
  const rows = await sql`
    SELECT id, article_id, author, body, quote, created_at, resolved, resolved_at, parent_id
    FROM article_comments
    WHERE article_id = ${id}
    ORDER BY created_at ASC
  `;
  return NextResponse.json({ comments: rows });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { author, body, quote = '', parent_id = null } = await req.json();
  if (!body?.trim()) return NextResponse.json({ error: 'Comment body is required' }, { status: 400 });

  await sql`ALTER TABLE article_comments ADD COLUMN IF NOT EXISTS parent_id UUID`;

  const rows = await sql`
    INSERT INTO article_comments (article_id, author, body, quote, parent_id)
    VALUES (${id}, ${(author || 'Anonymous').trim()}, ${body.trim()}, ${quote.trim()}, ${parent_id})
    RETURNING id, article_id, author, body, quote, created_at, resolved, resolved_at, parent_id
  `;
  const comment = rows[0];

  // Only notify for top-level comments (replies don't need a separate email)
  try {
    if (!parent_id) {
      const articles = await sql`SELECT title FROM articles WHERE id = ${id} LIMIT 1`;
      const title = (articles[0]?.title as string) ?? 'Untitled';
      await notifyNewComment({
        articleId:    id,
        articleTitle: title,
        author:       comment.author as string,
        body:         comment.body as string,
        quote:        comment.quote as string | undefined,
      });
    }
  } catch {
    // Never let notification errors fail the comment save
  }

  return NextResponse.json({ comment });
}

import { sql } from '@/lib/db';
import { randomUUID } from 'crypto';

/**
 * Snapshot content BEFORE it gets overwritten. Call this with the current
 * (about-to-be-replaced) content, never the new value — the point is to be
 * able to go back to what it was.
 */
export async function saveRevision(articleId: string, content: string, source: string, author?: string) {
  if (!content) return;
  const id = `rev-${randomUUID().slice(0, 8)}`;
  await sql`
    INSERT INTO article_revisions (id, article_id, content, source, author)
    VALUES (${id}, ${articleId}, ${content}, ${source}, ${author ?? null})
  `.catch(err => console.error('[revisions] failed to save snapshot:', err?.message));
}

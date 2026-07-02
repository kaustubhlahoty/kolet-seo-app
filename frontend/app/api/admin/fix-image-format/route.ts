import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

/**
 * POST /api/admin/fix-image-format
 *
 * One-shot migration: converts broken image notation in all article content
 * from the old bracket style to proper markdown image syntax.
 *
 * Old (broken):  [IMAGE_PLACEHOLDER_name — description]
 *                [https://url — description]
 * New (correct): ![description](IMAGE_PLACEHOLDER_name)
 *                ![description](https://url)
 */

function fixImageFormat(content: string): string {
  // Pattern 1: [IMAGE_PLACEHOLDER_name — description] (placeholder not yet replaced)
  // → ![description](IMAGE_PLACEHOLDER_name)
  let fixed = content.replace(
    /\[(IMAGE_PLACEHOLDER_[\w-]+)\s*[—–\-]\s*([^\]]+)\](?!\s*\()/g,
    (_, placeholder, description) => `![${description.trim()}](${placeholder})`
  );

  // Pattern 2: [https://url — description] (placeholder already replaced with real URL)
  // → ![description](https://url)
  fixed = fixed.replace(
    /\[(https?:\/\/[^\]\s]+)\s+[—–\-]\s+([^\]]+)\](?!\s*\()/g,
    (_, url, description) => `![${description.trim()}](${url})`
  );

  return fixed;
}

export async function POST() {
  const rows = await sql`SELECT id, content FROM articles WHERE content IS NOT NULL`;

  let fixed = 0;
  let skipped = 0;
  const changes: { id: string; before: number; after: number }[] = [];

  for (const row of rows) {
    const { id, content } = row as any;
    if (!content) { skipped++; continue; }

    const updated = fixImageFormat(content);

    if (updated === content) { skipped++; continue; }

    await sql`UPDATE articles SET content = ${updated} WHERE id = ${id}`;
    fixed++;
    changes.push({ id, before: content.length, after: updated.length });
  }

  return NextResponse.json({
    total: rows.length,
    fixed,
    skipped,
    changes,
  });
}

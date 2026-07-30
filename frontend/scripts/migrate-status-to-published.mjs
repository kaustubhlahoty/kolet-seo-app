// One-off migration: bulk-mark all existing articles as "published".
// Run once against the production DB after deploying the new status pipeline.
// Usage: DATABASE_URL="postgres://..." node scripts/migrate-status-to-published.mjs
import { neon } from '@neondatabase/serverless';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const sql = neon(url);

const before = await sql`SELECT status, COUNT(*)::int AS n FROM articles GROUP BY status ORDER BY n DESC`;
console.log('Before:', before);

const result = await sql`UPDATE articles SET status='published' WHERE status IS DISTINCT FROM 'published' RETURNING id`;
console.log(`Updated ${result.length} article(s) to "published".`);

const after = await sql`SELECT status, COUNT(*)::int AS n FROM articles GROUP BY status ORDER BY n DESC`;
console.log('After:', after);

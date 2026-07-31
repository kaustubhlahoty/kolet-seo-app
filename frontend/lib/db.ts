import { neon } from '@neondatabase/serverless';

let _sql: ReturnType<typeof neon> | undefined;
let _migrated = false;

function getConnection() {
  if (!_sql) _sql = neon(process.env.DATABASE_URL!);
  return _sql;
}

// Runs once per cold-start — idempotent ALTER TABLE so safe to call repeatedly
async function ensureMigrations() {
  if (_migrated) return;
  _migrated = true;
  const conn = getConnection();
  await Promise.allSettled([
    conn`ALTER TABLE articles ADD COLUMN IF NOT EXISTS content_format TEXT`,
    conn`ALTER TABLE articles ADD COLUMN IF NOT EXISTS content_backup TEXT`,
    conn`ALTER TABLE topics ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual'`,
    conn`ALTER TABLE topics ADD COLUMN IF NOT EXISTS rationale TEXT`,
    conn`
      CREATE TABLE IF NOT EXISTS article_suggestions (
        id TEXT PRIMARY KEY,
        article_id TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'direct_edit',
        original_text TEXT NOT NULL,
        proposed_text TEXT NOT NULL,
        author TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW(),
        resolved_at TIMESTAMP,
        resolved_by TEXT
      )
    `,
    conn`CREATE INDEX IF NOT EXISTS idx_suggestions_article_status ON article_suggestions(article_id, status)`,
    conn`
      CREATE TABLE IF NOT EXISTS article_revisions (
        id TEXT PRIMARY KEY,
        article_id TEXT NOT NULL,
        content TEXT NOT NULL,
        source TEXT,
        author TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `,
    conn`CREATE INDEX IF NOT EXISTS idx_revisions_article ON article_revisions(article_id, created_at DESC)`,
  ]);
}

// Defers neon() until the first query so importing this module is safe at build time.
// Runs schema migrations transparently on the first call of each cold-start.
export const sql = (async (...args: any[]) => {
  await ensureMigrations();
  return (getConnection() as Function).apply(null, args);
}) as (strings: TemplateStringsArray, ...values: any[]) => Promise<any[]>;

export async function initDb() {
  await sql`
    CREATE TABLE IF NOT EXISTS kv_store (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS keywords (
      id SERIAL PRIMARY KEY,
      seed TEXT,
      lang TEXT,
      keyword TEXT,
      volume INTEGER,
      competition INTEGER,
      opportunity_score REAL,
      cpc REAL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS topics (
      id TEXT PRIMARY KEY,
      headline TEXT,
      focus_keyword TEXT,
      secondary_keywords TEXT,
      content_format TEXT,
      kolet_angle TEXT,
      word_count INTEGER,
      difficulty TEXT,
      target_zone TEXT,
      lang TEXT,
      rationale TEXT,
      status TEXT DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS articles (
      id TEXT PRIMARY KEY,
      topic_id TEXT,
      title TEXT,
      slug TEXT,
      lang TEXT,
      focus_keyword TEXT,
      target_zone TEXT,
      content_format TEXT,
      status TEXT DEFAULT 'draft',
      content TEXT,
      content_backup TEXT,
      meta_description TEXT,
      seo_score INTEGER,
      eeat_score INTEGER,
      audit_report TEXT,
      images TEXT DEFAULT '[]',
      drive_url TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      published_at TIMESTAMP
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS article_suggestions (
      id TEXT PRIMARY KEY,
      article_id TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'direct_edit',
      original_text TEXT NOT NULL,
      proposed_text TEXT NOT NULL,
      author TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT NOW(),
      resolved_at TIMESTAMP,
      resolved_by TEXT
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS article_revisions (
      id TEXT PRIMARY KEY,
      article_id TEXT NOT NULL,
      content TEXT NOT NULL,
      source TEXT,
      author TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;

  // ── Idempotent migrations for existing deployments ──────────────────────
  await Promise.allSettled([
    // Add columns that may not exist in older deployments
    sql`ALTER TABLE articles ADD COLUMN IF NOT EXISTS content_format TEXT`,
    sql`ALTER TABLE articles ADD COLUMN IF NOT EXISTS content_backup TEXT`,
    sql`ALTER TABLE topics ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual'`,
    // Indexes for common query patterns
    sql`CREATE INDEX IF NOT EXISTS idx_articles_status_lang    ON articles(status, lang)`,
    sql`CREATE INDEX IF NOT EXISTS idx_articles_created_at     ON articles(created_at DESC)`,
    sql`CREATE INDEX IF NOT EXISTS idx_topics_status_lang      ON topics(status, lang)`,
    // Deduplicate keywords then enforce uniqueness
    sql`DELETE FROM keywords
        WHERE id NOT IN (
          SELECT MIN(id) FROM keywords GROUP BY seed, lang, keyword
        )`,
    sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_keywords_unique
        ON keywords(seed, lang, keyword)`,
  ]);
}

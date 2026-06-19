import { neon } from '@neondatabase/serverless';

let _sql: ReturnType<typeof neon> | undefined;

function getConnection() {
  if (!_sql) _sql = neon(process.env.DATABASE_URL!);
  return _sql;
}

// Defers neon() until the first query so importing this module is safe at build time
export const sql = ((...args: any[]) => (getConnection() as Function).apply(null, args)) as
  (strings: TemplateStringsArray, ...values: any[]) => Promise<any[]>;

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
      status TEXT DEFAULT 'draft',
      content TEXT,
      meta_description TEXT,
      seo_score INTEGER,
      eeat_score INTEGER,
      images TEXT DEFAULT '[]',
      drive_url TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      published_at TIMESTAMP
    )
  `;
}

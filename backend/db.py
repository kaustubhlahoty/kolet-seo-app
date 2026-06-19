import sqlite3, json, os
from pathlib import Path

DB_PATH = Path(os.environ.get("DB_PATH", str(Path(__file__).parent / "kolet_seo.db")))


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_conn()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS keywords (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            seed TEXT,
            lang TEXT,
            keyword TEXT,
            volume INTEGER,
            competition INTEGER,
            opportunity_score REAL,
            cpc REAL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

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
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

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
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            published_at TIMESTAMP
        );
    """)
    conn.commit()
    conn.close()


init_db()

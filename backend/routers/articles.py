import json, re, os
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pathlib import Path
from dotenv import load_dotenv
from typing import List
from pydantic import BaseModel
from db import get_conn

load_dotenv(Path(__file__).parent.parent / ".env")

router     = APIRouter()
IMAGES_DIR = Path(__file__).parent.parent / "articles" / "images"

ANTHROPIC_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
GROQ_KEY      = os.environ.get("GROQ_API_KEY", "")

QUALITY_PROMPT = """You are a senior content editor at Kolet reviewing a draft article before publication.
Check EEAT signals, Kolet fact accuracy, and brand voice. Return ONLY JSON:
{"eeat_score": 0-100, "seo_score": 0-100, "verdict": "PASS"|"NEEDS_REVISION"|"FAIL",
 "issues": ["..."], "fixes": ["..."]}"""


def _audit_llm(content: str) -> dict:
    msg_content = f"Review:\n\n{content[:4000]}"
    raw = ""
    if ANTHROPIC_KEY:
        import anthropic
        ac = anthropic.Anthropic(api_key=ANTHROPIC_KEY)
        msg = ac.messages.create(model="claude-sonnet-4-6", max_tokens=600,
                                  system=QUALITY_PROMPT,
                                  messages=[{"role": "user", "content": msg_content}])
        raw = msg.content[0].text.strip()
    elif GROQ_KEY:
        from groq import Groq
        gc = Groq(api_key=GROQ_KEY)
        msg = gc.chat.completions.create(model="llama-3.3-70b-versatile", max_tokens=600,
                                          messages=[{"role": "system", "content": QUALITY_PROMPT},
                                                    {"role": "user", "content": msg_content}])
        raw = msg.choices[0].message.content.strip()
    else:
        return {"eeat_score": 70, "verdict": "NEEDS_REVISION", "issues": ["No LLM key set"], "fixes": []}
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    try:
        return json.loads(raw.strip())
    except Exception:
        return {"eeat_score": 70, "verdict": "NEEDS_REVISION", "issues": [], "fixes": []}


@router.get("/articles")
def list_articles(status: str = None, lang: str = None):
    conn = get_conn()
    query = "SELECT id, topic_id, title, slug, lang, focus_keyword, target_zone, status, meta_description, seo_score, eeat_score, images, drive_url, created_at, published_at FROM articles"
    filters, params = [], []
    if status:
        filters.append("status = ?")
        params.append(status)
    if lang:
        filters.append("lang = ?")
        params.append(lang)
    if filters:
        query += " WHERE " + " AND ".join(filters)
    query += " ORDER BY created_at DESC"
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return {"articles": [dict(r) for r in rows]}


@router.get("/articles/similar")
def find_similar_articles(keyword: str, article_id: str = ""):
    """Find existing articles with the same or overlapping focus keyword."""
    conn = get_conn()
    if article_id:
        rows = conn.execute(
            "SELECT id, title, slug, focus_keyword, lang, status FROM articles WHERE id != ?",
            (article_id,)
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT id, title, slug, focus_keyword, lang, status FROM articles"
        ).fetchall()
    conn.close()

    kw_lower = keyword.lower().strip()
    kw_words = set(kw_lower.split())

    similar = []
    for row in rows:
        r = dict(row)
        existing = (r.get("focus_keyword") or "").lower().strip()
        if not existing:
            continue
        if existing == kw_lower:
            r["match_type"] = "exact"
            similar.append(r)
            continue
        existing_words = set(existing.split())
        if kw_words and existing_words:
            overlap = len(kw_words & existing_words) / len(kw_words | existing_words)
            if overlap >= 0.6:
                r["match_type"] = "similar"
                similar.append(r)

    return {"similar": similar}


@router.get("/articles/{article_id}")
def get_article(article_id: str):
    conn = get_conn()
    row = conn.execute("SELECT * FROM articles WHERE id = ?", (article_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, "Article not found")
    return dict(row)


@router.post("/articles/{article_id}/audit")
def audit_article(article_id: str):
    conn = get_conn()
    row = conn.execute("SELECT content, title, focus_keyword FROM articles WHERE id = ?", (article_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, "Article not found")

    content = row["content"] or ""

    # Rule-based SEO checks
    kw    = (row["focus_keyword"] or "").lower()
    title = (row["title"] or "").lower()
    body  = re.sub(r"^---\n.*?\n---\n", "", content, flags=re.DOTALL)
    words = body.split()

    checks = {
        "kw_in_title":      kw in title,
        "kw_in_first_100":  kw in " ".join(words[:100]).lower(),
        "word_count_ok":    len(words) > 800,
        "has_h2":           bool(re.findall(r"^##\s", body, re.MULTILINE)),
        "no_bad_opener":    not any(x in body[:200].lower() for x in ["in today's", "in this article"]),
    }
    seo_score = round(sum(checks.values()) / len(checks) * 100)

    ai = _audit_llm(content)

    # Update DB
    conn = get_conn()
    conn.execute(
        "UPDATE articles SET seo_score=?, eeat_score=?, status=? WHERE id=?",
        (seo_score, ai.get("eeat_score", 70),
         "reviewed" if ai.get("verdict") == "PASS" else "needs_revision",
         article_id)
    )
    conn.commit()
    conn.close()

    return {
        "seo_score": seo_score,
        "eeat_score": ai.get("eeat_score", 70),
        "verdict": ai.get("verdict", "NEEDS_REVISION"),
        "seo_checks": checks,
        "issues": ai.get("issues", []),
        "fixes": ai.get("fixes", []),
    }


@router.post("/articles/{article_id}/publish")
def publish_article(article_id: str):
    conn = get_conn()
    row = conn.execute("SELECT * FROM articles WHERE id = ?", (article_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "Article not found")
    if row["status"] not in ("reviewed", "draft"):
        conn.close()
        raise HTTPException(400, f"Article status is '{row['status']}' — run audit first")
    conn.execute("UPDATE articles SET status='published', published_at=CURRENT_TIMESTAMP WHERE id=?", (article_id,))
    conn.commit()
    conn.close()
    return {"status": "published", "article_id": article_id}


@router.delete("/articles/{article_id}")
def delete_article(article_id: str):
    conn = get_conn()
    row = conn.execute("SELECT images FROM articles WHERE id = ?", (article_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "Article not found")
    # Remove associated images from disk
    try:
        for img_path in json.loads(row["images"] or "[]"):
            fname = img_path.split("/")[-1]
            p = IMAGES_DIR / fname
            if p.exists():
                p.unlink()
    except Exception:
        pass
    conn.execute("DELETE FROM articles WHERE id = ?", (article_id,))
    conn.commit()
    conn.close()
    return {"deleted": article_id}


class BatchDeleteRequest(BaseModel):
    ids: List[str]


@router.post("/articles/batch-delete")
def batch_delete_articles(req: BatchDeleteRequest):
    conn = get_conn()
    deleted = []
    for article_id in req.ids:
        row = conn.execute("SELECT images FROM articles WHERE id = ?", (article_id,)).fetchone()
        if not row:
            continue
        try:
            for img_path in json.loads(row["images"] or "[]"):
                fname = img_path.split("/")[-1]
                p = IMAGES_DIR / fname
                if p.exists():
                    p.unlink()
        except Exception:
            pass
        conn.execute("DELETE FROM articles WHERE id = ?", (article_id,))
        deleted.append(article_id)
    conn.commit()
    conn.close()
    return {"deleted": deleted}


@router.get("/images/{filename}")
def serve_image(filename: str):
    path = IMAGES_DIR / filename
    if not path.exists():
        raise HTTPException(404, "Image not found")
    return FileResponse(path)

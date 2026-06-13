import json, uuid, os
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List
from pathlib import Path
from dotenv import load_dotenv
from db import get_conn

load_dotenv(Path(__file__).parent.parent / ".env")

router = APIRouter()

ANTHROPIC_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
GROQ_KEY      = os.environ.get("GROQ_API_KEY", "")

GROQ_MODELS = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "gemma2-9b-it"]

def _call_llm(system, user_content, max_tokens=2500):
    if ANTHROPIC_KEY:
        import anthropic
        client = anthropic.Anthropic(api_key=ANTHROPIC_KEY)
        msg = client.messages.create(
            model="claude-sonnet-4-6", max_tokens=max_tokens,
            system=system, messages=[{"role": "user", "content": user_content}]
        )
        return msg.content[0].text.strip()
    elif GROQ_KEY:
        from groq import Groq
        from groq import RateLimitError as GroqRateLimitError
        client = Groq(api_key=GROQ_KEY)
        last_err = None
        for model in GROQ_MODELS:
            try:
                msg = client.chat.completions.create(
                    model=model, max_tokens=max_tokens,
                    messages=[{"role": "system", "content": system},
                               {"role": "user", "content": user_content}]
                )
                return msg.choices[0].message.content.strip()
            except GroqRateLimitError as e:
                last_err = e
                continue  # try next model
            except Exception as e:
                raise HTTPException(500, f"Groq error: {e}")
        # All models rate-limited
        msg = str(last_err)
        wait = ""
        import re as _re
        m = _re.search(r'try again in ([^\.\n]+)', msg)
        if m:
            wait = f" Try again in {m.group(1)}."
        raise HTTPException(429, f"Groq daily token limit reached.{wait}")
    else:
        raise HTTPException(500, "No LLM API key configured. Set ANTHROPIC_API_KEY or GROQ_API_KEY in backend/.env")

SYSTEM = """
You are the Kolet SEO strategist. Kolet is an eSIM travel product distributed through Air France–KLM.
Turn keyword data into 5 high-impact article topics for Kolet.

For each topic:
1. Pick the ONE best target keyword
2. Name 3–5 secondary keywords
3. Recommend content format (comparison, how-to, destination guide, listicle, pillar)
4. Write a specific, compelling headline
5. Define the Kolet angle (vs Airalo: partner trust/Flying Blue; vs Holafly: pay-per-use/no throttling; vs Saily: better price)
6. Estimate word count (800/1200/2000+)
7. Difficulty: Easy / Medium / Hard

Return ONLY a JSON array of objects with these exact fields:
id, headline, focus_keyword, secondary_keywords (array), content_format, kolet_angle, word_count, difficulty, target_zone, lang, rationale
"""


class IdeasRequest(BaseModel):
    keywords: List[dict]
    lang: str = "en"


@router.post("/ideas")
def generate_ideas(req: IdeasRequest):
    if not req.keywords:
        raise HTTPException(400, "No keywords provided")

    kw_summary = "\n".join(
        f"- {kw['keyword']} | vol: {kw.get('volume', 0):,} | comp: {kw.get('competition', 0)} | score: {kw.get('opportunity_score', 0)}"
        for kw in req.keywords[:25]
    )

    raw = _call_llm(
        SYSTEM,
        f"Language: {req.lang}\n\nKeywords:\n{kw_summary}\n\nGenerate 5 article topics. Return only JSON array."
    )
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    try:
        topics = json.loads(raw)
    except Exception:
        raise HTTPException(500, f"Claude returned invalid JSON: {raw[:200]}")

    # Assign proper UUIDs and persist
    conn = get_conn()
    result = []
    for t in topics:
        t["id"] = f"topic-{str(uuid.uuid4())[:8]}"
        t["status"] = "pending"
        conn.execute(
            """INSERT OR REPLACE INTO topics
               (id, headline, focus_keyword, secondary_keywords, content_format,
                kolet_angle, word_count, difficulty, target_zone, lang, rationale, status)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
            (t["id"], t["headline"], t["focus_keyword"],
             json.dumps(t.get("secondary_keywords", [])),
             t["content_format"], t["kolet_angle"], t.get("word_count", 1200),
             t["difficulty"], t.get("target_zone", "global"), t["lang"],
             t.get("rationale", ""), "pending")
        )
        result.append(t)

    conn.commit()
    conn.close()
    return {"topics": result}

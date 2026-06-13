import os, json, requests
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from dotenv import load_dotenv
from pathlib import Path
from db import get_conn

load_dotenv(Path(__file__).parent.parent / ".env")

router = APIRouter()
LOGIN    = os.environ.get("DATAFORSEO_LOGIN", "")
PASSWORD = os.environ.get("DATAFORSEO_PASSWORD", "")
BASE_URL = "https://api.dataforseo.com/v3"
AUTH     = (LOGIN, PASSWORD)

LOCATION_CODES = {"en": 2840, "fr": 2250, "de": 2158, "es": 2724, "nl": 2528, "it": 2380}


class ResearchRequest(BaseModel):
    seed: str
    lang: str = "en"


def _post(endpoint, payload):
    r = requests.post(f"{BASE_URL}/{endpoint}", auth=AUTH, json=payload, timeout=30)
    r.raise_for_status()
    return r.json()


def score(kw):
    vol  = kw.get("volume", 0) or 0
    comp = kw.get("competition", 50) or 50
    cpc  = kw.get("cpc", 1) or 1
    return round(vol * (1 - comp / 100) / (cpc + 0.5), 1)


@router.post("/research")
def run_research(req: ResearchRequest):
    if not LOGIN:
        raise HTTPException(500, "DataforSEO credentials not configured")

    loc = LOCATION_CODES.get(req.lang, 2840)

    try:
        # Keyword ideas
        payload = [{
            "keywords": [req.seed],
            "language_code": req.lang,
            "location_code": loc,
            "limit": 50,
            "filters": [["keyword_info.search_volume", ">", 50]],
            "order_by": ["keyword_info.search_volume,desc"],
        }]
        data = _post("dataforseo_labs/google/keyword_ideas/live", payload)
        items = data.get("tasks", [{}])[0].get("result", [{}])[0].get("items", []) or []

        keywords = []
        for item in items:
            if not item:
                continue
            kw = {
                "keyword": item["keyword"],
                "volume": item["keyword_info"].get("search_volume", 0) or 0,
                "competition": item["keyword_info"].get("competition_index", 0) or 0,
                "cpc": item["keyword_info"].get("cpc", 0) or 0,
                "trend": item["keyword_info"].get("monthly_searches", []),
            }
            kw["opportunity_score"] = score(kw)
            keywords.append(kw)

        keywords.sort(key=lambda x: x["opportunity_score"], reverse=True)

        # Persist to DB
        conn = get_conn()
        for kw in keywords:
            conn.execute(
                "INSERT INTO keywords (seed, lang, keyword, volume, competition, opportunity_score, cpc) VALUES (?,?,?,?,?,?,?)",
                (req.seed, req.lang, kw["keyword"], kw["volume"], kw["competition"], kw["opportunity_score"], kw["cpc"])
            )
        conn.commit()
        conn.close()

        # Build summary stats
        total_volume = sum(k["volume"] for k in keywords)
        avg_comp     = round(sum(k["competition"] for k in keywords) / len(keywords)) if keywords else 0
        easy_wins    = [k for k in keywords if k["competition"] < 40 and k["volume"] > 200]

        return {
            "keywords": keywords[:40],
            "summary": {
                "total_keywords": len(keywords),
                "total_monthly_volume": total_volume,
                "avg_competition": avg_comp,
                "easy_wins_count": len(easy_wins),
                "top_opportunity": keywords[0]["keyword"] if keywords else "",
            },
            "recommendations": [
                f"🎯 '{kw['keyword']}' — {kw['volume']:,} searches/mo, low competition ({kw['competition']})"
                for kw in easy_wins[:5]
            ] or [f"Focus on '{keywords[0]['keyword']}'" if keywords else "No data found"],
        }

    except requests.HTTPError as e:
        raise HTTPException(502, f"DataforSEO error: {e.response.text[:200]}")
    except Exception as e:
        raise HTTPException(500, str(e))

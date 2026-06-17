import os
from datetime import datetime, timedelta
from pathlib import Path
from fastapi import APIRouter, HTTPException
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

router = APIRouter()

GSC_CREDENTIALS = os.environ.get("GSC_CREDENTIALS_JSON", "")
GSC_SITE_URL    = os.environ.get("GSC_SITE_URL", "https://kolet.com/")


def _build_service():
    if not GSC_CREDENTIALS:
        return None
    creds_path = Path(GSC_CREDENTIALS)
    if not creds_path.exists():
        return None
    try:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build
        scopes = ["https://www.googleapis.com/auth/webmasters.readonly"]
        creds = service_account.Credentials.from_service_account_file(
            str(creds_path), scopes=scopes
        )
        return build("searchconsole", "v1", credentials=creds, cache_discovery=False)
    except Exception as e:
        print(f"[gsc] Failed to build service: {e}")
        return None


@router.get("/gsc/status")
def gsc_status():
    configured = bool(GSC_CREDENTIALS and Path(GSC_CREDENTIALS).exists())
    return {"configured": configured, "site_url": GSC_SITE_URL if configured else ""}


@router.get("/gsc/performance")
def gsc_performance(days: int = 28):
    service = _build_service()
    if not service:
        raise HTTPException(
            503,
            detail="Google Search Console not configured. "
                   "Add GSC_CREDENTIALS_JSON and GSC_SITE_URL to your .env file.",
        )

    end_date   = datetime.utcnow().date()
    start_date = end_date - timedelta(days=days)

    body = {
        "startDate":  str(start_date),
        "endDate":    str(end_date),
        "dimensions": ["page"],
        "rowLimit":   5000,
    }

    try:
        resp = service.searchanalytics().query(siteUrl=GSC_SITE_URL, body=body).execute()
    except Exception as e:
        raise HTTPException(502, detail=f"GSC API error: {str(e)[:300]}")

    pages = []
    for row in resp.get("rows", []):
        url = row["keys"][0]
        pages.append({
            "url":         url,
            "clicks":      int(row.get("clicks", 0)),
            "impressions": int(row.get("impressions", 0)),
            "ctr":         round(row.get("ctr", 0) * 100, 1),
            "position":    round(row.get("position", 0), 1),
        })

    pages.sort(key=lambda x: x["clicks"], reverse=True)
    return {"pages": pages, "total": len(pages), "days": days, "site": GSC_SITE_URL}

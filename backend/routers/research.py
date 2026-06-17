import os, json, re, requests, xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from dotenv import load_dotenv
from pathlib import Path
from db import get_conn

load_dotenv(Path(__file__).parent.parent / ".env")

router = APIRouter()
LOGIN         = os.environ.get("DATAFORSEO_LOGIN", "")
PASSWORD      = os.environ.get("DATAFORSEO_PASSWORD", "")
BASE_URL      = "https://api.dataforseo.com/v3"
AUTH          = (LOGIN, PASSWORD)
GROQ_KEY      = os.environ.get("GROQ_API_KEY", "")
ANTHROPIC_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
GROQ_MODELS   = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "gemma2-9b-it"]

# ── Topic map for coverage gap analysis ──────────────────────────────────────
# Each entry: topic display name + list of keyword fragments to match against
# article title/focus_keyword (case-insensitive substring)
TOPIC_MAP = {
    "Destinations": [
        {"topic": "Japan",        "search": ["japan", "japon", "japón"]},
        {"topic": "USA",          "search": ["usa", "états-unis", "estados unidos", "united states", "vereinigte staaten", "amérique"]},
        {"topic": "Europe",       "search": ["europe", "europa"]},
        {"topic": "Thailand",     "search": ["thailand", "thaïlande", "tailandia"]},
        {"topic": "UK",           "search": ["royaume-uni", "united kingdom", "großbritannien", "reino unido", "angleterre"]},
        {"topic": "Australia",    "search": ["australia", "australie", "australien"]},
        {"topic": "Canada",       "search": ["canada"]},
        {"topic": "UAE / Dubai",  "search": ["émirats", "emirates", "dubai", "dubaï"]},
        {"topic": "Mexico",       "search": ["mexique", "mexico", "mexiko"]},
        {"topic": "South Korea",  "search": ["corée", "korea", "corea", "coré"]},
        {"topic": "Singapore",    "search": ["singapour", "singapore"]},
        {"topic": "Italy",        "search": ["italie", "italy", "italien", "italia"]},
        {"topic": "Spain",        "search": ["espagne", "spain", "spanien", "españa"]},
        {"topic": "Morocco",      "search": ["maroc", "morocco", "marokko", "marruecos"]},
        {"topic": "Turkey",       "search": ["turquie", "turkey", "türkei", "turquía"]},
        {"topic": "Vietnam",      "search": ["vietnam"]},
        {"topic": "Indonesia",    "search": ["indonésie", "indonesia"]},
        {"topic": "India",        "search": ["inde", "india", "indien"]},
        {"topic": "Portugal",     "search": ["portugal"]},
        {"topic": "Greece",       "search": ["grèce", "greece", "griechenland", "grecia"]},
    ],
    "Use Cases": [
        {"topic": "Digital Nomad",   "search": ["nomade digital", "digital nomad", "nomade numérique"]},
        {"topic": "Business Travel", "search": ["voyage affaires", "business travel", "viaje de negocios"]},
        {"topic": "Family Travel",   "search": ["famille", "family travel", "familienreise", "viaje familiar"]},
        {"topic": "Backpacker",      "search": ["routard", "backpacker", "randonneur"]},
        {"topic": "Cruise",          "search": ["croisière", "cruise", "kreuzfahrt", "crucero"]},
        {"topic": "Long Stay",       "search": ["long séjour", "long stay", "expatrié", "expat"]},
        {"topic": "Student Travel",  "search": ["étudiant", "student", "studenten", "estudiante"]},
    ],
    "Comparisons & Value": [
        {"topic": "eSIM vs Roaming",    "search": ["vs roaming", "versus roaming", "frais roaming"]},
        {"topic": "eSIM vs Local SIM",  "search": ["vs carte sim", "vs local sim", "sim locale", "physical sim"]},
        {"topic": "Cheap eSIM",         "search": ["pas cher", "cheap", "günstig", "barata", "économique"]},
        {"topic": "Best eSIM",          "search": ["meilleure esim", "best esim", "beste esim", "mejor esim"]},
        {"topic": "eSIM Comparison",    "search": ["comparatif", "comparison", "vergleich", "comparativa"]},
    ],
    "Technical": [
        {"topic": "How to Install",    "search": ["installer", "install", "installieren", "instalar", "comment activer"]},
        {"topic": "Compatible Phones", "search": ["téléphone compatible", "compatible phone", "kompatibel"]},
        {"topic": "eSIM on iPhone",    "search": ["iphone"]},
        {"topic": "eSIM on Android",   "search": ["android"]},
        {"topic": "Activation Issues", "search": ["problème", "problème activation", "not working", "troubleshoot"]},
        {"topic": "eSIM Setup Guide",  "search": ["configuration", "setup guide", "einrichtung", "configuración"]},
    ],
}

SEED_SYSTEM = """You are an SEO strategist for Kolet, a French eSIM startup for travelers (kolet.com).
Generate keyword research seed ideas that a content writer could use as starting points.
Return ONLY valid JSON — no markdown, no explanation:
{"categories":[
  {"name":"Destinations","seeds":["esim japon","esim tokyo",...]},
  {"name":"Use Cases","seeds":[...]},
  {"name":"Comparisons","seeds":[...]},
  {"name":"Technical","seeds":[...]}
]}
Rules:
- Destinations: 7-8 seeds — specific countries/regions/cities where travelers need data
- Use Cases: 5-6 seeds — travel situations where internet access is critical
- Comparisons: 5-6 seeds — cost, vs-roaming, vs-competitors, value queries
- Technical: 5-6 seeds — how-to, compatibility, activation questions
- Seeds must be in the specified language (e.g. if French: "esim japon", not "esim japan")
- Each seed should be 2-5 words, written the way a real person types into Google
- Vary specificity: some broad ("esim europe"), some long-tail ("activer esim iphone 15 pro")
- Focus on keywords where a travel eSIM brand can realistically rank"""


class SeedRequest(BaseModel):
    lang: str = "fr"


@router.post("/research/suggest-seeds")
def suggest_seeds(req: SeedRequest):
    """Generate AI-powered seed keyword suggestions for Kolet in the given language."""
    lang_labels = {"fr": "French", "en": "English", "de": "German", "nl": "Dutch", "es": "Spanish"}
    lang_label  = lang_labels.get(req.lang, "English")

    user_msg = (
        f"Generate seed keyword ideas in {lang_label} for an eSIM travel brand.\n"
        f"Market: travelers who speak {lang_label}.\n"
        "Include destination keywords popular with this market, practical use-case keywords, "
        "comparison/value queries, and technical how-to keywords."
    )

    raw = ""
    if GROQ_KEY:
        from groq import Groq, RateLimitError as GroqRateLimitError
        gc = Groq(api_key=GROQ_KEY)
        for model in GROQ_MODELS:
            try:
                msg = gc.chat.completions.create(
                    model=model, max_tokens=800,
                    messages=[{"role": "system", "content": SEED_SYSTEM},
                               {"role": "user", "content": user_msg}]
                )
                raw = msg.choices[0].message.content.strip()
                break
            except GroqRateLimitError:
                continue
    elif ANTHROPIC_KEY:
        import anthropic
        ac = anthropic.Anthropic(api_key=ANTHROPIC_KEY)
        msg = ac.messages.create(
            model="claude-haiku-4-5-20251001", max_tokens=800,
            system=SEED_SYSTEM,
            messages=[{"role": "user", "content": user_msg}]
        )
        raw = msg.content[0].text.strip()

    if not raw:
        raise HTTPException(503, detail="LLM unavailable — check API keys or rate limits")

    # Strip markdown code fences if present
    if raw.startswith("```"):
        lines = raw.split("\n")
        raw = "\n".join(lines[1:-1] if lines[-1] == "```" else lines[1:])

    try:
        data = json.loads(raw)
        return data
    except json.JSONDecodeError:
        raise HTTPException(500, detail="LLM returned invalid JSON — try again")


@router.get("/research/gaps")
def content_gaps():
    """Return topic clusters with library coverage status."""
    conn = get_conn()
    rows = conn.execute(
        "SELECT id, title, focus_keyword, lang FROM articles"
    ).fetchall()
    conn.close()

    articles = [dict(r) for r in rows]

    def is_covered(search_terms: list) -> list:
        """Return list of (article_id, lang) pairs that cover any search term."""
        hits = []
        for art in articles:
            haystack = f"{art.get('title','') or ''} {art.get('focus_keyword','') or ''}".lower()
            if any(term.lower() in haystack for term in search_terms):
                hits.append({"id": art["id"], "title": art.get("title",""), "lang": art.get("lang","")})
        return hits

    categories_out = []
    total = 0
    covered = 0

    for cat_name, topics in TOPIC_MAP.items():
        topics_out = []
        for entry in topics:
            hits = is_covered(entry["search"])
            langs = sorted(set(h["lang"] for h in hits))
            topics_out.append({
                "topic":         entry["topic"],
                "article_count": len(hits),
                "langs":         langs,
                "articles":      hits[:3],  # preview max 3
            })
            total += 1
            if hits:
                covered += 1
        categories_out.append({"name": cat_name, "topics": topics_out})

    return {
        "categories": categories_out,
        "total_topics": total,
        "covered_count": covered,
        "gap_count": total - covered,
    }

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
        data = _post("dataforseo_labs/google/keywords_for_keywords/live", payload)
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


# ── Competitor intel ──────────────────────────────────────────────────────────

COMPETITORS = [
    {
        "name":         "Airalo",
        "color":        "green",
        # Posts split across sitemap-v2-posts-1.xml…N; posts-1 = NEWEST (low number = recent)
        "sitemaps":     ["https://www.airalo.com/sitemap-v2-posts-index.xml"],
        "sub_hint":     "posts",
        "reverse_subs": False,            # do NOT reverse — smallest numbers are most recent
        "blog_patterns": ["/blog/"],
    },
    {
        "name":         "Holafly",
        "color":        "blue",
        # Redirects to esim.holafly.com; WordPress post-sitemap*.xml, highest number = newest
        "sitemaps":     ["https://holafly.com/sitemap.xml"],
        "sub_hint":     "post-sitemap",
        "reverse_subs": True,             # reverse — largest numbers are most recent
        "blog_patterns": [],
    },
    {
        "name":         "Saily",
        "color":        "purple",
        "sitemaps":     ["https://saily.com/sitemap.xml"],
        "sub_hint":     "blog",
        "reverse_subs": True,
        "blog_patterns": ["/blog/", "/article", "/guide"],
    },
]

_SCRAPE_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control":   "no-cache",
}

INTEL_ANALYSIS_SYSTEM = """You are a content strategy analyst for Kolet, a French eSIM startup competing against Airalo, Holafly, and Saily.
Analyse the competitor articles list and return ONLY valid JSON — no markdown:
{
  "topic_clusters": [
    {"cluster": "Destination guides", "count": 0, "competitors": ["Airalo"]},
    {"cluster": "How-to / Technical", "count": 0, "competitors": ["Holafly", "Saily"]},
    {"cluster": "Comparison / Value", "count": 0, "competitors": ["Airalo", "Holafly"]}
  ],
  "most_invested": ["topic1", "topic2", "topic3"],
  "kolet_opportunities": [
    "Angle or topic where Kolet could counter or differentiate"
  ],
  "summary": "2–3 sentence strategic summary of what competitors are doing and where Kolet has room"
}"""


def _slug_to_title(url: str) -> str:
    path = urlparse(url).path.rstrip("/")
    parts = [p for p in path.split("/") if p]
    slug = parts[-1] if parts else ""
    slug = re.sub(r"-\d{4}(-\d{2}(-\d{2})?)?$", "", slug)
    return slug.replace("-", " ").replace("_", " ").title()


def _parse_date(raw: str):
    """Return a naive UTC datetime from a lastmod string, or None."""
    if not raw:
        return None
    raw = raw.strip()[:19]
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(raw, fmt)
        except ValueError:
            continue
    return None


def _fetch_xml(url: str):
    try:
        r = requests.get(url, headers=_SCRAPE_HEADERS, timeout=12, allow_redirects=True)
        r.raise_for_status()
        content = r.content
        if url.endswith(".gz"):
            import gzip
            content = gzip.decompress(content)
        return ET.fromstring(content)
    except ET.ParseError as e:
        print(f"[intel] XML parse failed {url}: {e} (possible Cloudflare block)")
        return None
    except Exception as e:
        print(f"[intel] fetch failed {url}: {e}")
        return None


def _parse_urlset(root, competitor: str, cutoff: datetime, blog_patterns: list) -> list:
    """Extract article entries from a <urlset> element."""
    articles = []
    SKIP = {".xml", ".json", "/category/", "/tag/", "/author/", "/page/", "/cdn-cgi/", "?"}

    for el in root.iter():
        tag = el.tag.split("}")[-1] if "}" in el.tag else el.tag
        if tag != "url":
            continue

        loc = lastmod = news_title = ""
        for child in el:
            ctag = child.tag.split("}")[-1] if "}" in child.tag else child.tag
            if ctag == "loc":
                loc = (child.text or "").strip()
            elif ctag == "lastmod":
                lastmod = (child.text or "").strip()
            elif ctag == "title":
                news_title = (child.text or "").strip()

        if not loc:
            continue
        if any(s in loc for s in SKIP):
            continue
        if blog_patterns and not any(p in loc for p in blog_patterns):
            continue

        article_date = _parse_date(lastmod)
        if article_date and article_date < cutoff:
            continue

        articles.append({
            "url":        loc,
            "title":      news_title or _slug_to_title(loc),
            "date":       lastmod[:10] if lastmod else "",
            "competitor": competitor,
        })

    return articles


def _fetch_competitor(comp: dict, days: int) -> tuple:
    """Returns (articles_list, status) where status is 'ok' | 'blocked' | 'error'."""
    cutoff = datetime.utcnow() - timedelta(days=days)
    blog_patterns = comp["blog_patterns"]
    sub_hint = comp.get("sub_hint", "")
    articles = []
    any_fetch_succeeded = False

    for sitemap_url in comp["sitemaps"]:
        root = _fetch_xml(sitemap_url)
        if root is None:
            continue
        any_fetch_succeeded = True

        tag = root.tag.split("}")[-1] if "}" in root.tag else root.tag

        if tag == "sitemapindex":
            # Collect sub-sitemap URLs from the index
            sub_urls = []
            for el in root.iter():
                t = el.tag.split("}")[-1] if "}" in el.tag else el.tag
                if t == "loc" and el.text:
                    sub_urls.append(el.text.strip())

            # Filter by sub_hint (matches against sitemap filename, not article URL)
            if sub_hint:
                matching = [u for u in sub_urls if sub_hint in u]
            else:
                matching = sub_urls

            # Optionally reverse: WordPress-style = highest number is newest (reverse=True)
            # Airalo-style = lowest number is newest (reverse=False)
            reverse_subs = comp.get("reverse_subs", True)
            ordered = list(reversed(matching)) if reverse_subs else list(matching)

            for sub_url in ordered[:6]:
                sub_root = _fetch_xml(sub_url)
                if sub_root is not None:
                    found = _parse_urlset(sub_root, comp["name"], cutoff, blog_patterns)
                    articles.extend(found)
                if len(articles) >= 60:
                    break
        else:
            articles.extend(_parse_urlset(root, comp["name"], cutoff, blog_patterns))

        if articles:
            break  # stop trying fallback root sitemaps once we have results

    sorted_articles = sorted(articles, key=lambda x: x["date"], reverse=True)[:60]
    if not any_fetch_succeeded:
        return sorted_articles, "blocked"
    return sorted_articles, "ok"


@router.get("/research/competitor-intel")
def competitor_intel(days: int = 30):
    """Fetch recent articles from competitor sitemaps."""
    results = []
    for comp in COMPETITORS:
        articles, status = _fetch_competitor(comp, days)
        results.append({
            "name":     comp["name"],
            "color":    comp["color"],
            "articles": articles,
            "count":    len(articles),
            "status":   status,
        })
    total = sum(r["count"] for r in results)
    return {"competitors": results, "total": total, "days": days}


class AnalyzeRequest(BaseModel):
    articles: list  # [{title, competitor, date}]


@router.post("/research/competitor-analyze")
def competitor_analyze(req: AnalyzeRequest):
    """Use Groq to analyse topic patterns across competitor articles."""
    if not req.articles:
        raise HTTPException(400, "No articles to analyse")

    lines = [f"- [{a['competitor']}] {a['title']} ({a.get('date','')})" for a in req.articles[:80]]
    user_msg = "Competitor articles published recently:\n" + "\n".join(lines)

    raw = ""
    if GROQ_KEY:
        from groq import Groq, RateLimitError as GroqRateLimitError
        gc = Groq(api_key=GROQ_KEY)
        for model in GROQ_MODELS:
            try:
                msg = gc.chat.completions.create(
                    model=model, max_tokens=900,
                    messages=[{"role": "system", "content": INTEL_ANALYSIS_SYSTEM},
                               {"role": "user", "content": user_msg}]
                )
                raw = msg.choices[0].message.content.strip()
                break
            except GroqRateLimitError:
                continue
    elif ANTHROPIC_KEY:
        import anthropic
        ac = anthropic.Anthropic(api_key=ANTHROPIC_KEY)
        msg = ac.messages.create(
            model="claude-haiku-4-5-20251001", max_tokens=900,
            system=INTEL_ANALYSIS_SYSTEM,
            messages=[{"role": "user", "content": user_msg}]
        )
        raw = msg.content[0].text.strip()

    if not raw:
        raise HTTPException(503, detail="LLM unavailable")

    if raw.startswith("```"):
        lines_raw = raw.split("\n")
        raw = "\n".join(lines_raw[1:-1] if lines_raw[-1] == "```" else lines_raw[1:])

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(500, detail="LLM returned invalid JSON — try again")

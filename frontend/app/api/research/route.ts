import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import Anthropic from '@anthropic-ai/sdk';

const BASE_URL = 'https://api.dataforseo.com/v3';
const LOCATION_CODES: Record<string, number> = { en: 2840, fr: 2250, de: 2158, es: 2724, nl: 2528, it: 2380 };

const RELEVANCE_RE = /\b(esim|e-sim|sim card|data plan|roaming|travel|voyage|tourist|trip|international|abroad|destination|connectivity|mobile data|4g|5g|airalo|holafly|saily|compare|comparison|best|cheap|unlimited|prepaid|carte sim|forfait)\b/i;

function koletRelevanceBonus(keyword: string): number {
  const matches = (keyword.match(new RegExp(RELEVANCE_RE.source, 'gi')) || []).length;
  return Math.min(matches * 0.15, 0.5);
}

function opportunityScore(vol: number, comp: number, cpc: number, keyword: string): number {
  const base = vol * (1 - comp / 100) / (cpc + 0.5);
  return Math.round(base * (1 + koletRelevanceBonus(keyword)) * 10) / 10;
}

async function clusterIntents(keywords: string[]): Promise<Record<string, string>> {
  if (!keywords.length) return {};
  try {
    const ac = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await ac.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: `Classify each keyword into exactly one category.

Categories:
- Destination: keyword targets a specific country/city (e.g. "esim japan", "sim card paris")
- Comparison: comparing products/brands (e.g. "airalo vs holafly", "best esim 2024")
- How-to: instructional intent (e.g. "how to set up esim", "activate data abroad")
- Technical: device/network technical (e.g. "esim compatible iphone", "dual sim roaming")
- Transactional: buy/price intent (e.g. "buy esim europe", "cheap sim card travel")

Return ONLY valid JSON (no markdown): {"keyword": "Category", ...}

Keywords:
${keywords.join('\n')}`,
      }],
    });
    const raw = (msg.content[0] as any).text.trim();
    const m = raw.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : {};
  } catch { return {}; }
}

export async function POST(request: Request) {
  const { seed, lang = 'en' } = await request.json();
  const login    = process.env.DATAFORSEO_LOGIN    || '';
  const password = process.env.DATAFORSEO_PASSWORD || '';
  if (!login) return NextResponse.json({ error: 'DataForSEO credentials not configured' }, { status: 500 });

  const loc  = LOCATION_CODES[lang] ?? 2840;
  const auth = 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64');

  try {
    const [ideasRes, relatedRes, coveredRows] = await Promise.all([
      // 1. Keyword ideas — raise limit to 200, lower min volume to 30
      fetch(`${BASE_URL}/dataforseo_labs/google/keyword_ideas/live`, {
        method: 'POST',
        headers: { Authorization: auth, 'Content-Type': 'application/json' },
        body: JSON.stringify([{
          keywords: [seed],
          language_code: lang,
          location_code: loc,
          limit: 200,
          filters: [['keyword_info.search_volume', '>', 30]],
          order_by: ['keyword_info.search_volume,desc'],
        }]),
      }),
      // 2. Related keywords — different result set for the same seed
      fetch(`${BASE_URL}/dataforseo_labs/google/related_keywords/live`, {
        method: 'POST',
        headers: { Authorization: auth, 'Content-Type': 'application/json' },
        body: JSON.stringify([{
          keyword: seed,
          language_code: lang,
          location_code: loc,
          limit: 100,
          filters: [['keyword_info.search_volume', '>', 30]],
        }]),
      }),
      // 3. Already-covered keywords (articles + topics)
      sql`SELECT focus_keyword AS kw FROM articles WHERE focus_keyword IS NOT NULL
          UNION
          SELECT focus_keyword AS kw FROM topics WHERE focus_keyword IS NOT NULL`,
    ]);

    const [ideasData, relatedData] = await Promise.all([ideasRes.json(), relatedRes.json()]);

    const coveredSet = new Set<string>(
      (coveredRows as any[]).map(r => (r.kw || '').toLowerCase().trim()).filter(Boolean)
    );

    // Merge + deduplicate
    const ideasItems   = ideasData?.tasks?.[0]?.result?.[0]?.items   || [];
    const relatedItems = relatedData?.tasks?.[0]?.result?.[0]?.items  || [];
    const seen = new Set<string>();
    const merged = [...ideasItems, ...relatedItems].filter(item => {
      const kw = item.keyword?.toLowerCase();
      if (!kw || seen.has(kw)) return false;
      seen.add(kw);
      return true;
    });

    const keywords = merged.map((item: any) => {
      const vol  = item.keyword_info?.search_volume   || 0;
      const comp = item.keyword_info?.competition_index || 0;
      const cpc  = item.keyword_info?.cpc              || 0;
      // Keep last 12 months of trend data
      const trend = (item.keyword_info?.monthly_searches || [])
        .slice(-12)
        .map((m: any) => m.search_volume || 0);
      return {
        keyword:           item.keyword,
        volume:            vol,
        competition:       comp,
        cpc,
        trend,
        opportunity_score: opportunityScore(vol, comp, cpc, item.keyword),
        covered:           coveredSet.has(item.keyword?.toLowerCase()),
        intent:            'Other',
      };
    }).sort((a: any, b: any) => b.opportunity_score - a.opportunity_score);

    // Intent clustering — classify all keywords in batches of 60
    const allKws = keywords.map(k => k.keyword);
    const batches: string[][] = [];
    for (let i = 0; i < allKws.length; i += 60) batches.push(allKws.slice(i, i + 60));
    const intentResults = await Promise.all(batches.map(batch => clusterIntents(batch)));
    const intentMap = Object.assign({}, ...intentResults);
    keywords.forEach(kw => { if (intentMap[kw.keyword]) kw.intent = intentMap[kw.keyword]; });

    // Persist to DB — unique index prevents duplicates on re-search
    const inserts = keywords.slice(0, 100).map(kw =>
      sql`INSERT INTO keywords (seed,lang,keyword,volume,competition,opportunity_score,cpc)
          VALUES (${seed},${lang},${kw.keyword},${kw.volume},${kw.competition},${kw.opportunity_score},${kw.cpc})
          ON CONFLICT (seed,lang,keyword) DO UPDATE
          SET volume=${kw.volume}, competition=${kw.competition},
              opportunity_score=${kw.opportunity_score}, cpc=${kw.cpc}`
        .catch(() => {})
    );
    await Promise.allSettled(inserts);

    const totalVolume    = keywords.reduce((s: number, k: any) => s + k.volume, 0);
    const avgComp        = keywords.length ? Math.round(keywords.reduce((s: number, k: any) => s + k.competition, 0) / keywords.length) : 0;
    const easyWins       = keywords.filter((k: any) => k.competition < 40 && k.volume > 100 && !k.covered);
    const coveredCount   = keywords.filter((k: any) => k.covered).length;

    return NextResponse.json({
      keywords: keywords.slice(0, 80),
      summary: {
        total_keywords:       keywords.length,
        total_monthly_volume: totalVolume,
        avg_competition:      avgComp,
        easy_wins_count:      easyWins.length,
        covered_count:        coveredCount,
        top_opportunity:      keywords[0]?.keyword || '',
      },
      recommendations: easyWins.slice(0, 5).map((kw: any) =>
        `🎯 '${kw.keyword}' — ${kw.volume.toLocaleString()} searches/mo · ${kw.competition < 35 ? 'Easy' : 'Medium'} (${kw.competition}) · ${kw.intent}`
      ),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}

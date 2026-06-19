import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

const BASE_URL = 'https://api.dataforseo.com/v3';
const LOCATION_CODES: Record<string, number> = { en: 2840, fr: 2250, de: 2158, es: 2724, nl: 2528, it: 2380 };

function score(kw: any) {
  const vol  = kw.volume || 0;
  const comp = kw.competition || 50;
  const cpc  = kw.cpc || 1;
  return Math.round(vol * (1 - comp / 100) / (cpc + 0.5) * 10) / 10;
}

export async function POST(request: Request) {
  const { seed, lang = 'en' } = await request.json();
  const login    = process.env.DATAFORSEO_LOGIN || '';
  const password = process.env.DATAFORSEO_PASSWORD || '';

  if (!login) return NextResponse.json({ error: 'DataforSEO credentials not configured' }, { status: 500 });

  const loc = LOCATION_CODES[lang] ?? 2840;
  const auth = 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64');

  try {
    const payload = [{ keywords: [seed], language_code: lang, location_code: loc, limit: 50, filters: [['keyword_info.search_volume', '>', 50]], order_by: ['keyword_info.search_volume,desc'] }];
    const res = await fetch(`${BASE_URL}/dataforseo_labs/google/keyword_ideas/live`, {
      method: 'POST', headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();

    if (data.status_code && data.status_code !== 20000) {
      throw new Error(`DataforSEO error: ${JSON.stringify(data)}`);
    }

    const items = data?.tasks?.[0]?.result?.[0]?.items || [];
    const keywords = items.map((item: any) => {
      const kw = {
        keyword:    item.keyword,
        volume:     item.keyword_info?.search_volume || 0,
        competition:item.keyword_info?.competition_index || 0,
        cpc:        item.keyword_info?.cpc || 0,
        trend:      item.keyword_info?.monthly_searches || [],
        opportunity_score: 0,
      };
      kw.opportunity_score = score(kw);
      return kw;
    }).sort((a: any, b: any) => b.opportunity_score - a.opportunity_score);

    for (const kw of keywords) {
      await sql`INSERT INTO keywords (seed,lang,keyword,volume,competition,opportunity_score,cpc) VALUES (${seed},${lang},${kw.keyword},${kw.volume},${kw.competition},${kw.opportunity_score},${kw.cpc})`;
    }

    const totalVolume = keywords.reduce((s: number, k: any) => s + k.volume, 0);
    const avgComp     = keywords.length ? Math.round(keywords.reduce((s: number, k: any) => s + k.competition, 0) / keywords.length) : 0;
    const easyWins    = keywords.filter((k: any) => k.competition < 40 && k.volume > 200);

    return NextResponse.json({
      keywords: keywords.slice(0, 40),
      summary: { total_keywords: keywords.length, total_monthly_volume: totalVolume, avg_competition: avgComp, easy_wins_count: easyWins.length, top_opportunity: keywords[0]?.keyword || '' },
      recommendations: easyWins.slice(0, 5).map((kw: any) => `🎯 '${kw.keyword}' — ${kw.volume.toLocaleString()} searches/mo, low competition (${kw.competition})`) || [`Focus on '${keywords[0]?.keyword}'`],
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}

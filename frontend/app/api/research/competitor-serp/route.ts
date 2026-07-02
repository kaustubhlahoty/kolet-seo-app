import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 30;

const BASE_URL    = 'https://api.dataforseo.com/v3';
const LOC_CODES: Record<string, number> = { en: 2840, fr: 2250, de: 2158, es: 2724, nl: 2528, it: 2380 };
const COMPETITORS = ['airalo', 'holafly', 'saily', 'esimdb', 'simify'];

export async function POST(request: Request) {
  const { keyword, lang = 'en' } = await request.json();
  const login    = process.env.DATAFORSEO_LOGIN    || '';
  const password = process.env.DATAFORSEO_PASSWORD || '';
  if (!login) return NextResponse.json({ error: 'DataForSEO not configured' }, { status: 500 });

  const loc  = LOC_CODES[lang] ?? 2840;
  const auth = 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64');

  try {
    const serpRes = await fetch(`${BASE_URL}/serp/google/organic/live/advanced`, {
      method:  'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify([{
        keyword,
        location_code: loc,
        language_code: lang,
        device:        'desktop',
        os:            'windows',
        depth:         20,
      }]),
    });

    if (!serpRes.ok) throw new Error(`SERP API ${serpRes.status}`);
    const serpData = await serpRes.json();
    const items    = serpData?.tasks?.[0]?.result?.[0]?.items || [];

    const organic: any[] = items
      .filter((item: any) => item.type === 'organic')
      .map((item: any) => {
        const domain = (item.domain || '').toLowerCase();
        const comp   = COMPETITORS.find(c => domain.includes(c));
        return {
          position:       item.rank_absolute,
          title:          item.title,
          url:            item.url,
          domain:         item.domain,
          description:    item.description,
          isCompetitor:   !!comp,
          competitorName: comp || null,
          isKolet:        domain.includes('kolet'),
        };
      })
      .slice(0, 10);

    const aiOverview       = items.find((i: any) => i.type === 'ai_overview' || i.type === 'ai_generated_answer');
    const featuredSnippet  = items.find((i: any) => i.type === 'featured_snippet');
    const peopleAlsoAsk    = items
      .filter((i: any) => i.type === 'people_also_ask')
      .flatMap((i: any) => i.items || [])
      .map((i: any) => i.title)
      .slice(0, 6);

    const competitorPositions = COMPETITORS.map(name => {
      const found = organic.find(r => r.competitorName === name);
      return { name, position: found?.position ?? null, url: found?.url ?? null };
    }).filter(c => c.position !== null || ['airalo', 'holafly', 'saily'].includes(c.name));

    const koletResult   = organic.find(r => r.isKolet);
    const koletPosition = koletResult?.position ?? null;

    // Battle plan from Claude
    const ac  = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await ac.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages: [{
        role: 'user',
        content: `You are an SEO strategist for Kolet, a French eSIM travel brand (B Corp, Flying Blue partner, 190+ countries, pay-per-use, founded 2024).

Keyword: "${keyword}" (${lang})
Kolet current position: ${koletPosition ?? 'Not in top 20'}

Competitor positions:
${competitorPositions.filter(c => c.position).map(c => `- ${c.name}: #${c.position}`).join('\n') || '- None in top 10'}
${competitorPositions.filter(c => !c.position).map(c => `- ${c.name}: not ranking`).join('\n')}

Top 5 SERP: ${organic.slice(0, 5).map(r => `#${r.position} ${r.domain}`).join(', ')}
AI Overview: ${aiOverview ? 'YES' : 'No'} | Featured Snippet: ${featuredSnippet ? 'YES' : 'No'}
People Also Ask: ${peopleAlsoAsk.slice(0, 4).join(' | ') || 'None'}

Give Kolet a concrete battle plan to rank top 3. Return ONLY JSON (no markdown):
{
  "difficulty": "Easy|Medium|Hard",
  "kolet_angle": "specific content angle Kolet should take vs competitors",
  "recommended_format": "listicle|comparison|guide|how-to|faq",
  "battle_plan": ["step 1 (specific)", "step 2", "step 3"],
  "target_snippet": true or false,
  "target_ai_overview": true or false,
  "estimated_effort": "Low|Medium|High"
}`,
      }],
    });

    const raw      = (msg.content[0] as any).text.trim();
    const m        = raw.match(/\{[\s\S]*\}/);
    const battlePlan = m ? (() => { try { return JSON.parse(m[0]); } catch { return null; } })() : null;

    return NextResponse.json({
      keyword,
      organic,
      competitor_positions: competitorPositions,
      kolet_position:       koletPosition,
      ai_overview:          !!aiOverview,
      featured_snippet:     !!featuredSnippet,
      people_also_ask:      peopleAlsoAsk,
      battle_plan:          battlePlan,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}

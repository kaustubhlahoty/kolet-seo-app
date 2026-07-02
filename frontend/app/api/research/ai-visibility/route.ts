import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 45;

const BASE_URL  = 'https://api.dataforseo.com/v3';
const LOC_CODES: Record<string, number> = { en: 2840, fr: 2250, de: 2158, es: 2724, nl: 2528, it: 2380 };

export async function POST(request: Request) {
  const { keywords, lang = 'en' } = await request.json();
  const login    = process.env.DATAFORSEO_LOGIN    || '';
  const password = process.env.DATAFORSEO_PASSWORD || '';
  if (!login) return NextResponse.json({ error: 'DataForSEO not configured' }, { status: 500 });

  const loc  = LOC_CODES[lang] ?? 2840;
  const auth = 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64');

  // Sample top 5 keywords to check AI Overview presence — avoid over-spending API credits
  const checkKws = (keywords as string[]).slice(0, 5);

  const serpChecks = await Promise.allSettled(
    checkKws.map(keyword =>
      fetch(`${BASE_URL}/serp/google/organic/live/advanced`, {
        method:  'POST',
        headers: { Authorization: auth, 'Content-Type': 'application/json' },
        body: JSON.stringify([{ keyword, location_code: loc, language_code: lang, device: 'desktop', depth: 10 }]),
      })
        .then(r => r.json())
        .then(data => ({ keyword, items: data?.tasks?.[0]?.result?.[0]?.items || [] }))
    )
  );

  const serpResults = serpChecks
    .filter(r => r.status === 'fulfilled')
    .map(r => (r as PromiseFulfilledResult<any>).value);

  const aiOverviewKeywords    = serpResults.filter(r => r.items.some((i: any) => i.type === 'ai_overview' || i.type === 'ai_generated_answer')).map(r => r.keyword);
  const featuredSnippetKws    = serpResults.filter(r => r.items.some((i: any) => i.type === 'featured_snippet')).map(r => r.keyword);
  const peopleAlsoAskCounts   = serpResults.filter(r => r.items.some((i: any) => i.type === 'people_also_ask')).length;

  // Claude full AI visibility analysis
  const ac  = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const msg = await ac.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: `You are an AI search visibility specialist for Kolet — a French eSIM travel brand (B Corp, Flying Blue partner, pay-per-use data, 190+ countries, founded 2024).

Keyword set analyzed: ${(keywords as string[]).slice(0, 15).join(', ')}
Google AI Overviews detected for: ${aiOverviewKeywords.join(', ') || 'none in sample'}
Featured Snippets detected for: ${featuredSnippetKws.join(', ') || 'none in sample'}
People Also Ask present: ${peopleAlsoAskCounts} / ${serpResults.length} sampled SERPs

Give Kolet a concrete AI search visibility strategy. Return ONLY valid JSON (no markdown):
{
  "overall_ai_readiness": "Low|Medium|High",
  "priority_action": "single most impactful action Kolet should take this week",
  "ai_overview_tips": [
    "specific tip for ranking in Google AI Overviews (mention exact content format/structure)"
  ],
  "perplexity_tips": [
    "specific tip for appearing in Perplexity answers (cite authoritative signals needed)"
  ],
  "chatgpt_tips": [
    "specific tip to get mentioned by ChatGPT when users ask about travel eSIMs"
  ],
  "llm_training_tips": [
    "specific content Kolet should publish to be cited in future LLM training"
  ],
  "quick_wins": [
    {
      "format": "content format name",
      "example": "concrete title or example",
      "why": "why this format gets cited by AI"
    }
  ],
  "schema_markup": ["structured data types Kolet should add to increase AI citation chances"],
  "paa_opportunities": ["People Also Ask questions Kolet should create dedicated answer pages for"]
}

Requirements:
- ai_overview_tips: exactly 3 tips
- perplexity_tips: exactly 3 tips
- chatgpt_tips: exactly 3 tips
- llm_training_tips: exactly 2 tips
- quick_wins: exactly 3 items
- schema_markup: 2-4 types
- paa_opportunities: 3-5 questions`,
    }],
  });

  const raw = (msg.content[0] as any).text.trim();
  const m   = raw.match(/\{[\s\S]*\}/);
  if (!m) return NextResponse.json({ error: 'Analysis failed' }, { status: 502 });

  try {
    const result = JSON.parse(m[0]);
    return NextResponse.json({
      ...result,
      ai_overview_keywords:     aiOverviewKeywords,
      featured_snippet_keywords: featuredSnippetKws,
    });
  } catch {
    return NextResponse.json({ error: 'Parse failed' }, { status: 502 });
  }
}

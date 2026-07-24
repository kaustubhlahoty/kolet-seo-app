import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getKoletKnowledgeBrief, getKoletKnowledgeFull } from '@/lib/kolet-knowledge';
import { getPricingContext } from '@/lib/pricing';

export const maxDuration = 60;

const ac = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function reviewVoiceTone(content: string, lang: string): Promise<{
  score: number;
  ai_patterns: string[];
  voice_issues: string[];
  rewrites: { original: string; suggestion: string }[];
  verdict: string;
}> {
  const msg = await ac.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    messages: [{
      role: 'user',
      content: `You are a senior editor reviewing a Kolet eSIM travel brand article for voice, tone, and authenticity.

Kolet's voice: warm, direct, slightly irreverent, like a well-travelled friend — NOT corporate, NOT AI-sounding.

ARTICLE (lang: ${lang}):
${content.slice(0, 4000)}

Review for:
1. AI-pattern openers ("In today's digital world", "In conclusion", "It's important to note", etc.)
2. Corporate/stiff language that doesn't match the brand voice
3. Conclusions that merely summarise what was already said
4. Vague sentences that could apply to any eSIM brand (not specific to Kolet)
5. Over-use of transition phrases ("Furthermore", "Moreover", "Additionally")

Return ONLY this JSON:
{
  "score": 0-100,
  "ai_patterns": ["exact phrase that sounds AI-generated"],
  "voice_issues": ["description of voice/tone problem"],
  "rewrites": [
    {"original": "exact sentence from article", "suggestion": "improved version in same language"}
  ],
  "verdict": "one sentence overall verdict"
}

Score guide: 90+ = publishable as-is, 70-89 = minor fixes, 50-69 = needs rewrite in sections, <50 = significant revision needed.
Return ONLY JSON.`,
    }],
  });
  const text = (msg.content[0] as any).text.trim();
  const m = text.match(/\{[\s\S]*\}/);
  return m ? JSON.parse(m[0]) : { score: 0, ai_patterns: [], voice_issues: [], rewrites: [], verdict: 'Review failed' };
}

async function reviewFacts(content: string, lang: string, targetZone?: string): Promise<{
  score: number;
  verified_claims: string[];
  flagged_claims: { claim: string; issue: string }[];
  verdict: string;
}> {
  const knowledge   = getKoletKnowledgeFull();
  const livePricing = await getPricingContext(targetZone).catch(() => '');
  const msg = await ac.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1000,
    messages: [{
      role: 'user',
      content: `You are a fact-checker for Kolet, a French eSIM travel brand.

VERIFIED KOLET FACTS:
${knowledge}

${livePricing ? `LIVE PRICING (authoritative — use to verify any price claims):\n${livePricing}\n` : ''}
ARTICLE TO CHECK (lang: ${lang}):
${content.slice(0, 3000)}

Check every Kolet-specific claim against the verified facts and live pricing above.
Pay special attention to: plan prices, GB sizes, network operator names, country coverage, validity period.

Return ONLY this JSON:
{
  "score": 0-100,
  "verified_claims": ["claim that checks out"],
  "flagged_claims": [
    {"claim": "exact text from article", "issue": "why this is wrong or unverifiable"}
  ],
  "verdict": "one sentence overall"
}

Flag: wrong prices, wrong plan sizes, invented network names, wrong validity period, invented statistics.
Score: 100 = all claims verified, 70 = minor uncertainties, <50 = significant errors found.
Return ONLY JSON.`,
    }],
  });
  const text = (msg.content[0] as any).text.trim();
  const m = text.match(/\{[\s\S]*\}/);
  return m ? JSON.parse(m[0]) : { score: 0, verified_claims: [], flagged_claims: [], verdict: 'Review failed' };
}

async function reviewCTR(title: string, seoTitle: string, seoDesc: string, focusKeyword: string, lang: string): Promise<{
  title_variants: { text: string; reasoning: string }[];
  meta_variants: { text: string; reasoning: string }[];
  snippet_tips: string[];
}> {
  const msg = await ac.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1200,
    messages: [{
      role: 'user',
      content: `You are a CTR optimisation specialist for Kolet, a French eSIM travel brand.

Article title: "${title}"
Current SEO title: "${seoTitle}"
Current meta description: "${seoDesc}"
Primary keyword: "${focusKeyword}"
Language: ${lang}

Generate CTR-optimised alternatives. Return ONLY this JSON:
{
  "title_variants": [
    {"text": "60-char max title", "reasoning": "why this gets more clicks"},
    {"text": "second variant", "reasoning": "..."},
    {"text": "third variant", "reasoning": "..."}
  ],
  "meta_variants": [
    {"text": "155-char max meta", "reasoning": "benefit-led"},
    {"text": "question-led variant", "reasoning": "..."},
    {"text": "action-led variant", "reasoning": "..."}
  ],
  "snippet_tips": [
    "specific change to improve featured snippet eligibility"
  ]
}

Rules for titles: include primary keyword, add a number if natural, use power words (best, guide, free, avoid), avoid clickbait.
Rules for meta: keyword in first 50 chars, include a call to action, 145-155 chars ideal.
Write all variants in ${lang}.
Return ONLY JSON.`,
    }],
  });
  const text = (msg.content[0] as any).text.trim();
  const m = text.match(/\{[\s\S]*\}/);
  return m ? JSON.parse(m[0]) : { title_variants: [], meta_variants: [], snippet_tips: [] };
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const rows = await sql`SELECT content, lang, title, focus_keyword, meta_description, target_zone FROM articles WHERE id=${id}`;
  if (!rows.length) return NextResponse.json({ error: 'Article not found' }, { status: 404 });

  const { content, lang, title, focus_keyword, meta_description, target_zone } = rows[0] as any;

  // Extract SEO title and description from article content
  const seoTitleMatch = content?.match(/SEO TITLE[^\n]*:\n([^\n═]+)/);
  const seoDescMatch  = content?.match(/SEO DESCRIPTION[^\n]*:\n([^\n═]+)/);
  const seoTitle = seoTitleMatch?.[1]?.trim() ?? title ?? '';
  const seoDesc  = seoDescMatch?.[1]?.trim()  ?? meta_description ?? '';

  // Run all three reviews in parallel — facts check now gets live pricing for the target zone
  const [voice, facts, ctr] = await Promise.all([
    reviewVoiceTone(content ?? '', lang ?? 'en'),
    reviewFacts(content ?? '', lang ?? 'en', target_zone ?? undefined),
    reviewCTR(title ?? '', seoTitle, seoDesc, focus_keyword ?? '', lang ?? 'en'),
  ]);

  const overallScore = Math.round((voice.score + facts.score) / 2);

  // Store review score back to DB
  try {
    await sql`UPDATE articles SET eeat_score=${overallScore} WHERE id=${id}`;
  } catch {}

  return NextResponse.json({ voice, facts, ctr, overall_score: overallScore });
}

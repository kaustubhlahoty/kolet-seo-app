import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export const maxDuration = 30;

export interface LinkCandidate {
  id: string;
  title: string;
  slug: string;
  anchor_text: string;
  reason: string;
  where_to_link?: string; // only on inbound candidates
}

export interface LinkCandidatesResult {
  outbound: LinkCandidate[]; // new article → existing (new article should link TO these)
  inbound: LinkCandidate[];  // existing → new article (update these to link back)
}

export async function POST(request: Request) {
  const { headline, focus_keyword, secondary_keywords = [], lang = 'en', target_zone = 'global' } = await request.json();

  if (!headline || !focus_keyword) {
    return NextResponse.json({ outbound: [], inbound: [] });
  }

  // Pull existing articles — just enough for Claude to reason about relevance
  const rows = await sql`
    SELECT id, title, slug, lang, focus_keyword, target_zone
    FROM articles
    WHERE status != 'archived'
    ORDER BY created_at DESC
    LIMIT 60
  `;

  if (!rows.length) return NextResponse.json({ outbound: [], inbound: [] });

  const articleList = rows.map((r: any) =>
    `id:${r.id} | "${r.title}" | keyword:${r.focus_keyword} | lang:${r.lang} | zone:${r.target_zone} | slug:${r.slug}`
  ).join('\n');

  const ac = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const msg = await ac.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1200,
    messages: [{
      role: 'user',
      content: `You are an SEO internal linking strategist for Kolet, a French eSIM travel brand.

NEW ARTICLE being written:
Title: "${headline}"
Primary keyword: ${focus_keyword}
Secondary keywords: ${(secondary_keywords as string[]).join(', ') || 'none'}
Language: ${lang}
Zone: ${target_zone}

EXISTING ARTICLES (id | title | keyword | lang | zone | slug):
${articleList}

Find internal linking opportunities. Return ONLY this JSON:
{
  "outbound": [
    {"id":"...","title":"...","slug":"...","anchor_text":"natural anchor text for the link","reason":"one sentence why"}
  ],
  "inbound": [
    {"id":"...","title":"...","slug":"...","anchor_text":"natural anchor text","where_to_link":"which section of the existing article to add the link","reason":"one sentence why"}
  ]
}

Rules:
- outbound: existing articles the NEW article should link TO (max 4, genuine semantic overlap only)
- inbound: existing articles that should be UPDATED to add a link back to the new article (max 4)
- Prioritise same-language articles (lang: ${lang})
- Anchor text must be natural and contextual — never keyword-stuffed
- Skip weak connections — 0 results is better than forced links
- Return ONLY valid JSON, no markdown fences, no explanation.`,
    }],
  });

  try {
    const text = (msg.content[0] as any).text.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const result: LinkCandidatesResult = jsonMatch
      ? JSON.parse(jsonMatch[0])
      : { outbound: [], inbound: [] };
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ outbound: [], inbound: [] });
  }
}

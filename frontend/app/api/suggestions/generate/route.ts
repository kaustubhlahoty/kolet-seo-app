import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { sql } from '@/lib/db';
import { randomUUID } from 'crypto';

export const maxDuration = 60;

const SUGGESTION_SYSTEM = `You are the autonomous SEO content strategist for Kolet, a French eSIM travel brand sold via kolet.com and Air France-KLM Flying Blue.

Your job: generate a batch of high-opportunity article topics that Kolet should write to grow organic traffic. Be proactive — consider:
- Seasonal travel trends (current month/season)
- Destinations with growing eSIM demand
- Comparison articles where Kolet can beat competitors
- How-to content that captures pre-travel searches
- Topics competitors rank for that Kolet doesn't cover yet

Return ONLY a valid JSON array of topic objects. No markdown fences.`;

export async function POST(request: Request) {
  const { lang = 'en', count = 5 } = await request.json().catch(() => ({}));

  // Fetch already-covered keywords to avoid duplication
  const covered = await sql`
    SELECT focus_keyword FROM articles WHERE focus_keyword IS NOT NULL
    UNION
    SELECT focus_keyword FROM topics WHERE focus_keyword IS NOT NULL AND status != 'rejected'
  `;
  const coveredKws = (covered as any[]).map(r => r.focus_keyword).filter(Boolean).join(', ');

  const today = new Date().toISOString().split('T')[0];
  const month = new Date().toLocaleString('en', { month: 'long' });

  const ac = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const msg = await ac.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 3000,
    system: SUGGESTION_SYSTEM,
    messages: [{
      role: 'user',
      content: `Today: ${today} (${month} — consider seasonal travel patterns for this month)
Language: ${lang}
Generate exactly ${count} article topic ideas.

Already covered (do NOT duplicate these): ${coveredKws || 'none yet'}

Each topic object must have:
{
  "headline": "exact article title",
  "focus_keyword": "primary SEO keyword",
  "secondary_keywords": ["kw1", "kw2", "kw3"],
  "content_format": "guide" | "comparison" | "how-to" | "listicle" | "faq" | "pillar",
  "kolet_angle": "what makes this uniquely valuable for Kolet vs competitors",
  "word_count": 900,
  "difficulty": "Easy" | "Medium" | "Hard",
  "target_zone": "country or region or global",
  "rationale": "why this topic will drive traffic NOW"
}

Focus on: high-intent destination eSIM searches, comparison articles (Kolet vs carrier plans), seasonal travel destinations for ${month}, and underserved How-to queries.

Return ONLY the JSON array.`,
    }],
  });

  let raw = (msg.content[0] as any).text.trim();
  if (raw.startsWith('```')) {
    const lines = raw.split('\n');
    raw = lines.slice(1, lines.at(-1) === '```' ? -1 : undefined).join('\n');
  }

  const topics = JSON.parse(raw.trim());
  const saved = [];

  for (const t of topics) {
    const id = `topic-${randomUUID().slice(0, 8)}`;
    await sql`
      INSERT INTO topics (id,headline,focus_keyword,secondary_keywords,content_format,kolet_angle,word_count,difficulty,target_zone,lang,rationale,status,source)
      VALUES (${id},${t.headline},${t.focus_keyword},${JSON.stringify(t.secondary_keywords||[])},${t.content_format||'guide'},${t.kolet_angle||''},${t.word_count||1000},${t.difficulty||'Medium'},${t.target_zone||'global'},${lang},${t.rationale||''},${'suggested'},${'auto'})
      ON CONFLICT (id) DO NOTHING
    `.catch(() => {});
    saved.push({ ...t, id, status: 'suggested', source: 'auto', lang });
  }

  return NextResponse.json({ topics: saved, generated_at: today });
}

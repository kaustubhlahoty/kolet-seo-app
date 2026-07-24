import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { sql } from '@/lib/db';
import { randomUUID } from 'crypto';

export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const { idea, keywords = [], lang = 'en', count = 5 } = await request.json();

    if (!idea?.trim()) {
      return NextResponse.json({ error: 'idea is required' }, { status: 400 });
    }

    const month = new Date().toLocaleString('en', { month: 'long' });
    const year  = new Date().getFullYear();
    const kwStr = Array.isArray(keywords) ? keywords.filter(Boolean).join(', ') : String(keywords || '');

    // Fetch already-covered keywords to avoid duplication
    const covered = await sql`
      SELECT focus_keyword FROM articles WHERE focus_keyword IS NOT NULL
      UNION
      SELECT focus_keyword FROM topics WHERE focus_keyword IS NOT NULL AND status != 'rejected'
    `;
    const coveredKws = (covered as any[]).map(r => r.focus_keyword).filter(Boolean).join(', ');

    const ac = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const msg = await ac.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      system: `You are a senior SEO content strategist for Kolet, a French eSIM travel brand (kolet.com) partnered with Air France-KLM Flying Blue.

A content creator has shared an idea. Your job: research this topic deeply and expand it into ${count} distinct, high-opportunity article angles — each with a unique search intent, format, or audience.

Kolet's key differentiators to weave in:
- 10 Flying Blue miles per € spent (Air France, KLM, Transavia, etc.)
- Koins cashback on unused data
- B-Corp certified (score 99.7/200, Jan 2026) — only certified major travel eSIM
- French-language support
- Affordable European + global eSIM plans
- No throttling — fixed-data plans at full speed

Think like a keyword researcher: consider search volume, competition, commercial intent, and seasonal demand for ${month} ${year}.

Return ONLY valid JSON — no markdown fences, no explanation.`,
      messages: [{
        role: 'user',
        content: `User's idea: "${idea.trim()}"
${kwStr ? `Target keywords: ${kwStr}` : ''}
Target language for articles: ${lang}
${coveredKws ? `Already covered (avoid duplicating): ${coveredKws}` : ''}

Expand this into exactly ${count} specific article topics with different angles.
Mix formats: comparison, how-to, guide, listicle, faq, pillar.

Return a JSON object:
{
  "insight": "2-3 sentence analysis: why this idea has SEO potential, what the competitive landscape looks like, and Kolet's best angle",
  "topics": [
    {
      "headline": "exact article title",
      "focus_keyword": "primary SEO keyword phrase",
      "secondary_keywords": ["kw1", "kw2", "kw3"],
      "content_format": "guide" | "comparison" | "how-to" | "listicle" | "faq" | "pillar",
      "kolet_angle": "why this angle is uniquely valuable for Kolet vs competitors",
      "word_count": 1000,
      "difficulty": "Easy" | "Medium" | "Hard",
      "target_zone": "country/region/global",
      "rationale": "why this will drive traffic and conversions NOW"
    }
  ]
}`,
      }],
    });

    let raw = (msg.content[0] as any).text.trim();
    if (raw.startsWith('```')) {
      const lines = raw.split('\n');
      raw = lines.slice(1, lines.at(-1)?.trim() === '```' ? -1 : undefined).join('\n');
    }

    const parsed = JSON.parse(raw.trim());
    const topics: any[] = Array.isArray(parsed) ? parsed : (parsed.topics ?? []);
    const insight: string = parsed.insight ?? '';

    const saved = [];
    for (const t of topics) {
      const id = `topic-${randomUUID().slice(0, 8)}`;
      await sql`
        INSERT INTO topics (
          id, headline, focus_keyword, secondary_keywords, content_format,
          kolet_angle, word_count, difficulty, target_zone, lang, rationale, status, source
        ) VALUES (
          ${id}, ${t.headline}, ${t.focus_keyword},
          ${JSON.stringify(t.secondary_keywords ?? [])},
          ${t.content_format ?? 'guide'}, ${t.kolet_angle ?? ''},
          ${t.word_count ?? 1000}, ${t.difficulty ?? 'Medium'},
          ${t.target_zone ?? 'global'}, ${lang}, ${t.rationale ?? ''},
          ${'suggested'}, ${'manual'}
        )
        ON CONFLICT (id) DO NOTHING
      `.catch(() => {});
      saved.push({ ...t, id, status: 'suggested', source: 'manual', lang });
    }

    return NextResponse.json({ topics: saved, insight });
  } catch (err: any) {
    console.error('[from-idea]', err?.message);
    return NextResponse.json({ error: err?.message ?? 'Failed to generate ideas' }, { status: 500 });
  }
}

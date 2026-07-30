import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { sql } from '@/lib/db';
import { QUALITY_PROMPT } from '@/lib/prompts';

// Bad openers per language — AI-sounding filler that signals low-quality content
const BAD_OPENER_RE = /(in today's digital|in this article|in this guide|in conclusion|it's important to note|dans cet article|dans ce guide|il est important de|en conclusion|aujourd'hui nous allons|in diesem artikel|in diesem guide|es ist wichtig|zum abschluss|in dit artikel|in deze gids|het is belangrijk|tot slot|en este artículo|en esta guía|es importante|en conclusión)/i;

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = await sql`SELECT content,title,focus_keyword,meta_description,lang FROM articles WHERE id=${id}`;
  if (!rows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { content, title, focus_keyword, meta_description } = rows[0] as any;
  const kw    = (focus_keyword || '').toLowerCase();
  const body  = (content || '').replace(/POST TITLE[\s\S]*?═{10,}\nPOST CONTENT[^\n]*\n/, '');
  const words = body.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const fullText  = (content || '').toLowerCase();
  const kwCount   = kw ? (fullText.match(new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length : 0;
  const kwDensity = wordCount > 0 ? kwCount / wordCount * 100 : 0;

  // Weighted SEO checks — max 100 pts total
  const checks: Record<string, { pass: boolean; pts: number; label: string }> = {
    kw_in_title:       { pass: !!(kw && (title || '').toLowerCase().includes(kw)),                                   pts: 15, label: 'Keyword in title' },
    kw_in_first_100:   { pass: !!(kw && words.slice(0, 100).join(' ').toLowerCase().includes(kw)),                  pts: 12, label: 'Keyword in first 100 words' },
    kw_density_ok:     { pass: kwDensity >= 0.5 && kwDensity <= 2.5,                                                pts: 10, label: 'Keyword density 0.5–2.5%' },
    word_count_ok:     { pass: wordCount >= 700,                                                                     pts: 10, label: 'Body word count ≥ 700' },
    has_h2:            { pass: /^##\s/m.test(body),                                                                  pts: 10, label: 'Has H2 headings' },
    multiple_h2:       { pass: (body.match(/^##\s/gm) || []).length >= 3,                                            pts:  8, label: '3+ H2 sections' },
    has_images:        { pass: /IMAGE_PLACEHOLDER_/i.test(content || ''),                                            pts:  8, label: 'Has image placeholders' },
    has_promo:         { pass: /PROMO CARD|ctaHref|ctaText/i.test(content || ''),                                    pts:  7, label: 'Has PROMO card' },
    kw_in_meta:        { pass: !!(kw && (meta_description || '').toLowerCase().includes(kw)),                        pts:  8, label: 'Keyword in meta description' },
    no_bad_opener:     { pass: !BAD_OPENER_RE.test((body || '').slice(0, 300)), pts: 12, label: 'No AI-pattern opener' },
  };

  const seoScore = Math.round(
    Object.values(checks).reduce((sum, c) => sum + (c.pass ? c.pts : 0), 0)
  );

  let ai: any = null;
  try {
    const ac = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await ac.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      system: QUALITY_PROMPT,
      messages: [{ role: 'user', content: `Review this article (${wordCount} words, keyword: "${focus_keyword}"):\n\n${(content || '').slice(0, 5000)}` }],
    });
    let raw = (msg.content[0] as any).text.trim();
    if (raw.startsWith('```')) {
      const lines = raw.split('\n');
      raw = lines.slice(1, lines[lines.length - 1] === '```' ? -1 : undefined).join('\n');
    }
    ai = JSON.parse(raw.trim());
  } catch {}

  const eeatScore = ai?.eeat_score ?? null;
  const verdict   = ai?.verdict ?? (eeatScore !== null ? (eeatScore >= 75 ? 'PASS' : eeatScore >= 55 ? 'NEEDS_REVISION' : 'FAIL') : 'NEEDS_REVISION');

  const report = {
    seo_score: seoScore,
    eeat_score: eeatScore,
    verdict,
    seo_checks: Object.fromEntries(Object.entries(checks).map(([k, v]) => [k, { pass: v.pass, label: v.label, pts: v.pts }])),
    brand_voice_score: ai?.brand_voice_score ?? null,
    depth_score:       ai?.depth_score ?? null,
    accuracy_score:    ai?.accuracy_score ?? null,
    structure_score:   ai?.structure_score ?? null,
    issues: ai?.issues ?? [],
    fixes:  ai?.fixes  ?? [],
  };

  await sql`UPDATE articles SET seo_score=${seoScore}, eeat_score=${eeatScore}, audit_report=${JSON.stringify(report)} WHERE id=${id}`;

  return NextResponse.json({
    seo_score: seoScore,
    eeat_score: eeatScore,
    verdict,
    seo_checks: Object.fromEntries(Object.entries(checks).map(([k, v]) => [k, { pass: v.pass, label: v.label, pts: v.pts }])),
    brand_voice_score: ai?.brand_voice_score ?? null,
    depth_score:       ai?.depth_score ?? null,
    accuracy_score:    ai?.accuracy_score ?? null,
    structure_score:   ai?.structure_score ?? null,
    issues: ai?.issues ?? [],
    fixes:  ai?.fixes  ?? [],
  });
}

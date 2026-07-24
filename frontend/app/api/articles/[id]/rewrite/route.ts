import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { sql } from '@/lib/db';
import { getSystemPrompt } from '@/lib/prompts';
import { getKoletKnowledgeBrief } from '@/lib/kolet-knowledge';
import { buildCtaHref } from '@/lib/cta-href';

export const maxDuration = 300;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { issues = [], fixes = [], seo_checks = {} } = await request.json();

    const rows = await sql`SELECT content, title, focus_keyword, lang, target_zone, content_format FROM articles WHERE id=${id}`;
    if (!rows.length) return NextResponse.json({ error: 'Article not found' }, { status: 404 });

    const { content, focus_keyword, lang, target_zone, content_format } = rows[0] as any;

    await sql`UPDATE articles SET content_backup=${content} WHERE id=${id}`.catch(() => {});

    const failedChecks = Object.entries(seo_checks as Record<string, { pass: boolean; label: string; pts: number }>)
      .filter(([, v]) => !v.pass)
      .map(([, v]) => `- ${v.label} (worth ${v.pts} pts)`);

    const langLabels: Record<string, string> = { fr: 'français', en: 'English', de: 'Deutsch', nl: 'Nederlands', es: 'Español' };
    const langLabel = langLabels[lang ?? 'en'] ?? 'English';
    const SYSTEM = getSystemPrompt(lang ?? 'en');
    const knowledge = getKoletKnowledgeBrief();

    const WORD_COUNT_BY_FORMAT: Record<string, string> = {
      guide: '1,000–1,500', comparison: '1,000–1,400', 'how-to': '800–1,200',
      listicle: '600–900', faq: '600–900', pillar: '1,500–2,000',
    };
    const wordCountTarget = WORD_COUNT_BY_FORMAT[content_format ?? 'guide'] ?? '800–1,200';

    const prompt = `You are rewriting a Kolet eSIM article to fix specific quality and SEO gaps. Keep the EXACT SAME CMS output format and structure. Do NOT change the topic, focus keyword, or main angle.

ORIGINAL ARTICLE:
${(content || '').slice(0, 6000)}

═══════════════════════════
REQUIRED FIXES — address EVERY item:
═══════════════════════════

Content issues to fix:
${issues.length > 0 ? issues.map((x: string, i: number) => `${i + 1}. ${x}`).join('\n') : '(none)'}

Actionable fixes to apply:
${fixes.length > 0 ? fixes.map((x: string, i: number) => `${i + 1}. ${x}`).join('\n') : '(none)'}

SEO gaps to close:
${failedChecks.length > 0 ? failedChecks.join('\n') : '(none)'}

═══════════════════════════
REWRITE RULES:
═══════════════════════════
- Keep the exact CMS format (POST TITLE, INTRO, KEY TAKEAWAYS, COVER IMAGE, POST CONTENT sections, PROMO CARD, SEO TITLE/DESCRIPTION)
- Keyword "${focus_keyword}" must appear in the first 100 words and maintain 0.5–2.5% density across the body
- Write entirely in ${langLabel}
- Word count target: ${wordCountTarget} words in post.content (format: ${content_format ?? 'guide'})
- Target zone: ${target_zone}
- Brand voice: warm, direct, slightly irreverent. No corporate language. No AI-sounding openers.
- CRITICAL: The character — (em dash) must never appear anywhere in the output. Replace every em dash with a comma, colon, semicolon, or period. Zero exceptions.
- Preserve all IMAGE_PLACEHOLDER_ references and the PROMO CARD
- PROMO card ctaHref: use EXACTLY "${buildCtaHref(target_zone, lang ?? 'en')}" — do not change this URL. The country name in the URL is always in English regardless of article language.

${knowledge}

Output ONLY the complete rewritten article in CMS format. No preamble, no explanation, no markdown fences.`;

    const ac = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const stream = await ac.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 6000,
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    });
    const finalMsg = await stream.finalMessage();
    const rawRewrite = (finalMsg.content[0] as { type: string; text: string }).text.trim();
    // Hard strip: remove any em dashes the model may have produced
    const rewrittenContent = rawRewrite.replace(/\s*—\s*/g, ', ');

    const kw = (focus_keyword || '').toLowerCase();
    const body = rewrittenContent.replace(/POST TITLE[\s\S]*?═{10,}\nPOST CONTENT[^\n]*\n/, '');
    const words = body.split(/\s+/).filter(Boolean);
    const wordCount = words.length;
    const fullLower = rewrittenContent.toLowerCase();
    const kwCount = kw ? (fullLower.match(new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length : 0;
    const kwDensity = wordCount > 0 ? kwCount / wordCount * 100 : 0;

    const metaMatch = rewrittenContent.match(/SEO DESCRIPTION[^\n]*:\n([^\n═]+)/);
    const metaDescription = metaMatch?.[1]?.trim() ?? '';

    const seoChecks = {
      kw_in_title:     !!(kw && (rewrittenContent.match(/POST TITLE[^\n]*:\n([^\n]+)/)?.[1] ?? '').toLowerCase().includes(kw)),
      kw_in_first_100: !!(kw && words.slice(0, 100).join(' ').toLowerCase().includes(kw)),
      kw_density_ok:   kwDensity >= 0.5 && kwDensity <= 2.5,
      word_count_ok:   wordCount >= 700,
      has_h2:          /^##\s/m.test(body),
      multiple_h2:     (body.match(/^##\s/gm) || []).length >= 3,
      has_images:      /IMAGE_PLACEHOLDER_/i.test(rewrittenContent),
      has_promo:       /PROMO CARD|ctaHref|ctaText/i.test(rewrittenContent),
      kw_in_meta:      !!(kw && metaDescription.toLowerCase().includes(kw)),
      no_bad_opener:   !/(in today's digital|in this article|in this guide|in conclusion|it's important to note|dans cet article|dans ce guide|il est important de|en conclusion|in diesem artikel|in dit artikel|in deze gids|en este artículo|en esta guía)/i.test((body || '').slice(0, 300)),
    };

    const pts: Record<string, number> = { kw_in_title: 15, kw_in_first_100: 12, kw_density_ok: 10, word_count_ok: 10, has_h2: 10, multiple_h2: 8, has_images: 8, has_promo: 7, kw_in_meta: 8, no_bad_opener: 12 };
    const newSeoScore = Object.entries(seoChecks).reduce((sum, [k, pass]) => sum + (pass ? (pts[k] ?? 0) : 0), 0);

    await sql`UPDATE articles SET content=${rewrittenContent}, seo_score=${newSeoScore}, audit_report=NULL, status='needs_revision' WHERE id=${id}`;

    const origin = new URL(request.url).origin;
    fetch(`${origin}/api/articles/${id}/review`, { method: 'POST' }).catch(() => {});

    return NextResponse.json({ seo_score: newSeoScore });
  } catch (e: any) {
    console.error('[rewrite] ERROR:', e?.message, e?.stack);
    return NextResponse.json({ error: e?.message ?? 'Internal server error' }, { status: 500 });
  }
}

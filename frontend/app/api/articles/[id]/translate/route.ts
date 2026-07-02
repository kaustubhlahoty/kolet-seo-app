import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { sql } from '@/lib/db';
import { randomUUID } from 'crypto';

export const maxDuration = 300;

const LANG_NAMES: Record<string, string> = {
  en: 'English', fr: 'French', de: 'German', es: 'Spanish', nl: 'Dutch',
  it: 'Italian', pt: 'Portuguese', ja: 'Japanese', zh: 'Chinese',
};

// Delimiter-based parsing — immune to JSON escaping issues with long content
function parseDelimited(raw: string): { title: string; slug: string; focus_keyword: string; meta_description: string; content: string } | null {
  const extract = (tag: string) => {
    const open  = `====${tag}====`;
    const close = `====${tag}_END====`;
    const si = raw.indexOf(open);
    const ei = raw.indexOf(close);
    if (si === -1 || ei === -1) return null;
    return raw.slice(si + open.length, ei).trim();
  };

  const title          = extract('TITLE');
  const slug           = extract('SLUG');
  const focus_keyword  = extract('FOCUS_KEYWORD');
  const meta_description = extract('META');
  const content        = extract('CONTENT');

  if (!title || !slug || !content) return null;
  return { title, slug, focus_keyword: focus_keyword ?? '', meta_description: meta_description ?? '', content };
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { target_lang } = await request.json();

  if (!target_lang) return NextResponse.json({ error: 'target_lang required' }, { status: 400 });

  const rows = await sql`SELECT * FROM articles WHERE id = ${id}`;
  if (!rows.length) return NextResponse.json({ error: 'Article not found' }, { status: 404 });

  const article = rows[0] as any;
  if (!article.content) return NextResponse.json({ error: 'Article has no content to translate' }, { status: 400 });

  const sourceLang     = LANG_NAMES[article.lang] || article.lang;
  const targetLangName = LANG_NAMES[target_lang]  || target_lang;

  const ac = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Use delimited format instead of JSON — avoids escaping failures on long content
  const msg = await ac.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 32000,
    system: `You are a professional travel content translator specializing in eSIM content for Kolet, a French eSIM brand.

Rules:
- Translate ALL text from ${sourceLang} to ${targetLangName}
- Preserve every IMAGE_PLACEHOLDER_xxx tag EXACTLY as written — do not translate or modify them
- Preserve all markdown formatting (## headings, **bold**, links, lists, > blockquotes)
- Preserve all CMS structure markers (═══, POST TITLE:, SEO METADATA:, INTRO, etc.) — translate only their values
- Adapt idioms naturally for the target language
- Keep brand names (Kolet, Airalo, Holafly), URLs, and product names untranslated
- The slug must be URL-safe: lowercase, hyphens only, target-language words`,
    messages: [{
      role: 'user',
      content: `Translate this article from ${sourceLang} to ${targetLangName}.

Original title: ${article.title}
Original focus keyword: ${article.focus_keyword}
Original slug: ${article.slug}
Original meta description: ${article.meta_description || ''}

ARTICLE CONTENT TO TRANSLATE:
${article.content}

Respond in EXACTLY this format — no other text, no code fences:
====TITLE====
{translated title}
====TITLE_END====
====SLUG====
{url-safe slug in target language}
====SLUG_END====
====FOCUS_KEYWORD====
{translated focus keyword}
====FOCUS_KEYWORD_END====
====META====
{translated meta description, max 155 chars}
====META_END====
====CONTENT====
{complete translated article content with all IMAGE_PLACEHOLDER_xxx tags kept exactly as-is}
====CONTENT_END====`,
    }],
  });

  const raw = (msg.content[0] as any).text;

  if (msg.stop_reason === 'max_tokens') {
    console.error('translate: hit max_tokens, content length:', article.content?.length);
    return NextResponse.json({ error: 'Article is too long to translate in one pass' }, { status: 500 });
  }

  const translated = parseDelimited(raw);
  if (!translated) {
    console.error('translate: failed to parse delimited response, raw[:400]:', raw.slice(0, 400));
    return NextResponse.json({ error: 'Translation response was malformed — missing required sections' }, { status: 500 });
  }

  const newId = `article-${randomUUID().slice(0, 8)}`;

  await sql`
    INSERT INTO articles (
      id, topic_id, title, slug, lang, focus_keyword, target_zone,
      content_format, status, content, meta_description, images, created_at
    ) VALUES (
      ${newId},
      ${article.topic_id},
      ${translated.title},
      ${translated.slug},
      ${target_lang},
      ${translated.focus_keyword},
      ${article.target_zone},
      ${article.content_format},
      ${'draft'},
      ${translated.content},
      ${translated.meta_description},
      ${article.images ?? null},
      NOW()
    )
  `;

  return NextResponse.json({
    id: newId,
    title: translated.title,
    lang: target_lang,
    slug: translated.slug,
    status: 'draft',
  });
}

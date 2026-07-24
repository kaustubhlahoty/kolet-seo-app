import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { sql } from '@/lib/db';

export const maxDuration = 300;

const LANG_NAMES: Record<string, string> = {
  en: 'English', fr: 'French', de: 'German', es: 'Spanish', nl: 'Dutch',
  it: 'Italian', pt: 'Portuguese', ja: 'Japanese', zh: 'Chinese',
};

export async function GET() {
  return NextResponse.json({ ok: true });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    console.log('[translate] POST called, id=', id);

    let body: { target_lang?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { target_lang } = body;
    if (!target_lang) return NextResponse.json({ error: 'target_lang required' }, { status: 400 });
    console.log('[translate] target_lang=', target_lang);

    let rows: any[];
    try {
      rows = await sql`SELECT * FROM articles WHERE id = ${id}`;
    } catch (dbErr: any) {
      console.error('[translate] DB SELECT failed:', dbErr?.message);
      return NextResponse.json({ error: 'DB error: ' + (dbErr?.message ?? 'unknown') }, { status: 500 });
    }

    if (!rows.length) return NextResponse.json({ error: 'Article not found' }, { status: 404 });

    const article = rows[0] as any;
    console.log('[translate] article.lang=', article.lang, 'content length=', article.content?.length);

    if (!article.content) return NextResponse.json({ error: 'Article has no content' }, { status: 400 });

    const sourceLang     = LANG_NAMES[article.lang] ?? article.lang ?? 'French';
    const targetLangName = LANG_NAMES[target_lang]  ?? target_lang;

    // Step 1: Insert a duplicate row immediately (so we have a target to update)
    const newId = `art-${Date.now().toString(36)}`;
    console.log('[translate] inserting duplicate with id=', newId);

    try {
      await sql`
        INSERT INTO articles (
          id, topic_id, title, slug, lang, focus_keyword, target_zone,
          content_format, status, content, meta_description, images, created_at
        ) VALUES (
          ${newId},
          ${article.topic_id ?? null},
          ${article.title + ' [translating…]'},
          ${article.slug + '-' + target_lang},
          ${target_lang},
          ${article.focus_keyword ?? null},
          ${article.target_zone ?? null},
          ${article.content_format ?? null},
          ${'draft'},
          ${article.content},
          ${article.meta_description ?? null},
          ${article.images ?? null},
          NOW()
        )
      `;
    } catch (insertErr: any) {
      console.error('[translate] INSERT failed:', insertErr?.message);
      return NextResponse.json({ error: 'Failed to create article copy: ' + (insertErr?.message ?? 'unknown') }, { status: 500 });
    }

    console.log('[translate] duplicate created, calling Claude…');

    // Step 2: Translate using Claude
    const ac = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // Use streaming — required by SDK v0.51+ for large max_tokens
    const stream = await ac.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 32000,
      system: `You are a professional travel content translator for Kolet, a French eSIM brand.
Rules:
- Translate ALL text from ${sourceLang} to ${targetLangName}
- Keep IMAGE_PLACEHOLDER_xxx tags EXACTLY as-is — never translate or modify them
- Keep all markdown: ## headings, **bold**, links, lists, > blockquotes
- Keep all CMS markers (═══ lines, POST TITLE:, SEO METADATA:, INTRO, etc.) — translate only their values
- Keep brand names (Kolet, Airalo, Holafly), URLs, product names untranslated
- Slug must be URL-safe: lowercase, hyphens only`,
      messages: [{
        role: 'user',
        content: `Translate this from ${sourceLang} to ${targetLangName}.

TITLE: ${article.title}
FOCUS KEYWORD: ${article.focus_keyword ?? ''}
SLUG: ${article.slug}
META: ${article.meta_description ?? ''}

CONTENT:
${article.content}

Reply ONLY in this exact format (no code fences, no extra text):
====TITLE====
translated title here
====TITLE_END====
====SLUG====
url-safe-slug-here
====SLUG_END====
====KW====
translated focus keyword
====KW_END====
====META====
translated meta description (max 155 chars)
====META_END====
====CONTENT====
complete translated article content
====CONTENT_END====`,
      }],
    });

    const finalMsg = await stream.finalMessage();
    console.log('[translate] Claude done, stop_reason=', finalMsg.stop_reason);

    const raw = (finalMsg.content[0] as { type: string; text: string }).text;

    const extract = (open: string, close: string) => {
      const si = raw.indexOf(open);
      const ei = raw.indexOf(close);
      if (si === -1 || ei === -1) return null;
      return raw.slice(si + open.length, ei).trim();
    };

    const translatedTitle   = extract('====TITLE====', '====TITLE_END====')   ?? article.title;
    const translatedSlug    = extract('====SLUG====',  '====SLUG_END====')    ?? (article.slug + '-' + target_lang);
    const translatedKw      = extract('====KW====',    '====KW_END====')      ?? (article.focus_keyword ?? '');
    const translatedMeta    = extract('====META====',  '====META_END====')    ?? (article.meta_description ?? '');
    const translatedContent = extract('====CONTENT====', '====CONTENT_END====') ?? article.content;

    console.log('[translate] parsed. Updating article', newId);

    // Step 3: Update the duplicate with translated content
    try {
      await sql`
        UPDATE articles SET
          title           = ${translatedTitle},
          slug            = ${translatedSlug},
          focus_keyword   = ${translatedKw},
          meta_description = ${translatedMeta},
          content         = ${translatedContent},
          status          = ${'draft'}
        WHERE id = ${newId}
      `;
    } catch (updateErr: any) {
      console.error('[translate] UPDATE failed:', updateErr?.message);
      // Article was already created, return its id anyway
      return NextResponse.json({ id: newId, title: translatedTitle, lang: target_lang, slug: translatedSlug, status: 'draft', warning: 'content update failed' });
    }

    console.log('[translate] done. newId=', newId);

    return NextResponse.json({
      id: newId,
      title: translatedTitle,
      lang: target_lang,
      slug: translatedSlug,
      status: 'draft',
    });
  } catch (err: any) {
    console.error('[translate] UNHANDLED ERROR:', err?.message, err?.stack);
    return NextResponse.json({ error: err?.message ?? 'Internal server error' }, { status: 500 });
  }
}

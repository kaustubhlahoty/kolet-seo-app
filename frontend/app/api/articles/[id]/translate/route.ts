import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { sql } from '@/lib/db';
import { randomUUID } from 'crypto';

export const maxDuration = 300;

const LANG_NAMES: Record<string, string> = {
  en: 'English', fr: 'French', de: 'German', es: 'Spanish', nl: 'Dutch',
  it: 'Italian', pt: 'Portuguese', ja: 'Japanese', zh: 'Chinese',
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { target_lang } = await request.json();

  if (!target_lang) return NextResponse.json({ error: 'target_lang required' }, { status: 400 });

  const rows = await sql`SELECT * FROM articles WHERE id = ${id}`;
  if (!rows.length) return NextResponse.json({ error: 'Article not found' }, { status: 404 });

  const article = rows[0] as any;
  if (!article.content) return NextResponse.json({ error: 'Article has no content to translate' }, { status: 400 });

  const sourceLang = LANG_NAMES[article.lang] || article.lang;
  const targetLangName = LANG_NAMES[target_lang] || target_lang;

  const ac = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const msg = await ac.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 32000,
    system: `You are a professional travel content translator specializing in eSIM and travel technology content. You translate articles for Kolet, a French eSIM brand.

Rules:
- Translate the FULL article body preserving ALL markdown formatting exactly (headings, bold, links, lists, images)
- Preserve IMAGE_PLACEHOLDER_X tags exactly as-is — do NOT translate them
- Adapt idioms and cultural references naturally for the target language
- Keep brand names, product names, URLs, and code snippets untranslated
- Translate the title and meta description naturally
- Output ONLY a JSON object with keys: "title", "content", "meta_description", "focus_keyword", "slug"
- The slug must be URL-safe (lowercase, hyphens, target-language words)
- No markdown fences around the JSON`,
    messages: [{
      role: 'user',
      content: `Translate this article from ${sourceLang} to ${targetLangName}.

Original title: ${article.title}
Original focus keyword: ${article.focus_keyword}
Original slug: ${article.slug}
Original meta description: ${article.meta_description || ''}

ARTICLE CONTENT:
${article.content}

Return JSON only: {"title":"...","content":"...","meta_description":"...","focus_keyword":"...","slug":"..."}`,
    }],
  });

  let raw = (msg.content[0] as any).text.trim();
  // Strip markdown fences if Claude wrapped the JSON
  if (raw.startsWith('```')) {
    const lines = raw.split('\n');
    raw = lines.slice(1, lines.at(-1)?.startsWith('```') ? -1 : undefined).join('\n');
  }
  // Extract the first {...} block in case Claude added commentary
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error('translate: no JSON found in response, stop_reason:', msg.stop_reason, 'raw[:500]:', raw.slice(0, 500));
    return NextResponse.json({
      error: msg.stop_reason === 'max_tokens'
        ? 'Article is too long to translate in one pass — try translating a shorter article first'
        : 'Translation failed: Claude did not return valid JSON',
    }, { status: 500 });
  }

  let translated: any;
  try {
    translated = JSON.parse(jsonMatch[0]);
  } catch (e: any) {
    console.error('translate: JSON.parse failed', e.message, 'raw[:500]:', raw.slice(0, 500));
    return NextResponse.json({ error: `Translation response was malformed: ${e.message}` }, { status: 500 });
  }
  const newId = `article-${randomUUID().slice(0, 8)}`;

  await sql`
    INSERT INTO articles (
      id, topic_id, title, slug, lang, focus_keyword, target_zone,
      content_format, status, content, meta_description, images, created_at
    ) VALUES (
      ${newId}, ${article.topic_id}, ${translated.title}, ${translated.slug},
      ${target_lang}, ${translated.focus_keyword}, ${article.target_zone},
      ${article.content_format}, ${'draft'}, ${translated.content},
      ${translated.meta_description}, ${article.images || '[]'}, NOW()
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

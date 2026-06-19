import Anthropic from '@anthropic-ai/sdk';
import { sql } from '@/lib/db';
import { getSystemPrompt } from '@/lib/prompts';
import { randomUUID } from 'crypto';

export const maxDuration = 60;

function extractImagePrompts(text: string, headline: string, zone: string) {
  const seen: Record<string, string> = {};
  const order: string[] = [];
  const EXCLUDED = new Set(['IMAGE_PLACEHOLDER_author-avatar','IMAGE_PLACEHOLDER_author_avatar']);

  const patterns = [
    /!\[([^\]]*)\]\((IMAGE_PLACEHOLDER_[\w-]+)\)/g,
    /\[(IMAGE_PLACEHOLDER_[\w-]+)\s*[—\-]\s*([^\]]+)\]/g,
    /(IMAGE_PLACEHOLDER_[\w-]+)\s*[—\-]\s*(.+)/g,
    /IMAGE_PLACEHOLDER_[\w-]+/g,
  ];

  for (const m of text.matchAll(patterns[0])) { const [,desc,ph]=m; if(!seen[ph]){seen[ph]=desc;order.push(ph);} }
  for (const m of text.matchAll(patterns[1])) { const [,ph,desc]=m; if(!seen[ph]){seen[ph]=desc;order.push(ph);} }
  for (const m of text.matchAll(patterns[2])) { const [,ph,desc]=m; if(!seen[ph]){seen[ph]=desc;order.push(ph);} }
  for (const m of text.matchAll(patterns[3])) { const ph=m[0]; if(!seen[ph]){seen[ph]='';order.push(ph);} }

  return order.filter(ph => !EXCLUDED.has(ph)).map(ph => ({
    placeholder: ph,
    description: seen[ph] || '',
    prompt: `Editorial travel-tech visual for a Kolet eSIM blog article. Scene: ${seen[ph] || `traveller using smartphone ${zone !== 'global' ? 'in ' + zone : 'at an international airport'}`}. Style: modern, minimal, blue and white palette. High-resolution, 16:9.`,
  }));
}

export async function POST(request: Request) {
  const { topic_id, headline, focus_keyword, secondary_keywords = [], content_format = 'guide', kolet_angle = '', word_count = 1200, target_zone = 'global', lang = 'en', brief = '' } = await request.json();

  const encoder = new TextEncoder();
  const sse = (obj: object) => encoder.encode(`data: ${JSON.stringify(obj)}\n\n`);

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const articleId = randomUUID().slice(0, 8);
        controller.enqueue(sse({ type: 'status', message: 'Starting article generation...' }));

        const SYSTEM = getSystemPrompt(lang);
        const langLabels: Record<string,string> = { fr: 'français', en: 'English', de: 'Deutsch', nl: 'Nederlands', es: 'Español' };
        const langLabel = langLabels[lang] ?? lang;

        let prompt = `Write a complete SEO article for Kolet following EXACTLY the format defined in your system instructions.

Topic: ${headline}
Primary keyword: ${focus_keyword}
Secondary keywords: ${secondary_keywords.join(', ')}
Content format: ${content_format}
Target zone: ${target_zone}
Kolet angle: ${kolet_angle}
Language: ${langLabel} — write the ENTIRE article in ${langLabel}, including all headings, intro, takeaways, and SEO fields.

Critical reminders:
- Body word count: 600-800 words (post.content only)
- PROMO card with exact syntax required
- Follow all typography rules for ${langLabel}`;

        if (brief) prompt += `\n\nContent brief to follow (use this as your structural guide):\n${brief}`;

        controller.enqueue(sse({ type: 'status', message: `Claude is writing your article in ${langLabel}...` }));

        const ac = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        let fullText = '';

        const anthropicStream = ac.messages.stream({ model: 'claude-sonnet-4-6', max_tokens: 6000, system: SYSTEM, messages: [{ role: 'user', content: prompt }] });
        for await (const event of anthropicStream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            const text = event.delta.text;
            fullText += text;
            controller.enqueue(sse({ type: 'chunk', text }));
          }
        }

        controller.enqueue(sse({ type: 'status', message: 'Saving article...' }));

        const slug = headline.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
        const titleMatch = fullText.match(/POST TITLE[^\n]*:\n([^\n═]+)/);
        const title = titleMatch?.[1]?.trim() ?? headline;

        const topicIdStr = String(topic_id ?? '');

        try {
          await sql`
            INSERT INTO articles (id,topic_id,title,slug,lang,focus_keyword,target_zone,status,content,meta_description,images)
            VALUES (${articleId},${topicIdStr},${title},${slug},${lang},${focus_keyword},${target_zone},${'draft'},${fullText},${''},${'[]'})
          `;
        } catch (e: any) {
          throw new Error(`INSERT failed: ${e.message} | topic_id type: ${typeof topic_id}`);
        }

        try {
          await sql`UPDATE topics SET status=${'written'} WHERE id=${topicIdStr}`;
        } catch (e: any) {
          throw new Error(`UPDATE failed: ${e.message}`);
        }

        const imagePrompts = extractImagePrompts(fullText, headline, target_zone);
        controller.enqueue(sse({ type: 'done', article_id: articleId, title, image_prompts: imagePrompts }));
      } catch (e: any) {
        controller.enqueue(sse({ type: 'error', message: e.message }));
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' } });
}

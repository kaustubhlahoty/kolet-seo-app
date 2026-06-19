import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { BRIEF_SYSTEM } from '@/lib/prompts';

const LANG_LABELS: Record<string, string> = { fr: 'French', en: 'English', de: 'German', nl: 'Dutch', es: 'Spanish' };

export async function POST(request: Request) {
  const { headline, focus_keyword, secondary_keywords = [], content_format = 'guide', kolet_angle = '', target_zone = 'global', lang = 'fr' } = await request.json();
  const langLabel = LANG_LABELS[lang] ?? 'English';
  const userMsg = `Write the brief in ${langLabel}.\nHeadline: ${headline}\nPrimary keyword: ${focus_keyword}\nSecondary keywords: ${secondary_keywords.join(', ')}\nContent format: ${content_format}\nTarget zone: ${target_zone}\nKolet angle: ${kolet_angle}\n\nGenerate the content brief:`;

  try {
    const ac = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await ac.messages.create({ model: 'claude-haiku-4-5-20251001', max_tokens: 800, system: BRIEF_SYSTEM, messages: [{ role: 'user', content: userMsg }] });
    return NextResponse.json({ brief: (msg.content[0] as any).text.trim() });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 503 });
  }
}

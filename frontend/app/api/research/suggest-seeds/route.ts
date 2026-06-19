import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { SEED_SYSTEM } from '@/lib/prompts';

const LANG_LABELS: Record<string, string> = { fr: 'French', en: 'English', de: 'German', nl: 'Dutch', es: 'Spanish' };

export async function POST(request: Request) {
  const { lang = 'fr' } = await request.json();
  const langLabel = LANG_LABELS[lang] ?? 'English';
  const userMsg = `Generate seed keyword ideas in ${langLabel} for an eSIM travel brand. Market: travelers who speak ${langLabel}. Include destination keywords popular with this market, practical use-case keywords, comparison/value queries, and technical how-to keywords.`;

  try {
    const ac = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await ac.messages.create({ model: 'claude-haiku-4-5-20251001', max_tokens: 800, system: SEED_SYSTEM, messages: [{ role: 'user', content: userMsg }] });
    let raw = (msg.content[0] as any).text.trim();
    if (raw.startsWith('```')) { const lines = raw.split('\n'); raw = lines.slice(1, lines.at(-1) === '```' ? -1 : undefined).join('\n'); }
    return NextResponse.json(JSON.parse(raw));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 503 });
  }
}

import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { INTEL_ANALYSIS_SYSTEM } from '@/lib/prompts';

export async function POST(request: Request) {
  const { articles } = await request.json();
  if (!articles?.length) return NextResponse.json({ error: 'No articles' }, { status: 400 });

  const lines = articles.slice(0, 80).map((a: any) => `- [${a.competitor}] ${a.title} (${a.date || ''})`).join('\n');
  const userMsg = `Competitor articles published recently:\n${lines}`;

  try {
    const ac = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await ac.messages.create({ model: 'claude-haiku-4-5-20251001', max_tokens: 900, system: INTEL_ANALYSIS_SYSTEM, messages: [{ role: 'user', content: userMsg }] });
    let raw = (msg.content[0] as any).text.trim();
    if (raw.startsWith('```')) { const lines = raw.split('\n'); raw = lines.slice(1, lines.at(-1) === '```' ? -1 : undefined).join('\n'); }
    return NextResponse.json(JSON.parse(raw));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 503 });
  }
}

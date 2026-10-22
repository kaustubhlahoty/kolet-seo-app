import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { BRIEF_SYSTEM } from '@/lib/prompts';
import { getKoletKnowledgeBrief } from '@/lib/kolet-knowledge';

const LANG_LABELS: Record<string, string> = { fr: 'French', en: 'English', de: 'German', nl: 'Dutch', es: 'Spanish' };

// A stateless model call has no memory of what it cited in the previous brief,
// so "vary your sources" in the system prompt alone tends to collapse back to
// the same familiar defaults (GSMA, UNWTO, ...) every time. Picking a random
// category to lead with each request forces actual run-to-run variety instead
// of relying on the model to self-diversify.
const SOURCE_CATEGORIES = [
  'destination-specific tourism boards and national statistics offices for the country/region this article covers',
  'telecom regulators and connectivity benchmarks (e.g. Ookla-style speed/coverage data) relevant to this destination',
  'recent reputable press or industry reporting (last 12 months) on this specific topic',
  'market-research firms such as Statista, Mintel, or Euromonitor',
  'academic research or think-tank studies relevant to this topic',
  'global travel/telecom bodies (UNWTO, IATA, GSMA) — only if genuinely the best fit, not the default',
];

export async function POST(request: Request) {
  const { headline, focus_keyword, secondary_keywords = [], content_format = 'guide', kolet_angle = '', target_zone = 'global', lang = 'fr' } = await request.json();
  const langLabel = LANG_LABELS[lang] ?? 'English';
  const leadCategory = SOURCE_CATEGORIES[Math.floor(Math.random() * SOURCE_CATEGORIES.length)];
  const userMsg = `Write the brief in ${langLabel}.\nHeadline: ${headline}\nPrimary keyword: ${focus_keyword}\nSecondary keywords: ${secondary_keywords.join(', ')}\nContent format: ${content_format}\nTarget zone: ${target_zone}\nKolet angle: ${kolet_angle}\n\n${getKoletKnowledgeBrief()}\n\nFor "Key sources to cite": lead with at least one source from this category if a genuinely relevant one exists for this specific headline — ${leadCategory}. Fill the remaining slots with whichever other categories are most specific to this topic; don't let the lead category crowd out a better fit.\n\nGenerate the content brief:`;

  try {
    const ac = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await ac.messages.create({ model: 'claude-sonnet-4-6', max_tokens: 800, system: BRIEF_SYSTEM, messages: [{ role: 'user', content: userMsg }] });
    return NextResponse.json({ brief: (msg.content[0] as any).text.trim() });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 503 });
  }
}

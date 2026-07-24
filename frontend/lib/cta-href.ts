const LANG_PREFIX: Record<string, string> = {
  en: '',
  fr: '/fr',
  de: '/de',
  nl: '/nl',
  es: '/es',
};

// Overrides for zones whose canonical URL slug differs from a naive lowercase-hyphenate
const SLUG_OVERRIDES: Record<string, string> = {
  'united states':              'united-states-of-america',
  'united states of america':   'united-states-of-america',
  'usa':                        'united-states-of-america',
  'us':                         'united-states-of-america',
  'uk':                         'united-kingdom',
  'great britain':              'united-kingdom',
};

/**
 * Build the PROMO card CTA href.
 * Country slug is always in English; language prefix is added for non-EN locales.
 * Falls back to https://www.kolet.com/ when destination is unknown or global.
 */
export function buildCtaHref(targetZone: string | null | undefined, lang: string | null | undefined): string {
  const raw = (targetZone ?? '').trim().toLowerCase();

  if (!raw || raw === 'global') return 'https://www.kolet.com/';

  const slug = SLUG_OVERRIDES[raw]
    ?? raw
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

  if (!slug) return 'https://www.kolet.com/';

  const prefix = LANG_PREFIX[lang ?? 'en'] ?? '';
  return `https://www.kolet.com${prefix}/destinations/esim-${slug}`;
}

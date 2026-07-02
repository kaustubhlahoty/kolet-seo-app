import { sql } from './db';

const PRICING_API = 'https://api.kolet.com/catalog/data-plans-for-esimdb';
const CACHE_KEY   = 'pricing_catalog';
const CACHE_TTL   = 60 * 60 * 1000; // 1 hour

type Network = { name: string; types: string[] };
type Coverage = { code: string; networks: Network[] };

export type Plan = {
  id:           string;
  zone:         string;
  zone_slug:    string;
  validity:     number;
  dataCap:      number;
  dataCapUnit:  string;
  promoEnabled: boolean;
  prices:       { EUR: number; USD: number };
  coverages:    Coverage[];
};

// In-process memory cache — avoids repeated DB hits within a single cold-start
let _mem: { data: Plan[]; ts: number } | null = null;

export async function fetchCatalog(): Promise<Plan[]> {
  // 1. Memory cache
  if (_mem && Date.now() - _mem.ts < CACHE_TTL) return _mem.data;

  // 2. DB cache (kv_store)
  try {
    const rows = await sql`SELECT value, updated_at FROM kv_store WHERE key = ${CACHE_KEY}`;
    if (rows.length) {
      const age = Date.now() - new Date((rows[0] as any).updated_at).getTime();
      if (age < CACHE_TTL) {
        const data: Plan[] = JSON.parse((rows[0] as any).value);
        _mem = { data, ts: Date.now() - age };
        return data;
      }
    }
  } catch { /* DB miss — fall through to live fetch */ }

  // 3. Live fetch
  const res = await fetch(PRICING_API, { next: { revalidate: 3600 } } as any);
  if (!res.ok) throw new Error(`Kolet pricing API returned ${res.status}`);
  const data: Plan[] = await res.json();

  // Persist to DB cache
  _mem = { data, ts: Date.now() };
  await sql`
    INSERT INTO kv_store (key, value)
    VALUES (${CACHE_KEY}, ${JSON.stringify(data)})
    ON CONFLICT (key) DO UPDATE SET value = ${JSON.stringify(data)}, updated_at = NOW()
  `.catch(() => {});

  return data;
}

// Normalise a free-text zone name to match zone_slug format
function normalizeZone(zone: string): string {
  return zone.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

export async function getPlansForZone(targetZone: string): Promise<Plan[]> {
  const catalog = await fetchCatalog();
  const normalized = normalizeZone(targetZone);
  return catalog
    .filter(p => p.zone_slug === normalized || p.zone_slug.includes(normalized) || normalized.includes(p.zone_slug))
    .sort((a, b) => a.dataCap - b.dataCap);
}

// Returns a formatted pricing block to inject into Claude prompts
export async function getPricingContext(targetZone?: string): Promise<string> {
  let catalog: Plan[];
  try {
    catalog = await fetchCatalog();
  } catch (e: any) {
    return `[Pricing data unavailable: ${e.message}]`;
  }

  const zoneCount    = new Set(catalog.map(p => p.zone_slug)).size;
  const eurPrices    = catalog.map(p => p.prices.EUR);
  const minPrice     = Math.min(...eurPrices);
  const maxPrice     = Math.max(...eurPrices);

  let ctx = `━━━ LIVE KOLET PRICING (real-time — use these exact numbers, no approximations) ━━━
Coverage: ${zoneCount} destinations worldwide
Plan sizes available everywhere: 1 GB · 3 GB · 5 GB · 10 GB · 20 GB
Validity: 30 days from first connection (not from purchase)
Price range: €${minPrice} – €${maxPrice} EUR`;

  // Destination-specific pricing
  if (targetZone && targetZone !== 'global') {
    const plans = await getPlansForZone(targetZone);
    if (plans.length > 0) {
      const networks = plans[0].coverages.flatMap(c => c.networks);
      const uniqueNetworks = [...new Map(networks.map(n => [n.name, n])).values()];
      const networkStr = uniqueNetworks
        .map(n => `${n.name} (${n.types.join('/')})`)
        .join(', ');

      ctx += `\n\n${targetZone.toUpperCase()} — exact prices:`;
      for (const p of plans) {
        ctx += `\n  ${p.dataCap} ${p.dataCapUnit} → €${p.prices.EUR} EUR / $${p.prices.USD} USD`;
      }
      if (networkStr) {
        ctx += `\n  Network partners: ${networkStr}`;
      }
    } else {
      // Zone not found — show global range so Claude doesn't hallucinate
      ctx += `\n\nNote: exact pricing for "${targetZone}" not found in catalogue — do not invent prices. Say "starting from €${minPrice}" and link to kolet.com for exact pricing.`;
    }
  }

  ctx += '\n━━━';
  return ctx;
}

// Lightweight summary for prompts that don't need per-zone data
export async function getPricingSummary(): Promise<string> {
  let catalog: Plan[];
  try {
    catalog = await fetchCatalog();
  } catch {
    return '190+ destinations, plans from 1 GB to 20 GB, valid 30 days.';
  }
  const zoneCount = new Set(catalog.map(p => p.zone_slug)).size;
  const minEur    = Math.min(...catalog.map(p => p.prices.EUR));
  return `${zoneCount} destinations · plans: 1 GB, 3 GB, 5 GB, 10 GB, 20 GB · from €${minEur} · valid 30 days from first connection`;
}

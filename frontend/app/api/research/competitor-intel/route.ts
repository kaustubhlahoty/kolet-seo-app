import { NextResponse } from 'next/server';

const COMPETITORS = [
  { name: 'Airalo',  color: 'green',  sitemaps: ['https://www.airalo.com/sitemap-v2-posts-index.xml'], sub_hint: 'posts',       reverse_subs: false, blog_patterns: ['/blog/'] },
  { name: 'Holafly', color: 'blue',   sitemaps: ['https://holafly.com/sitemap.xml'],                  sub_hint: 'post-sitemap', reverse_subs: true,  blog_patterns: [] },
  { name: 'Saily',   color: 'purple', sitemaps: ['https://saily.com/sitemap.xml'],                    sub_hint: 'blog',         reverse_subs: true,  blog_patterns: ['/blog/','/article','/guide'] },
];

const SKIP = ['.xml','.json','/category/','/tag/','/author/','/page/','/cdn-cgi/','?'];

function slugToTitle(url: string) {
  const parts = new URL(url).pathname.replace(/\/$/, '').split('/');
  const slug = parts.at(-1) || '';
  return slug.replace(/-\d{4}(-\d{2}(-\d{2})?)?$/, '').replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function parseDate(raw: string) {
  if (!raw) return null;
  const s = raw.trim().slice(0, 19);
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function parseUrlset(xml: string, competitor: string, cutoff: Date, blogPatterns: string[]) {
  const articles: any[] = [];
  const blocks = xml.match(/<url>[\s\S]*?<\/url>/g) || [];
  for (const block of blocks) {
    const loc     = (block.match(/<loc>([^<]+)<\/loc>/)?.[1] || '').trim();
    const lastmod = (block.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1] || '').trim();
    const title   = (block.match(/<news:title>([^<]+)<\/news:title>/)?.[1] || '').trim();
    if (!loc || SKIP.some(s => loc.includes(s))) continue;
    if (blogPatterns.length && !blogPatterns.some(p => loc.includes(p))) continue;
    const d = parseDate(lastmod);
    if (d && d < cutoff) continue;
    articles.push({ url: loc, title: title || slugToTitle(loc), date: lastmod.slice(0, 10), competitor });
  }
  return articles;
}

async function fetchXml(url: string) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html,application/xml,*/*' }, signal: AbortSignal.timeout(12000) });
    if (!r.ok) return null;
    return r.text();
  } catch { return null; }
}

async function fetchCompetitor(comp: typeof COMPETITORS[0], days: number) {
  const cutoff = new Date(Date.now() - days * 86400000);
  let articles: any[] = [];
  let fetched = false;

  for (const sitemapUrl of comp.sitemaps) {
    const xml = await fetchXml(sitemapUrl);
    if (!xml) continue;
    fetched = true;

    if (xml.includes('<sitemapindex')) {
      const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].trim());
      const matching = comp.sub_hint ? locs.filter(u => u.includes(comp.sub_hint)) : locs;
      const ordered  = comp.reverse_subs ? [...matching].reverse() : matching;
      for (const sub of ordered.slice(0, 6)) {
        const subXml = await fetchXml(sub);
        if (subXml) articles.push(...parseUrlset(subXml, comp.name, cutoff, comp.blog_patterns));
        if (articles.length >= 60) break;
      }
    } else {
      articles.push(...parseUrlset(xml, comp.name, cutoff, comp.blog_patterns));
    }
    if (articles.length) break;
  }

  const sorted = articles.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 60);
  return { articles: sorted, status: fetched ? 'ok' : 'blocked' };
}

export async function GET(request: Request) {
  const days = Number(new URL(request.url).searchParams.get('days') || 30);
  const results = await Promise.all(COMPETITORS.map(async comp => {
    const { articles, status } = await fetchCompetitor(comp, days);
    return { name: comp.name, color: comp.color, articles, count: articles.length, status };
  }));
  return NextResponse.json({ competitors: results, total: results.reduce((s, r) => s + r.count, 0), days });
}

import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 30;

export async function GET() {
  const creds   = process.env.GSC_CREDENTIALS_JSON || '';
  const siteUrl = process.env.GSC_SITE_URL          || 'https://kolet.com/';

  if (creds.length < 10) {
    return NextResponse.json({ error: 'GSC not configured' }, { status: 503 });
  }

  try {
    const keyFile = JSON.parse(creds);
    const auth    = new google.auth.GoogleAuth({ credentials: keyFile, scopes: ['https://www.googleapis.com/auth/webmasters.readonly'] });
    const sc      = google.searchconsole({ version: 'v1', auth });

    const end   = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 90);

    // Query-level data (not page-level) — this gives us keyword-level positions
    const resp = await sc.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate:  start.toISOString().slice(0, 10),
        endDate:    end.toISOString().slice(0, 10),
        dimensions: ['query'],
        rowLimit:   1000,
      },
    });

    // Near-miss = page 2 keywords with decent impression volume (include ALL queries,
    // branded and non-branded — "kolet esim france" at pos 14 is exactly worth fixing)
    const queries = (resp.data.rows || [])
      .map((row: any) => ({
        query:       row.keys[0] as string,
        clicks:      Math.round(row.clicks      || 0),
        impressions: Math.round(row.impressions || 0),
        ctr:         Math.round((row.ctr        || 0) * 1000) / 10,
        position:    Math.round((row.position   || 0) * 10)  / 10,
      }))
      .filter(q => q.position >= 8 && q.position <= 20 && q.impressions >= 50)
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 30);

    if (!queries.length) {
      return NextResponse.json({ queries: [], total: 0 });
    }

    // Claude gives a concrete fix for each near-miss
    const ac  = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await ac.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: `You are an SEO strategist for Kolet, a French eSIM travel brand.

These keywords are ranking at position 8–20 (page 2) with high impressions. A small push could get them to page 1.

For each keyword give ONE specific action. Be concrete — say exactly what to change (e.g. "Add an H2 '${queries[0]?.query} Tips for iPhone Users'" not "optimize content").

Keywords (query | pos | impressions):
${queries.slice(0, 20).map(q => `${q.query} | pos ${q.position} | ${q.impressions} impr`).join('\n')}

Return ONLY JSON array (no markdown):
[{"query":"...", "action":"specific action", "priority":"High|Medium|Low", "type":"new_article|update_existing|add_section|improve_title|improve_meta"}]`,
      }],
    });

    const raw      = (msg.content[0] as any).text.trim();
    const m        = raw.match(/\[[\s\S]*\]/);
    const actions: any[] = m ? JSON.parse(m[0]) : [];
    const actionMap      = Object.fromEntries(actions.map(a => [a.query, a]));

    const enriched = queries.map(q => ({
      ...q,
      action:   actionMap[q.query]?.action   || null,
      priority: actionMap[q.query]?.priority || 'Medium',
      type:     actionMap[q.query]?.type     || null,
    }));

    return NextResponse.json({ queries: enriched, total: enriched.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}

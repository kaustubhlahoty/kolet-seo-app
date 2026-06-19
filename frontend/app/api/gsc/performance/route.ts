import { NextResponse } from 'next/server';
import { google } from 'googleapis';

export async function GET(request: Request) {
  const days    = Number(new URL(request.url).searchParams.get('days') || 28);
  const creds   = process.env.GSC_CREDENTIALS_JSON || '';
  const siteUrl = process.env.GSC_SITE_URL || 'https://kolet.com/';

  if (!creds || creds.length < 10) {
    return NextResponse.json({ error: 'Google Search Console not configured. Add GSC_CREDENTIALS_JSON to your env.' }, { status: 503 });
  }

  try {
    const keyFile = JSON.parse(creds);
    const auth = new google.auth.GoogleAuth({ credentials: keyFile, scopes: ['https://www.googleapis.com/auth/webmasters.readonly'] });
    const sc = google.searchconsole({ version: 'v1', auth });

    const end   = new Date(); end.setDate(end.getDate());
    const start = new Date(); start.setDate(start.getDate() - days);

    const resp = await sc.searchanalytics.query({
      siteUrl,
      requestBody: { startDate: start.toISOString().slice(0,10), endDate: end.toISOString().slice(0,10), dimensions: ['page'], rowLimit: 5000 },
    });

    const pages = (resp.data.rows || []).map((row: any) => ({
      url:         row.keys[0],
      clicks:      Math.round(row.clicks || 0),
      impressions: Math.round(row.impressions || 0),
      ctr:         Math.round((row.ctr || 0) * 1000) / 10,
      position:    Math.round((row.position || 0) * 10) / 10,
    })).sort((a: any, b: any) => b.clicks - a.clicks);

    return NextResponse.json({ pages, total: pages.length, days, site: siteUrl });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}

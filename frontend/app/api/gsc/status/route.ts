import { NextResponse } from 'next/server';

export async function GET() {
  const creds   = process.env.GSC_CREDENTIALS_JSON || '';
  const siteUrl = process.env.GSC_SITE_URL || 'https://kolet.com/';
  const configured = creds.length > 10;
  return NextResponse.json({ configured, site_url: configured ? siteUrl : '' });
}

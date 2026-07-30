import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

/**
 * GET  /api/admin/clean-nbsp  — dry run, reports what would change
 * POST /api/admin/clean-nbsp  — applies the cleanup
 *
 * Strips stray &nbsp; from the plain-text fields only (POST TITLE, READ TIME,
 * INTRO, SEO TITLE, SEO DESCRIPTION). Never touches KEY TAKEAWAYS, COVER IMAGE,
 * or POST CONTENT, which are markdown.
 */

function cleanPlainText(s: string): string {
  return s.replace(/&nbsp;/g, ' ').replace(/ {2,}/g, ' ');
}

function cleanLabelLine(content: string, label: string): string {
  const re = new RegExp(`(${label}[^\\n]*:\\n)([^\\n═]+)`);
  return content.replace(re, (_m, prefix, val) => prefix + cleanPlainText(val));
}

function cleanIntroBlock(content: string): string {
  const re = /(INTRO\s*[\(（][^\n]*\n)([\s\S]*?)(?=\nKEY TAKEAWAYS|\nCOVER IMAGE|═{5})/;
  return content.replace(re, (_m, prefix, val) => prefix + cleanPlainText(val));
}

function cleanContentBlob(content: string): string {
  let out = content;
  out = cleanLabelLine(out, 'POST TITLE');
  out = cleanLabelLine(out, 'READ TIME');
  out = cleanIntroBlock(out);
  out = cleanLabelLine(out, 'SEO TITLE');
  out = cleanLabelLine(out, 'SEO DESCRIPTION');
  return out;
}

async function findAffected() {
  const rows = await sql`
    SELECT id, title, content FROM articles
    WHERE content LIKE '%&nbsp;%' OR title LIKE '%&nbsp;%'
  `;
  return rows as { id: string; title: string; content: string }[];
}

export async function GET() {
  const rows = await findAffected();
  const changes = [];
  for (const row of rows) {
    const newTitle = cleanPlainText(row.title || '');
    const newContent = cleanContentBlob(row.content || '');
    if (newTitle !== row.title || newContent !== row.content) {
      changes.push({ id: row.id, title_before: row.title, title_after: newTitle, content_changed: newContent !== row.content });
    }
  }
  return NextResponse.json({ mode: 'dry_run', total_scanned: rows.length, would_update: changes.length, changes });
}

export async function POST() {
  const rows = await findAffected();
  let updated = 0;
  const changes = [];
  for (const row of rows) {
    const newTitle = cleanPlainText(row.title || '');
    const newContent = cleanContentBlob(row.content || '');
    if (newTitle === row.title && newContent === row.content) continue;
    await sql`UPDATE articles SET title=${newTitle}, content=${newContent} WHERE id=${row.id}`;
    updated++;
    changes.push({ id: row.id, title_before: row.title, title_after: newTitle });
  }
  return NextResponse.json({ mode: 'applied', total_scanned: rows.length, updated, changes });
}

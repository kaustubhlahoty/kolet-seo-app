import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { auth } from '@/auth';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string; suggestionId: string }> }) {
  const { suggestionId } = await params;

  const session = await auth();
  const resolvedBy = session?.user?.name || session?.user?.email || 'Unknown';

  const rows = await sql`
    UPDATE article_suggestions SET status='rejected', resolved_at=NOW(), resolved_by=${resolvedBy}
    WHERE id=${suggestionId} AND status='pending'
    RETURNING id
  `;
  if (!rows.length) return NextResponse.json({ error: 'Suggestion not found or already resolved' }, { status: 404 });

  return NextResponse.json({ status: 'rejected' });
}

import { sql } from '@/lib/db';

export async function getAdminSetting(key: string): Promise<string | null> {
  try {
    const rows = await sql`SELECT value FROM kv_store WHERE key = ${key}`;
    return (rows[0] as any)?.value ?? null;
  } catch {
    return null;
  }
}

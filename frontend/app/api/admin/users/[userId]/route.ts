import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import bcrypt from "bcryptjs";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;
  const body = await req.json();
  const { name, role, password } = body;

  if (role && !["admin", "reviewer"].includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  if (password) {
    const hash = await bcrypt.hash(password, 12);
    await sql`UPDATE users SET password_hash = ${hash} WHERE id = ${userId}`;
  }
  if (name !== undefined) {
    await sql`UPDATE users SET name = ${name} WHERE id = ${userId}`;
  }
  if (role) {
    await sql`UPDATE users SET role = ${role} WHERE id = ${userId}`;
  }

  const rows = await sql`SELECT id, email, name, role, created_at FROM users WHERE id = ${userId}`;
  return NextResponse.json({ user: rows[0] });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;
  await sql`DELETE FROM users WHERE id = ${userId}`;
  return NextResponse.json({ ok: true });
}

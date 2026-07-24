import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import bcrypt from "bcryptjs";

export async function GET() {
  const rows = await sql`
    SELECT id, email, name, role, created_at FROM users ORDER BY created_at ASC
  `;
  return NextResponse.json({ users: rows });
}

export async function POST(req: Request) {
  const { email, password, name = "", role = "reviewer" } = await req.json();
  if (!email?.trim() || !password?.trim()) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }
  if (!["admin", "reviewer"].includes(role)) {
    return NextResponse.json({ error: "Role must be admin or reviewer" }, { status: 400 });
  }
  const hash = await bcrypt.hash(password, 12);
  try {
    const rows = await sql`
      INSERT INTO users (email, password_hash, name, role)
      VALUES (${email.trim()}, ${hash}, ${name.trim()}, ${role})
      RETURNING id, email, name, role, created_at
    `;
    return NextResponse.json({ user: rows[0] });
  } catch (e: any) {
    if (e.message?.includes("unique")) {
      return NextResponse.json({ error: "A user with that email already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
  }
}

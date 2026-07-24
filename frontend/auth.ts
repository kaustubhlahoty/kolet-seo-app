import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";
import { authConfig } from "./auth.config";

const sql = neon(process.env.DATABASE_URL!);

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const rows = await sql`
          SELECT id, email, name, role, password_hash
          FROM users
          WHERE email = ${credentials.email as string}
          LIMIT 1
        `;
        const user = rows[0];
        if (!user) return null;
        const valid = await bcrypt.compare(
          credentials.password as string,
          user.password_hash as string
        );
        if (!valid) return null;
        return {
          id: user.id as string,
          email: user.email as string,
          name: user.name as string,
          role: user.role as string,
        };
      },
    }),
  ],
});

declare module "next-auth" {
  interface User { role: string; }
  interface Session {
    user: { role: string } & import("next-auth").DefaultSession["user"];
  }
}

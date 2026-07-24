import type { NextAuthConfig } from "next-auth";

function isReviewerApiAllowed(pathname: string, method: string): boolean {
  if (/^\/api\/articles\/[^/]+\/comments/.test(pathname)) return true;
  if (/^\/api\/articles\/[^/]+$/.test(pathname) && method === "GET") return true;
  if (pathname === "/api/articles" && method === "GET") return true;
  if (pathname === "/api/notifications/unread-comments") return true;
  return false;
}

export const authConfig: NextAuthConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 }, // 30-day persistent cookie
  callbacks: {
    jwt({ token, user }) {
      if (user) token.role = (user as { role?: string }).role;
      return token;
    },
    session({ session, token }) {
      (session.user as { role?: string }).role = token.role as string | undefined;
      return session;
    },
    authorized({ auth, request: { nextUrl, method } }) {
      const pathname = nextUrl.pathname;

      // Always allow NextAuth's own routes
      if (pathname.startsWith("/api/auth")) return true;

      const session = auth;
      const role = (session?.user as { role?: string })?.role;

      // Not authenticated
      if (!session) {
        if (pathname.startsWith("/api/")) {
          return new Response(
            JSON.stringify({ error: "Unauthorized" }),
            { status: 401, headers: { "Content-Type": "application/json" } }
          );
        }
        return false; // Auth.js redirects to /login
      }

      // Redirect logged-in users away from /login
      if (pathname === "/login") {
        return Response.redirect(new URL("/library", nextUrl));
      }

      // Admin: full access
      if (role === "admin") return true;

      // Reviewer: library pages + comments API + article read API
      if (role === "reviewer") {
        if (pathname.startsWith("/library")) return true;
        if (pathname.startsWith("/api/") && isReviewerApiAllowed(pathname, method || "GET")) return true;
        if (pathname.startsWith("/api/")) {
          return new Response(
            JSON.stringify({ error: "Forbidden" }),
            { status: 403, headers: { "Content-Type": "application/json" } }
          );
        }
        return Response.redirect(new URL("/library", nextUrl));
      }

      return false;
    },
  },
  providers: [], // Added in auth.ts (Node.js only)
};

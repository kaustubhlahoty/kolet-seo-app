// Empty string = same origin (works for both local Next.js dev and Vercel)
export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

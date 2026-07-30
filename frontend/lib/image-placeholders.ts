/** Every IMAGE_PLACEHOLDER_xxx token referenced in a string, deduplicated. */
export function findImagePlaceholders(text: string): string[] {
  return [...new Set((text || "").match(/IMAGE_PLACEHOLDER_[\w-]+/g) || [])];
}

/**
 * A replacement must never drop an image placeholder that was present in the
 * original text — doing so silently orphans the uploaded image behind it.
 */
export function placeholdersPreserved(original: string, proposed: string): { ok: boolean; missing: string[] } {
  const originalTokens = findImagePlaceholders(original);
  if (!originalTokens.length) return { ok: true, missing: [] };
  const proposedTokens = new Set(findImagePlaceholders(proposed));
  const missing = originalTokens.filter(t => !proposedTokens.has(t));
  return { ok: missing.length === 0, missing };
}

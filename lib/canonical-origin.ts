/**
 * Canonical site origin resolver.
 *
 * Single-sources the site origin from NEXT_PUBLIC_SITE_URL with
 * validation and a safe fallback.
 */

const FALLBACK_ORIGIN = "https://kafka-hub.dev";

/**
 * Validate that a string is a valid http/https origin:
 * - Must start with http:// or https://
 * - No credentials (user:pass@)
 * - No non-root path, query, or fragment
 */
export function resolveCanonicalOrigin(raw?: string): string {
  const value = raw?.trim();
  if (!value) return FALLBACK_ORIGIN;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return FALLBACK_ORIGIN;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return FALLBACK_ORIGIN;
  }

  if (url.username || url.password) {
    return FALLBACK_ORIGIN;
  }

  // Accept an origin with an optional root slash, but never normalize away
  // path/query/fragment input that would produce misleading canonical URLs.
  if (
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.href !== `${url.origin}/`
  ) {
    return FALLBACK_ORIGIN;
  }

  return url.origin;
}

/**
 * The resolved canonical origin for the running application.
 * Uses NEXT_PUBLIC_SITE_URL env var with fallback to https://kafka-hub.dev.
 */
export const CANONICAL_ORIGIN: string = resolveCanonicalOrigin(
  typeof process !== "undefined"
    ? process.env.NEXT_PUBLIC_SITE_URL
    : undefined,
);

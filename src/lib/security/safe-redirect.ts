/**
 * Only allow same-origin relative paths as post-login redirect targets (prevents open redirects
 * such as ?next=https://evil.example or ?next=//evil.example).
 */
export function safeNextPath(next: string | null | undefined, fallback = "/marketplace"): string {
  if (!next || typeof next !== "string") return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (/[\r\n\t]/.test(next)) return fallback;
  try {
    const url = new URL(next, "http://localhost");
    if (url.origin !== "http://localhost") return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}

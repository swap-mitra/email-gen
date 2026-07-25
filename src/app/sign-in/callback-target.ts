/**
 * Where to land after Google returns. Middleware puts the bounced-from path in
 * `?next=` so deep links (invitation URLs especially) survive the OAuth round
 * trip. Only same-origin relative paths are honoured — an attacker-supplied
 * `next` must not be able to bounce someone off-site right after they
 * authenticate.
 */
export function callbackTarget(search: string): string {
  const next = new URLSearchParams(search).get("next");
  if (!next || !next.startsWith("/")) return "/dashboard";
  // "//host" and "/\host" are both read as protocol-relative by browsers.
  if (next.startsWith("//") || next.startsWith("/\\")) return "/dashboard";
  return next;
}

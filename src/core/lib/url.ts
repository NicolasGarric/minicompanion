/**
 * Links built from data people typed (store websites, bug report pages, retailer templates) only keep
 * web addresses or in-app routes: anything else (javascript:, data:, …) becomes undefined, so no link.
 */
export function safeHref(url: string | null | undefined, { allowApp = false } = {}): string | undefined {
  const u = (url ?? '').trim();
  if (allowApp && /^\/(?!\/)[^\s"'<>]*$/.test(u)) return u;
  try {
    const parsed = new URL(u);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}

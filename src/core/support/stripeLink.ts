/** Donation links: pure helper (no import.meta), unit-tested with plain Node. */

/** Only real Stripe pages are accepted (a typo or another site would send donors elsewhere). */
export function stripeLink(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  try {
    const u = new URL(v.trim());
    return u.protocol === 'https:' && /^(buy|donate|billing)\.stripe\.com$/.test(u.hostname) ? u.toString() : null;
  } catch {
    return null;
  }
}

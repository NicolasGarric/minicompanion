/**
 * Privacy-friendly analytics: only daily aggregated counters, stored in the browser.
 * No identifiers, no cookies, no third-party service.
 * `configureAnalytics({ endpoint })` can later forward the same anonymous events to a
 * self-hosted, cookie-less counter.
 */
export const EVENTS = [
  'image_uploaded',
  'scheme_created',
  'card_generated',
  'card_shared',
  'shared_link_opened',
  'beginner_started',
  'beginner_completed',
  'store_finder_opened',
] as const;

export type AnalyticsEvent = (typeof EVENTS)[number];

export interface AnalyticsData {
  since: string;
  totals: Partial<Record<AnalyticsEvent, number>>;
  /** ISO day (YYYY-MM-DD) -> event -> count */
  daily: Record<string, Partial<Record<AnalyticsEvent, number>>>;
  /** optional detail, e.g. share method */
  detail: Record<string, number>;
}

const KEY = 'cf.analytics';
let endpoint: string | null = null;

export function configureAnalytics(opts: { endpoint?: string }) {
  endpoint = opts.endpoint ?? null;
}

const today = () => new Date().toISOString().slice(0, 10);

export function readAnalytics(): AnalyticsData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as AnalyticsData;
  } catch {
    /* unreadable data: start over */
  }
  return { since: today(), totals: {}, daily: {}, detail: {} };
}

const lastSeen = new Map<string, number>();

export function track(event: AnalyticsEvent, detail?: string) {
  // Same event twice within 1 s (double mount, double click) counts once.
  const key = `${event}:${detail ?? ''}`;
  const now = Date.now();
  if (now - (lastSeen.get(key) ?? 0) < 1000) return;
  lastSeen.set(key, now);

  const data = readAnalytics();
  const day = today();
  data.totals[event] = (data.totals[event] ?? 0) + 1;
  data.daily[day] ??= {};
  data.daily[day][event] = (data.daily[day][event] ?? 0) + 1;
  if (detail) data.detail[`${event}:${detail}`] = (data.detail[`${event}:${detail}`] ?? 0) + 1;
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* quota or private mode: the event is lost, no impact for the user */
  }
  if (endpoint) {
    navigator.sendBeacon?.(endpoint, JSON.stringify({ event, detail, day }));
  }
}

export function resetAnalytics() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to do */
  }
}

import { useT } from '../../core/i18n';
import { Icon } from '../../core/ui/ui';
import { formatWhen } from './GameCard';
import type { RoundSlot, Tournament } from '../lib/tournaments';

/** Value of a datetime-local input (local time, minutes). */
export const toLocalInput = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** One round while editing. venue: '' = the event's venue, a store id, or 'other' (name + address). */
export interface SlotDraft {
  when: string;
  venue: string;
  venue_name: string;
  address: string;
}

/**
 * Drafts for n rounds: rounds already edited are kept, new ones fall a week after the previous one.
 * Round 1 always starts with the event.
 */
export function fitDrafts(first: string, n: number, prev: SlotDraft[]): SlotDraft[] {
  const out: SlotDraft[] = [];
  for (let i = 0; i < n; i++) {
    const before = out[i - 1];
    const next = before ? toLocalInput(new Date(Date.parse(before.when) + 7 * 864e5)) : first;
    out.push(i === 0 ? { ...(prev[0] ?? blank(first)), when: first } : prev[i] ?? { ...blank(next), venue: before.venue, venue_name: before.venue_name, address: before.address });
  }
  return out;
}
const blank = (when: string): SlotDraft => ({ when, venue: '', venue_name: '', address: '' });

export const draftsToSlots = (drafts: SlotDraft[]): RoundSlot[] =>
  drafts.map((d, i) => ({
    number: i + 1,
    starts_at: new Date(d.when).toISOString(),
    store_id: d.venue && d.venue !== 'other' ? d.venue : null,
    venue_name: d.venue === 'other' ? d.venue_name.trim() || null : null,
    address: d.venue === 'other' ? d.address.trim() || null : null,
  }));

export const slotsToDrafts = (slots: RoundSlot[]): SlotDraft[] =>
  slots.map((s) => ({
    when: toLocalInput(new Date(s.starts_at)),
    venue: s.store_id ?? (s.venue_name || s.address ? 'other' : ''),
    venue_name: s.store_id ? '' : s.venue_name ?? '',
    address: s.store_id ? '' : s.address ?? '',
  }));

/** Date + venue of every round. Round 1's date follows the event start (edited above it). */
export function RoundScheduleEditor({ drafts, onChange, stores }: {
  drafts: SlotDraft[];
  onChange: (d: SlotDraft[]) => void;
  stores: { id: string; name: string; city: string }[];
}) {
  const t = useT();
  const set = (i: number, p: Partial<SlotDraft>) => onChange(drafts.map((d, j) => (j === i ? { ...d, ...p } : d)));
  return (
    <ol className="round-schedule-editor">
      {drafts.map((d, i) => (
        <li key={i}>
          <strong>{t('tour.roundN', { n: i + 1 })}</strong>
          <div className="field-grid">
            <label className="field">
              <span>{t('games.date')}</span>
              <input
                className="text-input"
                type="datetime-local"
                required
                disabled={i === 0}
                min={drafts[i - 1]?.when}
                value={d.when}
                onChange={(e) => set(i, { when: e.target.value })}
              />
            </label>
            <label className="field">
              <span>{t('tour.venue')}</span>
              <select className="select" value={d.venue} onChange={(e) => set(i, { venue: e.target.value })}>
                <option value="">{t('tour.sameVenue')}</option>
                {stores.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.city}</option>)}
                <option value="other">{t('tour.otherVenue')}</option>
              </select>
            </label>
          </div>
          {d.venue === 'other' && (
            <div className="field-grid">
              <label className="field">
                <span>{t('tour.venue')}</span>
                <input className="text-input" required maxLength={80} value={d.venue_name} onChange={(e) => set(i, { venue_name: e.target.value })} />
              </label>
              <label className="field">
                <span>{t('tour.addressLabel')}</span>
                <input className="text-input" required maxLength={150} value={d.address} onChange={(e) => set(i, { address: e.target.value })} />
              </label>
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

/** Where a round is played: its own venue, or the tournament's. */
export const slotVenue = (s: RoundSlot | undefined, tour: Tournament) =>
  s?.venue_name || s?.address
    ? { name: s.venue_name ?? '', address: s.address ?? '', store_id: s.store_id }
    : { name: tour.venue_name, address: tour.address, store_id: tour.store_id };

/** Date and venue line of one round (pairings, table page). */
export function RoundWhere({ slot, tour, lang }: { slot: RoundSlot; tour: Tournament; lang: string }) {
  const v = slotVenue(slot, tour);
  return (
    <p className="round-where muted">
      <Icon name="calendar" size={14} /> {formatWhen(slot.starts_at, lang)}
      {' · '}
      <Icon name="map" size={14} /> {v.store_id ? <a href={`#/play/store/${v.store_id}`}>{v.name}</a> : v.name}
      {v.address && <> · <a href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(v.address)}`} target="_blank" rel="noreferrer">{v.address} ↗</a></>}
    </p>
  );
}

/** The whole schedule, on the info tab. */
export function RoundScheduleList({ slots, tour, lang, currentRound }: { slots: RoundSlot[]; tour: Tournament; lang: string; currentRound?: number }) {
  const t = useT();
  return (
    <ol className="round-schedule">
      {slots.map((s) => (
        <li key={s.number} className={s.number === currentRound ? 'on' : ''}>
          <strong>{t('tour.roundN', { n: s.number })}</strong>
          <RoundWhere slot={s} tour={tour} lang={lang} />
        </li>
      ))}
    </ol>
  );
}

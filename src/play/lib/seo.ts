import type { RoundSlot, Tournament } from './tournaments';

/**
 * schema.org Event for a tournament: search engines can show it as an event (date, venue), and AI
 * assistants read it reliably. Pure function: also used at build time by scripts/build-seo.mjs.
 */
export function tournamentJsonLd(
  t: Pick<Tournament, 'slug' | 'name' | 'description' | 'starts_at' | 'ends_at' | 'status' | 'venue_name' | 'address' | 'max_players' | 'language' | 'game_system'>,
  schedule: Pick<RoundSlot, 'number' | 'starts_at' | 'venue_name' | 'address'>[],
  origin: string,
) {
  const url = `${origin}/play/t/${t.slug}`;
  const place = (name: string | null, address: string | null) => ({ '@type': 'Place', name: name || t.venue_name, address: address || t.address });
  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: t.name,
    description: t.description || [t.game_system, 'tabletop miniatures tournament'].filter(Boolean).join(' '),
    url,
    startDate: t.starts_at,
    endDate: t.ends_at,
    eventStatus: t.status === 'cancelled' ? 'https://schema.org/EventCancelled' : 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: place(t.venue_name, t.address),
    maximumAttendeeCapacity: t.max_players,
    inLanguage: t.language === 'both' ? ['ja', 'en'] : t.language,
    ...(schedule.length > 1 && {
      subEvent: schedule.map((s) => ({
        '@type': 'Event',
        name: `${t.name} – round ${s.number}`,
        startDate: s.starts_at,
        location: place(s.venue_name, s.address),
        url,
      })),
    }),
  };
}

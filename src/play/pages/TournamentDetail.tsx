import { useCallback, useEffect, useState } from 'react';
import { k, useLang, useT } from '../../core/i18n';
import { supabase, backendConfigured } from '../../core/auth/supabase';
import { BackendNotice } from '../../core/auth/BackendNotice';
import { requireSignIn, useSession } from '../../core/auth/session';
import { Icon } from '../../core/ui/ui';
import { osmEmbedUrl, osmLink } from '../../core/stores/stores';
import { formatWhen } from '../components/GameCard';
import { playError } from '../lib/games';
import { downloadIcs } from '../lib/ics';

interface Tournament {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  registration_deadline: string;
  format_id: string;
  type: string;
  language: 'en' | 'ja' | 'both';
  max_players: number;
  rounds_planned: number;
  venue_name: string;
  address: string;
  status: string;
  twitch_channel: string | null;
  format?: { points_limit: number; round_minutes: number } | null;
}

interface Place {
  lat: number;
  lng: number;
  registered: number;
  spots_left: number;
  store_name: string | null;
}

/** One tournament: details, map, and register / withdraw. */
export function TournamentDetail({ slug }: { slug: string }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const session = useSession((s) => s.session);
  const [data, setData] = useState<{ t: Tournament; place: Place | null; mine: string | null } | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const res = await supabase
      .from('tournaments')
      .select('id, slug, name, description, starts_at, ends_at, registration_deadline, format_id, type, language, max_players, rounds_planned, venue_name, address, status, twitch_channel, format:formats(points_limit, round_minutes)')
      .eq('slug', slug)
      .maybeSingle();
    if (res.error) {
      console.error('[play] tournament', slug, res.error);
      return setData(null);
    }
    if (!res.data) return setData(null);
    const tour = res.data as unknown as Tournament;
    // Counts and coordinates come from the search function (PostGIS point → lat / lng).
    const search = await supabase.rpc('search_tournaments', { p_from: new Date(Date.parse(tour.starts_at) - 1000).toISOString() });
    if (search.error) console.error('[play] search_tournaments', search.error);
    const place = ((search.data ?? []) as (Place & { id: string })[]).find((r) => r.id === tour.id) ?? null;
    let mine: string | null = null;
    if (session) {
      const reg = await supabase.from('registrations').select('status').eq('tournament_id', tour.id).eq('user_id', session.user.id).maybeSingle();
      if (reg.error) console.error('[play] registration', reg.error);
      mine = reg.data?.status ?? null;
    }
    setData({ t: tour, place, mine });
  }, [slug, session]);

  useEffect(() => {
    load();
  }, [load]);

  if (!backendConfigured) return <BackendNotice />;
  if (data === undefined) return <div className="narrow"><span className="spinner" /></div>;
  if (data === null) return <div className="narrow"><p className="hint">{t('tour.notFound')}</p><a href="#/play">← {t('nav.play.tournaments')}</a></div>;

  const { t: tour, place, mine } = data;
  const registered = mine === 'registered' || mine === 'waitlist';
  const closed = Date.now() > Date.parse(tour.registration_deadline) || tour.status !== 'published';

  const act = async (fn: 'register_for_tournament' | 'withdraw_from_tournament') => {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.rpc(fn, { p_tournament: tour.id });
    if (e) {
      console.error(`[play] ${fn}`, e);
      setError(playError(e) ?? 'generic');
    }
    await load();
    setBusy(false);
  };

  return (
    <div className="narrow game-detail">
      <a href="#/play" className="small">← {t('nav.play.tournaments')}</a>
      <div className="page-head">
        <div>
          <h1>{tour.name}</h1>
          <p className="lead">
            {t(k(`tour.type.${tour.type}`))}
            {tour.format && ` · ${t('games.points', { points: tour.format.points_limit })} · ${t('tour.rounds', { n: tour.rounds_planned })}`}
          </p>
        </div>
        {place && (
          <span className="game-tags">
            <span className={`tag ${place.spots_left > 0 ? 'ok' : ''}`}>{t('games.seats', { taken: place.registered, max: tour.max_players })}</span>
          </span>
        )}
      </div>

      <section className="card game-facts">
        <p><Icon name="book" size={16} /> {formatWhen(tour.starts_at, lang)} → {new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit' }).format(new Date(tour.ends_at))}</p>
        <p><Icon name="map" size={16} /> {place?.store_name ?? tour.venue_name} · {tour.address}</p>
        <p><Icon name="globe" size={16} /> {tour.language === 'both' ? t('games.lang.both') : tour.language === 'ja' ? '日本語' : 'English'}</p>
        <p className="muted">{t('tour.deadline', { date: formatWhen(tour.registration_deadline, lang) })}</p>
        {tour.description && <p className="game-note">{tour.description}</p>}
        {tour.twitch_channel && <p><Icon name="link" size={16} /> {t('tour.stream', { channel: tour.twitch_channel })}</p>}
        <p>
          <button
            className="btn small"
            onClick={() => downloadIcs({ id: tour.id, title: tour.name, start: tour.starts_at, end: tour.ends_at, location: `${tour.venue_name}, ${tour.address}`, url: location.href })}
          >
            <Icon name="calendar" size={14} /> {t('games.addToCalendar')}
          </button>
        </p>
      </section>

      {place && (
        <section className="card tour-map">
          <iframe title={t('tour.map')} src={osmEmbedUrl({ lat: place.lat, lng: place.lng } as never)} loading="lazy" />
          <a className="small" href={osmLink({ lat: place.lat, lng: place.lng } as never)} target="_blank" rel="noreferrer">{t('tour.openMap')} ↗</a>
        </section>
      )}

      <section className="card game-actions">
        {!session ? (
          <button className="btn primary" onClick={() => requireSignIn()}>{t('tour.signinToRegister')}</button>
        ) : registered ? (
          <>
            <p>{t(mine === 'waitlist' ? 'tour.onWaitlist' : 'tour.registered')}</p>
            <button className="btn ghost" disabled={busy} onClick={() => act('withdraw_from_tournament')}>{t('tour.withdraw')}</button>
          </>
        ) : closed ? (
          <p className="muted">{t('tour.closed')}</p>
        ) : (
          <button className="btn primary" disabled={busy} onClick={() => act('register_for_tournament')}>
            {place && place.spots_left <= 0 ? t('tour.joinWaitlist') : t('tour.register')}
          </button>
        )}
        {error && <p className="error" role="alert">{t(k(`games.error.${error}`))}</p>}
      </section>
    </div>
  );
}

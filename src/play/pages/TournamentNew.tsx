import { useEffect, useState } from 'react';
import { k, useT, useLang } from '../../core/i18n';
import { navigate } from '../../core/router';
import { backendConfigured } from '../../core/auth/supabase';
import { BackendNotice } from '../../core/auth/BackendNotice';
import { requireSignIn, useSession } from '../../core/auth/session';
import { CITIES } from '../../core/data/cities';
import { playError } from '../lib/games';
import { suggestedSwissRounds } from '../lib/pairing';
import { createTournament, storesWithPlace } from '../lib/tournaments';

const local = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const slugify = (s: string) =>
  s.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'event';

/** Organise a tournament (Swiss rounds). Saved as a draft, published from its page. */
export function TournamentNew() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const { ready, session } = useSession();
  const [stores, setStores] = useState<Awaited<ReturnType<typeof storesWithPlace>>>([]);
  const start = new Date(Date.now() + 14 * 864e5);
  start.setHours(13, 0, 0, 0);
  const [f, setF] = useState({
    name: '', game_system: '', description: '', store_id: '', venue_name: '', address: '', city: 'Tokyo',
    starts_at: local(start), hours: '6', format_id: 'clash', type: 'casual', language: lang as string, max_players: '16',
    rounds_planned: String(suggestedSwissRounds(16)), lists_visibility: 'hidden_until_start', twitch_channel: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (ready && !session) requireSignIn();
    if (backendConfigured) storesWithPlace().then(setStores, () => setStores([]));
  }, [ready, session]);

  if (!backendConfigured) return <BackendNotice />;
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const store = stores.find((s) => s.id === f.store_id);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      const startsAt = new Date(f.starts_at);
      const city = CITIES.find((c) => c.id === f.city);
      // Location: the store's point, or the city centre (only used for distance searches).
      const location = store?.location ?? `SRID=4326;POINT(${city?.lng ?? 139.7671} ${city?.lat ?? 35.6812})`;
      const slug = await createTournament({
        slug: `${slugify(f.name)}-${Math.random().toString(36).slice(2, 6)}`,
        name: f.name.trim(),
        description: f.description.trim() || null,
        organiser_id: session.user.id,
        store_id: store?.id ?? null,
        venue_name: store?.name ?? f.venue_name.trim(),
        address: store?.address ?? `${f.address.trim()}, ${f.city}`,
        location,
        starts_at: startsAt.toISOString(),
        ends_at: new Date(startsAt.getTime() + Number(f.hours) * 36e5).toISOString(),
        registration_deadline: new Date(startsAt.getTime() - 36e5).toISOString(),
        list_deadline: new Date(startsAt.getTime() - 864e5).toISOString(),
        format_id: f.format_id,
        type: f.type,
        language: f.language,
        max_players: Number(f.max_players),
        rounds_planned: Number(f.rounds_planned),
        lists_visibility: f.lists_visibility,
        pairing_system: 'swiss',
        twitch_channel: f.twitch_channel.trim() || null,
        game_system: f.game_system.trim() || null,
        status: 'draft',
      });
      navigate(`play/t/${slug}`);
    } catch (err) {
      setError(playError(err) ?? 'generic');
      setBusy(false);
    }
  };

  return (
    <div className="narrow">
      <h1>{t('tour.newTitle')}</h1>
      <form className="card field-col game-form" onSubmit={submit}>
        <h2>{t('tour.sectionEvent')}</h2>
        <label className="field">
          <span>{t('tour.name')}</span>
          <input className="text-input" required minLength={3} maxLength={100} value={f.name} onChange={(e) => set({ name: e.target.value })} />
        </label>
        <div className="field-grid">
          <label className="field">
            <span>{t('games.game')}</span>
            <input className="text-input" maxLength={60} value={f.game_system} onChange={(e) => set({ game_system: e.target.value })} placeholder={t('games.gamePlaceholder')} />
          </label>
          <label className="field">
            <span>{t('tour.size')}</span>
            <select className="select" value={f.format_id} onChange={(e) => set({ format_id: e.target.value })}>
              {['skirmish', 'clash', 'battle'].map((x) => <option key={x} value={x}>{t(k(`tour.format.${x}`))}</option>)}
            </select>
          </label>
          <label className="field">
            <span>{t('tour.typeLabel')}</span>
            <select className="select" value={f.type} onChange={(e) => set({ type: e.target.value })}>
              {['beginner', 'casual', 'competitive', 'narrative'].map((x) => <option key={x} value={x}>{t(k(`tour.type.${x}`))}</option>)}
            </select>
          </label>
        </div>
        <div className="field-grid">
          <label className="field">
            <span>{t('tour.maxPlayers')}</span>
            <input className="text-input" type="number" min={2} max={256} required value={f.max_players} onChange={(e) => set({ max_players: e.target.value, rounds_planned: String(suggestedSwissRounds(Number(e.target.value) || 2)) })} />
          </label>
          <label className="field">
            <span>{t('tour.roundsLabel')}</span>
            <input className="text-input" type="number" min={1} max={10} required value={f.rounds_planned} onChange={(e) => set({ rounds_planned: e.target.value })} />
            <small className="hint">{t('tour.roundsHint')}</small>
          </label>
          <label className="field">
            <span>{t('games.language')}</span>
            <select className="select" value={f.language} onChange={(e) => set({ language: e.target.value })}>
              <option value="ja">日本語</option>
              <option value="en">English</option>
              <option value="both">{t('games.lang.both')}</option>
            </select>
          </label>
        </div>
        <label className="field">
          <span>{t('tour.descriptionLabel')}</span>
          <textarea className="text-input" rows={3} maxLength={2000} value={f.description} onChange={(e) => set({ description: e.target.value })} />
        </label>

        <h2>{t('games.sectionWhen')}</h2>
        <div className="field-grid">
          <label className="field">
            <span>{t('games.date')}</span>
            <input className="text-input" type="datetime-local" required value={f.starts_at} onChange={(e) => set({ starts_at: e.target.value })} />
          </label>
          <label className="field">
            <span>{t('tour.hours')}</span>
            <input className="text-input" type="number" min={1} max={48} value={f.hours} onChange={(e) => set({ hours: e.target.value })} />
          </label>
        </div>
        <p className="hint">{t('tour.deadlinesHint')}</p>

        <h2>{t('games.sectionWhere')}</h2>
        <label className="field">
          <span>{t('games.store')}</span>
          <select className="select" value={f.store_id} onChange={(e) => set({ store_id: e.target.value })}>
            <option value="">{t('games.noStore')}</option>
            {stores.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.city}</option>)}
          </select>
        </label>
        {!store && (
          <div className="field-grid">
            <label className="field">
              <span>{t('tour.venue')}</span>
              <input className="text-input" required maxLength={80} value={f.venue_name} onChange={(e) => set({ venue_name: e.target.value })} />
            </label>
            <label className="field">
              <span>{t('games.city')}</span>
              <select className="select" value={f.city} onChange={(e) => set({ city: e.target.value })}>
                {CITIES.map((c) => <option key={c.id} value={c.id}>{t(k(`city.${c.id}`))}</option>)}
              </select>
            </label>
            <label className="field">
              <span>{t('tour.addressLabel')}</span>
              <input className="text-input" required maxLength={150} value={f.address} onChange={(e) => set({ address: e.target.value })} />
            </label>
          </div>
        )}

        <h2>{t('tour.sectionOptions')}</h2>
        <div className="field-grid">
          <label className="field">
            <span>{t('tour.listsVisibility')}</span>
            <select className="select" value={f.lists_visibility} onChange={(e) => set({ lists_visibility: e.target.value })}>
              <option value="hidden_until_start">{t('tour.lists.hidden')}</option>
              <option value="public">{t('tour.lists.public')}</option>
            </select>
          </label>
          <label className="field">
            <span>{t('tour.twitch')}</span>
            <input className="text-input" pattern="[A-Za-z0-9_]{4,25}" value={f.twitch_channel} onChange={(e) => set({ twitch_channel: e.target.value })} placeholder="channel_name" />
          </label>
        </div>

        {error && <p className="error" role="alert">{t(k(`games.error.${error}`))}</p>}
        <div className="nav-row">
          <a className="btn ghost" href="#/play">{t('common.back')}</a>
          <button className="btn primary" disabled={busy}>{t('tour.createDraft')}</button>
        </div>
      </form>
    </div>
  );
}

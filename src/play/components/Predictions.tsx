import { useEffect, useState } from 'react';
import { k, useT } from '../../core/i18n';
import { supabase } from '../../core/auth/supabase';
import { requireSignIn } from '../../core/auth/session';
import { playError } from '../lib/games';
import type { Match } from '../lib/tournaments';

/**
 * Tournament predictions, table by table: spectators tap the player they expect to win before the
 * score is reported; the bar shows the crowd's split. Points only, no money. Best forecasters below.
 */
interface Split { match_id: string; for_a: number; for_b: number; my_pick: string | null }
interface Seer { user_id: string; display_name: string; handle: string; correct: number; total: number }

const db = () => {
  if (!supabase) throw new Error('backend');
  return supabase;
};

export function Predictions({ tournamentId, matches, tableOf, nameOf, me }: {
  tournamentId: string;
  matches: Match[];
  tableOf: (m: Match) => number | undefined;
  nameOf: (id: string) => string;
  me: string | null;
}) {
  const t = useT();
  const [splits, setSplits] = useState<Map<string, Split>>(new Map());
  const [seers, setSeers] = useState<Seer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [off, setOff] = useState(false);

  const load = async () => {
    const [a, b] = await Promise.all([
      db().rpc('tournament_predictions', { p_tournament: tournamentId }),
      db().rpc('prediction_leaderboard', { p_tournament: tournamentId }),
    ]);
    if (a.error) {
      if (playError(a.error) === 'not_installed') setOff(true);
      return;
    }
    setSplits(new Map((a.data as Split[]).map((s) => [s.match_id, s])));
    setSeers((b.data as Seer[] | null) ?? []);
  };
  useEffect(() => {
    if (supabase) void load();
  }, [tournamentId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (off || !supabase) return null;
  const open = matches.filter((m) => m.player_b_id && m.status === 'scheduled');
  const pick = async (m: Match, player: string) => {
    if (!me) return requireSignIn();
    setError(null);
    try {
      const r = await db().rpc('predict_match', { p_match: m.id, p_pick: player });
      if (r.error) throw r.error;
      await load();
    } catch (e) {
      setError(playError(e) ?? 'generic');
    }
  };

  if (!open.length && !seers.length) return null;
  return (
    <section className="predictions">
      {open.length > 0 && (
        <>
          <h3>{t('predict.title')}</h3>
          <p className="hint">{t('predict.hint')}</p>
          <ul className="predict-list">
            {open.map((m) => {
              const s = splits.get(m.id), a = s?.for_a ?? 0, b = s?.for_b ?? 0, total = a + b;
              const pa = total ? Math.round((a / total) * 100) : 50;
              const mine = me === m.player_a_id || me === m.player_b_id;
              return (
                <li key={m.id} className="predict-row">
                  <div className="predict-head">
                    <span className="b">T{tableOf(m) ?? '?'}</span>
                    {[m.player_a_id, m.player_b_id!].map((p, i) => (
                      <button key={p} className={`chip ${s?.my_pick === p ? 'on' : ''}`} disabled={mine} aria-pressed={s?.my_pick === p} onClick={() => pick(m, p)}>
                        {i === 1 && <span className="muted vs">{t('predict.vs')} </span>}{nameOf(p)}
                      </button>
                    ))}
                  </div>
                  <div className="predict-bar" aria-label={t('predict.split', { a: pa, b: 100 - pa, n: total })}>
                    <span style={{ width: `${pa}%` }} />
                  </div>
                  <div className="predict-meta"><span>{total ? `${pa} %` : '–'}</span><span className="muted">{t('predict.votes', { n: total })}</span><span>{total ? `${100 - pa} %` : '–'}</span></div>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {seers.length > 0 && (
        <>
          <h3>{t('predict.board')}</h3>
          <ol className="seer-list">
            {seers.slice(0, 5).map((s) => (
              <li key={s.user_id} className={s.user_id === me ? 'me' : ''}>
                <span>{s.display_name}</span><span className="tab">{s.correct}/{s.total}</span>
              </li>
            ))}
          </ol>
        </>
      )}
      {error && <p className="error">{t(k(`games.error.${error}`))}</p>}
    </section>
  );
}

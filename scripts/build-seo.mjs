#!/usr/bin/env node
// After `vite build`: static HTML per public page and per published tournament (for search engines,
// AI assistants and link previews that don't run JavaScript), plus sitemap.xml, robots.txt and llms.txt.
// The app replaces the static content as soon as it loads, so people see no difference.
//
// Data: public tournaments read with the public (anon) key, like any visitor. Without it (or offline),
// only the fixed pages are generated. Rebuilt on every deploy.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { en } from '../src/core/i18n/en.ts';
import { tournamentJsonLd } from '../src/play/lib/seo.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const SITE = (process.env.SITE_URL || 'https://minicompanion.vercel.app').replace(/\/$/, '');
const TODAY = new Date().toISOString().slice(0, 10);

// Same variables as the app (Vercel env, or .env.local / .env when building locally)
const env = { ...process.env };
for (const f of ['.env.local', '.env']) {
  const p = join(ROOT, f);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*(VITE_SUPABASE_(?:URL|ANON_KEY))\s*=\s*(.+?)\s*$/);
    if (m && !env[m[1]]) env[m[1]] = m[2];
  }
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ld = (data) => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
const when = (iso) => new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tokyo' }) + ' (JST)';

const template = readFileSync(join(DIST, 'index.html'), 'utf8');

/** One page: tailored head and readable body, written to dist/<path>/index.html. */
function page(path, { title, description, body, head = '' }) {
  const full = `${title} · MiniCompanion`;
  const url = `${SITE}/${path}`;
  let html = template
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(full)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*/, `$1${esc(description)}`)
    .replace(/(<link rel="canonical" href=")[^"]*/, `$1${esc(url)}`)
    .replace(/(<meta property="og:title" content=")[^"]*/, `$1${esc(full)}`)
    .replace(/(<meta property="og:description" content=")[^"]*/, `$1${esc(description)}`)
    .replace(/(<meta property="og:url" content=")[^"]*/, `$1${esc(url)}`)
    .replace('<!--seo:head-->', head);
  html = html.replace(/<main class="seo-static">[\s\S]*?<!--seo:body-->/, `<main class="seo-static">${body}`);
  const out = join(DIST, path, 'index.html');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
}

// --- Public tournaments -----------------------------------------------------------------------------
async function fetchJson(path) {
  if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) return null;
  try {
    const res = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/${path}`, {
      headers: { apikey: env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}` },
    });
    return res.ok ? res.json() : null;
  } catch {
    return null;
  }
}
const tournaments = ((await fetchJson(
  'tournaments?select=id,slug,name,description,starts_at,ends_at,status,venue_name,address,max_players,language,game_system,type&status=in.(published,in_progress,finished)&is_hidden=eq.false&order=starts_at.desc&limit=500',
)) ?? []).filter((t) => /^[a-z0-9-]{1,80}$/.test(t.slug));
const schedule = (await fetchJson('round_schedule?select=tournament_id,number,starts_at,venue_name,address&order=number')) ?? [];
const upcoming = tournaments.filter((t) => t.status !== 'finished' && Date.parse(t.ends_at) > Date.now()).reverse();

const tourList = (list) =>
  list.length
    ? `<ul>${list.map((t) => `<li><a href="/play/t/${t.slug}">${esc(t.name)}</a> — ${esc(when(t.starts_at))}, ${esc(t.venue_name)}</li>`).join('')}</ul>`
    : '';

// --- Fixed pages ----------------------------------------------------------------------------------
const PAGES = [
  ['paint', en['home.title'], en['home.lead'], `<h2>${esc(en['home.projectTitle'])}</h2><p>${esc(en['home.projectText'])}</p>`],
  ['paint/beginner', en['beginner.title'], en['home.beginnerText'], `<p>${esc(en['beginner.plan.text'])}</p>`],
  ['play', en['play.title'], en['play.lead'], `<h2>Upcoming tournaments</h2>${tourList(upcoming.slice(0, 50))}`],
  ['play/quick', en['quick.title'], en['quick.lead'], ''],
  ['play/leagues', en['league.title'], en['league.lead'], ''],
  ['paint/challenges', en['challenge.pageTitle'], en['challenge.pageLead'], ''],
  ['play/table-generator', en['table.title'], en['table.lead'], ''],
  ['play/mentors', en['mentor.title'], en['mentor.lead'], ''],
  ['play/swap', en['swap.title'], en['swap.lead'], ''],
  ['dice', en['dice.title'], en['dice.lead'], ''],
  ['stores', en['stores.title'], en['stores.lead'], '<p>Real game, miniature and model-kit stores worldwide, from OpenStreetMap (ODbL).</p>'],
  ['legal', en['legal.title'], en['legal.about'], `<p>${esc(en['legal.full'])}</p>`],
];
for (const [path, title, description, extra] of PAGES) {
  page(path, { title, description, body: `<h1>${esc(title)}</h1><p>${esc(description)}</p>${extra}` });
}

for (const t of tournaments) {
  const rounds = schedule.filter((s) => s.tournament_id === t.id);
  const description = [when(t.starts_at), t.venue_name, t.game_system, t.description].filter(Boolean).join(' · ');
  page(`play/t/${t.slug}`, {
    title: t.name,
    description: description.length > 160 ? `${description.slice(0, 157)}…` : description,
    head: ld(tournamentJsonLd(t, rounds, SITE)),
    body: [
      `<h1>${esc(t.name)}</h1>`,
      `<p>${esc(when(t.starts_at))} → ${esc(when(rounds.at(-1)?.starts_at ?? t.ends_at))}</p>`,
      `<p>${esc(t.venue_name)}, ${esc(t.address)}</p>`,
      t.game_system ? `<p>${esc(t.game_system)} · ${esc(en[`tour.type.${t.type}`] ?? t.type)} · up to ${t.max_players} players</p>` : '',
      t.description ? `<p>${esc(t.description)}</p>` : '',
      rounds.length > 1
        ? `<h2>${esc(en['tour.schedule'])}</h2><ol>${rounds.map((r) => `<li>${esc(when(r.starts_at))}${r.venue_name ? `, ${esc(r.venue_name)}` : ''}</li>`).join('')}</ol>`
        : '',
    ].join(''),
  });
}

// --- sitemap.xml ----------------------------------------------------------------------------------
const urls = [
  { loc: `${SITE}/`, priority: '1.0' },
  ...PAGES.map(([p]) => ({ loc: `${SITE}/${p}`, priority: p === 'play' || p === 'paint' ? '0.9' : '0.7' })),
  ...tournaments.map((t) => ({ loc: `${SITE}/play/t/${t.slug}`, priority: t.status === 'finished' ? '0.3' : '0.6' })),
];
writeFileSync(
  join(DIST, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((u) => `  <url><loc>${esc(u.loc)}</loc><lastmod>${TODAY}</lastmod><priority>${u.priority}</priority></url>`)
    .join('\n')}\n</urlset>\n`,
);

// --- robots.txt: everyone welcome on public pages, including AI assistants -------------------------
const PRIVATE = ['/account', '/admin/', '/messages', '/notifications', '/signin', '/stats', '/paint/editor', '/play/table/', '/play/new', '/play/t-new', '/play/mine', '/play/game/', '/*/tables'];
const AI_BOTS = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-User', 'Claude-SearchBot', 'PerplexityBot', 'Perplexity-User', 'Google-Extended', 'Applebot-Extended', 'CCBot', 'Meta-ExternalAgent', 'Amazonbot', 'DuckAssistBot', 'MistralAI-User'];
const rules = ['Allow: /', ...PRIVATE.map((p) => `Disallow: ${p}`)].join('\n');
writeFileSync(
  join(DIST, 'robots.txt'),
  `# Public pages are open to search engines and AI assistants alike; personal pages are not useful to them.\nUser-agent: *\n${rules}\n\n${AI_BOTS.map((b) => `User-agent: ${b}`).join('\n')}\n${rules}\n\nSitemap: ${SITE}/sitemap.xml\n`,
);

// --- llms.txt (https://llmstxt.org): a short, plain description for AI assistants ------------------
writeFileSync(
  join(DIST, 'llms.txt'),
  `# MiniCompanion

> Free, independent web companion for miniature and tabletop wargaming hobbyists: plan painting schemes on a photo of your own model, find tournaments, casual games, leagues, painting contests and real hobby stores, and share your work. Available in English, Japanese, French, Spanish, German, Italian, Brazilian Portuguese, Simplified Chinese and Korean. Not affiliated with any brand.

## Paint
- [Paint scheme planner](${SITE}/paint): upload a photo; the palette is extracted, closest paints suggested; try base coats, washes, drybrushing and edge highlights on the model itself; export or share the scheme. Images stay in the browser.
- [Beginner guide](${SITE}/paint/beginner): one photo, five classic steps, a shopping list and a store nearby.

## Play
- [Tournaments](${SITE}/play): map and filters (city, distance, game size, type); Swiss pairings, live standings, QR score entry per table, multi-week events with a date and venue per round, calendar export.
- [Quick games](${SITE}/play/quick): casual games near you; ask to join, the exact address is shared only with accepted players.
- [Leagues](${SITE}/play/leagues): a season of games with automatic standings.

## Stores
- [Hobby stores](${SITE}/stores): real game, miniature and model-kit stores worldwide from OpenStreetMap (ODbL).
${upcoming.length ? `\n## Upcoming tournaments\n${upcoming.slice(0, 30).map((t) => `- [${t.name}](${SITE}/play/t/${t.slug}): ${when(t.starts_at)}, ${t.venue_name}`).join('\n')}\n` : ''}
## About
- [About and legal notice](${SITE}/legal): independent fan project; trademarks belong to their owners and are used for identification only.
`,
);

console.log(`SEO: ${PAGES.length} pages, ${tournaments.length} tournaments, sitemap ${urls.length} URLs, robots.txt, llms.txt`);

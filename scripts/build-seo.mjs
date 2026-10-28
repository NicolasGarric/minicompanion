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
import { fr } from '../src/core/i18n/fr.ts';
import { es } from '../src/core/i18n/es.ts';
import { de } from '../src/core/i18n/de.ts';
import { it } from '../src/core/i18n/it.ts';
import { pt } from '../src/core/i18n/pt.ts';
import { ja } from '../src/core/i18n/ja.ts';
import { zh } from '../src/core/i18n/zh.ts';
import { ko } from '../src/core/i18n/ko.ts';
import { HREFLANG, LANGS, localizedPath } from '../src/core/i18n/langs.ts';
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
// Every public page exists in each language: English at "/play", the others at "/ja/play" etc.
const DICTS = { en, fr, es, de, it, pt, ja, zh, ko };
const tr = (lang, key) => DICTS[lang][key] ?? en[key] ?? key;
const localeOf = (lang) => LANGS.find((l) => l.code === lang)?.locale ?? 'en-GB';
const when = (iso, lang = 'en') =>
  new Date(iso).toLocaleString(localeOf(lang), { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tokyo' }) + ' (JST)';
/** "play/t/x" in a language -> "ja/play/t/x" (no leading slash, as dist paths are written). */
const langPath = (path, lang) => localizedPath(`/${path}`, lang).replace(/^\//, '');
/** hreflang links of one page, x-default = English. */
const alternates = (path) =>
  [...LANGS.map(({ code }) => `<link rel="alternate" hreflang="${HREFLANG[code]}" href="${esc(`${SITE}/${langPath(path, code)}`)}" />`),
    `<link rel="alternate" hreflang="x-default" href="${esc(`${SITE}/${path}`)}" />`].join('\n    ');

const template = readFileSync(join(DIST, 'index.html'), 'utf8');

/** One page in one language: tailored head and readable body, written to dist/<lang>/<path>/index.html. */
function page(path, lang, { title, description, body, head = '' }) {
  const full = `${title} · MiniCompanion`;
  const url = `${SITE}/${langPath(path, lang)}`;
  let html = template
    .replace(/<html lang="[^"]*"/, `<html lang="${localeOf(lang)}"`)
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(full)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*/, `$1${esc(description)}`)
    .replace(/(<link rel="canonical" href=")[^"]*/, `$1${esc(url)}`)
    .replace(/(<meta property="og:title" content=")[^"]*/, `$1${esc(full)}`)
    .replace(/(<meta property="og:description" content=")[^"]*/, `$1${esc(description)}`)
    .replace(/(<meta property="og:url" content=")[^"]*/, `$1${esc(url)}`)
    .replace('<!--seo:head-->', `${alternates(path)}\n    ${head}`);
  html = html.replace(/<main class="seo-static">[\s\S]*?<!--seo:body-->/, `<main class="seo-static">${body}`);
  const out = join(DIST, langPath(path, lang), 'index.html');
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

const tourList = (list, lang) =>
  list.length
    ? `<ul>${list.map((t) => `<li><a href="/${langPath(`play/t/${t.slug}`, lang)}">${esc(t.name)}</a> — ${esc(when(t.starts_at, lang))}, ${esc(t.venue_name)}</li>`).join('')}</ul>`
    : '';

// --- Fixed pages ----------------------------------------------------------------------------------
const PAGES = [
  ['', 'platform.title', 'platform.lead', () => ''],
  ['paint', 'home.title', 'home.lead', (l) => `<h2>${esc(tr(l, 'home.projectTitle'))}</h2><p>${esc(tr(l, 'home.projectText'))}</p>`],
  ['paint/beginner', 'beginner.title', 'home.beginnerText', (l) => `<p>${esc(tr(l, 'beginner.plan.text'))}</p>`],
  ['play', 'play.title', 'play.lead', (l) => `<h2>${esc(tr(l, 'nav.play.tournaments'))}</h2>${tourList(upcoming.slice(0, 50), l)}`],
  ['play/quick', 'quick.title', 'quick.lead', () => ''],
  ['play/leagues', 'league.title', 'league.lead', () => ''],
  ['paint/challenges', 'challenge.pageTitle', 'challenge.pageLead', () => ''],
  ['play/table-generator', 'table.title', 'table.lead', () => ''],
  ['play/campaigns', 'nc.title', 'nc.lead', () => ''],
  ['play/mentors', 'mentor.title', 'mentor.lead', () => ''],
  ['play/swap', 'swap.title', 'swap.lead', () => ''],
  ['dice', 'dice.title', 'dice.lead', () => ''],
  ['stores', 'stores.title', 'stores.lead', () => '<p>OpenStreetMap (ODbL).</p>'],
  ['legal', 'legal.title', 'legal.about', (l) => `<p>${esc(tr(l, 'legal.full'))}</p>`],
];
for (const { code: lang } of LANGS) {
  for (const [path, titleKey, leadKey, extra] of PAGES) {
    // The English home page is the app's own index.html (kept as built); other languages get theirs.
    if (path === '' && lang === 'en') continue;
    const title = path === '' ? 'MiniCompanion' : tr(lang, titleKey);
    page(path, lang, { title, description: tr(lang, leadKey), body: `<h1>${esc(tr(lang, titleKey))}</h1><p>${esc(tr(lang, leadKey))}</p>${extra(lang)}` });
  }
}

for (const t of tournaments) {
  const rounds = schedule.filter((s) => s.tournament_id === t.id);
  for (const { code: lang } of LANGS) {
    const description = [when(t.starts_at, lang), t.venue_name, t.game_system, t.description].filter(Boolean).join(' · ');
    page(`play/t/${t.slug}`, lang, {
      title: t.name,
      description: description.length > 160 ? `${description.slice(0, 157)}…` : description,
      head: ld(tournamentJsonLd(t, rounds, SITE)),
      body: [
        `<h1>${esc(t.name)}</h1>`,
        `<p>${esc(when(t.starts_at, lang))} → ${esc(when(rounds.at(-1)?.starts_at ?? t.ends_at, lang))}</p>`,
        `<p>${esc(t.venue_name)}, ${esc(t.address)}</p>`,
        t.game_system ? `<p>${esc(t.game_system)} · ${esc(tr(lang, `tour.type.${t.type}`))} · ${esc(tr(lang, 'games.seats').replace('{taken}/', '').replace('{max}', t.max_players))}</p>` : '',
        t.description ? `<p>${esc(t.description)}</p>` : '',
        rounds.length > 1
          ? `<h2>${esc(tr(lang, 'tour.schedule'))}</h2><ol>${rounds.map((r) => `<li>${esc(when(r.starts_at, lang))}${r.venue_name ? `, ${esc(r.venue_name)}` : ''}</li>`).join('')}</ol>`
          : '',
      ].join(''),
    });
  }
}

// --- sitemap.xml ----------------------------------------------------------------------------------
// One entry per page and language, each listing its other languages (xhtml:link, as Google expects).
const pages = [
  ...PAGES.map(([p]) => ({ path: p, priority: p === '' ? '1.0' : p === 'play' || p === 'paint' ? '0.9' : '0.7' })),
  ...tournaments.map((t) => ({ path: `play/t/${t.slug}`, priority: t.status === 'finished' ? '0.3' : '0.6' })),
];
const urls = pages.flatMap((p) => LANGS.map(({ code }) => ({ ...p, loc: `${SITE}/${langPath(p.path, code)}` })));
const xhtml = (path) =>
  [...LANGS.map(({ code }) => `<xhtml:link rel="alternate" hreflang="${HREFLANG[code]}" href="${esc(`${SITE}/${langPath(path, code)}`)}"/>`),
    `<xhtml:link rel="alternate" hreflang="x-default" href="${esc(`${SITE}/${path}`)}"/>`].join('');
writeFileSync(
  join(DIST, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls
    .map((u) => `  <url><loc>${esc(u.loc)}</loc><lastmod>${TODAY}</lastmod><priority>${u.priority}</priority>${xhtml(u.path)}</url>`)
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

console.log(`SEO: ${PAGES.length} pages and ${tournaments.length} tournaments in ${LANGS.length} languages, sitemap ${urls.length} URLs, robots.txt, llms.txt`);

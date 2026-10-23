#!/usr/bin/env node
// Builds public/data/shops.json: real game, model-kit and hobby shops worldwide, from OpenStreetMap.
// Data © OpenStreetMap contributors, under the Open Database License (ODbL): the file keeps that notice
// and the app shows it next to the list. Re-run now and then to pick up shops added on OpenStreetMap.
//
// Usage: node scripts/fetch-osm-shops.mjs            (downloads from the Overpass API, region by region)
//        OSM_CACHE=dir node scripts/fetch-osm-shops.mjs   (reuses <dir>/<region>.json from an earlier run)
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public/data/shops.json');
const CACHE = process.env.OSM_CACHE;
const UA = 'MiniCompanion/0.1 (hobby project, shop list refresh)';

// Regions small enough for the public Overpass server: [name, south, west, north, east]
const REGIONS = [
  ['na_w', 5, -170, 85, -100], ['na_e', 5, -100, 85, -50], ['sa', -60, -95, 5, -30],
  ['eu_w', 30, -30, 75, 15], ['eu_e', 30, 15, 75, 60], ['af', -40, -20, 30, 60],
  ['as', -15, 60, 80, 180], ['oc', -50, 100, -15, 180],
];

async function region([name, s, w, n, e]) {
  const cached = CACHE && join(CACHE, `${name}.json`);
  if (cached && existsSync(cached)) return JSON.parse(readFileSync(cached, 'utf8'));
  const query = `[out:json][timeout:250];nwr["shop"~"^(games|model|hobby)$"](${s},${w},${n},${e});out center tags;`;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ data: query }),
    });
    if (res.ok) {
      const json = await res.json();
      if (cached) (mkdirSync(CACHE, { recursive: true }), writeFileSync(cached, JSON.stringify(json)));
      return json;
    }
    console.warn(`${name}: HTTP ${res.status}, retrying`);
    await new Promise((r) => setTimeout(r, 30000 * attempt));
  }
  throw new Error(`${name}: Overpass unavailable`);
}

// shop=hobby mixes many things: keep it only when it looks like models / miniatures / tabletop.
const OFF_TOPIC = /anim(e|ate)|アニメ|らしんばん|ゲーマーズ|駿河屋|まんだらけ|ポケモン|pok[eé]mon|k-books|jump ?shop|ジャンプ|キャラ|プリキュア|トレカ|カードラボ|card ?(shop|lab)|manga|comic|コミック|wild birds|pipas|bastel|panduro|knit|wool|yarn|scrapbook|craft|bead|sewing|fabric|stamp|coin|bird|fish|aquar|brew|kite|dance|music|手芸|ユザワヤ|reef|cosplay|コスプレ|仮面ライダー|スニダン|sneaker/i;
const OFF_TOPIC_TAGS = /knitting|dance|birds|homebrewing|stamps|comics|trading_cards|anime|crafts?|sewing|mahjong|pub_games|video_games/i;

function keep(t) {
  if (!t.name) return null;
  const sub = [t.hobby, t.games, t.model].filter(Boolean).join(';');
  if (OFF_TOPIC_TAGS.test(sub) && !/war|miniature|tabletop|board|model/i.test(sub)) return null;
  if (t.shop === 'hobby' && OFF_TOPIC.test(t.name)) return null;
  if (t.shop === 'games' && /mahjong|麻雀|casino|lotter|arcade/i.test(t.name)) return null;
  return t.shop === 'games' ? 'games' : t.shop === 'model' ? 'model' : 'hobby';
}

const seen = new Map();
for (const r of REGIONS) {
  const json = await region(r);
  for (const el of json.elements ?? []) {
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    const kind = keep(el.tags ?? {});
    if (lat == null || lng == null || !kind) continue;
    const t = el.tags;
    const street = [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ');
    const city = t['addr:city'] ?? '';
    seen.set(`${el.type[0]}${el.id}`, [
      `${el.type[0]}${el.id}`,
      t.name,
      Math.round(lat * 1e5) / 1e5,
      Math.round(lng * 1e5) / 1e5,
      kind,
      [street, city].filter(Boolean).join(', '),
      (t.website ?? t['contact:website'] ?? '').slice(0, 200),
    ]);
  }
  if (!CACHE) await new Promise((res) => setTimeout(res, 5000)); // be gentle with the public server
}

const shops = [...seen.values()].sort((a, b) => a[0].localeCompare(b[0]));
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(
  OUT,
  JSON.stringify({
    license: 'Data © OpenStreetMap contributors, available under the Open Database License (ODbL) — https://www.openstreetmap.org/copyright',
    generated: new Date().toISOString().slice(0, 10),
    fields: ['id', 'name', 'lat', 'lng', 'kind', 'address', 'website'],
    shops,
  }),
);
const by = shops.reduce((m, s) => ((m[s[4]] = (m[s[4]] ?? 0) + 1), m), {});
console.log(`${shops.length} shops written to public/data/shops.json`, by);

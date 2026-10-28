import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AFTERMATHS, MISSIONS, RULES, T9_ORDER, type T9 } from '../../src/play/data/scenarios/blocks.ts';
import { SCENARIOS, STANDALONE, TEMPLATES, loreText, localizedCampaign, scenarioById, scenarioTexts, templateBoard } from '../../src/play/data/scenarios/catalog.ts';

const marks = (s: string) => [...new Set([...s.matchAll(/\{[A-Z]\}/g)].map((m) => m[0]))].sort().join("");
function full(t: T9, what: string) {
  assert.equal(t.length, 9, `${what}: 9 languages`);
  t.forEach((v, i) => assert.ok(v.trim().length > 0, `${what}: ${T9_ORDER[i]} is empty`));
  // Every language uses the same camp placeholders
  t.forEach((v, i) => assert.equal(marks(v), marks(t[0]), `${what}: placeholders differ in ${T9_ORDER[i]}`));
}

test('the library has 10 campaigns of 5 scenarios and 12 standalone ones', () => {
  assert.equal(TEMPLATES.length, 10);
  assert.ok(TEMPLATES.every((c) => c.scenarios.length === 5));
  assert.equal(STANDALONE.length, 12);
  assert.equal(SCENARIOS.length, 62);
  assert.equal(new Set(TEMPLATES.map((c) => c.key)).size, 10, 'unique campaign keys');
  assert.equal(new Set(SCENARIOS.map((s) => s.id)).size, 62, 'unique scenario ids');
});

test('every text exists in the 9 languages with the same placeholders', () => {
  for (const [k, v] of Object.entries(MISSIONS)) full(v, `mission ${k}`);
  for (const [k, v] of Object.entries(RULES)) full(v, `rule ${k}`);
  for (const [k, v] of Object.entries(AFTERMATHS)) full(v, `aftermath ${k}`);
  for (const c of TEMPLATES) {
    full(c.title, `${c.key} title`);
    full(c.pitch, `${c.key} pitch`);
    c.places.forEach((p) => p.lore && full(p.lore, `${c.key} lore ${p.name}`));
  }
  for (const s of SCENARIOS) {
    full(s.scenario.title, `${s.id} title`);
    full(s.scenario.hook, `${s.id} hook`);
    assert.ok(s.scenario.mission in MISSIONS && s.scenario.rule in RULES && s.scenario.after in AFTERMATHS, `${s.id}: known blocks`);
  }
});

test('scenario texts get the camp names in every language', () => {
  for (const s of SCENARIOS) {
    for (const lang of T9_ORDER) {
      const x = scenarioTexts(s.scenario, lang, 'Nord', 'Sud');
      for (const v of Object.values(x)) assert.ok(!/\{[A-Z]\}/.test(v), `${s.id} ${lang}: placeholder left`);
    }
  }
  const raid = scenarioById('amber_veil.4')!;
  assert.ok(raid.scenario.swap);
  assert.ok(scenarioTexts(raid.scenario, 'en', 'North', 'South').mission.startsWith('A unit'), 'sabotage mission text');
  assert.match(scenarioTexts(raid.scenario, 'en', 'North', 'South').mission, /South wins by sabotaging/, 'camp B attacks when swapped');
});

test('each campaign places its five scenarios once, on its own board', () => {
  for (const c of TEMPLATES) {
    const used = c.places.filter((p) => p.sc).map((p) => p.sc).sort();
    assert.deepEqual(used, [1, 2, 3, 4, 5], `${c.key}: scenarios 1-5 placed once`);
    assert.equal(c.scenarios[4].after, 'finale', `${c.key}: the fifth battle is the finale`);
    assert.equal(new Set(c.places.map((p) => p.name)).size, c.places.length, `${c.key}: unique place names`);
    const b = templateBoard(c, ['North', 'South']);
    assert.ok(b.places.every((p) => !p.sc || scenarioById(p.sc)), `${c.key}: scenario ids resolve`);
    assert.ok(b.places.every((p) => !p.lore || loreText(p.lore, 'ja').length > 0), `${c.key}: lore ids resolve`);
    assert.ok(b.places.some((p) => p.lore), `${c.key}: some background`);
  }
});

test('campaign titles follow the reader when the master kept the template text', () => {
  const c = TEMPLATES[0];
  assert.equal(localizedCampaign({ title: c.title[1], description: c.pitch[1], template_key: c.key }, 'ja').title, c.title[2]);
  assert.equal(localizedCampaign({ title: 'Notre guerre', description: null, template_key: c.key }, 'ja').title, 'Notre guerre');
});

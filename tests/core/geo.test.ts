import test from 'node:test';
import assert from 'node:assert/strict';
import { countryPoint, parsePoint, toPoint, zoneInfo } from '../../src/core/lib/geo.ts';
import { toCities } from '../../src/core/stores/stores.ts';

const ewkb = (lng: number, lat: number) => {
  const b = Buffer.alloc(25);
  b.writeUInt8(1, 0);
  b.writeUInt32LE(0x20000001, 1);
  b.writeUInt32LE(4326, 5);
  b.writeDoubleLE(lng, 9);
  b.writeDoubleLE(lat, 17);
  return b.toString('hex').toUpperCase();
};

test('points are read in both forms the database returns', () => {
  assert.deepEqual(parsePoint(ewkb(4.832, 45.7578)), { lng: 4.832, lat: 45.7578 });
  assert.deepEqual(parsePoint(ewkb(-58.38, -34.6)), { lng: -58.38, lat: -34.6 });
  assert.deepEqual(parsePoint(toPoint({ lat: 45.7578, lng: 4.832 })), { lng: 4.832, lat: 45.7578 });
  for (const bad of [null, undefined, '', 'nope', '00ff', ewkb(400, 45), '01030000' + '0'.repeat(42)]) assert.equal(parsePoint(bad), null);
});

test('a time zone gives a country and a place, old names included', () => {
  assert.equal(zoneInfo('Europe/Paris')?.country, 'FR');
  assert.equal(zoneInfo('Asia/Tokyo')?.country, 'JP');
  assert.equal(zoneInfo('Asia/Calcutta')?.country, 'IN');
  assert.ok(Math.abs(zoneInfo('America/Argentina/Buenos_Aires')!.lat + 34.6) < 0.2);
  assert.ok(Math.abs(countryPoint('BE')!.lat - 50.8) < 0.2);
  assert.equal(countryPoint('??'), null);
  assert.equal(zoneInfo('UTC'), null);
  assert.equal(zoneInfo(''), null);
});

test('search results: duplicates merged, known Japanese cities keep their id, bad rows dropped', () => {
  const hit = (name: string, cc: string, state: string, lat = '1', en?: string) => ({ name, lat, lon: '2', address: { state, country: cc, country_code: cc }, namedetails: en ? { 'name:en': en } : null });
  const out = toCities([hit('東京都', 'jp', '', '35.6', 'Tokyo'), hit('Springfield', 'us', 'Ohio'), hit('Springfield', 'us', 'Ohio', '1.1'), hit('Springfield', 'us', 'Oregon'), hit('Tokyo', 'us', 'Texas', '3', 'Tokyo'), hit('X', 'fr', '', 'abc')], ['Tokyo']);
  assert.deepEqual(out.map((c) => [c.name, c.countryCode, c.region]), [['Tokyo', 'JP', ''], ['Springfield', 'US', 'Ohio'], ['Springfield', 'US', 'Oregon'], ['Tokyo', 'US', 'Texas']]);
});

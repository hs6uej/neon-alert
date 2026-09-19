// Custom (admin-made) maps: codec, validation, registry and playing on them.
require('../public/js/data.js');
require('../public/js/mapdata.js');
require('../public/js/config.js');
require('../public/js/sim.js');
require('../public/js/ai.js');
const assert = require('assert');
const GA = globalThis.GA;
const { W, H } = GA, N = W * H;

const fromGen = (id, seed, name) => {
  const m = GA.genMap(seed, id);
  return {
    name, desc: 'test', terrain: GA.terrainEncode(m.terrain), ore: GA.oreEncode(m.ore),
    starts: m.starts.slice(0, 3).map((p) => [p.x, p.y]), neutrals: m.neutrals,
  };
};

// ---- codec round trip
{
  const t = new Uint8Array(N); for (let i = 0; i < N; i++) t[i] = (i * 7 + ((i / W) | 0)) % 3 === 0 ? 1 : i % 5 === 0 ? 2 : 0;
  const back = GA.terrainDecode(GA.terrainEncode(t));
  assert(back && back.every((v, i) => v === t[i]), 'terrain rle round trip');
  assert.strictEqual(GA.terrainDecode('0:5'), null, 'wrong size rejected');
  assert.strictEqual(GA.terrainDecode('9:9216'), null, 'bad tile value rejected');
  assert.strictEqual(GA.terrainDecode('x'), null);
  console.log('ok codec');
}

// ---- every built-in map converts to a valid custom map (templates in the editor)
for (const id of ['crossroads', 'isles', 'highlands', 'random']) {
  const v = GA.validateMap(fromGen(id, 3, 'Copy of ' + id));
  const msgs = v.errors.map((e) => e.k + JSON.stringify(e.v || {}));
  assert.strictEqual(v.errors.length, 0, `${id} template invalid: ${msgs.join(' | ')}`);
  console.log('ok template', id, v.warnings.length ? '(warnings: ' + v.warnings.map((w) => w.k).join('; ') + ')' : '', 'encoded terrain', v.map.terrain.length, 'bytes');
}

// ---- validation catches mistakes
{
  const base = fromGen('crossroads', 3, 'Base map');
  const expect = (mut, text) => {
    const m = JSON.parse(JSON.stringify(base)); mut(m);
    const v = GA.validateMap(m);
    assert(v.errors.some((e) => e.k.includes(text)), `expected error "${text}", got: ${v.errors.map((e) => e.k).join(' | ')}`);
  };
  expect((m) => { m.name = 'ab'; }, 'name');
  expect((m) => { m.starts.pop(); }, 'exactly 3');
  expect((m) => { m.starts[1] = [m.starts[0][0] + 3, m.starts[0][1]]; }, 'too close together');
  expect((m) => { m.starts[2] = [3, 3]; }, 'edge');
  expect((m) => { m.terrain = '0:5'; }, 'Terrain');
  expect((m) => { m.neutrals = [{ type: 'trooper', x: 40, y: 40 }]; }, 'Unknown neutral');
  // a wall of rock that cuts start 2 off from start 1
  expect((m) => {
    const t = GA.terrainDecode(m.terrain);
    const [sx, sy] = m.starts[1];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const d = Math.hypot(x - sx, y - sy); if (d > 11 && d < 14) t[y * W + x] = 1; }
    m.terrain = GA.terrainEncode(t);
  }, 'cannot be reached');
  // start blocked by water
  expect((m) => { const t = GA.terrainDecode(m.terrain); const [sx, sy] = m.starts[0]; t[sy * W + sx + 2] = 2; m.terrain = GA.terrainEncode(t); }, 'open ground');
  // border rock is forced, name is sanitised
  const m = JSON.parse(JSON.stringify(base)); m.name = '<b>Hi</b> map'; const t = GA.terrainDecode(m.terrain); t[0] = 0; t[N - 1] = 0; m.terrain = GA.terrainEncode(t);
  const v = GA.validateMap(m);
  assert(!/[<>]/.test(v.map.name), 'name sanitised');
  assert.strictEqual(GA.terrainDecode(v.map.terrain)[0], 1, 'border forced to rock');
  console.log('ok validation');
}

// ---- registry feeds the pickers; the simulation plays on the custom map and derives everything from it
{
  const good = GA.validateMap(fromGen('highlands', 5, 'My Highlands')).map;
  GA.setCustomMaps([{ id: 'c_abcd1234', ...good }]);
  assert(GA.MAP_CHOICES.includes('c_abcd1234'), 'id in MAP_CHOICES');
  const entry = GA.MAPS.find((m) => m.id === 'c_abcd1234');
  assert(entry && entry.name === 'My Highlands' && entry.custom, 'listed in MAPS');
  assert(GA.MAPS.slice(0, GA.BASE_MAPS.length).every((m, i) => m === GA.BASE_MAPS[i]), 'built-in maps keep their place');

  const s = new GA.Sim({ seed: 9, map: 'c_abcd1234', players: [{ name: 'A', team: 0, bot: 'normal' }, { name: 'B', team: 1, bot: 'normal' }, { name: 'C', team: 2, bot: 'normal' }] });
  assert.strictEqual(s.mapId, 'c_abcd1234');
  const ref = GA.genMap(5, 'highlands');
  assert.deepStrictEqual(Array.from(s.terrain).join('') === Array.from(GA.terrainDecode(good.terrain)).join(''), true, 'terrain comes from the saved map');
  assert.strictEqual([...s.buildings.values()].filter((b) => b.def.neutral).length, good.neutrals.length, 'neutral structures from the saved map');
  const startSet = new Set(good.starts.map((p) => p.join(',')));
  assert(s.starts.every((p) => startSet.has(p.x + ',' + p.y)), 'starts come from the saved map');
  // each game gets its own copy of the terrain (rock destruction must not leak into the saved map)
  const rock = Array.from({ length: N }, (_, i) => i).find((i) => s.rockHp[i] > 0);
  s.rockDamage(rock, 1e6, 'shell');
  assert.strictEqual(s.terrain[rock], 0);
  assert.strictEqual(GA.terrainDecode(GA.CUSTOM_MAPS.c_abcd1234.terrain)[rock], 1, 'registry copy untouched');
  for (let i = 0; i < 20 * 60 * 3; i++) s.step();
  assert(s.units.size > 6, 'bots are playing on the custom map');
  // deleting the map falls back gracefully
  GA.setCustomMaps([]);
  assert(!GA.MAP_CHOICES.includes('c_abcd1234'));
  const s2 = new GA.Sim({ seed: 1, map: 'c_abcd1234', players: [{ name: 'A', team: 0 }, { name: 'B', team: 1 }] });
  assert(s2.mapId === 'random' && s2.buildings.size >= 2, 'unknown custom id falls back to a random map');
  console.log('ok registry + simulation on a custom map (units after 3 min:', s.units.size, ')');
}
console.log('ALL OK');

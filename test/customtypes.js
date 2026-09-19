// Custom buildings / units / weapons, the on/off switch, and how they behave in the simulation.
require('../public/js/data.js');
require('../public/js/mapdata.js');
require('../public/js/config.js');
require('../public/js/sim.js');
require('../public/js/ai.js');
const assert = require('assert');
const GA = globalThis.GA;

const CFG = {
  custom: {
    weapons: { w_zap: { base: 'pulse', dmg: 80, range: 9, cd: 0.5 } },
    types: {
      x_bar2: { base: 'barracks', name: 'Field Barracks', cost: 300, time: 6 },
      x_ref2: { base: 'refinery', name: 'Mini Refinery', cost: 700 },
      x_zapper: { base: 'arc', name: 'Zapper Tank', hp: 900, cost: 500, time: 6, weapon: 'w_zap' },
      x_rifle: { base: 'trooper', name: 'Marksman', cost: 90, req: ['x_bar2'] },
    },
  },
  disabled: ['nova', 'wasp', 'radar'],
};
const twoPlayers = (bots) => [{ name: 'A', team: 0, bot: bots ? 'normal' : undefined }, { name: 'B', team: 1, bot: bots ? 'normal' : undefined }];
const run = (s, secs) => { for (let i = 0; i < secs * 20; i++) s.step(); };
// free spot next to player 0's base (ignores the build radius rule)
const spot = (s, type, skip = 0) => { const st = s.starts[0]; let n = 0; for (let r = 4; r < 16; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; const x = st.x + dx, y = st.y + dy; if (s.canPlace(0, type, x, y, true) && n++ >= skip) return [x, y]; } return null; };
const put = (s, type) => { const p = spot(s, type, 3 * (put.n = (put.n || 0) + 1)); return s.addBuilding(type, 0, p[0], p[1], { instant: true }); };

// ---- config: cleaning and applying
{
  const c = GA.cleanConfig({ ...CFG, custom: { ...CFG.custom, types: { ...CFG.custom.types, x_conyard2: { base: 'conyard', name: 'nope' }, bad: { base: 'arc', name: 'bad id' }, x_neut: { base: 'derrick', name: 'neutral' }, x_loop: { base: 'arc', name: 'Loop', req: ['x_loop'] } } }, disabled: [...CFG.disabled, 'power', 'harvester', 'conyard', 'nosuch'] });
  assert.deepStrictEqual(Object.keys(c.custom.types).sort(), ['x_bar2', 'x_loop', 'x_ref2', 'x_rifle', 'x_zapper'], 'invalid custom types are dropped');
  assert(!('req' in c.custom.types.x_loop), 'a type cannot require itself');
  assert.deepStrictEqual(c.disabled, ['nova', 'radar', 'wasp'], 'protected / unknown ids cannot be switched off');
  assert.strictEqual(c.custom.types.x_zapper.weapon, 'w_zap', 'custom weapons can be used by types');
  GA.applyConfig(CFG);
  assert.strictEqual(GA.TYPES.length, GA.BUILTIN_TYPES.length + 4);
  assert.strictEqual(GA.TIDX.x_zapper, GA.TYPES.indexOf('x_zapper'));
  const z = GA.DEFS.x_zapper;
  assert(z.custom && z.base === 'arc' && z.look === 'arc' && z.role === 'arc' && z.wp.dmg === 80 && z.hp === 900 && z.cat === 'vehicle' && z.kind === 'u');
  assert.strictEqual(GA.DEFS.x_bar2.cat, 'structure'); assert.strictEqual(GA.roleOf(GA.DEFS.x_bar2), 'barracks');
  assert(GA.DEFS.nova.disabled && !GA.DEFS.arc.disabled);
  // the table is identical no matter how often / in which order the same config is applied (server and clients must agree)
  const order = GA.TYPES.join(',');
  GA.applyConfig({}); GA.applyConfig(JSON.parse(JSON.stringify(GA.cleanConfig(CFG))));
  assert.strictEqual(GA.TYPES.join(','), order, 'stable type table');
  GA.applyConfig({});
  assert(!GA.DEFS.x_zapper && !GA.WEAPONS.w_zap && GA.TYPES.length === GA.BUILTIN_TYPES.length && !GA.DEFS.nova.disabled, 'resetting removes every custom type');
  console.log('ok config clean/apply');
}

// ---- a copy of the barracks trains infantry (and makes the tech tree work), a copy of the refinery refines
{
  GA.applyConfig(CFG);
  const s = new GA.Sim({ seed: 3, startCredits: 30000, players: twoPlayers(false) });
  const me = s.players[0];
  assert(!s.canQueue(0, 'trooper'), 'no barracks yet');
  const pw = put(s, 'power'); s.computeCounts();
  assert(!s.canQueue(0, 'x_rifle'), 'custom unit needs its custom building');
  const bar = put(s, 'x_bar2'); s.computeCounts();
  assert(me.counts.x_bar2 === 1 && me.counts.barracks === 1, 'a copy counts as the original too');
  assert(s.canQueue(0, 'trooper') && s.canQueue(0, 'x_rifle'), 'copy unlocks infantry and its own tech');
  const before = s.units.size;
  s.cmd(0, { type: 'queue', item: 'x_rifle', n: 2 }); run(s, 20);
  assert(s.units.size >= before + 2 && [...s.units.values()].filter((u) => u.type === 'x_rifle').length === 2, 'the custom barracks produced two Marksmen');
  s.cmd(0, { type: 'rally', id: bar.id, x: 30, y: 30 });
  assert(bar.rally, 'rally point works on the copy');
  // refinery copy: free harvester when placed, and ore is delivered to it
  put(s, 'factory'); s.computeCounts();
  s.cmd(0, { type: 'queue', item: 'x_ref2' }); run(s, 30);
  assert(me.q.structure[0] && me.q.structure[0].ready, 'custom refinery is ready to place');
  const pos = (() => { const st = s.starts[0]; for (let r = 4; r < 16; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (s.canPlace(0, 'x_ref2', st.x + dx, st.y + dy)) return [st.x + dx, st.y + dy]; return null; })();
  assert(pos, 'found a spot for the custom refinery');
  const hv0 = [...s.units.values()].filter((u) => u.def.harvester && u.owner === 0).length;
  s.cmd(0, { type: 'place', item: 'x_ref2', x: pos[0], y: pos[1] }); s.computeCounts();
  assert.strictEqual([...s.units.values()].filter((u) => u.def.harvester && u.owner === 0).length, hv0 + 1, 'a free harvester came with the copy');
  assert(me.counts.refinery >= 1);
  // vehicles: the custom tank uses its custom weapon
  s.cmd(0, { type: 'queue', item: 'x_zapper' }); run(s, 15);
  const zap = [...s.units.values()].find((u) => u.type === 'x_zapper');
  assert(zap && zap.def.wp.dmg === 80 && zap.def.wp.range === 9, 'custom tank exists with the custom weapon');
  console.log('ok custom buildings / units act like their originals');
}

// ---- switched-off types
{
  GA.applyConfig(CFG);
  const s = new GA.Sim({ seed: 4, startCredits: 30000, players: twoPlayers(false) });
  put(s, 'power'); put(s, 'refinery'); put(s, 'factory'); s.computeCounts();
  assert(!s.canQueue(0, 'nova') && !s.canQueue(0, 'radar') && s.canQueue(0, 'arc'), 'disabled types cannot be queued');
  s.cmd(0, { type: 'queue', item: 'nova' }); assert.strictEqual(s.players[0].q.vehicle.length, 0, 'the queue command is refused');
  GA.applyConfig({ disabled: ['trooper', 'derrick'] });
  const s2 = new GA.Sim({ seed: 4, players: twoPlayers(false) });
  assert.strictEqual([...s2.units.values()].length, 0, 'a switched-off trooper is not handed out at the start');
  assert.strictEqual([...s2.buildings.values()].filter((b) => b.type === 'derrick').length, 0, 'switched-off neutral structures are not placed');
  console.log('ok disabled types');
}

// ---- bots keep playing when structures / units are switched off (radar off also removes tech lab, uplink ... from their plan)
{
  GA.applyConfig({ disabled: ['radar', 'nova', 'trooper', 'turret'] });
  const s = new GA.Sim({ seed: 5, players: [0, 1, 2].map((i) => ({ name: 'B' + i, team: i, bot: 'normal' })) });
  let armed = 0;
  for (let i = 0; i < 20 * 60 * 6; i++) { s.step(); if (i % 400 === 0) armed = Math.max(armed, s.units.size); }
  assert(armed > 8, 'bots still build an army without radar / turrets / troopers (peak ' + armed + ')');
  for (const b of s.buildings.values()) assert(!['radar', 'turret', 'techlab', 'uplink'].includes(b.type) || b.def.neutral, 'no ' + b.type + ' was built');
  console.log('ok bots with switched-off types, peak units', armed);
}

// ---- snapshots carry custom types and round-trip through the type table
{
  GA.applyConfig(CFG);
  const s = new GA.Sim({ seed: 6, startCredits: 30000, players: twoPlayers(false) });
  put(s, 'power'); put(s, 'x_bar2'); s.computeCounts();
  s.cmd(0, { type: 'queue', item: 'x_rifle' }); run(s, 12);
  const snap = s.flush([0])[0];
  const names = snap.ents.map((a) => GA.TYPES[a[1]]);
  assert(names.includes('x_bar2') && names.includes('x_rifle'), 'custom entities decode back to their ids');
  console.log('ok snapshot round trip');
}
GA.applyConfig({});
console.log('ALL OK');

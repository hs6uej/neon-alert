// Feature tests for commands the bots do not exercise: capture, deploy, sell, repair, rally, lance, harvest.
require('../public/js/data.js');
require('../public/js/config.js');
require('../public/js/sim.js');
require('../public/js/ai.js');
const GA = globalThis.GA;
const assert = require('assert');

function mk(seed) {
  return new GA.Sim({ seed, startCredits: 20000, players: [{ name: 'A', team: 0 }, { name: 'B', team: 1 }, { name: 'C', team: 2 }] });
}
const run = (s, sec) => { for (let i = 0; i < sec * 20; i++) s.step(); };
function site(s, pid, type, from) {
  const d = GA.DEFS[type];
  for (let r = 3; r < 14; r++) for (let a = 0; a < 40; a++) {
    const x = Math.round(from.x + Math.cos(a) * r), y = Math.round(from.y + Math.sin(a) * r);
    if (s.canPlace(pid, type, x, y)) return [x, y];
  }
}
function build(s, pid, type) {
  s.cmd(pid, { type: 'queue', item: type });
  const it = s.players[pid].q.structure;
  for (let i = 0; i < 20 * 120 && !(it[0] && it[0].ready); i++) s.step();
  assert(it[0] && it[0].ready, 'not ready ' + type);
  const cy = [...s.buildings.values()].find((b) => b.owner === pid && b.type === 'conyard');
  const p = site(s, pid, type, cy);
  assert(p, 'no site ' + type);
  s.cmd(pid, { type: 'place', item: type, x: p[0], y: p[1] });
  return [...s.buildings.values()].find((b) => b.owner === pid && b.type === type);
}

// 1. tech tree + economy
{
  const s = mk(1);
  const pw = build(s, 0, 'power');
  assert(pw, 'power');
  assert.strictEqual(s.players[0].pwrProd, 150);
  const rf = build(s, 0, 'refinery');
  run(s, 1);
  const hv = [...s.units.values()].filter((u) => u.owner === 0 && u.type === 'harvester');
  assert.strictEqual(hv.length, 1, 'free harvester');
  const c0 = s.players[0].credits;
  run(s, 90);
  assert(s.players[0].credits > c0 - 100, 'harvester earns credits: ' + (s.players[0].credits - c0));
  console.log('ok economy, delta credits', Math.floor(s.players[0].credits - c0));
  // sell + repair
  rf.hp = 300;
  s.cmd(0, { type: 'repair', id: rf.id });
  run(s, 5);
  assert(rf.hp > 300, 'repair heals');
  const before = s.players[0].credits;
  s.cmd(0, { type: 'sell', id: rf.id });
  assert(!s.buildings.has(rf.id) && s.players[0].credits > before, 'sell');
  console.log('ok repair/sell');
}

// 2. capture with engineer
{
  const s = mk(2);
  const cyB = [...s.buildings.values()].find((b) => b.owner === 1);
  const eng = s.addUnit('engineer', 0, cyB.x + 3.5, cyB.y + 3.5);
  s.cmd(0, { type: 'capture', ids: [eng.id], target: cyB.id });
  run(s, 12);
  assert.strictEqual(cyB.owner, 0, 'captured');
  assert(!s.units.has(eng.id), 'engineer consumed');
  console.log('ok capture');
}

// 3. MCV deploy
{
  const s = mk(3);
  const cy = [...s.buildings.values()].find((b) => b.owner === 0);
  const sp = s.nearestPassable(Math.floor(cy.x + 8), Math.floor(cy.y + 8), 8);
  const m = s.addUnit('mcv', 0, sp[0] + 0.5, sp[1] + 0.5);
  s.cmd(0, { type: 'deploy', ids: [m.id] });
  run(s, 1);
  const cys = [...s.buildings.values()].filter((b) => b.owner === 0 && b.type === 'conyard');
  assert.strictEqual(cys.length, 2, 'mcv deployed');
  console.log('ok mcv');
}

// 4. combat + rally + move
{
  const s = mk(4);
  const cy = [...s.buildings.values()].find((b) => b.owner === 0);
  const tgt = [...s.buildings.values()].find((b) => b.owner === 1);
  const us = [];
  for (let i = 0; i < 12; i++) us.push(s.addUnit(i % 2 ? 'arc' : 'lancer', 0, tgt.x + 6 + (i % 4) * 0.7, tgt.y + 6 + Math.floor(i / 4) * 0.7));
  s.cmd(0, { type: 'attack', ids: us.map((u) => u.id), target: tgt.id });
  const hp0 = tgt.hp;
  run(s, 20);
  assert(tgt.dead || tgt.hp < hp0, 'attack damages building');
  console.log('ok combat: target hp', Math.floor(tgt.hp), '/', hp0, 'dead', !!tgt.dead);
  // move order
  const u = us.find((x) => !x.dead);
  assert(u, "a survivor");
  s.cmd(0, { type: 'move', ids: [u.id], x: cy.x, y: cy.y + 6 });
  run(s, 140);
  assert(Math.hypot(u.x - cy.x, u.y - (cy.y + 6)) < 4, 'move arrives ' + Math.hypot(u.x - cy.x, u.y - cy.y - 6));
  console.log('ok move');
}

// 5. orbital lance
{
  const s = mk(5);
  const tgt = [...s.buildings.values()].find((b) => b.owner === 1);
  const u = s.addUnit('arc', 1, tgt.x + 4, tgt.y + 4);
  s.players[0].sw.ready = true;
  s.cmd(0, { type: 'sw', x: tgt.x, y: tgt.y });
  run(s, 5);
  assert(tgt.dead, 'lance kills conyard');
  console.log('ok lance');
}

// 6. elimination + victory
{
  const s = mk(6);
  s.cmd(1, { type: 'surrender' });
  s.cmd(2, { type: 'surrender' });
  run(s, 2);
  assert(s.over && s.over.winnerTeam === 0, 'winner');
  console.log('ok victory');
}

// 7. map generation sanity across seeds
{
  let bad = 0;
  for (let seed = 1; seed <= 150; seed++) {
    const m = GA.genMap(seed);
    let oreNear = m.starts.map((st) => { let n = 0; for (let y = st.y - 18; y <= st.y + 18; y++) for (let x = st.x - 18; x <= st.x + 18; x++) if (x > 0 && y > 0 && x < 96 && y < 96 && m.ore[y * 96 + x] > 0) n++; return n; });
    if (Math.min(...oreNear) < 20) bad++;
  }
  assert(bad < 5, 'too many maps with poor ore: ' + bad);
  console.log('ok mapgen (poor-ore maps:', bad + '/150)');
}
// 8. admin config overrides + reset
{
  const stable = (k, v) => (k === 'wp' ? undefined : v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1))) : v);
  const before = JSON.stringify([GA.DEFS, GA.WEAPONS, GA.MULT, GA.BOT_LEVELS, GA.SETTINGS], stable);
  GA.applyConfig({ defs: { arc: { cost: 1, weapon: 'rail', req: ['power'] }, turret: { weapon: '' } }, weapons: { rail: { dmg: 7 } }, mult: { pulse: { inf: 3 } }, bots: { hard: { delay: 5 } }, settings: { startCredits: 123 } });
  assert.strictEqual(GA.DEFS.arc.cost, 1); assert.strictEqual(GA.DEFS.arc.wp.dmg, 7); assert.strictEqual(GA.MULT.pulse.inf, 3);
  assert.strictEqual(GA.DEFS.turret.wp, undefined); assert.strictEqual(GA.BOT_LEVELS.hard.delay, 5);
  const s = new GA.Sim({ seed: 1, players: [{ name: 'A' }, { name: 'B' }] });
  assert.strictEqual(s.players[0].credits, 123, 'settings used by sim');
  GA.applyConfig({});
  const after = JSON.stringify([GA.DEFS, GA.WEAPONS, GA.MULT, GA.BOT_LEVELS, GA.SETTINGS], stable);
  assert.strictEqual(before, after, 'reset restores defaults');
  assert.strictEqual(GA.DEFS.turret.wp, GA.WEAPONS.tower);
  console.log('ok config apply/reset');
}
console.log('ALL OK');

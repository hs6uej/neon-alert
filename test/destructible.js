// Destructible rock walls and neutral map structures (derricks / depots).
require('../public/js/data.js');
require('../public/js/sim.js');
require('../public/js/ai.js');
const assert = require('assert');
const GA = globalThis.GA;
const W = GA.W;

const mk = (map, n = 2) => new GA.Sim({ seed: 7, map, startCredits: 20000, players: Array.from({ length: n }, (_, i) => ({ name: 'P' + i, team: i })) });
const run = (s, secs) => { for (let i = 0; i < secs * 20; i++) s.step(); };
const rockNear = (s, x, y, rMax = 25) => {
  let best = -1, bd = 1e9;
  for (let i = 0; i < W * GA.H; i++) {
    if (!(s.rockHp[i] > 0)) continue;
    const d = Math.hypot((i % W) + 0.5 - x, ((i / W) | 0) + 0.5 - y);
    // must be reachable-adjacent: some passable neighbour
    const tx = i % W, ty = (i / W) | 0;
    if (d < bd && d < rMax && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => s.passable(tx + dx, ty + dy))) { bd = d; best = i; }
  }
  return best;
};

// ---- 1. rocks are destructible, map border is not
{
  const s = mk('crossroads');
  let soft = 0, hard = 0;
  for (let i = 0; i < W * GA.H; i++) if (s.terrain[i] === 1) (s.rockHp[i] > 0 ? soft++ : hard++);
  assert(soft > 100 && hard > 300, `rock tiles soft=${soft} hard=${hard}`);
  for (let x = 0; x < W; x++) assert.strictEqual(s.rockHp[x], 0, 'border is indestructible');
  console.log('ok rock tiles: breakable', soft, 'indestructible', hard);
}

// ---- 2. attack order on a rock destroys it and opens the tile
{
  const s = mk('crossroads');
  const st = s.starts[0];
  const rock = rockNear(s, st.x, st.y);
  assert(rock >= 0);
  const tanks = [0, 1, 2].map((k) => s.addUnit('arc', 0, st.x + k * 0.6, st.y + 2, {}));
  s.cmd(0, { type: 'attackRock', ids: tanks.map((u) => u.id), x: rock % W, y: (rock / W) | 0 });
  assert(tanks.every((u) => u.order && u.order.type === 'attackRock'));
  const events = [];
  for (let i = 0; i < 20 * 120 && s.terrain[rock] === 1; i++) { s.step(); events.push(...s.events); s.events = []; }
  assert.strictEqual(s.terrain[rock], 0, 'rock destroyed');
  assert(events.some((e) => e.e === 'rock' && e.i === rock && e.s === 3), 'destroy event');
  assert(events.some((e) => e.e === 'rock' && e.i === rock && e.s === 1), 'damage stage event');
  assert(s.passable(rock % W, (rock / W) | 0), 'tile is passable now');
  run(s, 1);
  assert(tanks.every((u) => !u.order || u.order.type !== 'attackRock'), 'order finished');
  console.log('ok attack order breaks a rock in', (s.time).toFixed(1), 's');
}

// ---- 3. units do not shoot rocks on their own; splash chips nearby rocks; unarmed units cannot attack rocks
{
  const s = mk('crossroads');
  const st = s.starts[0];
  const rock = rockNear(s, st.x, st.y);
  const t = s.addUnit('trooper', 0, (rock % W) + 0.5, ((rock / W) | 0) + 1.5, {});
  run(s, 5);
  assert.strictEqual(s.rockHp[rock], s.rockMax, 'idle troopers leave rocks alone');
  const eng = s.addUnit('engineer', 0, st.x, st.y + 2, {});
  s.cmd(0, { type: 'attackRock', ids: [eng.id], x: rock % W, y: (rock / W) | 0 });
  assert(!eng.order, 'engineer cannot attack rocks');
  // splash: an Arc Tank shooting an enemy trooper next to the wall
  const foe = s.addUnit('trooper', 1, (rock % W) + 0.5, ((rock / W) | 0) + 0.5 + 1, {});
  foe.hp = 1e6; foe.mhp = 1e6;
  const tank = s.addUnit('arc', 0, foe.x, foe.y + 3, {});
  s.cmd(0, { type: 'attack', ids: [tank.id], target: foe.id });
  run(s, 30);
  const chipped = Array.from({ length: W * GA.H }, (_, i) => i).filter((i) => s.terrain[i] === 1 && s.rockHp[i] > 0 && s.rockHp[i] < s.rockMax).length;
  assert(chipped > 0 || s.rockStage.some((v) => v), 'splash chipped nearby rocks');
  console.log('ok splash chips rocks, idle units ignore them (chipped tiles:', chipped, ')');
}

// ---- 4. Orbital Lance opens a crater
{
  const s = mk('crossroads');
  const st = s.starts[0];
  const rock = rockNear(s, st.x, st.y);
  const x = (rock % W) + 0.5, y = ((rock / W) | 0) + 0.5;
  const near = []; for (let i = 0; i < W * GA.H; i++) if (s.rockHp[i] > 0 && Math.hypot((i % W) + 0.5 - x, ((i / W) | 0) + 0.5 - y) < 2) near.push(i);
  s.players[0].sw.ready = true;
  s.cmd(0, { type: 'sw', x, y });
  run(s, 5);
  assert(near.every((i) => s.terrain[i] === 0), 'lance flattened rocks near the impact');
  console.log('ok orbital lance cleared', near.length, 'rock tiles');
}

// ---- 5. neutral structures
for (const map of ['crossroads', 'isles', 'highlands', 'random']) {
  const s = mk(map, 3);
  const ns = [...s.buildings.values()].filter((b) => b.def.neutral);
  assert(ns.length >= 4, `${map}: neutral structures ${ns.length}`);
  assert(ns.every((b) => b.owner === s.neutralId), 'owned by neutral');
  // each neutral structure is reachable from a base
  const st = s.nearestPassable(s.starts[0].x, s.starts[0].y + 4, 8);
  for (const b of ns) {
    const g = s.goalNear({ x: st[0] + 0.5, y: st[1] + 0.5 }, b);
    const p = s.findPath(st[0], st[1], Math.floor(g[0]), Math.floor(g[1]), 40000);
    assert(p && p.length, `${map}: ${b.type} at ${b.bx},${b.by} reachable`);
  }
  // players list contains a neutral entry, initInfo exposes it, and it never wins/loses the game
  assert.strictEqual(s.players.filter((p) => p.neutral).length, 1);
  assert(s.initInfo().players[s.neutralId].neutral === true);
  console.log('ok', map, 'neutral structures:', ns.map((b) => b.type[0] + '@' + b.bx + ',' + b.by).join(' '));
}

// ---- 6. neutral behaviour: not auto-targeted, capture, income, one-off bounty, destroy
{
  const s = mk('crossroads');
  const derrick = [...s.buildings.values()].find((b) => b.type === 'derrick');
  const depot = [...s.buildings.values()].find((b) => b.type === 'depot');
  // a tank parked next to it does not shoot it
  const tank = s.addUnit('arc', 0, derrick.x + 2.5, derrick.y, {});
  run(s, 6);
  assert.strictEqual(derrick.hp, derrick.mhp, 'neutral structure is not auto-targeted');
  // engineer captures the derrick
  const eng = s.addUnit('engineer', 0, derrick.x + 2.5, derrick.y + 1, {});
  s.cmd(0, { type: 'capture', ids: [eng.id], target: derrick.id });
  run(s, 6);
  assert.strictEqual(derrick.owner, 0, 'captured');
  assert(s.players[0].income >= GA.DEFS.derrick.income, 'income registered');
  const c0 = s.players[0].credits;
  run(s, 10);
  const gained = s.players[0].credits - c0;
  assert(gained > GA.DEFS.derrick.income * 9, `derrick pays out (${gained})`);
  assert.strictEqual(s.players[0].blds, 1, 'derrick does not count as a base building');
  // depot bounty is paid once
  const e2 = s.addUnit('engineer', 0, depot.x + 2.5, depot.y, {});
  const before = s.players[0].credits;
  s.cmd(0, { type: 'capture', ids: [e2.id], target: depot.id });
  run(s, 8);
  assert.strictEqual(depot.owner, 0);
  assert(s.players[0].credits - before >= GA.DEFS.depot.bounty, 'bounty paid');
  const e3 = s.addUnit('engineer', 1, depot.x - 2.5, depot.y, {});
  const b1 = s.players[1].credits;
  s.cmd(1, { type: 'capture', ids: [e3.id], target: depot.id });
  run(s, 8);
  assert.strictEqual(depot.owner, 1, 'recaptured');
  assert(s.players[1].credits - b1 < 100, 'no second bounty');
  // explicit attack destroys a neutral structure (and the neutral is never in the results)
  const s2 = mk('crossroads');
  const d2 = [...s2.buildings.values()].find((b) => b.type === 'derrick');
  const t2 = [0, 1].map((k) => s2.addUnit('arc', 0, d2.x + 3 + k * 0.5, d2.y, {}));
  s2.cmd(0, { type: 'attack', ids: t2.map((u) => u.id), target: d2.id });
  run(s2, 40);
  assert(!s2.buildings.has(d2.id), 'derrick destroyed by explicit attack');
  assert.strictEqual(s2.players[s2.neutralId].stats.kills, 0);
  assert(!s2.over, 'game continues');
  console.log('ok neutral structures: not auto-targeted, capture, income', gained.toFixed(0), 'in 10 s, one-off bounty, destroyable');
}

// ---- 7. snapshots: rock events reach everybody, neutral structures follow fog of war
{
  const s = mk('crossroads');
  const rock = rockNear(s, s.starts[1].x, s.starts[1].y);
  s.rockDamage(rock, 1e6, 'shell');
  const snaps = s.flush([0, 1]);
  for (const pid of [0, 1]) assert(snaps[pid].ev.some((e) => e.e === 'rock' && e.i === rock && e.s === 3), 'rock event delivered to player ' + pid);
  assert.strictEqual(snaps[0].pl.length, s.players.length);
  const far = [...s.buildings.values()].find((b) => b.def.neutral);
  const seen0 = snaps[0].ents.some((a) => a[0] === far.id);
  console.log('ok snapshot: rock event broadcast; neutral structure visible at start =', seen0);
}
console.log('ALL OK');

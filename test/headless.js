// Headless bot-vs-bot simulation to sanity check economy, AI and combat.
require('../public/js/data.js');
require('../public/js/sim.js');
require('../public/js/ai.js');
const GA = globalThis.GA;

const minutes = +(process.argv[2] || 12);
const levels = (process.argv[3] || 'normal,normal,normal').split(',');
const seed = process.argv[4] ? +process.argv[4] : 12345;
const sim = new GA.Sim({
  map: process.argv[5] && process.argv[5] !== '--map' ? process.argv[5] : undefined,
  seed,
  players: levels.map((l, i) => ({ name: 'Bot' + i, team: i, bot: l })),
});

if (process.argv.includes('--map')) {
  const ch = ['.', '#', '~'];
  for (let y = 0; y < GA.H; y += 2) {
    let s = '';
    for (let x = 0; x < GA.W; x++) s += sim.ore[y * GA.W + x] > 0 ? '$' : ch[sim.terrain[y * GA.W + x]];
    console.log(s);
  }
  console.log(sim.starts);
}

const t0 = Date.now();
let worst = 0;
const total = minutes * 60 * 20;
for (let i = 0; i < total; i++) {
  const s = process.hrtime.bigint();
  sim.step();
  const d = Number(process.hrtime.bigint() - s) / 1e6;
  if (d > worst) worst = d;
  if (i % 20 === 0) sim.flush([]);
  if (i % (20 * 60) === 0) {
    const line = sim.players.map((p) => {
      let u = 0, hv = 0;
      for (const e of sim.units.values()) if (e.owner === p.id) { if (e.def.harvester) hv++; else u++; }
      return `P${p.id}[${p.alive ? 'ok' : 'DEAD'}] cr=${Math.floor(p.credits)} pw=${p.pwrProd}/${p.pwrUse} bld=${p.blds} army=${u} hv=${hv} k=${p.stats.kills}`;
    }).join(' | ');
    console.log(`t=${Math.floor(sim.time / 60)}m ${line}`);
  }
  if (sim.over) { console.log('GAME OVER', sim.over, 'at', Math.floor(sim.time), 's'); break; }
}
console.log('wall ms', Date.now() - t0, 'worst tick ms', worst.toFixed(2), 'ents', sim.ents.size);
const snap = sim.flush([0])[0];
console.log('snapshot bytes', JSON.stringify(snap).length, 'ents', snap.ents.length);

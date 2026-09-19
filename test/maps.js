// Designed-map sanity: connectivity, reachable ore, fairness between the three bases.
require('../public/js/data.js'); require('../public/js/config.js'); require('../public/js/sim.js');
const GA = globalThis.GA, W = 96, H = 96, N = W * H;
const assert = require('assert');
function flood(terrain, sx, sy) {
  const seen = new Uint8Array(N), st = [sy * W + sx]; seen[st[0]] = 1;
  while (st.length) { const c = st.pop(), x = c % W, y = (c / W) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const i = ny * W + nx; if (seen[i] || terrain[i] !== 0) continue; seen[i] = 1; st.push(i); } }
  return seen;
}
for (const id of [...GA.MAP_IDS, 'random', 'any']) {
  for (let seed = 1; seed <= 40; seed++) {
    const m = GA.genMap(seed, id);
    const seen = flood(m.terrain, m.starts[0].x, m.starts[0].y);
    for (const s of m.starts) assert(seen[s.y * W + s.x], `${id}/${seed}: bases connected`);
    for (let i = 0; i < N; i++) if (m.ore[i] > 0) assert(seen[i], `${id}/${seed}: ore reachable`);
    const near = m.starts.map((st) => { let n = 0, v = 0; for (let i = 0; i < N; i++) if (m.ore[i] > 0 && Math.hypot((i % W) - st.x, ((i / W) | 0) - st.y) < 20) { n++; v += m.ore[i]; } return { n, v }; });
    assert(Math.min(...near.map((x) => x.n)) >= 20, `${id}/${seed}: ore near every base ${JSON.stringify(near)}`);
    if (id !== 'random') { const vs = near.map((x) => x.v); assert(Math.max(...vs) / Math.min(...vs) < 1.45, `${id}/${seed}: ore fairness ${vs.map(Math.round)}`); }
  }
  const m = GA.genMap(1, id);
  let rock = 0, water = 0, ore = 0;
  for (let i = 0; i < N; i++) { if (m.terrain[i] === 1) rock++; else if (m.terrain[i] === 2) water++; if (m.ore[i] > 0) ore++; }
  console.log(`ok ${id.padEnd(10)} rock ${(100 * rock / N).toFixed(0)}%  water ${(100 * water / N).toFixed(0)}%  ore tiles ${ore}  -> ${m.mapId}`);
}
console.log('MAPS OK');

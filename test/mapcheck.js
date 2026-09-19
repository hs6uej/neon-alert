require('../public/js/data.js'); require('../public/js/sim.js');
const GA = globalThis.GA; const W = GA.W, H = GA.H;
let bad = 0;
for (let seed = 1; seed <= 300; seed++) {
  const m = GA.genMap(seed);
  const seen = new Uint8Array(W * H); const st = [m.starts[0].y * W + m.starts[0].x]; seen[st[0]] = 1;
  while (st.length) { const c = st.pop(), x = c % W, y = (c / W) | 0; for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const nx = x+dx, ny = y+dy; if (nx<0||ny<0||nx>=W||ny>=H) continue; const i = ny*W+nx; if (seen[i]||m.terrain[i]!==0) continue; seen[i]=1; st.push(i);} }
  const startsOk = m.starts.every((s) => seen[s.y*W+s.x]);
  let unreachableOre = 0; for (let i = 0; i < W*H; i++) if (m.ore[i] > 0 && !seen[i]) unreachableOre++;
  if (!startsOk || unreachableOre) { bad++; console.log('seed', seed, 'startsOk', startsOk, 'unreachable ore', unreachableOre); }
}
console.log('bad maps', bad, '/300');

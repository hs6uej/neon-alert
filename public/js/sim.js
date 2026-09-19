// Authoritative game simulation (runs in Node for multiplayer and in the browser for offline skirmish)
(function () {
  'use strict';
  const GA = globalThis.GA;
  const { W, H, DT, DEFS, WEAPONS, MULT, TIDX, SETTINGS } = GA;
  const N = W * H;

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  GA.mulberry32 = mulberry32;

  function valueNoise(rnd, cell, size) {
    size = size || W;
    const gw = Math.ceil(size / cell) + 2, gh = Math.ceil(size / cell) + 2;
    const g = new Float32Array(gw * gh);
    for (let i = 0; i < g.length; i++) g[i] = rnd();
    return (x, y) => {
      const fx = x / cell, fy = y / cell;
      const ix = Math.floor(fx), iy = Math.floor(fy);
      let tx = fx - ix, ty = fy - iy;
      tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
      const a = g[iy * gw + ix], b = g[iy * gw + ix + 1], c = g[(iy + 1) * gw + ix], d = g[(iy + 1) * gw + ix + 1];
      return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
    };
  }

  // ---------------------------------------------------------------- map generation
  // Designed maps are 3-fold rotationally symmetric around the centre, so every base is equally placed.
  const CX = (W - 1) / 2, CY = (H - 1) / 2, SEC = (Math.PI * 2) / 3;
  const polarStarts = (r, a0) => [0, 1, 2].map((k) => ({ x: Math.round(CX + Math.cos(a0 + k * SEC) * r), y: Math.round(CY + Math.sin(a0 + k * SEC) * r) }));
  // rotate a point into the 120-degree sector centred on angle a0 (used to sample noise symmetrically)
  function foldXY(x, y, a0) {
    const dx = x - CX, dy = y - CY;
    const k = Math.round((Math.atan2(dy, dx) - a0) / SEC);
    const a = -k * SEC, c = Math.cos(a), sn = Math.sin(a);
    return [CX + dx * c - dy * sn + 55, CY + dx * sn + dy * c + 55];
  }
  const edgeRock = (x, y) => x < 1 || y < 1 || x >= W - 1 || y >= H - 1;
  const segDist = (px, py, ax, ay, bx, by) => {
    const vx = bx - ax, vy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy)));
    return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
  };
  const angDist = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return Math.abs(d); };

  const BUILDERS = {
    // Open field with rock spokes between the bases (each with a gate), a walled centre and lakes past the wall ends
    crossroads(terrain, rnd) {
      const a0 = -Math.PI / 2, starts = polarStarts(33, a0);
      const nz = valueNoise(rnd, 7, 210);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const dx = x - CX, dy = y - CY, r = Math.hypot(dx, dy);
        const [fx, fy] = foldXY(x, y, a0);
        let t = 0;
        if (nz(fx, fy) > 0.76 && r > 13) t = 1;
        const phi = Math.atan2(dy, dx);
        for (let k = 0; k < 3; k++) {
          const beta = a0 + k * SEC + SEC / 2, along = dx * Math.cos(beta) + dy * Math.sin(beta), perp = Math.abs(-dx * Math.sin(beta) + dy * Math.cos(beta));
          if (along > 10.5 && along < 31 && perp < 1.35 && !(along > 19 && along < 23)) t = 1;
          if (along > 32 && along < 42 && perp < 3.8 - (along - 32) * 0.15) t = 2;
        }
        if (r > 8.3 && r < 10) {
          let gap = false;
          for (let k = 0; k < 3; k++) if (angDist(phi, a0 + k * SEC) < 0.3) gap = true;
          if (!gap) t = 1;
        }
        if (r < 8.3) t = 0;
        if (edgeRock(x, y)) t = 1;
        terrain[y * W + x] = t;
      }
      starts.mid = [0, 1, 2].map((k) => { const beta = a0 + k * SEC + SEC / 2; return { x: CX + Math.cos(beta) * 26 - Math.sin(beta) * 5.5, y: CY + Math.sin(beta) * 26 + Math.cos(beta) * 5.5 }; });
      return starts;
    },
    // Three island bases joined by narrow land bridges around a central island; the rest is deep water
    isles(terrain, rnd) {
      const a0 = -Math.PI / 2, starts = polarStarts(32, a0);
      const nz = valueNoise(rnd, 6, 210);
      const mids = [0, 1, 2].map((k) => ({ x: (starts[k].x + starts[(k + 1) % 3].x) / 2, y: (starts[k].y + starts[(k + 1) % 3].y) / 2 }));
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const dx = x - CX, dy = y - CY, r = Math.hypot(dx, dy);
        const [fx, fy] = foldXY(x, y, a0);
        const n = nz(fx, fy);
        let land = r < 9.5 + (n - 0.5) * 3.5;
        for (let k = 0; k < 3; k++) {
          const s = starts[k], nx = starts[(k + 1) % 3];
          if (Math.hypot(x - s.x, y - s.y) < 12.8 + (n - 0.5) * 5) land = true;
          if (segDist(x, y, s.x, s.y, CX, CY) < 1.7) land = true;
          if (segDist(x, y, s.x, s.y, nx.x, nx.y) < 1.45) land = true;
          if (Math.hypot(x - mids[k].x, y - mids[k].y) < 4.2 + (n - 0.5) * 2) land = true;
        }
        let t = land ? 0 : 2;
        if (land && n > 0.8 && r > 11) t = 1;
        if (edgeRock(x, y)) t = 1;
        terrain[y * W + x] = t;
      }
      return starts;
    },
    // Winding cliff lines and canyons: contour ridges of a smooth noise field with random gaps, plus a few tarns
    highlands(terrain, rnd) {
      const a0 = -Math.PI / 3, starts = polarStarts(36, a0);
      const n1 = valueNoise(rnd, 17, 220), n2 = valueNoise(rnd, 8, 220), n3 = valueNoise(rnd, 9, 220);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const [fx, fy] = foldXY(x, y, a0);
        const v = n1(fx, fy) * 0.78 + n2(fx, fy) * 0.22, gap = n3(fx, fy);
        let t = 0;
        const ridge = Math.abs(v - 0.5) < 0.038 || Math.abs(v - 0.69) < 0.03 || Math.abs(v - 0.33) < 0.03;
        if (ridge && gap > 0.4) t = 1;
        if (v > 0.84) t = 1;
        if (v < 0.17) t = 2;
        if (edgeRock(x, y)) t = 1;
        terrain[y * W + x] = t;
      }
      return starts;
    },
  };
  GA.MAP_IDS = Object.keys(BUILDERS);
  GA.MAP_SEEDS = { crossroads: 11, isles: 23, highlands: 5 };

  function genMap(seed, mapId) {
    const custom = GA.CUSTOM_MAPS && GA.CUSTOM_MAPS[mapId] && GA.customMapData(GA.CUSTOM_MAPS[mapId]);
    if (custom) {
      const crnd = mulberry32(seed), starts = custom.starts;
      for (let i = starts.length - 1; i > 0; i--) {
        const j = Math.floor(crnd() * (i + 1));
        [starts[i], starts[j]] = [starts[j], starts[i]];
      }
      return { terrain: custom.terrain, ore: custom.ore, starts, mapId, neutrals: custom.neutrals };
    }
    if (mapId === 'any') mapId = GA.MAP_IDS[Math.abs(seed | 0) % GA.MAP_IDS.length];
    if (!BUILDERS[mapId]) mapId = 'random';
    const rnd = mulberry32(seed);
    const terrain = new Uint8Array(N);
    const ore = new Float32Array(N);
    let starts;
    if (BUILDERS[mapId]) {
      starts = BUILDERS[mapId](terrain, mulberry32(GA.MAP_SEEDS[mapId])); // designed maps have fixed terrain
      const midKeep = starts.mid;
      for (let i = starts.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [starts[i], starts[j]] = [starts[j], starts[i]];
      }
      if (midKeep) starts.mid = midKeep;
    } else {
      const n1 = valueNoise(rnd, 9), n2 = valueNoise(rnd, 5), n3 = valueNoise(rnd, 12);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const v = n1(x, y) * 0.65 + n2(x, y) * 0.35;
          const wv = n3(x, y);
          let t = 0;
          if (v > 0.665) t = 1;
          else if (wv > 0.7 && v < 0.55) t = 2;
          if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) t = 1;
          terrain[y * W + x] = t;
        }
      }
      const base = [[15, 15], [80, 19], [46, 80]];
      for (let i = base.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [base[i], base[j]] = [base[j], base[i]];
      }
      starts = base.map(([x, y]) => ({ x: x + Math.floor(rnd() * 5) - 2, y: y + Math.floor(rnd() * 5) - 2 }));
    }
    for (const s of starts) {
      for (let y = s.y - 11; y <= s.y + 11; y++) for (let x = s.x - 11; x <= s.x + 11; x++) {
        if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue;
        if (Math.hypot(x - s.x, y - s.y) <= 10.5) terrain[y * W + x] = 0;
      }
    }
    const flood = (sx, sy) => {
      const seen = new Uint8Array(N);
      const st = [sy * W + sx];
      seen[st[0]] = 1;
      while (st.length) {
        const c = st.pop(); const cx = c % W, cy = (c / W) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const ni = ny * W + nx;
          if (seen[ni] || terrain[ni] !== 0) continue;
          seen[ni] = 1; st.push(ni);
        }
      }
      return seen;
    };
    let reach = flood(starts[0].x, starts[0].y);
    for (let i = 1; i < starts.length; i++) {
      if (reach[starts[i].y * W + starts[i].x]) continue;
      // carve a corridor
      let x = starts[i].x, y = starts[i].y;
      const tx = starts[0].x, ty = starts[0].y;
      while (Math.abs(x - tx) + Math.abs(y - ty) > 1) {
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
          const cx = x + ox, cy = y + oy;
          if (cx > 0 && cy > 0 && cx < W - 1 && cy < H - 1) terrain[cy * W + cx] = 0;
        }
        if (Math.abs(x - tx) > Math.abs(y - ty)) x += Math.sign(tx - x); else y += Math.sign(ty - y);
      }
      reach = flood(starts[0].x, starts[0].y);
    }
    const centers = [];
    const patch = (cx, cy, r, amt) => {
      centers.push([Math.round(cx), Math.round(cy)]);
      for (let y = Math.floor(cy - r - 2); y <= cy + r + 2; y++) for (let x = Math.floor(cx - r - 2); x <= cx + r + 2; x++) {
        if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) continue;
        const i = y * W + x;
        const d = Math.hypot(x - cx, y - cy) + (rnd() - 0.5) * 1.6;
        if (d < r + 0.6) terrain[i] = 0; // carve out rocks / water under the field
        if (d < r && terrain[i] === 0) ore[i] = amt * (0.75 + rnd() * 0.5);
      }
    };
    const mid = { x: W / 2, y: H / 2 };
    for (const s of starts) {
      const a = Math.atan2(mid.y - s.y, mid.x - s.x);
      patch(s.x + Math.cos(a + 0.7) * 11, s.y + Math.sin(a + 0.7) * 11, 3.4, 700);
      patch(s.x + Math.cos(a - 0.9) * 13, s.y + Math.sin(a - 0.9) * 13, 3.0, 700);
    }
    patch(mid.x, mid.y, 6, 1100);
    const midKeep = starts.mid;
    for (let i = 0; i < starts.length; i++) {
      const a = starts[i], b = starts[(i + 1) % starts.length];
      const p = midKeep ? midKeep[i] : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      patch(p.x, p.y, 3.6, 800);
    }
    // make sure every ore field is reachable from the first base
    for (const [cx, cy] of centers) {
      reach = flood(starts[0].x, starts[0].y);
      if (reach[cy * W + cx]) continue;
      let x = cx, y = cy;
      const tx = starts[0].x, ty = starts[0].y;
      while (Math.abs(x - tx) + Math.abs(y - ty) > 1) {
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
          const px = x + ox, py = y + oy;
          if (px > 0 && py > 0 && px < W - 1 && py < H - 1) terrain[py * W + px] = 0;
        }
        if (Math.abs(x - tx) > Math.abs(y - ty)) x += Math.sign(tx - x); else y += Math.sign(ty - y);
        if (reach[y * W + x]) break;
      }
    }
    // neutral structures (derricks / depots) along the routes between the bases
    const neutrals = [];
    const reachable = flood(starts[0].x, starts[0].y);
    const spot = (ax, ay, w, h) => {
      for (let r = 0; r <= 10; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = Math.round(ax) + dx, y = Math.round(ay) + dy;
        let ok = true;
        for (let j = y - 1; j <= y + h && ok; j++) for (let i = x - 1; i <= x + w; i++) {
          if (i < 2 || j < 2 || i >= W - 2 || j >= H - 2 || terrain[j * W + i] !== 0 || ore[j * W + i] > 0) { ok = false; break; }
        }
        if (!ok || !reachable[(y - 1) * W + x]) continue;
        if (starts.some((s) => Math.hypot(s.x - x, s.y - y) < 14)) continue;
        if (neutrals.some((n) => Math.abs(n.x - x) < w + 3 && Math.abs(n.y - y) < h + 3)) continue;
        return [x, y];
      }
      return null;
    };
    for (let i = 0; i < starts.length; i++) {
      const a = starts[i], b = starts[(i + 1) % starts.length];
      const p = midKeep ? midKeep[i] : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      for (const [type, f] of [['derrick', 0.28], ['depot', 0.66]]) {
        const sp = spot(p.x + (mid.x - p.x) * f, p.y + (mid.y - p.y) * f, 2, 2);
        if (sp) neutrals.push({ type, x: sp[0], y: sp[1] });
      }
    }
    return { terrain, ore, starts, mapId, neutrals };
  }
  GA.genMap = genMap;

  // ---------------------------------------------------------------- tiny binary heap
  class Heap {
    constructor() { this.f = []; this.i = []; }
    get size() { return this.f.length; }
    clear() { this.f.length = 0; this.i.length = 0; }
    push(f, i) {
      const F = this.f, I = this.i;
      let k = F.length; F.push(f); I.push(i);
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (F[p] <= f) break;
        F[k] = F[p]; I[k] = I[p]; k = p;
      }
      F[k] = f; I[k] = i;
    }
    pop() {
      const F = this.f, I = this.i;
      const top = I[0];
      const lf = F.pop(), li = I.pop();
      const n = F.length;
      if (n > 0) {
        let k = 0;
        for (;;) {
          let c = 2 * k + 1;
          if (c >= n) break;
          if (c + 1 < n && F[c + 1] < F[c]) c++;
          if (F[c] >= lf) break;
          F[k] = F[c]; I[k] = I[c]; k = c;
        }
        F[k] = lf; I[k] = li;
      }
      return top;
    }
  }

  const circleCache = new Map();
  function circleRows(r) {
    let c = circleCache.get(r);
    if (!c) {
      c = [];
      for (let dy = -r; dy <= r; dy++) c.push(Math.floor(Math.sqrt(r * r - dy * dy + 0.5)));
      circleCache.set(r, c);
    }
    return c;
  }
  GA.circleRows = circleRows;

  function angDiff(a, b) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  // ---------------------------------------------------------------- Sim
  class Sim {
    constructor(cfg) {
      this.cfg = cfg;
      this.seed = cfg.seed != null ? cfg.seed : (Math.random() * 1e9) | 0;
      this.rnd = mulberry32(this.seed ^ 0x9e3779b9);
      const m = genMap(this.seed, cfg.map);
      this.mapId = m.mapId;
      if (cfg.players.length > m.starts.length) throw new Error(`Map ${m.mapId} holds ${m.starts.length} players`);
      this.terrain = m.terrain;
      this.rockMax = SETTINGS.rockHp;
      this.rockHp = new Float32Array(N);       // >0 = a destructible rock tile
      this.rockStage = new Uint8Array(N);      // 0 intact, 1 cracked, 2 crumbling
      this.rockEnts = new Map();               // tile -> pseudo target used by attack orders
      for (let i = 0; i < N; i++) if (this.terrain[i] === 1 && GA.rockBreakable(i % W, (i / W) | 0)) this.rockHp[i] = this.rockMax;
      this.ore = m.ore;
      this.starts = m.starts;
      this.occ = new Int32Array(N);
      this.ents = new Map();
      this.units = new Map();
      this.buildings = new Map();
      this.nextId = 1;
      this.time = 0;
      this.tick = 0;
      this.events = [];
      this.projs = [];
      this.strikes = [];
      this.oreDirty = new Set();
      this.over = null;
      this.cw = Math.ceil(W / 4);
      this.hash = new Array(this.cw * this.cw);
      for (let i = 0; i < this.hash.length; i++) this.hash[i] = [];
      // pathfinding scratch
      this.pf = { g: new Float32Array(N), from: new Int32Array(N), stamp: new Uint32Array(N), closed: new Uint32Array(N), gen: 0, heap: new Heap() };

      this.players = cfg.players.map((pc, i) => {
        const lv = pc.bot ? GA.BOT_LEVELS[pc.bot] || GA.BOT_LEVELS.normal : null;
        return {
          id: i, name: pc.name, color: pc.color != null ? pc.color : i, team: pc.team != null ? pc.team : i,
          botLevel: pc.bot || null, bot: null,
          credits: cfg.startCredits != null ? cfg.startCredits : SETTINGS.startCredits,
          q: { structure: [], infantry: [], vehicle: [] },
          counts: {}, pwrProd: 0, pwrUse: 0, low: false, alive: true,
          sw: { charge: 0, ready: false },
          lastAlert: -99, lastAttacked: null,
          stats: { kills: 0, lost: 0, built: 0 },
          speedMul: lv ? lv.speed : 1, incomeMul: lv ? lv.income : 1,
          hadLow: false,
        };
      });
      this.players.forEach((p, i) => {
        const s = this.starts[i];
        this.addBuilding('conyard', i, s.x - 1, s.y - 1, { instant: true });
        for (let k = 0; k < (DEFS.trooper.disabled ? 0 : 3); k++) {
          const a = k * 2.1 + 0.5;
          const sp = this.nearestPassable(Math.floor(s.x + Math.cos(a) * 3.5), Math.floor(s.y + 2.5 + Math.sin(a) * 2), 6) || [s.x, s.y + 3];
          this.addUnit('trooper', i, sp[0] + 0.5, sp[1] + 0.5);
        }
      });
      // the neutral "player" owns the unclaimed map structures; it is never alive, never plays and never counts as an enemy to auto-target
      this.neutralId = this.players.length;
      this.players.push({
        id: this.neutralId, name: 'Neutral', color: -1, team: -1, neutral: true, botLevel: null, bot: null, credits: 0,
        q: { structure: [], infantry: [], vehicle: [] }, counts: {}, pwrProd: 0, pwrUse: 0, income: 0, low: false, alive: false,
        sw: { charge: 0, ready: false }, lastAlert: -99, lastAttacked: null, stats: { kills: 0, lost: 0, built: 0 }, speedMul: 1, incomeMul: 1, hadLow: false,
      });
      for (const n of m.neutrals || []) if (DEFS[n.type] && !DEFS[n.type].disabled) this.addBuilding(n.type, this.neutralId, n.x, n.y, { instant: true });
      this.computeCounts();
      this.players.forEach((p) => { if (p.botLevel) p.bot = new GA.Bot(this, p, p.botLevel); });
    }

    // ------------------------------------------------------------ basic helpers
    emit(e) { this.events.push(e); }
    tellPlayer(pid, text, kind) { this.emit({ e: 'msg', to: pid, text, kind: kind || 'info' }); }
    hostile(a, b) { return this.players[a].team !== this.players[b].team; }
    passable(tx, ty) {
      if (tx < 0 || ty < 0 || tx >= W || ty >= H) return false;
      const i = ty * W + tx;
      return this.terrain[i] === 0 && this.occ[i] === 0;
    }
    nearestPassable(tx, ty, maxR) {
      if (this.passable(tx, ty)) return [tx, ty];
      for (let r = 1; r <= maxR; r++) {
        let best = null, bd = 1e9;
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (!this.passable(tx + dx, ty + dy)) continue;
          const d = dx * dx + dy * dy;
          if (d < bd) { bd = d; best = [tx + dx, ty + dy]; }
        }
        if (best) return best;
      }
      return null;
    }
    distEnt(a, b) {
      if (b.kind === 'b' || b.kind === 'r') {
        const dx = Math.max(b.bx - a.x, 0, a.x - (b.bx + b.w));
        const dy = Math.max(b.by - a.y, 0, a.y - (b.by + b.h));
        return Math.hypot(dx, dy);
      }
      return Math.max(0, Math.hypot(b.x - a.x, b.y - a.y) - b.def.r * 0.5);
    }

    // ------------------------------------------------------------ entity creation / removal
    addUnit(type, owner, x, y, opts) {
      const def = DEFS[type];
      const u = {
        id: this.nextId++, kind: 'u', type, def, owner, x, y,
        hp: def.hp, mhp: def.hp, ang: Math.PI / 4 + (opts && opts.ang ? opts.ang : 0),
        cd: 0.3, order: null, path: null, pi: 0, tgt: 0, repath: 0, scan: Math.random() * 0.3,
        cargo: 0, hs: 'seek', wait: 0, stuck: 0, lx: x, ly: y, born: this.time,
      };
      this.ents.set(u.id, u);
      this.units.set(u.id, u);
      if (opts && opts.spawnFx) this.emit({ e: 'spawn', id: u.id, x, y, owner, z: def.fly ? 1 : 0 });
      return u;
    }
    addBuilding(type, owner, bx, by, opts) {
      const def = DEFS[type];
      const b = {
        id: this.nextId++, kind: 'b', type, def, owner, bx, by, w: def.w, h: def.h,
        x: bx + def.w / 2, y: by + def.h / 2, hp: def.hp, mhp: def.hp, cd: 0.5, ang: Math.PI / 4,
        born: this.time, repair: false, rally: null, tgt: 0, scan: 0,
      };
      for (let y = by; y < by + def.h; y++) for (let x = bx; x < bx + def.w; x++) this.occ[y * W + x] = b.id;
      this.ents.set(b.id, b);
      this.buildings.set(b.id, b);
      this.evict(b);
      if (!(opts && opts.instant)) this.emit({ e: 'built', id: b.id, x: b.x, y: b.y, owner });
      return b;
    }
    evict(b) {
      for (const u of this.units.values()) {
        if (u.def.fly) continue;
        if (u.x > b.bx - 0.25 && u.x < b.bx + b.w + 0.25 && u.y > b.by - 0.25 && u.y < b.by + b.h + 0.25) {
          const n = this.nearestPassable(Math.floor(u.x), Math.floor(u.y), 8);
          if (n) { u.x = n[0] + 0.5; u.y = n[1] + 0.5; }
          u.path = null;
        }
      }
    }
    removeEnt(e) {
      e.dead = true;
      this.ents.delete(e.id);
      if (e.kind === 'u') this.units.delete(e.id);
      else {
        this.buildings.delete(e.id);
        for (let y = e.by; y < e.by + e.h; y++) for (let x = e.bx; x < e.bx + e.w; x++) if (this.occ[y * W + x] === e.id) this.occ[y * W + x] = 0;
      }
    }
    kill(e, killer) {
      if (e.dead) return;
      const big = e.kind === 'b';
      this.emit({ e: 'boom', x: e.x, y: e.y, s: big ? Math.max(e.w, e.h) * 0.9 + 0.6 : e.def.r > 0.4 ? 1.1 : 0.6, z: e.def.fly ? 1 : 0, inf: e.def.armor === 'inf' ? 1 : 0, b: big ? 1 : 0, w: big ? e.w : 0, h: big ? e.h : 0 });
      const owner = this.players[e.owner];
      owner.stats.lost++;
      if (killer != null && killer !== e.owner && this.players[killer] && !owner.neutral) this.players[killer].stats.kills++;
      this.removeEnt(e);
      if (big) {
        // chain damage to neighbours
        for (const o of this.ents.values()) {
          const d = this.distEnt({ x: e.x, y: e.y }, o);
          if (d < 1.4 && o.kind === 'u') this.damage(o, 40, 'shell', killer, null);
        }
      }
    }

    // ------------------------------------------------------------ spatial hash
    rebuildHash() {
      for (let i = 0; i < this.hash.length; i++) this.hash[i].length = 0;
      for (const u of this.units.values()) {
        const cx = Math.min(this.cw - 1, Math.max(0, (u.x / 4) | 0)), cy = Math.min(this.cw - 1, Math.max(0, (u.y / 4) | 0));
        this.hash[cy * this.cw + cx].push(u);
      }
    }
    eachUnitNear(x, y, r, fn) {
      const c0 = Math.max(0, ((x - r) / 4) | 0), c1 = Math.min(this.cw - 1, ((x + r) / 4) | 0);
      const r0 = Math.max(0, ((y - r) / 4) | 0), r1 = Math.min(this.cw - 1, ((y + r) / 4) | 0);
      for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
        const cell = this.hash[cy * this.cw + cx];
        for (let i = 0; i < cell.length; i++) fn(cell[i]);
      }
    }

    // ------------------------------------------------------------ pathfinding
    findPath(sx, sy, gx, gy, maxNodes) {
      if (sx === gx && sy === gy) return [];
      const pf = this.pf, g = pf.g, from = pf.from, stamp = pf.stamp, closed = pf.closed, heap = pf.heap;
      const gen = ++pf.gen;
      heap.clear();
      const start = sy * W + sx, goal = gy * W + gx;
      g[start] = 0; stamp[start] = gen; from[start] = -1;
      const hf = (x, y) => { const dx = Math.abs(x - gx), dy = Math.abs(y - gy); return (dx + dy) + (1.4142 - 2) * Math.min(dx, dy); };
      heap.push(hf(sx, sy), start);
      let best = start, bestH = hf(sx, sy), expanded = 0, found = false;
      const limit = maxNodes || 9000;
      while (heap.size) {
        const cur = heap.pop();
        if (closed[cur] === gen) continue;
        closed[cur] = gen;
        if (cur === goal) { found = true; best = cur; break; }
        if (++expanded > limit) break;
        const cx = cur % W, cy = (cur / W) | 0;
        const gc = g[cur];
        for (let d = 0; d < 8; d++) {
          const dx = DIRS[d][0], dy = DIRS[d][1];
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const ni = ny * W + nx;
          if (closed[ni] === gen) continue;
          if (this.terrain[ni] !== 0 || this.occ[ni] !== 0) continue;
          if (dx !== 0 && dy !== 0) {
            if (this.terrain[cy * W + nx] !== 0 || this.occ[cy * W + nx] !== 0) continue;
            if (this.terrain[ny * W + cx] !== 0 || this.occ[ny * W + cx] !== 0) continue;
          }
          const ng = gc + (dx !== 0 && dy !== 0 ? 1.4142 : 1);
          if (stamp[ni] !== gen || ng < g[ni]) {
            stamp[ni] = gen; g[ni] = ng; from[ni] = cur;
            const h = hf(nx, ny);
            if (h < bestH) { bestH = h; best = ni; }
            heap.push(ng + h * 1.001, ni);
          }
        }
      }
      if (!found && best === start) return null;
      const out = [];
      for (let c = best; c !== -1; c = from[c]) out.push(c);
      out.reverse();
      // string pulling
      const pts = out.map((c) => [(c % W) + 0.5, ((c / W) | 0) + 0.5]);
      const res = [];
      let anchor = 0;
      for (let i = 1; i < pts.length; i++) {
        if (i === pts.length - 1 || !this.los(pts[anchor], pts[i + 1])) {
          res.push(pts[i][0], pts[i][1]);
          anchor = i;
        }
      }
      return res;
    }
    los(a, b) {
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const len = Math.hypot(dx, dy);
      const steps = Math.ceil(len / 0.35);
      const px = -dy / len * 0.32, py = dx / len * 0.32;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps, x = a[0] + dx * t, y = a[1] + dy * t;
        if (!this.passable(Math.floor(x), Math.floor(y))) return false;
        if (!this.passable(Math.floor(x + px), Math.floor(y + py))) return false;
        if (!this.passable(Math.floor(x - px), Math.floor(y - py))) return false;
      }
      return true;
    }
    setPath(u, gx, gy) {
      if (u.def.fly) { u.path = [gx, gy]; u.pi = 0; u.pgx = gx; u.pgy = gy; return; }
      const sx = Math.floor(u.x), sy = Math.floor(u.y);
      let tx = Math.floor(gx), ty = Math.floor(gy);
      if (!this.passable(tx, ty)) {
        const n = this.nearestPassable(tx, ty, 8);
        if (!n) { u.path = null; return; }
        tx = n[0]; ty = n[1];
      }
      const p = this.findPath(sx, sy, tx, ty);
      u.pgx = gx; u.pgy = gy;
      if (!p || !p.length) { u.path = null; return; }
      u.path = p; u.pi = 0;
    }
    goalNear(u, t) {
      if (t.kind !== 'b' && t.kind !== 'r') return [t.x, t.y];
      let best = null, bd = 1e9;
      for (let y = t.by - 1; y <= t.by + t.h; y++) for (let x = t.bx - 1; x <= t.bx + t.w; x++) {
        if (x >= t.bx && x < t.bx + t.w && y >= t.by && y < t.by + t.h) continue;
        if (!this.passable(x, y)) continue;
        const d = (x + 0.5 - u.x) ** 2 + (y + 0.5 - u.y) ** 2;
        if (d < bd) { bd = d; best = [x + 0.5, y + 0.5]; }
      }
      return best || [t.x, t.y];
    }
    followPath(u, dt) {
      let step = u.def.speed * dt * (u.speedBoost || 1);
      const fly = u.def.fly;
      while (step > 0 && u.path && u.pi < u.path.length) {
        const wx = u.path[u.pi], wy = u.path[u.pi + 1];
        const dx = wx - u.x, dy = wy - u.y, d = Math.hypot(dx, dy);
        const want = Math.atan2(dy, dx);
        if (d > 0.001) u.ang += Math.max(-9 * dt, Math.min(9 * dt, angDiff(u.ang, want)));
        if (d <= step) {
          u.x = wx; u.y = wy; u.pi += 2; step -= d;
        } else {
          const nx = u.x + (dx / d) * step, ny = u.y + (dy / d) * step;
          if (!fly && !this.passable(Math.floor(nx), Math.floor(ny))) {
            u.path = null; u.blocked = true;
            return false;
          }
          u.x = nx; u.y = ny; step = 0;
        }
      }
      if (!u.path || u.pi >= u.path.length) { u.path = null; return false; }
      return true;
    }

    // ------------------------------------------------------------ combat
    canTarget(a, t, w, explicit) {
      if (!t || t.dead || t.hp <= 0) return false;
      if (this.players[t.owner].team === this.players[a.owner].team) return false;
      if (!explicit && this.players[t.owner].neutral) return false;
      if (t.def.fly) return w.targets !== 'ground';
      return w.targets !== 'air';
    }
    acquire(a, w, R) {
      let best = null, bs = 1e9;
      this.eachUnitNear(a.x, a.y, R + 1, (t) => {
        if (!this.canTarget(a, t, w)) return;
        const d = this.distEnt(a, t);
        if (d > R) return;
        const s = d - (t.def.wp ? 1.5 : 0);
        if (s < bs) { bs = s; best = t; }
      });
      for (const b of this.buildings.values()) {
        if (!this.canTarget(a, b, w)) continue;
        const d = this.distEnt(a, b);
        if (d > R) continue;
        const s = d + (b.def.wp ? -0.5 : 2.5);
        if (s < bs) { bs = s; best = b; }
      }
      return best;
    }
    fire(a, t, w) {
      const rof = a.kind === 'u' ? 1 : 1;
      a.cd = w.cd * rof;
      const dx = t.x - a.x, dy = t.y - a.y;
      const dist = Math.hypot(dx, dy);
      a.ang = Math.atan2(dy, dx);
      const flight = w.speed > 0 ? dist / w.speed : 0.06;
      this.projs.push({ at: this.time + flight, tid: t.id, tx: t.x, ty: t.y, dmg: w.dmg, wtype: w.wtype, splash: w.splash || 0, targets: w.targets, owner: a.owner, src: a.id });
      const hit = t.kind === 'b' ? { x: t.x + (Math.random() - 0.5) * t.w * 0.6, y: t.y + (Math.random() - 0.5) * t.h * 0.6 } : t;
      this.emit({ e: 'shot', k: w.proj, x1: a.x, y1: a.y, x2: hit.x, y2: hit.y, t: flight, a1: a.def.fly ? 1 : 0, a2: t.def.fly ? 1 : 0, ty: a.type, s: w.splash || 0, o: a.owner });
    }
    damage(t, amount, wtype, attackerOwner, attacker) {
      if (t.dead) return;
      const m = (MULT[wtype] || MULT.pulse)[t.def.armor] ?? 1;
      const amt = amount * m;
      if (amt <= 0) return;
      t.hp -= amt;
      t.hit = this.time;
      const p = this.players[t.owner];
      if (this.time - p.lastAlert > 7) {
        p.lastAlert = this.time;
        this.emit({ e: 'alert', to: t.owner, x: t.x, y: t.y, kind: t.kind === 'b' ? 'base' : 'unit' });
      }
      p.lastAttacked = { x: t.x, y: t.y, time: this.time };
      if (t.hp <= 0) { this.kill(t, attackerOwner); return; }
      if (t.kind === 'u' && t.def.wp && !t.order && attacker && !attacker.dead && this.canTarget(t, attacker, t.def.wp)) {
        t.order = { type: 'attack', target: attacker.id, auto: true, hx: t.x, hy: t.y };
      }
    }
    // ---- destructible rock walls
    rockTarget(i) {
      let r = this.rockEnts.get(i);
      if (!r) {
        const x = i % W, y = (i / W) | 0;
        r = { id: -(i + 1), kind: 'r', type: 'rock', owner: this.neutralId, x: x + 0.5, y: y + 0.5, bx: x, by: y, w: 1, h: 1, def: { r: 0.5, armor: 'bld' } };
        this.rockEnts.set(i, r);
      }
      r.hp = this.rockHp[i]; r.dead = r.hp <= 0;
      return r;
    }
    rockDamage(i, amount, wtype) {
      const hp0 = this.rockHp[i];
      if (!(hp0 > 0)) return;
      const amt = amount * ((MULT[wtype] || MULT.pulse).bld ?? 1);
      if (amt <= 0) return;
      const hp = hp0 - amt, x = i % W, y = (i / W) | 0;
      if (hp <= 0) {
        this.rockHp[i] = 0; this.rockStage[i] = 0; this.terrain[i] = 0;
        this.emit({ e: 'rock', i, s: 3 });
        this.emit({ e: 'boom', x: x + 0.5, y: y + 0.5, s: 0.9, z: 0, inf: 0, b: 0, w: 0, h: 0 });
        return;
      }
      this.rockHp[i] = hp;
      const st = hp < this.rockMax * 0.34 ? 2 : hp < this.rockMax * 0.67 ? 1 : 0;
      if (st !== this.rockStage[i]) { this.rockStage[i] = st; this.emit({ e: 'rock', i, s: st }); }
    }
    // blast at (x, y): rocks in range take damage with the usual falloff; `direct` is the tile that was aimed at (full effect)
    rockBlast(x, y, R, dmg, wtype, direct, glancing) {
      const r = Math.ceil(R);
      for (let ty = Math.floor(y) - r; ty <= Math.floor(y) + r; ty++) {
        if (ty < 0 || ty >= H) continue;
        for (let tx = Math.floor(x) - r; tx <= Math.floor(x) + r; tx++) {
          if (tx < 0 || tx >= W) continue;
          const i = ty * W + tx;
          if (!(this.rockHp[i] > 0)) continue;
          const d = Math.hypot(tx + 0.5 - x, ty + 0.5 - y);
          if (d > R + 0.5) continue;
          this.rockDamage(i, dmg * (1 - 0.55 * Math.min(1, d / R)) * (i === direct ? 1 : glancing), wtype);
        }
      }
    }
    foe(a, b) { return this.hostile(a, b) && !this.players[b].neutral; }

    updateProjectiles() {
      if (!this.projs.length) return;
      const keep = [];
      for (const p of this.projs) {
        if (p.at > this.time) { keep.push(p); continue; }
        const src = this.ents.get(p.src);
        const t = this.ents.get(p.tid);
        let x = p.tx, y = p.ty;
        if (t) { x = t.x; y = t.y; }
        if (p.splash > 0) {
          const R = p.splash;
          const hit = (o) => {
            if (o.dead) return;
            if (this.players[o.owner].team === this.players[p.owner].team) return;
            if (this.players[o.owner].neutral && o.id !== p.tid) return;
            if (o.def.fly && p.targets === 'ground') return;
            if (!o.def.fly && p.targets === 'air') return;
            const d = this.distEnt({ x, y }, o);
            if (d > R) return;
            this.damage(o, p.dmg * (1 - 0.55 * (d / R)), p.wtype, p.owner, src);
          };
          this.eachUnitNear(x, y, R + 1, hit);
          for (const b of Array.from(this.buildings.values())) hit(b);
          if (p.targets !== 'air') this.rockBlast(x, y, R, p.dmg, p.wtype, p.tid < 0 ? -p.tid - 1 : -1, SETTINGS.rockSplash);
        } else if (t) {
          this.damage(t, p.dmg, p.wtype, p.owner, src);
        } else if (p.tid < 0 && p.targets !== 'air') {
          this.rockDamage(-p.tid - 1, p.dmg, p.wtype);
        }
      }
      this.projs = keep;
    }

    // ------------------------------------------------------------ unit AI
    updateUnit(u, dt) {
      const d = u.def;
      u.cd = Math.max(0, u.cd - dt);
      if (d.harvester) return this.updHarvester(u, dt);
      const o = u.order;
      if (o && o.type === 'deploy') return this.doDeploy(u);
      if (o && o.type === 'capture') return this.updCapture(u, dt);
      const w = d.wp;
      let tgt = null;
      if (w) {
        if (o && o.type === 'attackRock') {
          tgt = this.rockTarget(o.i);
          if (tgt.dead || !this.canTarget(u, tgt, w, true)) { tgt = null; u.path = null; u.order = null; }
        } else if (o && o.type === 'attack') {
          tgt = this.ents.get(o.target);
          if (!tgt || !this.canTarget(u, tgt, w, !o.auto)) {
            tgt = null; u.path = null;
            if (o.auto) {
              const t2 = this.acquire(u, w, w.range + 1.5);
              if (t2) { o.target = t2.id; tgt = t2; }
              else if (o.hx != null && Math.hypot(o.hx - u.x, o.hy - u.y) > 3) u.order = { type: 'move', x: o.hx, y: o.hy };
              else u.order = null;
            } else u.order = null;
          } else if (o.auto && Math.hypot(o.hx - u.x, o.hy - u.y) > 12) {
            u.order = { type: 'move', x: o.hx, y: o.hy }; u.path = null; tgt = null;
          }
        } else if (!o || o.type === 'amove') {
          if (u.tgt) {
            const t = this.ents.get(u.tgt);
            if (!t || !this.canTarget(u, t, w) || this.distEnt(u, t) > w.range + (o ? 2.5 : 0.6)) u.tgt = 0; else tgt = t;
          }
          if (!tgt) {
            u.scan -= dt;
            if (u.scan <= 0) {
              u.scan = 0.25 + Math.random() * 0.2;
              const t = this.acquire(u, w, w.range + (o ? 1.5 : 0.3));
              if (t) { u.tgt = t.id; tgt = t; }
            }
          }
        }
      }
      if (tgt) {
        const dist = this.distEnt(u, tgt);
        if (dist <= w.range) {
          u.path = null;
          const want = Math.atan2(tgt.y - u.y, tgt.x - u.x);
          u.ang += Math.max(-10 * dt, Math.min(10 * dt, angDiff(u.ang, want)));
          if (u.cd <= 0 && Math.abs(angDiff(u.ang, want)) < 0.5) this.fire(u, tgt, w);
          return;
        }
        if (o) {
          u.repath -= dt;
          if (!u.path || (u.repath <= 0 && Math.hypot(u.pgx - tgt.x, u.pgy - tgt.y) > 1.5)) {
            u.repath = 0.7;
            const g = this.goalNear(u, tgt);
            this.setPath(u, g[0], g[1]);
            if (!u.path && !d.fly) { u.order = null; return; }
          }
          this.followPath(u, dt);
          return;
        }
      }
      if (o && (o.type === 'move' || o.type === 'amove')) {
        if (!u.path) {
          if (Math.hypot(o.x - u.x, o.y - u.y) < 0.8 || (o.retry || 0) > 2) { u.order = null; return; }
          this.setPath(u, o.x, o.y);
          o.retry = (o.retry || 0) + 1;
          if (!u.path) { u.order = null; return; }
        }
        if (!this.followPath(u, dt) && u.blocked) { u.blocked = false; }
      }
    }
    updHarvester(u, dt) {
      const d = u.def, o = u.order, p = this.players[u.owner];
      if (o && o.type === 'move') {
        if (!u.path) {
          if (Math.hypot(o.x - u.x, o.y - u.y) < 0.8 || (o.retry || 0) > 2) { u.order = null; return; }
          this.setPath(u, o.x, o.y); o.retry = (o.retry || 0) + 1;
          if (!u.path) { u.order = null; return; }
        }
        this.followPath(u, dt);
        return;
      }
      if (u.wait > 0) { u.wait -= dt; return; }
      switch (u.hs) {
        case 'seek': {
          if (u.cargo >= d.capacity - 0.5) { u.hs = 'ret'; break; }
          const tile = this.findOre(u);
          if (tile < 0) { if (u.cargo > 1) u.hs = 'ret'; else u.wait = 1.5; break; }
          u.oreTile = tile;
          this.setPath(u, (tile % W) + 0.5, ((tile / W) | 0) + 0.5);
          if (!u.path) {
            if (Math.floor(u.x) === tile % W && Math.floor(u.y) === ((tile / W) | 0)) u.hs = 'harv';
            else { (this.badOre || (this.badOre = new Set())).add(tile); u.wait = 0.3; }
            break;
          }
          u.hs = 'go';
          break;
        }
        case 'go': {
          if (this.ore[u.oreTile] <= 0 && u.path) { u.hs = 'seek'; u.path = null; break; }
          if (!u.path) {
            const ti = Math.floor(u.y) * W + Math.floor(u.x);
            if (this.ore[ti] > 0) u.hs = 'harv'; else { u.hs = 'seek'; u.wait = 0.4; }
            break;
          }
          this.followPath(u, dt);
          break;
        }
        case 'harv': {
          const ti = Math.floor(u.y) * W + Math.floor(u.x);
          const have = this.ore[ti];
          if (have <= 0) { u.hs = u.cargo > 0 && u.cargo >= d.capacity * 0.6 ? 'ret' : 'seek'; break; }
          const amt = Math.min(SETTINGS.harvestRate * dt, have, d.capacity - u.cargo);
          const before = Math.floor(have / 25);
          this.ore[ti] = have - amt;
          if (this.ore[ti] < 1) this.ore[ti] = 0;
          if (Math.floor(this.ore[ti] / 25) !== before) this.oreDirty.add(ti);
          u.cargo += amt;
          if (u.cargo >= d.capacity - 0.5) u.hs = 'ret';
          break;
        }
        case 'ret': {
          let ref = null, bd = 1e9;
          for (const b of this.buildings.values()) {
            if (b.owner !== u.owner || GA.roleOf(b.def) !== 'refinery') continue;
            const dd = (b.x - u.x) ** 2 + (b.y - u.y) ** 2;
            if (dd < bd) { bd = dd; ref = b; }
          }
          if (!ref) { u.wait = 2; u.path = null; break; }
          if (this.distEnt(u, ref) <= 1.5) { u.hs = 'unload'; u.path = null; break; }
          u.repath -= dt;
          if (!u.path && u.repath <= 0) {
            const g = this.goalNear(u, ref);
            this.setPath(u, g[0], g[1]);
            u.repath = 1;
            if (!u.path) { u.wait = 0.6; break; }
          }
          if (u.path) this.followPath(u, dt);
          break;
        }
        case 'unload': {
          const amt = Math.min(u.cargo, SETTINGS.unloadRate * dt);
          u.cargo -= amt;
          p.credits += amt * p.incomeMul;
          if (u.cargo <= 0.01) { u.cargo = 0; u.hs = 'seek'; u.path = null; }
          break;
        }
        default: u.hs = 'seek';
      }
    }
    findOre(u) {
      const claims = new Map();
      for (const h of this.units.values()) if (h.def.harvester && h !== u && h.oreTile != null && (h.hs === 'go' || h.hs === 'harv')) claims.set(h.oreTile, (claims.get(h.oreTile) || 0) + 1);
      let best = -1, bs = 1e9;
      for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
          const i = y * W + x;
          if (this.ore[i] <= 0) continue;
          if (this.occ[i] || (this.badOre && this.badOre.has(i))) continue;
          const dd = Math.hypot(x + 0.5 - u.x, y + 0.5 - u.y);
          if (dd > bs) continue;
          const s = dd + (claims.get(i) || 0) * 3 + Math.random() * 1.5;
          if (s < bs) { bs = s; best = i; }
        }
      }
      return best;
    }
    updCapture(u, dt) {
      const o = u.order;
      const t = this.ents.get(o.target);
      if (!t || t.kind !== 'b' || !this.hostile(u.owner, t.owner)) { u.order = null; return; }
      if (this.distEnt(u, t) <= 1.05) {
        const old = t.owner;
        t.owner = u.owner; t.repair = false; t.rally = null;
        this.emit({ e: 'capture', x: t.x, y: t.y, id: t.id, owner: u.owner });
        this.tellPlayer(u.owner, `${t.def.name} captured!`, 'good');
        this.tellPlayer(old, `${t.def.name} was captured!`, 'bad');
        if (!this.players[old].neutral) this.players[u.owner].stats.kills++;
        if (t.def.bounty && !t.looted) {
          t.looted = true;
          this.players[u.owner].credits += t.def.bounty;
          this.tellPlayer(u.owner, `Bonus: +${t.def.bounty} credits`, 'good');
        }
        this.removeEnt(u);
        return;
      }
      u.repath -= dt;
      if (!u.path || u.repath <= 0) {
        u.repath = 1.2;
        const g = this.goalNear(u, t);
        this.setPath(u, g[0], g[1]);
        if (!u.path && !u.def.fly && this.distEnt(u, t) > 1.5) { u.order = null; return; }
      }
      this.followPath(u, dt);
    }
    doDeploy(u) {
      const bx = Math.round(u.x - 1.5), by = Math.round(u.y - 1.5);
      if (this.canPlace(u.owner, 'conyard', bx, by, true)) {
        this.removeEnt(u);
        this.addBuilding('conyard', u.owner, bx, by);
        this.tellPlayer(u.owner, 'Nexus Core deployed.', 'good');
      } else {
        this.tellPlayer(u.owner, 'Cannot deploy here.', 'bad');
        u.order = null;
      }
    }
    separate() {
      for (const u of this.units.values()) {
        const fly = u.def.fly;
        this.eachUnitNear(u.x, u.y, 1.2, (v) => {
          if (v.id <= u.id || v.def.fly !== fly) return;
          const dx = v.x - u.x, dy = v.y - u.y;
          const min = (u.def.r + v.def.r) * 0.95;
          const d2 = dx * dx + dy * dy;
          if (d2 >= min * min) return;
          let d = Math.sqrt(d2);
          let nx, ny;
          if (d < 0.001) { const a = ((u.id * 37) % 628) / 100; nx = Math.cos(a); ny = Math.sin(a); d = 0; } else { nx = dx / d; ny = dy / d; }
          const push = (min - d) * 0.5;
          const um = u.path ? 0.3 : 1, vm = v.path ? 0.3 : 1;
          const tot = um + vm;
          this.nudge(u, -nx * push * 2 * (um / tot), -ny * push * 2 * (um / tot));
          this.nudge(v, nx * push * 2 * (vm / tot), ny * push * 2 * (vm / tot));
        });
      }
    }
    nudge(u, dx, dy) {
      const nx = u.x + dx, ny = u.y + dy;
      if (u.def.fly || this.passable(Math.floor(nx), Math.floor(ny))) { u.x = nx; u.y = ny; }
      else if (this.passable(Math.floor(nx), Math.floor(u.y))) u.x = nx;
      else if (this.passable(Math.floor(u.x), Math.floor(ny))) u.y = ny;
    }

    // ------------------------------------------------------------ buildings
    updateBuilding(b, dt) {
      const p = this.players[b.owner];
      if (b.repair) {
        if (b.hp >= b.mhp) b.repair = false;
        else if (p.credits > 0) {
          const heal = b.mhp * SETTINGS.repairRate * dt;
          const cost = b.def.cost * 0.5 * (heal / b.mhp);
          p.credits -= cost;
          b.hp = Math.min(b.mhp, b.hp + heal);
        }
      }
      const w = b.def.wp;
      if (!w || p.low) return;
      b.cd = Math.max(0, b.cd - dt);
      let tgt = null;
      if (b.tgt) {
        const t = this.ents.get(b.tgt);
        if (!t || !this.canTarget(b, t, w) || this.distEnt(b, t) > w.range) b.tgt = 0; else tgt = t;
      }
      if (!tgt) {
        b.scan -= dt;
        if (b.scan <= 0) { b.scan = 0.3; const t = this.acquire(b, w, w.range); if (t) { b.tgt = t.id; tgt = t; } }
      }
      if (tgt) {
        const want = Math.atan2(tgt.y - b.y, tgt.x - b.x);
        b.ang += Math.max(-8 * dt, Math.min(8 * dt, angDiff(b.ang, want)));
        if (b.cd <= 0 && Math.abs(angDiff(b.ang, want)) < 0.4) this.fire(b, tgt, w);
      }
    }

    // ------------------------------------------------------------ economy / production
    computeCounts() {
      for (const p of this.players) { p.counts = {}; p.pwrProd = 0; p.pwrUse = 0; p.blds = 0; p.income = 0; }
      for (const b of this.buildings.values()) {
        const p = this.players[b.owner];
        p.counts[b.type] = (p.counts[b.type] || 0) + 1;
        if (b.def.role && b.def.role !== b.type) p.counts[b.def.role] = (p.counts[b.def.role] || 0) + 1;
        if (!b.def.neutral) p.blds++;
        if (b.def.income) p.income += b.def.income;
        const pw = b.def.power;
        if (pw > 0) p.pwrProd += pw; else p.pwrUse -= pw;
      }
      for (const p of this.players) {
        const low = p.pwrUse > p.pwrProd;
        if (low && !p.hadLow) this.emit({ e: 'lowpower', to: p.id });
        p.hadLow = low; p.low = low;
      }
    }
    hasTech(pid, def) {
      const c = this.players[pid].counts;
      for (const r of def.req) if (!c[r]) return false;
      return true;
    }
    canQueue(pid, type) {
      const def = DEFS[type];
      const p = this.players[pid];
      if (!def || !p || !p.alive || def.buildable === false || def.disabled) return false;
      if (!this.hasTech(pid, def)) return false;
      if (def.cat === 'infantry' && !p.counts.barracks) return false;
      if (def.cat === 'vehicle' && !p.counts.factory) return false;
      if (def.cat === 'structure' && !p.counts.conyard) return false;
      return true;
    }
    updatePlayer(p, dt) {
      if (!p.alive) return;
      if (p.income) p.credits += p.income * dt;
      const pf = p.low ? Math.max(SETTINGS.lowPowerMin, p.pwrProd / Math.max(1, p.pwrUse)) : 1;
      for (const cat of GA.CATS) {
        const q = p.q[cat];
        const it = q[0];
        if (!it || it.ready) continue;
        const def = DEFS[it.type];
        if (!this.canQueue(p.id, it.type)) { it.hold = true; continue; }
        it.hold = false;
        let mult = pf * p.speedMul;
        if (cat === 'infantry') mult *= 1 + SETTINGS.multiProdBonus * Math.min(3, (p.counts.barracks || 1) - 1);
        if (cat === 'vehicle') mult *= 1 + SETTINGS.multiProdBonus * Math.min(3, (p.counts.factory || 1) - 1);
        const rate = (dt / def.time) * mult;
        const pay = def.cost * rate;
        if (p.credits < pay) { it.wait = true; continue; }
        it.wait = false;
        p.credits -= pay; it.paid += pay; it.prog += rate;
        if (it.prog >= 1) {
          if (cat === 'structure') {
            it.ready = true; it.prog = 1;
            this.emit({ e: 'ready', to: p.id, cat, type: it.type });
          } else {
            if (this.produceUnit(p, it.type)) {
              q.shift();
              this.emit({ e: 'ready', to: p.id, cat, type: it.type });
              p.stats.built++;
            } else it.prog = 1;
          }
        }
      }
      // superweapon
      const has = p.counts.uplink > 0;
      if (has && !p.low && !p.sw.ready) {
        p.sw.charge += dt / SETTINGS.swCharge;
        if (p.sw.charge >= 1) { p.sw.charge = 1; p.sw.ready = true; this.emit({ e: 'swready', to: p.id }); }
      }
      if (!has) { p.sw.charge = 0; p.sw.ready = false; }
    }
    produceUnit(p, type) {
      const def = DEFS[type];
      const need = def.cat === 'infantry' ? 'barracks' : 'factory';
      const prods = [];
      for (const b of this.buildings.values()) if (b.owner === p.id && GA.roleOf(b.def) === need) prods.push(b);
      if (!prods.length) return false;
      const b = prods[(p.rr = ((p.rr || 0) + 1)) % prods.length];
      const sp = this.exitPoint(b, def.fly);
      const u = this.addUnit(type, p.id, sp[0], sp[1], { spawnFx: true });
      if (b.rally && !def.harvester) u.order = { type: 'move', x: b.rally.x, y: b.rally.y };
      return true;
    }
    exitPoint(b, fly) {
      const fx = b.x, fy = b.by + b.h + 0.6;
      let best = null, bd = 1e9;
      for (let y = b.by - 1; y <= b.by + b.h; y++) for (let x = b.bx - 1; x <= b.bx + b.w; x++) {
        if (x >= b.bx && x < b.bx + b.w && y >= b.by && y < b.by + b.h) continue;
        if (!this.passable(x, y)) continue;
        let crowd = 0;
        this.eachUnitNear(x + 0.5, y + 0.5, 1, (u) => { if (Math.hypot(u.x - x - 0.5, u.y - y - 0.5) < 0.6) crowd++; });
        const d = (x + 0.5 - fx) ** 2 + (y + 0.5 - fy) ** 2 + crowd * 6;
        if (d < bd) { bd = d; best = [x + 0.5, y + 0.5]; }
      }
      return best || [b.x, b.by + b.h + 0.5];
    }
    canPlace(pid, type, x, y, deploy) {
      const d = DEFS[type];
      if (!d) return false;
      if (x < 1 || y < 1 || x + d.w > W - 1 || y + d.h > H - 1) return false;
      for (let j = y; j < y + d.h; j++) for (let i = x; i < x + d.w; i++) {
        const idx = j * W + i;
        if (this.terrain[idx] !== 0 || this.occ[idx] !== 0) return false;
        if (!deploy && this.ore[idx] > 0) return false;
      }
      if (deploy) return true;
      for (const b of this.buildings.values()) {
        if (b.owner !== pid || b.def.wp) continue;
        const gx = Math.max(b.bx - (x + d.w), x - (b.bx + b.w), 0);
        const gy = Math.max(b.by - (y + d.h), y - (b.by + b.h), 0);
        if (Math.max(gx, gy) <= SETTINGS.buildRadius) return true;
      }
      return false;
    }

    // ------------------------------------------------------------ commands
    cmd(pid, c) {
      const p = this.players[pid];
      if (!p || !p.alive || this.over || !c) return;
      const ownUnits = (ids) => {
        const out = [];
        if (!Array.isArray(ids)) return out;
        for (let i = 0; i < ids.length && i < 250; i++) {
          const u = this.units.get(ids[i]);
          if (u && u.owner === pid) out.push(u);
        }
        return out;
      };
      switch (c.type) {
        case 'move': case 'amove': {
          const us = ownUnits(c.ids);
          if (!us.length || typeof c.x !== 'number') return;
          const x = Math.max(1, Math.min(W - 1, c.x)), y = Math.max(1, Math.min(H - 1, c.y));
          this.groupMove(us, x, y, c.type);
          break;
        }
        case 'attack': {
          const t = this.ents.get(c.target);
          if (!t || !this.hostile(pid, t.owner)) return;
          for (const u of ownUnits(c.ids)) {
            if (u.def.wp && this.canTarget(u, t, u.def.wp, true)) { u.order = { type: 'attack', target: t.id }; u.path = null; u.repath = 0; }
            else if (!u.def.wp && !u.def.capture) this.groupMove([u], t.x, t.y, 'move');
          }
          break;
        }
        case 'attackRock': {
          const tx = Math.floor(c.x), ty = Math.floor(c.y);
          if (!(tx >= 0 && ty >= 0 && tx < W && ty < H) || !(this.rockHp[ty * W + tx] > 0)) return;
          for (const u of ownUnits(c.ids)) if (u.def.wp && u.def.wp.targets !== 'air') { u.order = { type: 'attackRock', i: ty * W + tx }; u.path = null; u.repath = 0; u.tgt = 0; }
          break;
        }
        case 'capture': {
          const t = this.ents.get(c.target);
          if (!t || t.kind !== 'b' || !this.hostile(pid, t.owner)) return;
          for (const u of ownUnits(c.ids)) if (u.def.capture) { u.order = { type: 'capture', target: t.id }; u.path = null; u.repath = 0; }
          break;
        }
        case 'stop': for (const u of ownUnits(c.ids)) { u.order = null; u.path = null; u.tgt = 0; u.hs = u.def.harvester ? 'seek' : u.hs; } break;
        case 'deploy': for (const u of ownUnits(c.ids)) if (u.def.mcv) { u.order = { type: 'deploy' }; u.path = null; } break;
        case 'harvest': {
          for (const u of ownUnits(c.ids)) if (u.def.harvester) {
            u.order = null; u.hs = 'go';
            const i = Math.floor(c.y) * W + Math.floor(c.x);
            if (this.ore[i] > 0) { u.oreTile = i; this.setPath(u, Math.floor(c.x) + 0.5, Math.floor(c.y) + 0.5); } else u.hs = 'seek';
          }
          break;
        }
        case 'rally': {
          const b = this.buildings.get(c.id);
          if (b && b.owner === pid && (GA.roleOf(b.def) === 'barracks' || GA.roleOf(b.def) === 'factory')) {
            b.rally = c.clear ? null : { x: Math.max(1, Math.min(W - 1, c.x)), y: Math.max(1, Math.min(H - 1, c.y)) };
          }
          break;
        }
        case 'queue': {
          const type = c.item, def = DEFS[type];
          if (!def || !this.canQueue(pid, type)) return;
          const q = p.q[def.cat];
          const n = Math.max(1, Math.min(5, c.n | 0 || 1));
          for (let k = 0; k < n; k++) {
            if (q.length >= 9) break;
            if (def.cat === 'structure' && q.length >= 3) break;
            q.push({ type, paid: 0, prog: 0, ready: false });
          }
          break;
        }
        case 'cancel': {
          const q = p.q[c.cat];
          if (!q) return;
          const i = c.index | 0;
          if (i < 0 || i >= q.length) return;
          p.credits += q[i].paid;
          q.splice(i, 1);
          break;
        }
        case 'place': {
          const q = p.q.structure;
          const it = q[0];
          if (!it || !it.ready || it.type !== c.item) return;
          const x = c.x | 0, y = c.y | 0;
          if (!this.canPlace(pid, it.type, x, y)) { this.tellPlayer(pid, 'Cannot build here.', 'bad'); return; }
          q.shift();
          const b = this.addBuilding(it.type, pid, x, y);
          p.stats.built++;
          if (GA.roleOf(DEFS[it.type]) === 'refinery') {
            const sp = this.exitPoint(b);
            this.addUnit('harvester', pid, sp[0], sp[1], { spawnFx: true });
          }
          this.computeCounts();
          break;
        }
        case 'sell': {
          const b = this.buildings.get(c.id);
          if (!b || b.owner !== pid) return;
          p.credits += b.def.cost * SETTINGS.sellRefund * Math.min(1, b.hp / b.mhp + 0.4);
          this.emit({ e: 'sell', x: b.x, y: b.y, w: b.w, h: b.h, id: b.id });
          this.removeEnt(b);
          this.computeCounts();
          break;
        }
        case 'repair': {
          const b = this.buildings.get(c.id);
          if (b && b.owner === pid && b.hp < b.mhp) b.repair = !b.repair;
          break;
        }
        case 'sw': {
          if (!p.sw.ready || typeof c.x !== 'number') return;
          p.sw.ready = false; p.sw.charge = 0;
          const x = Math.max(1, Math.min(W - 1, c.x)), y = Math.max(1, Math.min(H - 1, c.y));
          this.strikes.push({ at: this.time + SETTINGS.lanceDelay, x, y, owner: pid });
          this.emit({ e: 'lance', x, y, t: SETTINGS.lanceDelay, owner: pid, r: SETTINGS.lanceRadius });
          for (const q of this.players) this.tellPlayer(q.id, q.id === pid ? 'Orbital Lance launched!' : `${p.name} launched an Orbital Lance!`, q.id === pid ? 'good' : 'bad');
          break;
        }
        case 'surrender': this.eliminate(p); break;
      }
    }
    groupMove(us, x, y, mode) {
      const fly = us.filter((u) => u.def.fly), ground = us.filter((u) => !u.def.fly);
      const set = (u, gx, gy) => {
        u.order = { type: mode, x: gx, y: gy };
        u.tgt = 0; u.path = null; u.repath = 0;
        if (u.def.harvester) u.hs = 'seek';
        this.setPath(u, gx, gy);
        if (!u.path && !u.def.fly) { u.order = null; }
      };
      if (ground.length === 1) set(ground[0], x, y);
      else if (ground.length > 1) {
        const tx = Math.floor(x), ty = Math.floor(y);
        const tiles = [];
        for (let R = 1; R <= 14; R++) {
          tiles.length = 0;
          for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) if (this.passable(tx + dx, ty + dy)) tiles.push([tx + dx + 0.5, ty + dy + 0.5, dx * dx + dy * dy]);
          if (tiles.length >= ground.length) break;
        }
        tiles.sort((a, b) => a[2] - b[2]);
        ground.sort((a, b) => (a.x - x) ** 2 + (a.y - y) ** 2 - ((b.x - x) ** 2 + (b.y - y) ** 2));
        ground.forEach((u, i) => { const t = tiles[i] || tiles[tiles.length - 1] || [x, y]; set(u, t[0], t[1]); });
      }
      fly.forEach((u, i) => {
        const a = (i / Math.max(1, fly.length)) * Math.PI * 2, r = fly.length > 1 ? 0.8 + Math.floor(i / 6) * 0.8 : 0;
        set(u, x + Math.cos(a) * r, y + Math.sin(a) * r);
      });
    }

    // ------------------------------------------------------------ elimination / win
    eliminate(p) {
      if (!p.alive) return;
      p.alive = false;
      p.elimAt = this.time;
      for (const e of Array.from(this.ents.values())) if (e.owner === p.id) {
        this.emit({ e: 'boom', x: e.x, y: e.y, s: e.kind === 'b' ? Math.max(e.w, e.h) * 0.8 + 0.5 : 0.7, z: e.def.fly ? 1 : 0, inf: 0, b: e.kind === 'b' ? 1 : 0, w: e.w || 0, h: e.h || 0 });
        this.removeEnt(e);
      }
      p.q = { structure: [], infantry: [], vehicle: [] };
      for (const q of this.players) this.tellPlayer(q.id, `${p.name} has been defeated!`, 'info');
      this.emit({ e: 'defeat', pid: p.id });
      this.computeCounts();
    }
    checkEnd() {
      for (const p of this.players) {
        if (!p.alive) continue;
        let any = p.blds > 0;
        if (!any) for (const u of this.units.values()) if (u.owner === p.id && u.def.mcv) { any = true; break; }
        if (!any) this.eliminate(p);
      }
      const teams = new Set();
      for (const p of this.players) if (p.alive) teams.add(p.team);
      if (teams.size <= 1 && !this.over) {
        this.over = { winnerTeam: teams.size ? [...teams][0] : -1, time: this.time };
        this.emit({ e: 'over', winnerTeam: this.over.winnerTeam });
      }
    }

    // ------------------------------------------------------------ main step
    step() {
      if (this.over && this.over.frozen) return;
      const dt = DT;
      this.time += dt;
      this.tick++;
      this.rebuildHash();
      this.computeCounts();
      for (const p of this.players) { if (p.bot && p.alive) p.bot.update(dt); this.updatePlayer(p, dt); }
      for (const b of Array.from(this.buildings.values())) if (!b.dead) this.updateBuilding(b, dt);
      for (const u of Array.from(this.units.values())) if (!u.dead) this.updateUnit(u, dt);
      this.updateProjectiles();
      if (this.strikes.length) {
        const keep = [];
        for (const s of this.strikes) {
          if (s.at > this.time) { keep.push(s); continue; }
          const R = SETTINGS.lanceRadius;
          this.emit({ e: 'boom', x: s.x, y: s.y, s: 3.5, z: 0, inf: 0, b: 0, w: 0, h: 0, big: 1 });
          for (const o of Array.from(this.ents.values())) {
            if (o.dead) continue;
            const d = this.distEnt({ x: s.x, y: s.y }, o);
            if (d > R) continue;
            this.damage(o, SETTINGS.lanceDamage * (1 - 0.6 * (d / R)), 'shell', s.owner, null);
          }
          this.rockBlast(s.x, s.y, R, SETTINGS.lanceDamage, 'shell', -1, 1);
        }
        this.strikes = keep;
      }
      this.separate();
      if (this.tick % 10 === 0) this.checkEnd();
    }

    // ------------------------------------------------------------ snapshots
    visionFor(team) {
      const vis = new Uint8Array(N);
      const mark = (x, y, r) => {
        const ir = Math.ceil(r), rows = circleRows(ir);
        const cx = Math.floor(x), cy = Math.floor(y);
        for (let dy = -ir; dy <= ir; dy++) {
          const yy = cy + dy;
          if (yy < 0 || yy >= H) continue;
          const ext = rows[dy + ir];
          const x0 = Math.max(0, cx - ext), x1 = Math.min(W - 1, cx + ext);
          for (let xx = x0; xx <= x1; xx++) vis[yy * W + xx] = 1;
        }
      };
      for (const e of this.ents.values()) {
        if (this.players[e.owner].team !== team) continue;
        mark(e.x, e.y, e.def.vision + (e.kind === 'b' ? 1 : 0));
      }
      return vis;
    }
    // Build per-player snapshots. `humans` = array of player ids to build for.
    flush(humans) {
      const out = {};
      const visCache = new Map();
      const all = new Uint8Array(N).fill(1);
      const ore = [];
      for (const i of this.oreDirty) ore.push(i, Math.round(this.ore[i]));
      this.oreDirty.clear();
      for (const pid of humans) {
        const p = this.players[pid];
        let vis;
        if (!p.alive || this.over) vis = all;
        else {
          if (!visCache.has(p.team)) visCache.set(p.team, this.visionFor(p.team));
          vis = visCache.get(p.team);
        }
        const ents = [];
        for (const e of this.ents.values()) {
          const mine = this.players[e.owner].team === p.team;
          const ti = Math.max(0, Math.min(N - 1, Math.floor(e.y) * W + Math.floor(e.x)));
          if (!mine && !vis[ti] && !(e.kind === 'b' && this.tileSeen(vis, e))) continue;
          if (e.kind === 'u') ents.push([e.id, TIDX[e.type], e.owner, Math.round(e.x * 16), Math.round(e.y * 16), Math.round(e.hp), Math.round(e.ang * 50), e.def.harvester ? Math.round(e.cargo) : 0]);
          else ents.push([e.id, TIDX[e.type], e.owner, Math.round(e.x * 16), Math.round(e.y * 16), Math.round(e.hp), Math.round(e.ang * 50), [Math.round(e.born * 10), e.repair ? 1 : 0, mine && e.rally ? Math.round(e.rally.x * 10) : -1, mine && e.rally ? Math.round(e.rally.y * 10) : -1]]);
        }
        const evs = [];
        const vt = (x, y) => vis[Math.max(0, Math.min(N - 1, Math.floor(y) * W + Math.floor(x)))];
        for (const ev of this.events) {
          if (ev.to !== undefined) { if (ev.to === pid) evs.push(ev); continue; }
          if (ev.e === 'shot') { if (vt(ev.x1, ev.y1) || vt(ev.x2, ev.y2)) evs.push(ev); continue; }
          if (ev.x !== undefined) { if (vt(ev.x, ev.y)) evs.push(ev); continue; }
          evs.push(ev);
        }
        const q = {};
        for (const cat of GA.CATS) q[cat] = p.q[cat].map((it) => [TIDX[it.type], +it.prog.toFixed(3), it.ready ? 1 : 0, it.hold ? 1 : it.wait ? 2 : 0]);
        out[pid] = {
          k: 'snap', time: +this.time.toFixed(2), tick: this.tick,
          ents, ore, ev: evs,
          me: { credits: Math.floor(p.credits), pw: [p.pwrProd, p.pwrUse], q, sw: [+p.sw.charge.toFixed(3), p.sw.ready ? 1 : 0], alive: p.alive ? 1 : 0, stats: p.stats },
          pl: this.players.map((o) => [o.alive ? 1 : 0, o.stats.kills, o.stats.lost]),
          over: this.over ? { winnerTeam: this.over.winnerTeam, time: this.over.time } : null,
        };
      }
      this.events = [];
      return out;
    }
    tileSeen(vis, b) {
      for (let y = b.by; y < b.by + b.h; y++) for (let x = b.bx; x < b.bx + b.w; x++) if (vis[y * W + x]) return true;
      return false;
    }
    initInfo() {
      return {
        w: W, h: H, seed: this.seed, starts: this.starts, mapId: this.mapId,
        terrain: Buffer_b64(this.terrain),
        ore: Array.from(this.ore, (v) => Math.round(v)),
        players: this.players.map((p) => ({ id: p.id, name: p.name, color: p.color, team: p.team, bot: p.botLevel, neutral: !!p.neutral })),
      };
    }
  }
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

  function Buffer_b64(u8) {
    if (typeof Buffer !== 'undefined') return Buffer.from(u8).toString('base64');
    let s = '';
    for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
    return btoa(s);
  }
  GA.b64decode = function (str) {
    if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(str, 'base64'));
    const s = atob(str), out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  };

  GA.Sim = Sim;
})();

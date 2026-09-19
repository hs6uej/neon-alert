// Custom (admin-made) maps: storage format, validation and the registry that feeds the map pickers and the simulation.
// Shared by the server, the game client and the admin map editor.
(function () {
  'use strict';
  const GA = (globalThis.GA = globalThis.GA || {});
  const { W, H } = GA;
  const N = W * H;

  GA.MAP_LIMITS = { maxMaps: 24, minStartGap: 24, maxNeutrals: 24 };
  GA.CUSTOM_MAP_ID = /^c_[a-z0-9]{4,12}$/;
  GA.BASE_MAPS = GA.MAPS.slice();
  GA.CUSTOM_MAPS = {};

  // ---- terrain is stored run-length encoded ("0:120,1:3,..."), ore as a flat [tile, amount, ...] list
  GA.terrainEncode = function (u8) {
    const out = [];
    for (let i = 0; i < u8.length;) {
      let j = i;
      while (j < u8.length && u8[j] === u8[i]) j++;
      out.push(u8[i] + ':' + (j - i));
      i = j;
    }
    return out.join(',');
  };
  GA.terrainDecode = function (str) {
    if (typeof str !== 'string' || str.length > 200000) return null;
    const out = new Uint8Array(N);
    let p = 0;
    for (const tok of str.split(',')) {
      const m = /^([0-2]):(\d+)$/.exec(tok);
      if (!m) return null;
      const v = +m[1], n = +m[2];
      if (p + n > N) return null;
      out.fill(v, p, p + n);
      p += n;
    }
    return p === N ? out : null;
  };
  GA.oreEncode = function (f32) {
    const out = [];
    for (let i = 0; i < f32.length; i++) if (f32[i] > 0) out.push(i, Math.round(f32[i]));
    return out;
  };

  // Decoded copy for the simulation (fresh arrays every time - the sim mutates terrain when rocks are destroyed)
  GA.customMapData = function (cm) {
    const terrain = GA.terrainDecode(cm && cm.terrain);
    if (!terrain || !Array.isArray(cm.starts) || cm.starts.length < 2 || cm.starts.length > 3) return null;
    const ore = new Float32Array(N);
    const ro = Array.isArray(cm.ore) ? cm.ore : [];
    for (let k = 0; k + 1 < ro.length; k += 2) if (ro[k] >= 0 && ro[k] < N) ore[ro[k]] = ro[k + 1];
    return { terrain, ore, starts: cm.starts.map((s) => ({ x: s[0], y: s[1] })), neutrals: (cm.neutrals || []).map((n) => ({ type: n.type, x: n.x, y: n.y })) };
  };

  // ---- registry: keeps GA.MAPS / GA.MAP_CHOICES (arrays are mutated in place) in sync with the custom maps
  GA.setCustomMaps = function (list) {
    GA.CUSTOM_MAPS = {};
    for (const m of list || []) if (m && GA.CUSTOM_MAP_ID.test(m.id)) GA.CUSTOM_MAPS[m.id] = m;
    GA.MAPS.length = 0;
    GA.MAPS.push(...GA.BASE_MAPS);
    for (const m of Object.values(GA.CUSTOM_MAPS)) GA.MAPS.push({ id: m.id, name: m.name, desc: m.desc || '', custom: true, players: m.starts.length });
    GA.MAP_CHOICES.length = 0;
    GA.MAP_CHOICES.push(...GA.MAPS.map((m) => m.id));
  };

  // how many players a map holds (built-in maps: 3)
  GA.mapMaxPlayers = (id) => (GA.CUSTOM_MAPS[id] ? GA.CUSTOM_MAPS[id].starts.length : 3);

  // ---- validation (used live by the editor and authoritatively by the server)
  // Returns { errors, warnings, map } - messages are { k: 'English text with {vars}', v: {vars} }; `map` is the cleaned map (only when it parsed).
  GA.validateMap = function (raw) {
    const errors = [], warnings = [];
    const E = (k, v) => errors.push({ k, v }), Wn = (k, v) => warnings.push({ k, v });
    if (!raw || typeof raw !== 'object') { E('Invalid map data'); return { errors, warnings }; }
    const name = String(raw.name == null ? '' : raw.name).replace(/[<>]/g, '').trim().slice(0, 24);
    const desc = String(raw.desc == null ? '' : raw.desc).replace(/[<>]/g, '').trim().slice(0, 120);
    if (name.length < 3) E('Give the map a name (3-24 characters)');
    const terrain = GA.terrainDecode(raw.terrain);
    if (!terrain) { E('Terrain data is invalid'); return { errors, warnings }; }
    for (let i = 0; i < N; i++) { const x = i % W, y = (i / W) | 0; if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) terrain[i] = 1; }

    const ore = new Float32Array(N);
    const ro = Array.isArray(raw.ore) ? raw.ore : [];
    for (let k = 0; k + 1 < ro.length; k += 2) {
      const i = ro[k] | 0, a = +ro[k + 1];
      if (i >= 0 && i < N && terrain[i] === 0 && a > 0) ore[i] = Math.min(2500, Math.max(50, Math.round(a)));
    }

    // start positions
    const starts = [];
    if (!Array.isArray(raw.starts) || raw.starts.length < 2 || raw.starts.length > 3) E('A map needs 2 or 3 start positions');
    else {
      raw.starts.forEach((s, k) => {
        const x = Array.isArray(s) ? s[0] | 0 : -1, y = Array.isArray(s) ? s[1] | 0 : -1;
        if (x < 12 || y < 12 || x > W - 13 || y > H - 13) E('Start {n} is too close to the map edge', { n: k + 1 });
        starts.push([x, y]);
      });
      for (let a = 0; a < starts.length; a++) for (let b = a + 1; b < starts.length; b++) {
        if (Math.hypot(starts[a][0] - starts[b][0], starts[a][1] - starts[b][1]) < GA.MAP_LIMITS.minStartGap) E('Starts {a} and {b} are too close together (min {n} tiles)', { a: a + 1, b: b + 1, n: GA.MAP_LIMITS.minStartGap });
      }
      starts.forEach(([sx, sy], k) => {
        let bad = false;
        for (let y = sy - 4; y <= sy + 4 && !bad; y++) for (let x = sx - 4; x <= sx + 4; x++) {
          if (Math.hypot(x - sx, y - sy) <= 4.5 && (x < 0 || y < 0 || x >= W || y >= H || terrain[y * W + x] !== 0)) { bad = true; break; }
        }
        if (bad) E('Start {n} needs open ground around it (rock or water is in the way)', { n: k + 1 });
      });
    }

    // neutral structures
    const neutrals = [];
    const nlist = Array.isArray(raw.neutrals) ? raw.neutrals : [];
    if (nlist.length > GA.MAP_LIMITS.maxNeutrals) E('Too many neutral structures (max {n})', { n: GA.MAP_LIMITS.maxNeutrals });
    for (const n of nlist.slice(0, GA.MAP_LIMITS.maxNeutrals)) {
      const def = n && GA.DEFS[n.type];
      if (!def || !def.neutral) { E('Unknown neutral structure'); continue; }
      neutrals.push({ type: n.type, x: n.x | 0, y: n.y | 0 });
    }

    // reachability (4-neighbour flood over open terrain from start 1)
    if (starts.length >= 2) {
      const reach = new Uint8Array(N);
      const s0 = starts[0];
      if (s0 && s0[0] >= 0 && s0[1] >= 0 && s0[0] < W && s0[1] < H && terrain[s0[1] * W + s0[0]] === 0) {
        const st = [s0[1] * W + s0[0]];
        reach[st[0]] = 1;
        while (st.length) {
          const c = st.pop(), cx = c % W, cy = (c / W) | 0;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            const ni = ny * W + nx;
            if (!reach[ni] && terrain[ni] === 0) { reach[ni] = 1; st.push(ni); }
          }
        }
        starts.forEach(([sx, sy], k) => { if (k && !reach[sy * W + sx]) E('Start {n} cannot be reached from start 1', { n: k + 1 }); });
        let lost = 0, total = 0;
        for (let i = 0; i < N; i++) if (ore[i] > 0) { total += ore[i]; if (!reach[i]) lost++; }
        if (lost) Wn('{n} ore tile(s) cannot be reached by harvesters', { n: lost });
        if (total < 4000) Wn('There is very little ore on this map');
        starts.forEach(([sx, sy], k) => {
          let near = false;
          for (let i = 0; i < N && !near; i++) if (ore[i] > 0 && Math.hypot((i % W) - sx, ((i / W) | 0) - sy) < 24) near = true;
          if (!near) Wn('Start {n} has no ore within 24 tiles', { n: k + 1 });
        });
        neutrals.forEach((n, k) => {
          let free = n.x >= 2 && n.y >= 2 && n.x + 2 <= W - 2 && n.y + 2 <= H - 2, touch = false;
          for (let y = n.y - 1; y <= n.y + 2 && free; y++) for (let x = n.x - 1; x <= n.x + 2; x++) {
            const inside = x >= n.x && x < n.x + 2 && y >= n.y && y < n.y + 2, i = y * W + x;
            if (inside && (terrain[i] !== 0 || ore[i] > 0)) { free = false; break; }
            if (!inside && reach[i]) touch = true;
          }
          const name = GA.DEFS[n.type].name;
          if (!free) E('{name} at {x},{y} must sit on open ground without ore', { name, x: n.x, y: n.y });
          else if (!touch) E('{name} at {x},{y} cannot be reached', { name, x: n.x, y: n.y });
          for (let j = 0; j < k; j++) if (Math.abs(neutrals[j].x - n.x) < 4 && Math.abs(neutrals[j].y - n.y) < 4) E('Two neutral structures are too close together');
          if (starts.some(([sx, sy]) => Math.hypot(sx - n.x, sy - n.y) < 12)) E('{name} at {x},{y} is too close to a start position', { name, x: n.x, y: n.y });
        });
      }
    }

    const map = { name, desc, terrain: GA.terrainEncode(terrain), ore: GA.oreEncode(ore), starts, neutrals };
    return { errors, warnings, map };
  };
})();

// Client-side game state: snapshots, interpolation, effects, input handling
(function () {
  'use strict';
  const GA = globalThis.GA;
  const { W, H, DEFS, TYPES, PLAYER_COLORS } = GA;
  const N = W * H;
  const Audio = GA.Audio;

  const B_HEIGHT = { conyard: 2.1, power: 1.1, refinery: 1.5, barracks: 0.9, factory: 1.6, radar: 1.6, techlab: 1.4, turret: 0.85, uplink: 2.8, derrick: 1.5, depot: 0.9 };

  function angLerp(a, b, t) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  }

  function setPointerFor(g, x, y) { g.mouse.sx = x; g.mouse.sy = y; g.mouse.in = true; g.updateHover(); }

  class Game {
    constructor(ui, renderer, canvas, start, transport) {
      this.ui = ui; this.r = renderer; this.canvas = canvas; this.transport = transport;
      this.map = start.map;
      this.terrain = GA.b64decode(start.map.terrain);
      this.rockStage = new Uint8Array(N);
      this.hoverRock = -1;
      this.ore = Float32Array.from(start.map.ore);
      this.players = start.map.players;
      GA.setOwnerColors(this.players);
      this.me = start.me;
      this.myTeam = this.players[this.me].team;
      this.local = !!start.local;
      this.ents = new Map();
      this.sel = new Set();
      this.groups = {};
      this.groupOf = new Map();
      this.hoverId = 0;
      this.mode = null; // 'amove' | 'sell' | 'repair' | 'sw'
      this.placing = null;
      this.drag = null;
      this.mouse = { sx: 0, sy: 0, wx: null, wy: null, in: false };
      this.edge = { x: 0, y: 0, on: false }; // pointer position relative to the whole window, for edge scrolling
      this.pad = [0, 0]; this.boxMode = false; this.touches = new Map(); this.touchAt = -1e9; this.lastTap = null; this.pinch = null;
      this.keys = new Set();
      this.orderMarks = [];
      this.pings = [];
      this.fx = { particles: [], shots: [], rings: [], decals: [], lances: [], spawn: new Map(), build: new Map() };
      this.vis = new Uint8Array(N);
      this.explored = new Uint8Array(N);
      this.fogCanvas = document.createElement('canvas');
      this.fogCanvas.width = W; this.fogCanvas.height = H;
      this.fogCtx = this.fogCanvas.getContext('2d');
      this.fogImg = this.fogCtx.createImageData(W, H);
      this.miniCanvas = document.createElement('canvas');
      this.miniCanvas.width = W; this.miniCanvas.height = H;
      this.miniDirty = true;
      this.occ = new Uint8Array(N);
      this.st = { credits: 0, pw: [0, 0], q: { structure: [], infantry: [], vehicle: [] }, sw: [0, 0], alive: 1, stats: {} };
      this.counts = {};
      this.over = null;
      this.time = 0;
      this.lastSnapAt = performance.now();
      this.snapCount = 0;
      this.swCharge = 0; this.swReady = false;
      this.lastAlertPos = null;
      this.showBars = false;
      this.lastMini = 0;
      const s = start.map.starts[this.me];
      this.cam = { x: s.x, y: s.y, zoom: 1, shx: 0, shy: 0, shake: 0 };
      this.bindInput();
    }

    // ------------------------------------------------------------ snapshots
    onMessage(m) {
      if (m.k === 'snap') this.onSnapshot(m);
      else if (m.t === 'chat') this.ui.chat(m);
    }
    onSnapshot(m) {
      const now = performance.now() / 1000;
      const dur = Math.max(0.05, Math.min(0.25, now - this.lastSnapAt));
      this.lastSnapAt = now;
      this.time = m.time;
      this.snapCount++;
      const seen = new Set();
      const occ = this.occ; occ.fill(0);
      for (const a of m.ents) {
        const id = a[0];
        seen.add(id);
        let e = this.ents.get(id);
        const type = TYPES[a[1]], def = DEFS[type];
        const x = a[3] / 16, y = a[4] / 16, ang = a[6] / 50;
        if (!e) {
          e = { id, type, def, isB: def.kind === 'b', owner: a[2], hp: a[5], mhp: def.hp, x0: x, y0: y, tx: x, ty: y, rx: x, ry: y, a0: ang, a1: ang, ang, lt0: now, ldur: dur, moving: false, movedAt: 0, flash: 0, cargo: 0, born: 0 };
          if (e.isB) { e.w = def.w; e.h = def.h; e.x = x; e.y = y; e.bx = x - def.w / 2; e.by = y - def.h / 2; }
          this.ents.set(id, e);
        } else {
          e.ghost = false;
          if (a[5] < e.hp - 0.5) e.hitAt = now;
          e.hp = a[5];
          if (e.owner !== a[2]) e.owner = a[2];
          if (Math.abs(x - e.tx) + Math.abs(y - e.ty) > 0.01) e.movedAt = now;
          e.x0 = e.rx; e.y0 = e.ry; e.a0 = e.ang; e.tx = x; e.ty = y; e.a1 = ang; e.lt0 = now; e.ldur = dur;
        }
        if (e.isB) {
          e.x = x; e.y = y; e.rx = x; e.ry = y; e.ang = ang; e.a1 = ang;
          const ex = a[7];
          e.born = ex[0] / 10; e.repair = !!ex[1];
          e.rally = ex[2] >= 0 ? { x: ex[2] / 10, y: ex[3] / 10 } : null;
          const b = e.bx | 0, c = e.by | 0;
          for (let j = 0; j < e.h; j++) for (let i = 0; i < e.w; i++) occ[(c + j) * W + b + i] = 1;
        } else e.cargo = a[7];
      }
      // entities that vanished: keep enemy buildings we cannot currently see as ghosts
      this.computeVision(m);
      for (const [id, e] of this.ents) {
        if (seen.has(id)) continue;
        const team = this.players[e.owner].team;
        const ti = Math.max(0, Math.min(N - 1, Math.floor(e.isB ? e.y : e.ty) * W + Math.floor(e.isB ? e.x : e.tx)));
        if (e.isB && team !== this.myTeam && !this.vis[ti] && !this.allVisible) { e.ghost = true; const b = e.bx | 0, c = e.by | 0; for (let j = 0; j < e.h; j++) for (let i = 0; i < e.w; i++) occ[(c + j) * W + b + i] = 1; continue; }
        this.ents.delete(id);
        this.sel.delete(id);
      }
      // ore
      for (let i = 0; i < m.ore.length; i += 2) this.ore[m.ore[i]] = m.ore[i + 1];
      if (m.ore.length) this.miniDirty = true;
      this.st = m.me;
      this.swCharge = m.me.sw[0]; this.swReady = !!m.me.sw[1];
      this.counts = {};
      for (const e of this.ents.values()) if (e.isB && e.owner === this.me && !e.ghost) this.counts[e.type] = (this.counts[e.type] || 0) + 1;
      this.pl = m.pl;
      for (const ev of m.ev) this.handleEvent(ev, now);
      if (m.over && !this.over) { this.over = m.over; this.ui.gameOver(this, m.over); }
      else if (!m.me.alive && !this.defeatShown && !m.over) { this.defeatShown = true; this.ui.gameOver(this, { winnerTeam: -1, time: m.time }); }
      // placing mode ends when the item is no longer ready
      if (this.placing) {
        const it = this.st.q.structure[0];
        if (!it || !it[2] || TYPES[it[0]] !== this.placing.type) this.placing = null;
      }
      // deployed buildings/killed: prune selection of dead
      for (const id of this.sel) if (!this.ents.has(id)) this.sel.delete(id);
      this.ui.update(this);
    }
    computeVision(m) {
      const vis = this.vis;
      this.allVisible = !m.me.alive || !!m.over;
      if (this.allVisible) vis.fill(1);
      else {
        vis.fill(0);
        for (const e of this.ents.values()) {
          if (e.ghost) continue;
          if (this.players[e.owner].team !== this.myTeam) continue;
          const r = Math.ceil(e.def.vision + (e.isB ? 1 : 0));
          const rows = GA.circleRows(r);
          const cx = Math.floor(e.isB ? e.x : e.tx), cy = Math.floor(e.isB ? e.y : e.ty);
          for (let dy = -r; dy <= r; dy++) {
            const yy = cy + dy;
            if (yy < 0 || yy >= H) continue;
            const ext = rows[dy + r];
            const x0 = Math.max(0, cx - ext), x1 = Math.min(W - 1, cx + ext);
            for (let xx = x0; xx <= x1; xx++) vis[yy * W + xx] = 1;
          }
        }
      }
      const px = this.fogImg.data;
      for (let i = 0; i < N; i++) {
        if (vis[i]) this.explored[i] = 1;
        const o = i * 4;
        px[o] = 3; px[o + 1] = 7; px[o + 2] = 14;
        px[o + 3] = vis[i] ? 0 : this.explored[i] ? 120 : 246;
      }
      this.fogCtx.putImageData(this.fogImg, 0, 0);
    }
    tileVisible(x, y) {
      const i = Math.floor(y) * W + Math.floor(x);
      return i >= 0 && i < N && this.vis[i] === 1;
    }
    tileFree(tx, ty) {
      if (tx < 1 || ty < 1 || tx >= W - 1 || ty >= H - 1) return false;
      const i = ty * W + tx;
      return this.terrain[i] === 0 && !this.occ[i] && this.ore[i] <= 0;
    }
    canPlaceHere(type, x, y) {
      const d = DEFS[type];
      for (let j = 0; j < d.h; j++) for (let i = 0; i < d.w; i++) if (!this.tileFree(x + i, y + j)) return false;
      for (const b of this.ents.values()) {
        if (!b.isB || b.owner !== this.me || b.ghost || b.def.weapon) continue;
        const gx = Math.max(b.bx - (x + d.w), x - (b.bx + b.w), 0), gy = Math.max(b.by - (y + d.h), y - (b.by + b.h), 0);
        if (Math.max(gx, gy) <= 4) return true;
      }
      return false;
    }
    miniTerrain() {
      if (this.miniDirty) {
        const ctx = this.miniCanvas.getContext('2d');
        const img = ctx.createImageData(W, H);
        for (let i = 0; i < N; i++) {
          const t = this.terrain[i], o = i * 4;
          let r = 15, g = 26, b = 38;
          if (t === 1) { r = 70; g = 78; b = 108; } else if (t === 2) { r = 10; g = 58; b = 92; } else if (this.ore[i] > 0) { if (this.ore[i] > 950) { r = 200; g = 150; b = 50; } else { r = 40; g = 170; b = 110; } }
          img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = 255;
        }
        ctx.putImageData(img, 0, 0);
        this.miniDirty = false;
      }
      return this.miniCanvas;
    }

    // ------------------------------------------------------------ events -> effects
    audioVol(x, y) {
      const d = Math.hypot(x - this.cam.x, y - this.cam.y);
      return Math.max(0, 1 - d / (32 / this.cam.zoom));
    }
    handleEvent(ev, now) {
      const fx = this.fx;
      switch (ev.e) {
        case 'shot': {
          const z1 = ev.a1 ? 1.6 : DEFS[ev.ty] && DEFS[ev.ty].kind === 'b' ? 0.85 : 0.5, z2 = ev.a2 ? 1.6 : 0.42;
          const dist = Math.hypot(ev.x2 - ev.x1, ev.y2 - ev.y1);
          const dur = Math.max(0.05, ev.t);
          fx.shots.push({ k: ev.k, x1: ev.x1, y1: ev.y1, x2: ev.x2, y2: ev.y2, z1, z2, t0: now, dur, arc: 0.6 + dist * 0.09, o: ev.o, s: ev.s, done: false });
          this.addParticle({ kind: 'flash', x: ev.x1, y: ev.y1, z: z1, size: 6, dur: 0.12, color: PLAYER_COLORS[ev.o] ? PLAYER_COLORS[ev.o].main : '#fff' });
          for (const e of this.ents.values()) if (!e.isB && e.type === ev.ty && Math.abs(e.rx - ev.x1) < 0.4 && Math.abs(e.ry - ev.y1) < 0.4) { e.flash = 0.12; break; }
          Audio.play(ev.k, this.audioVol(ev.x1, ev.y1));
          break;
        }
        case 'boom': this.explosion(ev, now); break;
        case 'rock':
          this.rockStage[ev.i] = ev.s === 3 ? 0 : ev.s;
          if (ev.s === 3) { this.terrain[ev.i] = 0; this.miniDirty = true; }
          break;
        case 'spawn': {
          fx.spawn.set(ev.id, now);
          const col = PLAYER_COLORS[ev.owner].main;
          fx.rings.push({ x: ev.x, y: ev.y, r: 1.4, t0: now, dur: 0.9, color: col, lw: 3 });
          fx.rings.push({ x: ev.x, y: ev.y, r: 0.8, t0: now + 0.15, dur: 0.8, color: '#ffffff', lw: 2 });
          for (let i = 0; i < 10; i++) this.addParticle({ kind: 'spark', x: ev.x, y: ev.y, z: 0.1, vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 3, vz: 2 + Math.random() * 3, dur: 0.6, size: 3, color: col, grav: 4 });
          Audio.play('spawn', this.audioVol(ev.x, ev.y));
          break;
        }
        case 'built': {
          fx.build.set(ev.id, now);
          const col = PLAYER_COLORS[ev.owner].main;
          fx.rings.push({ x: ev.x, y: ev.y, r: 3, t0: now, dur: 1.1, color: col, lw: 3 });
          for (let i = 0; i < 16; i++) this.addParticle({ kind: 'spark', x: ev.x + (Math.random() - 0.5) * 2, y: ev.y + (Math.random() - 0.5) * 2, z: 0, vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2, vz: 2 + Math.random() * 4, dur: 0.9, size: 3, color: '#ffe8a3', grav: 5 });
          Audio.play('built', this.audioVol(ev.x, ev.y));
          break;
        }
        case 'sell': {
          fx.rings.push({ x: ev.x, y: ev.y, r: 2.5, t0: now, dur: 0.8, color: '#facc15', lw: 3 });
          for (let i = 0; i < 12; i++) this.addParticle({ kind: 'debris', x: ev.x + (Math.random() - 0.5) * ev.w, y: ev.y + (Math.random() - 0.5) * ev.h, z: 0.4, vx: (Math.random() - 0.5), vy: (Math.random() - 0.5), vz: 2 + Math.random() * 3, dur: 0.9, size: 5, color: '#facc15', grav: 6 });
          Audio.play('sell', this.audioVol(ev.x, ev.y));
          break;
        }
        case 'capture': {
          fx.rings.push({ x: ev.x, y: ev.y, r: 3, t0: now, dur: 1, color: PLAYER_COLORS[ev.owner].main, lw: 3 });
          fx.build.set(ev.id, now - 0.6);
          Audio.play('capture', this.audioVol(ev.x, ev.y));
          break;
        }
        case 'lance': {
          fx.lances.push({ x: ev.x, y: ev.y, t0: now, dur: ev.t, r: ev.r || 4.2 });
          Audio.play('lance', 0.9);
          break;
        }
        case 'msg': this.ui.toast(ev.text, ev.kind); break;
        case 'alert': {
          if (ev.kind === 'base') {
            this.pings.push({ x: ev.x, y: ev.y, t0: now });
            this.lastAlertPos = { x: ev.x, y: ev.y };
            this.ui.alert('Base under attack');
            Audio.play('alert', 0.8); Audio.say('Base under attack');
          }
          break;
        }
        case 'ready': {
          Audio.play('ready', 0.8);
          Audio.say(ev.cat === 'structure' ? 'Construction complete' : 'Unit ready');
          this.ui.flashReady(ev.cat);
          break;
        }
        case 'lowpower': this.ui.toast('Low power! Production slowed, defenses offline.', 'bad'); Audio.say('Low power'); break;
        case 'swready': this.ui.toast('Orbital Lance is ready!', 'good'); Audio.say('Orbital lance ready'); break;
        case 'defeat': break;
      }
    }
    addParticle(p) {
      p.t0 = p.t0 || performance.now() / 1000;
      if (p.vx == null) { p.vx = 0; p.vy = 0; p.vz = 0; }
      const list = this.fx.particles;
      if (list.length > 1600) list.splice(0, 200);
      list.push(p);
    }
    puff(x, y, z, kind, dur) {
      this.addParticle({ kind, x, y, z, size: 6, dur: dur || 0.6, grow: 2, vz: 0.3 });
    }
    explosion(ev, now) {
      const s = ev.s, z = ev.z ? 1.5 : 0.3;
      const fx = this.fx;
      const big = s > 1.5;
      this.addParticle({ kind: 'blast', x: ev.x, y: ev.y, z, size: 16 + s * 12, dur: 0.45, color: ev.inf ? '#67e8f9' : '#ffd27a' });
      fx.rings.push({ x: ev.x, y: ev.y, r: s * 1.5 + 0.5, t0: now, dur: 0.5, color: ev.inf ? '#67e8f9' : '#ffb347', lw: 2.5 });
      const nf = Math.floor(6 + s * 8);
      for (let i = 0; i < nf; i++) this.addParticle({ kind: 'fire', x: ev.x + (Math.random() - 0.5) * s, y: ev.y + (Math.random() - 0.5) * s, z, vx: (Math.random() - 0.5) * s * 1.5, vy: (Math.random() - 0.5) * s * 1.5, vz: 0.6 + Math.random() * 1.5, dur: 0.5 + Math.random() * 0.6, size: 6 + s * 3 * Math.random(), grav: -0.5 });
      for (let i = 0; i < Math.floor(s * 3); i++) this.addParticle({ kind: 'smoke', x: ev.x + (Math.random() - 0.5) * s, y: ev.y + (Math.random() - 0.5) * s, z, vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4, vz: 0.5 + Math.random(), dur: 1.4 + Math.random(), size: 8 + s * 4, grow: 2 });
      if (ev.b || big) for (let i = 0; i < 10 + s * 5; i++) this.addParticle({ kind: 'debris', x: ev.x, y: ev.y, z: 0.4, vx: (Math.random() - 0.5) * s * 2.5, vy: (Math.random() - 0.5) * s * 2.5, vz: 2 + Math.random() * 4, dur: 0.9 + Math.random() * 0.5, size: 3 + Math.random() * 4, color: ev.inf ? '#67e8f9' : '#3b4562', grav: 9 });
      else if (ev.inf) for (let i = 0; i < 6; i++) this.addParticle({ kind: 'spark', x: ev.x, y: ev.y, z: 0.4, vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2, vz: 1 + Math.random() * 2, dur: 0.5, size: 2, color: '#a5f3fc', grav: 5 });
      if (!ev.z) { fx.decals.push({ x: ev.x, y: ev.y, r: s * 0.55 + 0.2, t0: now, dur: 30, a: 0.8, glow: !!ev.b }); if (fx.decals.length > 70) fx.decals.shift(); }
      const vol = this.audioVol(ev.x, ev.y);
      if (ev.big) { Audio.play('bigboom', 1); this.cam.shake = 0.9; } else if (ev.b) { Audio.play('boom', vol); if (vol > 0.2) this.cam.shake = Math.max(this.cam.shake, 0.35); } else Audio.play('boomSmall', vol);
    }
    impact(s, now) {
      const col = PLAYER_COLORS[s.o] ? PLAYER_COLORS[s.o].main : '#fff';
      const z = s.z2;
      if (s.s > 0) {
        this.addParticle({ kind: 'blast', x: s.x2, y: s.y2, z, size: 8 + s.s * 14, dur: 0.3, color: s.k === 'plasma' ? col : '#ffb84d' });
        this.fx.rings.push({ x: s.x2, y: s.y2, r: s.s * 1.1, t0: now, dur: 0.35, color: s.k === 'plasma' ? col : '#ffb84d', lw: 2, a: 0.7 });
        for (let i = 0; i < 4 + s.s * 3; i++) this.addParticle({ kind: 'spark', x: s.x2, y: s.y2, z, vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 3, vz: 1 + Math.random() * 2, dur: 0.4, size: 2, color: '#ffe0a3', grav: 6 });
        if (s.k === 'shell') { this.fx.decals.push({ x: s.x2, y: s.y2, r: 0.5, t0: now, dur: 14, a: 0.6 }); }
        Audio.play('boomSmall', this.audioVol(s.x2, s.y2) * 0.7);
      } else {
        for (let i = 0; i < 3; i++) this.addParticle({ kind: 'spark', x: s.x2, y: s.y2, z, vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2, vz: 1 + Math.random() * 2, dur: 0.25, size: 2, color: s.k === 'rail' ? '#a5f3fc' : col, grav: 5 });
        this.addParticle({ kind: 'flash', x: s.x2, y: s.y2, z, size: 4, dur: 0.1, color: s.k === 'rail' ? '#a5f3fc' : col });
      }
    }

    // ------------------------------------------------------------ per-frame update
    update(dt, now) {
      // interpolate entities
      for (const e of this.ents.values()) {
        if (e.isB) continue;
        const t = Math.min(1, (now - e.lt0) / e.ldur);
        e.rx = e.x0 + (e.tx - e.x0) * t; e.ry = e.y0 + (e.ty - e.y0) * t;
        e.ang = angLerp(e.a0, e.a1, Math.min(1, t * 1.3));
        e.moving = now - e.movedAt < 0.3;
        if (e.flash > 0) e.flash -= dt;
      }
      // ghosts and damage smoke
      for (const e of this.ents.values()) {
        if (e.isB && !e.ghost && e.hp < e.mhp * 0.5 && Math.random() < (e.hp < e.mhp * 0.25 ? 0.3 : 0.12)) this.addParticle({ kind: 'smoke', x: e.x + (Math.random() - 0.5) * e.w * 0.5, y: e.y + (Math.random() - 0.5) * e.h * 0.5, z: 0.7, vz: 0.8, vx: 0.2, vy: -0.2, dur: 1.4, size: 8, grow: 2.5 });
      }
      // shots
      const shots = this.fx.shots;
      for (let i = shots.length - 1; i >= 0; i--) {
        const s = shots[i];
        const el = now - s.t0;
        if (!s.done && el >= s.dur) { s.done = true; this.impact(s, now); }
        if (el > Math.max(s.dur, s.k === 'rail' ? 0.4 : 0)) shots.splice(i, 1);
      }
      // particles
      const ps = this.fx.particles;
      let w = 0;
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        if (now - p.t0 > p.dur) continue;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.grav) p.vz -= p.grav * dt;
        if (p.z < 0 && p.kind !== 'smoke') { p.z = 0; p.vz *= -0.3; p.vx *= 0.6; p.vy *= 0.6; }
        ps[w++] = p;
      }
      ps.length = w;
      this.fx.rings = this.fx.rings.filter((r) => now - r.t0 < r.dur);
      this.fx.lances = this.fx.lances.filter((l) => now - l.t0 < l.dur * 1.6);
      this.fx.decals = this.fx.decals.filter((d) => now - d.t0 < d.dur);
      if ((this.pruneTick = (this.pruneTick || 0) + 1) % 120 === 0) {
        for (const [id, t] of this.fx.spawn) if (now - t > 3) this.fx.spawn.delete(id);
        for (const [id, t] of this.fx.build) if (now - t > 3) this.fx.build.delete(id);
      }
      this.orderMarks = this.orderMarks.filter((m) => now - m.t0 < 1);
      this.pings = this.pings.filter((p) => now - p.t0 < 2.5);
      // camera
      this.updateCamera(dt);
      if (this.cam.shake > 0) {
        this.cam.shake = Math.max(0, this.cam.shake - dt * 2.4);
        this.cam.shx = (Math.random() - 0.5) * 14 * this.cam.shake; this.cam.shy = (Math.random() - 0.5) * 14 * this.cam.shake;
      } else { this.cam.shx = 0; this.cam.shy = 0; }
      // hover
      if (this.mouse.in) this.updateHover();
      const acting = !!(this.placing || this.mode), b = document.body.classList;
      b.toggle('acting', acting); b.toggle('acting-confirm', !!(this.placing || this.mode === 'sw'));
      if (acting && !this._actLbl) this._actLbl = document.getElementById('tbOkLbl');
      if (this._actLbl) { const t = GA.tt(this.mode === 'sw' ? 'Fire here' : 'Build here'); if (this._actLbl.textContent !== t) this._actLbl.textContent = t; }
      document.getElementById('tbBox').classList.toggle('on', this.boxMode);
    }
    updateCamera(dt) {
      const k = this.keys, cam = this.cam;
      let sx = 0, sy = 0;
      if (k.has('ArrowLeft')) sx -= 1;
      if (k.has('ArrowRight')) sx += 1;
      if (k.has('ArrowUp')) sy -= 1;
      if (k.has('ArrowDown')) sy += 1;
      let speed = 1;
      if (!sx && !sy && (this.pad[0] || this.pad[1])) { sx = this.pad[0]; sy = this.pad[1]; }
      if (!sx && !sy && this.edge.on && !this.drag && !this.midDrag && !document.querySelector('#pauseMenu:not(.hidden), #endScreen:not(.hidden)')) {
        // the zone is measured from the window edge (HUD panels do not block it); speed ramps up towards the edge
        const zone = 22, w = this.r.w, h = this.r.h, e = this.edge;
        const ramp = (d) => (d >= zone ? 0 : 0.4 + 0.6 * (1 - Math.max(0, d) / zone));
        sx = e.x < zone ? -ramp(e.x) : w - 1 - e.x < zone ? ramp(w - 1 - e.x) : 0;
        sy = e.y < zone ? -ramp(e.y) : h - 1 - e.y < zone ? ramp(h - 1 - e.y) : 0;
        speed = Math.max(Math.abs(sx), Math.abs(sy));
      }
      if (sx || sy) {
        const sp = 26 * dt * speed / Math.sqrt(cam.zoom);
        const l = Math.hypot(sx, sy);
        cam.x += ((sx + sy) / l) * sp * 0.707 * 1.0;
        cam.y += ((sy - sx) / l) * sp * 0.707 * 1.0;
      }
      cam.x = Math.max(0, Math.min(W, cam.x)); cam.y = Math.max(0, Math.min(H, cam.y));
    }
    centerOn(x, y) { this.cam.x = x; this.cam.y = y; }
    goHome() {
      let best = null;
      for (const e of this.ents.values()) if (e.isB && e.owner === this.me && !e.ghost && (!best || e.type === 'conyard')) best = e;
      if (best) this.centerOn(best.x, best.y);
    }

    // ------------------------------------------------------------ picking
    screenToWorld(sx, sy) { this.r.setView(this.cam); return this.r.toWorld(sx, sy); }
    hitBox(bx, by, w, h, hh, sx, sy) {
      const v = this.r.v, P = GA.drawHelpers.P;
      const pts = [P(v, bx, by, hh), P(v, bx + w, by, hh), P(v, bx + w, by, 0), P(v, bx + w, by + h, 0), P(v, bx, by + h, 0), P(v, bx, by + h, hh)];
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
        if ((yi > sy) !== (yj > sy) && sx < ((xj - xi) * (sy - yi)) / (yj - yi) + xi) inside = !inside;
      }
      return inside;
    }
    pickRock(sx, sy, wx, wy) {
      const x0 = Math.floor(wx), y0 = Math.floor(wy);
      let best = -1, bd = -1;
      for (let y = y0 - 1; y <= y0 + 3; y++) for (let x = x0 - 1; x <= x0 + 3; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const i = y * W + x;
        if (this.terrain[i] !== 1 || !GA.rockBreakable(x, y) || !this.hitBox(x, y, 1, 1, GA.rockHeight(x, y), sx, sy)) continue;
        if (x + y > bd) { bd = x + y; best = i; }
      }
      return best;
    }
    hitEnt(e, sx, sy) {
      const v = this.r.v, P = GA.drawHelpers.P;
      if (e.ghost) return false;
      if (e.isB) return this.hitBox(e.bx, e.by, e.w, e.h, B_HEIGHT[e.type] || 1, sx, sy);
      const alt = e.def.fly ? 1.6 : 0;
      const [cx, cy] = P(v, e.rx, e.ry, alt);
      const inf = e.def.cat === 'infantry';
      const hw = (inf ? 9 : e.def.r * 44 + 8) * v.zoom, hgt = (inf ? 24 : e.type === 'titan' ? 46 : 28) * v.zoom;
      return sx >= cx - hw && sx <= cx + hw && sy >= cy - hgt && sy <= cy + 6 * v.zoom;
    }
    pick(sx, sy) {
      this.r.setView(this.cam);
      let best = null, bd = -1;
      for (const e of this.ents.values()) {
        if (!this.hitEnt(e, sx, sy)) continue;
        const d = (e.isB ? e.x + e.y - 0.5 : e.rx + e.ry) + (e.def.fly ? 5 : 0);
        if (d > bd) { bd = d; best = e; }
      }
      return best;
    }
    updateHover() {
      const e = this.pick(this.mouse.sx, this.mouse.sy);
      this.hoverId = e ? e.id : 0;
      const [wx, wy] = this.screenToWorld(this.mouse.sx, this.mouse.sy);
      this.mouse.wx = wx; this.mouse.wy = wy;
      this.hoverRock = !e && !this.placing && !this.mode ? this.pickRock(this.mouse.sx, this.mouse.sy, wx, wy) : -1;
      if (this.mode === 'amove' && !e) this.hoverRock = this.pickRock(this.mouse.sx, this.mouse.sy, wx, wy);
      if (this.placing) {
        const d = DEFS[this.placing.type];
        this.placing.tx = Math.round(wx - d.w / 2); this.placing.ty = Math.round(wy - d.h / 2);
        this.placing.ok = this.canPlaceHere(this.placing.type, this.placing.tx, this.placing.ty);
      }
      let cur = 'cur-default';
      const selUnits = this.selUnits();
      if (this.mode === 'sell') cur = 'cur-sell';
      else if (this.mode === 'repair') cur = 'cur-repair';
      else if (this.mode === 'sw') cur = 'cur-sw';
      else if (this.mode === 'amove') cur = 'cur-attack';
      else if (this.placing) cur = 'cur-default';
      else if (selUnits.length) {
        if (e && this.isEnemy(e) && !e.ghost) cur = 'cur-attack';
        else if (!e) cur = this.hoverRock >= 0 && selUnits.some((u) => u.def.wp) ? 'cur-attack' : 'cur-move';
      }
      if (this.canvas.dataset.cur !== cur) { this.canvas.dataset.cur = cur; this.canvas.className = cur; }
    }
    isEnemy(e) { return this.players[e.owner].team !== this.myTeam; }
    selUnits() {
      const out = [];
      for (const id of this.sel) { const e = this.ents.get(id); if (e && !e.isB && e.owner === this.me) out.push(e); }
      return out;
    }
    selBuildings() {
      const out = [];
      for (const id of this.sel) { const e = this.ents.get(id); if (e && e.isB && e.owner === this.me) out.push(e); }
      return out;
    }

    // ------------------------------------------------------------ commands
    send(c) { this.transport.send({ t: 'cmd', c }); }
    setMode(m) { this.mode = m; this.ui.syncTools(this); if (m) this.placing = null; this.updateHover(); }
    startPlacing(type) { this.placing = { type, tx: null, ty: null, ok: false }; this.setMode(null); this.placing = { type, tx: null, ty: null, ok: false }; this.updateHover(); }
    mark(x, y, kind) { this.orderMarks.push({ x, y, t0: performance.now() / 1000, kind }); }
    orderAt(wx, wy, target, shift, rock = -1) {
      const units = this.selUnits();
      if (!units.length) {
        const bs = this.selBuildings().filter((b) => b.type === 'barracks' || b.type === 'factory');
        for (const b of bs) this.send({ type: 'rally', id: b.id, x: wx, y: wy });
        if (bs.length) { this.mark(wx, wy, 'move'); Audio.play('order', 0.7); }
        return;
      }
      const ids = units.map((u) => u.id);
      if (target && this.isEnemy(target) && !target.ghost) {
        const eng = units.filter((u) => u.def.capture).map((u) => u.id);
        const other = units.filter((u) => !u.def.capture).map((u) => u.id);
        if (target.isB && eng.length) this.send({ type: 'capture', ids: eng, target: target.id });
        if (other.length) this.send({ type: 'attack', ids: other, target: target.id });
        else if (!target.isB && eng.length) this.send({ type: 'move', ids: eng, x: target.rx, y: target.ry });
        this.mark(target.isB ? target.x : target.rx, target.isB ? target.y : target.ry, 'attack');
        Audio.play('order', 0.8);
        return;
      }
      if (rock >= 0) {
        const canBreak = (u) => u.def.wp && u.def.wp.targets !== 'air';
        const armed = units.filter(canBreak).map((u) => u.id), rest = units.filter((u) => !canBreak(u)).map((u) => u.id);
        if (armed.length) this.send({ type: 'attackRock', ids: armed, x: rock % W, y: (rock / W) | 0 });
        if (rest.length) this.send({ type: 'move', ids: rest, x: wx, y: wy });
        this.mark((rock % W) + 0.5, ((rock / W) | 0) + 0.5, 'attack');
        Audio.play('order', 0.8);
        return;
      }
      const harv = units.filter((u) => u.def.harvester);
      const ti = Math.floor(wy) * W + Math.floor(wx);
      if (harv.length && this.ore[ti] > 0) {
        this.send({ type: 'harvest', ids: harv.map((u) => u.id), x: wx, y: wy });
        const rest = units.filter((u) => !u.def.harvester).map((u) => u.id);
        if (rest.length) this.send({ type: 'move', ids: rest, x: wx, y: wy });
      } else this.send({ type: 'move', ids, x: wx, y: wy });
      this.mark(wx, wy, 'move');
      Audio.play('order', 0.8);
    }
    stopSel() { const ids = this.selUnits().map((u) => u.id); if (ids.length) this.send({ type: 'stop', ids }); }
    deploySel() { const ids = this.selUnits().filter((u) => u.def.mcv).map((u) => u.id); if (ids.length) this.send({ type: 'deploy', ids }); }

    // ------------------------------------------------------------ input
    bindInput() {
      const cv = this.canvas;
      const rect = () => cv.getBoundingClientRect();
      this._h = {};
      const on = (target, ev, fn, opts) => { target.addEventListener(ev, fn, opts); this._h[ev + Math.random()] = [target, ev, fn, opts]; };
      const pos = (e) => { const r = rect(); return [e.clientX - r.left, e.clientY - r.top]; };
      on(cv, 'contextmenu', (e) => e.preventDefault());
      on(cv, 'mouseenter', (e) => { const [x, y] = pos(e); this.mouse.sx = x; this.mouse.sy = y; this.mouse.in = true; });
      on(cv, 'mouseleave', () => { this.mouse.in = false; });
      on(cv, 'mousemove', (e) => {
        if (performance.now() - this.touchAt < 700) return;
        const [x, y] = pos(e);
        this.mouse.sx = x; this.mouse.sy = y; this.mouse.in = true; this.mouse.moved = true;
        if (this.drag) { this.drag.x1 = x; this.drag.y1 = y; if (Math.hypot(x - this.drag.x0, y - this.drag.y0) > 5) this.drag.active = true; }
        if (this.midDrag) {
          const dx = x - this.midDrag.x, dy = y - this.midDrag.y;
          this.midDrag.x = x; this.midDrag.y = y;
          const v = this.r.v;
          const a = -dx / v.A, b = -dy / v.B;
          this.cam.x += (a + b) / 2; this.cam.y += (b - a) / 2;
        }
      });
      on(cv, 'mousedown', (e) => {
        if (performance.now() - this.touchAt < 700) return;
        Audio.init(); Audio.startMusic();
        const [x, y] = pos(e);
        this.mouse.sx = x; this.mouse.sy = y;
        this.updateHover();
        if (e.button === 1) { this.midDrag = { x, y }; e.preventDefault(); return; }
        if (e.button === 2) { this.rightClick(e.shiftKey); return; }
        if (e.button === 0) this.leftDown(e.shiftKey);
      });
      on(window, 'mouseup', (e) => {
        if (e.button === 1) { this.midDrag = null; return; }
        if (e.button === 0 && this.drag) this.leftUp(e.shiftKey, e.detail >= 2);
      });
      on(cv, 'wheel', (e) => {
        e.preventDefault();
        const [x, y] = pos(e);
        this.zoomAt(x, y, e.deltaY < 0 ? 1.1 : 1 / 1.1);
      }, { passive: false });
      this.bindTouch(on, pos);
      on(window, 'mousemove', (e) => { this.edge.x = e.clientX; this.edge.y = e.clientY; this.edge.on = e.buttons === 0; });
      on(document.documentElement, 'mouseleave', () => { this.edge.on = false; });
      on(window, 'keydown', (e) => this.keyDown(e));
      on(window, 'keyup', (e) => { this.keys.delete(e.key); });
      on(window, 'blur', () => { this.keys.clear(); this.midDrag = null; this.drag = null; this.edge.on = false; this.pad = [0, 0]; this.touches.clear(); this.pinch = null; });
    }
    zoomAt(x, y, factor) {
      const before = this.screenToWorld(x, y);
      this.cam.zoom = Math.max(0.55, Math.min(1.6, this.cam.zoom * factor));
      const after = this.screenToWorld(x, y);
      this.cam.x += before[0] - after[0]; this.cam.y += before[1] - after[1];
    }
    panBy(dx, dy) {
      const v = this.r.v, a = -dx / v.A, b = -dy / v.B;
      this.cam.x += (a + b) / 2; this.cam.y += (b - a) / 2;
    }
    cancelAction() {
      if (this.placing) { this.placing = null; this.ui.update(this); }
      else if (this.mode) this.setMode(null);
    }
    setBoxMode(on) { this.boxMode = on; }

    // ------------------------------------------------------------ touch (iPad): tap / drag-pan / pinch / long-press, edge pads and the on-screen buttons
    bindTouch(on, pos) {
      const cv = this.canvas, doc = document;
      const setPointer = (x, y) => { this.mouse.sx = x; this.mouse.sy = y; this.mouse.in = true; this.updateHover(); };
      on(cv, 'pointerdown', (e) => {
        if (e.pointerType !== 'touch') return;
        e.preventDefault();
        try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        Audio.init(); Audio.startMusic();
        doc.body.classList.add('touch');
        this.touchAt = performance.now();
        const [x, y] = pos(e);
        const t = { id: e.pointerId, x, y, px: x, py: y, x0: x, y0: y, moved: false, long: false, timer: 0 };
        this.touches.set(e.pointerId, t);
        if (this.touches.size === 1) t.timer = setTimeout(() => this.touchLong(t), 480);
        else {
          for (const o of this.touches.values()) { clearTimeout(o.timer); o.moved = true; }
          this.drag = null;
          const [a, b] = [...this.touches.values()];
          this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
        }
      });
      on(cv, 'pointermove', (e) => {
        if (e.pointerType !== 'touch') return;
        const t = this.touches.get(e.pointerId);
        if (!t) return;
        e.preventDefault();
        this.touchAt = performance.now();
        const [x, y] = pos(e);
        t.px = t.x; t.py = t.y; t.x = x; t.y = y;
        if (this.touches.size >= 2 && this.pinch) {
          const [a, b] = [...this.touches.values()];
          const d = Math.hypot(a.x - b.x, a.y - b.y) || 1, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
          this.r.setView(this.cam);
          this.panBy(mx - this.pinch.mx, my - this.pinch.my);
          this.zoomAt(mx, my, d / this.pinch.d);
          this.pinch = { d, mx, my };
          return;
        }
        if (!t.moved && Math.hypot(x - t.x0, y - t.y0) > 12) { t.moved = true; clearTimeout(t.timer); }
        if (!t.moved) return;
        if (this.placing || this.mode === 'sw') setPointer(x, y - 56);   // the aim point sits above the finger
        else if (this.boxMode) this.drag = { x0: t.x0, y0: t.y0, x1: x, y1: y, active: true };
        else { this.r.setView(this.cam); this.panBy(x - t.px, y - t.py); }
      });
      const end = (e) => {
        if (e.pointerType !== 'touch') return;
        const t = this.touches.get(e.pointerId);
        if (!t) return;
        clearTimeout(t.timer);
        this.touches.delete(e.pointerId);
        this.touchAt = performance.now();
        if (this.touches.size === 0) this.pinch = null;
        if (e.type === 'pointercancel') { this.drag = null; return; }
        if (this.boxMode && this.drag && this.drag.active) { this.leftUp(false, false); this.boxMode = false; return; }
        if (!t.moved && !t.long && this.touches.size === 0) this.touchTap(t);
      };
      on(cv, 'pointerup', end); on(cv, 'pointercancel', end);

      // big scroll pads along the edges of the map area
      doc.querySelectorAll('#panPads [data-pad]').forEach((el) => {
        const dir = el.dataset.pad.split(',').map(Number);
        on(el, 'pointerdown', (e) => { e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } this.pad = dir; el.classList.add('on'); doc.body.classList.add('touch'); this.touchAt = performance.now(); Audio.init(); });
        const off = () => { this.pad = [0, 0]; el.classList.remove('on'); };
        on(el, 'pointerup', off); on(el, 'pointercancel', off); on(el, 'lostpointercapture', off);
      });
      // on-screen buttons
      const btn = (id, fn) => { const b = doc.getElementById(id); if (b) on(b, 'click', fn); };
      btn('tbBox', () => this.setBoxMode(!this.boxMode));
      btn('tbAmove', () => { if (this.selUnits().some((u) => u.def.wp)) this.setMode(this.mode === 'amove' ? null : 'amove'); });
      btn('tbStop', () => this.stopSel());
      btn('tbHome', () => this.goHome());
      btn('tbClear', () => { this.sel.clear(); this.ui.selectionChanged(this); });
      btn('tbOk', () => this.leftDown(false));
      btn('tbCancel', () => this.cancelAction());
    }
    touchLong(t) {
      if (!this.touches.has(t.id) || t.moved) return;
      t.long = true;
      setPointerFor(this, t.x, t.y);
      if (this.placing || this.mode === 'sw') return;
      const e = this.hoverId ? this.ents.get(this.hoverId) : null;
      if (e && e.owner === this.me && !e.isB) {           // long-press a unit: select every unit of that type on screen
        this.drag = { x0: t.x, y0: t.y, x1: t.x, y1: t.y, active: false };
        this.leftUp(false, true);
        return;
      }
      const ids = this.selUnits().map((u) => u.id);
      if (!ids.length) return;
      const wx = Math.max(1, Math.min(W - 1, this.mouse.wx)), wy = Math.max(1, Math.min(H - 1, this.mouse.wy));
      if (this.hoverRock >= 0) this.orderAt(wx, wy, null, false, this.hoverRock);
      else { this.send({ type: 'amove', ids, x: wx, y: wy }); this.mark(wx, wy, 'attack'); Audio.play('order', 0.8); }
    }
    touchTap(t) {
      setPointerFor(this, t.x0, t.y0);
      const now = performance.now();
      const dbl = !!(this.lastTap && now - this.lastTap.t < 320 && Math.hypot(t.x0 - this.lastTap.x, t.y0 - this.lastTap.y) < 30);
      this.lastTap = { t: now, x: t.x0, y: t.y0 };
      if (this.placing || this.mode === 'sw') return;     // aim only; the confirm button places / fires
      if (this.mode) { this.leftDown(false); return; }     // attack-move / sell / repair act on tap
      const e = this.hoverId ? this.ents.get(this.hoverId) : null;
      if (!e) {
        const wx = Math.max(1, Math.min(W - 1, this.mouse.wx)), wy = Math.max(1, Math.min(H - 1, this.mouse.wy));
        if (this.selUnits().length || this.selBuildings().some((b) => b.type === 'barracks' || b.type === 'factory')) { this.orderAt(wx, wy, null, false, this.hoverRock); return; }
      }
      this.drag = { x0: t.x0, y0: t.y0, x1: t.x0, y1: t.y0, active: false };
      this.leftUp(false, dbl);
    }
    unbind() { for (const k of Object.keys(this._h)) { const [t, ev, fn, o] = this._h[k]; t.removeEventListener(ev, fn, o); } this._h = {}; }

    leftDown(shift) {
      if (this.placing) {
        if (this.placing.tx != null) {
          if (this.placing.ok) this.send({ type: 'place', item: this.placing.type, x: this.placing.tx, y: this.placing.ty });
          else { Audio.play('error', 1); this.ui.toast('Cannot build here.', 'bad'); }
        }
        return;
      }
      const wx = this.mouse.wx, wy = this.mouse.wy;
      if (this.mode === 'sw') {
        this.send({ type: 'sw', x: wx, y: wy });
        this.setMode(null);
        return;
      }
      if (this.mode === 'amove') {
        const ids = this.selUnits().map((u) => u.id);
        if (this.hoverRock >= 0) this.orderAt(wx, wy, null, shift, this.hoverRock);
        else if (ids.length) { this.send({ type: 'amove', ids, x: wx, y: wy }); this.mark(wx, wy, 'attack'); Audio.play('order', 0.8); }
        this.setMode(null);
        return;
      }
      const e = this.hoverId ? this.ents.get(this.hoverId) : null;
      if (this.mode === 'sell') {
        if (e && e.isB && e.owner === this.me) this.send({ type: 'sell', id: e.id });
        return;
      }
      if (this.mode === 'repair') {
        if (e && e.isB && e.owner === this.me) this.send({ type: 'repair', id: e.id });
        return;
      }
      this.drag = { x0: this.mouse.sx, y0: this.mouse.sy, x1: this.mouse.sx, y1: this.mouse.sy, active: false };
    }
    leftUp(shift, dbl) {
      const d = this.drag; this.drag = null;
      if (!d) return;
      if (d.active) {
        const x0 = Math.min(d.x0, d.x1), x1 = Math.max(d.x0, d.x1), y0 = Math.min(d.y0, d.y1), y1 = Math.max(d.y0, d.y1);
        const v = this.r.v, P = GA.drawHelpers.P;
        this.r.setView(this.cam);
        const picked = [];
        for (const e of this.ents.values()) {
          if (e.isB || e.owner !== this.me) continue;
          const [sx, sy] = P(v, e.rx, e.ry, e.def.fly ? 1.6 : 0.3);
          if (sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1) picked.push(e.id);
        }
        if (!shift) this.sel.clear();
        for (const id of picked) this.sel.add(id);
        if (picked.length) Audio.play('select', 0.7);
      } else {
        const e = this.pick(d.x0, d.y0);
        if (e && e.owner === this.me) {
          if (dbl && !e.isB) {
            // select all of same type on screen
            const v = this.r.v, P = GA.drawHelpers.P;
            this.sel.clear();
            for (const o of this.ents.values()) {
              if (o.isB || o.owner !== this.me || o.type !== e.type) continue;
              const [sx, sy] = P(v, o.rx, o.ry, 0);
              if (sx > 0 && sx < this.r.w && sy > 0 && sy < this.r.h) this.sel.add(o.id);
            }
          } else if (shift) { if (this.sel.has(e.id)) this.sel.delete(e.id); else { if (e.isB) this.sel.clear(); this.sel.add(e.id); } }
          else { this.sel.clear(); this.sel.add(e.id); }
          Audio.play('select', 0.7);
        } else if (e && this.players[e.owner].neutral && !this.selUnits().length) {
          this.sel.clear(); this.sel.add(e.id); Audio.play('select', 0.7);
        } else if (e && this.isEnemy(e)) {
          // enemy click with units selected = attack
          if (this.selUnits().length) this.orderAt(this.mouse.wx, this.mouse.wy, e, shift);
          else { this.sel.clear(); }
        } else if (!shift) this.sel.clear();
      }
      this.ui.selectionChanged(this);
    }
    rightClick(shift) {
      if (this.placing) { this.placing = null; this.ui.update(this); return; }
      if (this.mode) { this.setMode(null); return; }
      const e = this.hoverId ? this.ents.get(this.hoverId) : null;
      const wx = Math.max(1, Math.min(W - 1, this.mouse.wx)), wy = Math.max(1, Math.min(H - 1, this.mouse.wy));
      this.orderAt(wx, wy, e, shift, e ? -1 : this.hoverRock);
    }
    keyDown(e) {
      if (this.ui.typing()) return;
      const k = e.key;
      this.keys.add(k);
      if (k === 'Escape') {
        if (this.placing) this.placing = null;
        else if (this.mode) this.setMode(null);
        else if (this.sel.size) { this.sel.clear(); this.ui.selectionChanged(this); }
        else this.ui.togglePause();
        return;
      }
      if (k === 'Enter') { this.ui.openChat(); e.preventDefault(); return; }
      if (e.ctrlKey || e.metaKey) {
        if (/^[1-9]$/.test(k)) {
          e.preventDefault();
          const ids = Array.from(this.sel);
          this.groups[k] = ids;
          this.rebuildGroupOf();
          this.ui.toast(`Group ${k} set (${ids.length})`, 'info');
        }
        return;
      }
      if (/^[1-9]$/.test(k)) {
        const ids = (this.groups[k] || []).filter((id) => this.ents.has(id));
        if (ids.length) {
          const now = performance.now();
          if (this.lastGroup === k && now - this.lastGroupAt < 400) { const u = this.ents.get(ids[0]); this.centerOn(u.isB ? u.x : u.rx, u.isB ? u.y : u.ry); }
          this.lastGroup = k; this.lastGroupAt = now;
          this.sel = new Set(ids);
          this.ui.selectionChanged(this);
          Audio.play('select', 0.7);
        }
        return;
      }
      switch (k.toLowerCase()) {
        case 'a': if (this.selUnits().some((u) => u.def.wp)) this.setMode(this.mode === 'amove' ? null : 'amove'); break;
        case 's': this.stopSel(); break;
        case 'd': this.deploySel(); break;
        case 'h': this.goHome(); break;
        case 'r': this.setMode(this.mode === 'repair' ? null : 'repair'); break;
        case 'x': this.setMode(this.mode === 'sell' ? null : 'sell'); break;
        case 'b': this.showBars = !this.showBars; break;
        case ' ': if (this.lastAlertPos) this.centerOn(this.lastAlertPos.x, this.lastAlertPos.y); e.preventDefault(); break;
        case 'tab': this.ui.nextTab(); e.preventDefault(); break;
      }
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(k)) e.preventDefault();
    }
    rebuildGroupOf() {
      this.groupOf.clear();
      for (const [k, ids] of Object.entries(this.groups)) for (const id of ids) this.groupOf.set(id, k);
    }
    minimapPos(mx, my, cw) {
      const ms = cw / (2 * W);
      const u = (mx - cw / 2) / ms, v = my / (ms * 0.5);
      return [(u + v) / 2, (v - u) / 2];
    }
    destroy() { this.unbind(); }
  }

  GA.Game = Game;
})();

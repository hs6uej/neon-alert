// Skirmish bot. Plays through the same command API as human players.
(function () {
  'use strict';
  const GA = globalThis.GA;
  const { DEFS, W, H } = GA;

  const pickWeighted = (list) => {
    let tot = 0;
    for (const [, w] of list) tot += w;
    let r = Math.random() * tot;
    for (const [t, w] of list) { r -= w; if (r <= 0) return t; }
    return list.length ? list[0][0] : null;
  };

  class Bot {
    constructor(sim, p, level) {
      this.sim = sim; this.p = p; this.level = level;
      this.lv = GA.BOT_LEVELS[level] || GA.BOT_LEVELS.normal;
      this.timer = 0.5 + Math.random() * 1.5;
      this.wave = null;
      this.lastDefend = -99;
    }
    update(dt) {
      this.timer -= dt;
      if (this.timer > 0) return;
      this.timer = this.lv.think * (0.8 + Math.random() * 0.4);
      this.think();
    }
    cmd(c) { this.sim.cmd(this.p.id, c); }
    base() {
      let best = null;
      for (const b of this.sim.buildings.values()) {
        if (b.owner !== this.p.id) continue;
        if (b.type === 'conyard') return b;
        if (!best) best = b;
      }
      return best;
    }
    think() {
      if (!this.p.alive) return;
      this.structures();
      this.produce();
      this.army();
      this.misc();
    }

    // ---------------------------------------------------------- structures
    structures() {
      const s = this.sim, p = this.p, q = p.q.structure;
      if (q[0] && q[0].ready) { this.placeBuilding(q[0].type); return; }
      if (q.length) return;
      const t = this.nextStructure();
      if (t && s.canQueue(p.id, t)) this.cmd({ type: 'queue', item: t });
    }
    nextStructure() {
      const p = this.p, c = p.counts, time = this.sim.time, cr = p.credits, lv = this.level;
      const margin = p.pwrProd - p.pwrUse;
      if (!c.power) return 'power';
      if (margin < 45) return 'power';
      if (!c.refinery) return 'refinery';
      if (!c.barracks) return 'barracks';
      if (!c.factory) return 'factory';
      if (c.refinery < 2 && time > this.lv.delay * 0.5) return 'refinery';
      if (!c.radar) return 'radar';
      const wantTurrets = lv === 'easy' ? 1 : Math.min(6, 1 + Math.floor(time / 220));
      if ((c.turret || 0) < wantTurrets) return 'turret';
      if (!c.techlab && (lv !== 'easy' || time > 500)) return 'techlab';
      if (c.factory < 2 && cr > 2200) return 'factory';
      if (c.barracks < 2 && cr > 1200) return 'barracks';
      if (c.refinery < 3 && cr > 2500) return 'refinery';
      if (c.techlab && !c.uplink && cr > 4500 && lv !== 'easy') return 'uplink';
      if (cr > 4000 && (c.turret || 0) < 10) return 'turret';
      return null;
    }
    placeBuilding(type) {
      const site = this.findSite(type);
      if (site) this.cmd({ type: 'place', item: type, x: site[0], y: site[1] });
      else this.cmd({ type: 'cancel', cat: 'structure', index: 0 });
    }
    findSite(type) {
      const s = this.sim, def = DEFS[type];
      const base = this.base();
      if (!base) return null;
      let oreTarget = null;
      if (type === 'refinery') {
        let bd = 1e9;
        for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
          if (s.ore[y * W + x] <= 0) continue;
          const d = (x - base.x) ** 2 + (y - base.y) ** 2;
          if (d < bd) { bd = d; oreTarget = [x, y]; }
        }
      }
      let dir = [0, 0];
      if (type === 'turret') {
        let bd = 1e9, e = null;
        for (const b of s.buildings.values()) if (s.foe(this.p.id, b.owner)) {
          const d = (b.x - base.x) ** 2 + (b.y - base.y) ** 2;
          if (d < bd) { bd = d; e = b; }
        }
        if (e) { const l = Math.hypot(e.x - base.x, e.y - base.y) || 1; dir = [(e.x - base.x) / l, (e.y - base.y) / l]; }
      }
      const roomy = (x, y) => {
        for (let j = y - 1; j <= y + def.h; j++) for (let i = x - 1; i <= x + def.w; i++) {
          if (i < 0 || j < 0 || i >= W || j >= H) return false;
          if (s.occ[j * W + i] !== 0) return false;
          if (s.terrain[j * W + i] === 1 && type !== 'turret') return false;
        }
        return true;
      };
      let best = null, bs = 1e9;
      for (let k = 0; k < 320; k++) {
        const a = Math.random() * Math.PI * 2;
        const r = 4 + Math.random() * (type === 'turret' ? 15 : 12);
        const x = Math.round(base.x + Math.cos(a) * r - def.w / 2), y = Math.round(base.y + Math.sin(a) * r - def.h / 2);
        if (!s.canPlace(this.p.id, type, x, y) || !roomy(x, y)) continue;
        const cx = x + def.w / 2, cy = y + def.h / 2;
        let sc = Math.hypot(cx - base.x, cy - base.y) + Math.random() * 2;
        if (oreTarget) sc = Math.hypot(cx - oreTarget[0], cy - oreTarget[1]) * 1.5 + sc * 0.3;
        if (type === 'turret') sc = Math.hypot(cx - (base.x + dir[0] * 9), cy - (base.y + dir[1] * 9)) + Math.random() * 3;
        if (sc < bs) { bs = sc; best = [x, y]; }
      }
      return best;
    }

    // ---------------------------------------------------------- unit production
    produce() {
      const s = this.sim, p = this.p, c = p.counts;
      let hv = 0, army = 0;
      for (const u of s.units.values()) if (u.owner === p.id) { if (u.def.harvester) hv++; else if (u.def.wp) army++; }
      for (const it of p.q.vehicle) if (it.type === 'harvester') hv++;
      const qv = p.q.vehicle, qi = p.q.infantry;
      if (army > 70) return;
      if (c.factory && qv.length < 2) {
        let t = null;
        if (c.refinery && hv < Math.min(5, c.refinery * 2) && (hv < 1 || p.credits > 900)) t = 'harvester';
        else {
          const list = [];
          const add = (type, w) => { if (s.canQueue(p.id, type) && DEFS[type].cost <= p.credits + 600) list.push([type, w]); };
          add('hover', 1); add('arc', 3); add('nova', 1.2); add('wasp', 0.7); add('rail', 2); add('titan', 1.4);
          t = pickWeighted(list);
        }
        if (t && s.canQueue(p.id, t)) this.cmd({ type: 'queue', item: t });
      }
      if (c.barracks && qi.length < 2) {
        const list = [];
        const add = (type, w) => { if (s.canQueue(p.id, type)) list.push([type, w]); };
        add('trooper', 3); add('lancer', 2);
        const t = pickWeighted(list);
        if (t) this.cmd({ type: 'queue', item: t });
      }
    }

    // ---------------------------------------------------------- army
    army() {
      const s = this.sim, p = this.p;
      const base = this.base();
      if (!base) return;
      const army = [];
      for (const u of s.units.values()) if (u.owner === p.id && u.def.wp) army.push(u);

      // defend when something is hitting us
      const la = p.lastAttacked;
      if (la && s.time - la.time < 6 && s.time - this.lastDefend > 3) {
        this.lastDefend = s.time;
        const ids = [];
        for (const u of army) {
          if (u.order && u.order.type === 'attack') continue;
          if (Math.hypot(u.x - base.x, u.y - base.y) < 32 || (this.wave && Math.hypot(u.x - la.x, u.y - la.y) < 20)) ids.push(u.id);
        }
        if (ids.length) this.cmd({ type: 'amove', ids, x: la.x, y: la.y });
      }

      const thresh = Math.min(40, this.lv.waveMin + Math.floor(Math.max(0, s.time - this.lv.delay) / 120) * this.lv.waveGrow);
      if (!this.wave) {
        if (s.time > this.lv.delay && army.length >= thresh) {
          const enemy = this.pickEnemy(base);
          if (enemy) this.wave = { enemy: enemy.id, at: s.time };
        }
      }
      if (this.wave) {
        const enemy = s.players[this.wave.enemy];
        if (!enemy.alive) { const e2 = this.pickEnemy(base); if (e2) this.wave.enemy = e2.id; else this.wave = null; }
        if (this.wave && army.length < Math.max(3, thresh * 0.25)) this.wave = null;
      }
      if (this.wave) {
        const home = [], away = [];
        for (const u of army) {
          if (u.order) continue;
          if (Math.hypot(u.x - base.x, u.y - base.y) < 16) home.push(u); else away.push(u);
        }
        const send = (list) => {
          if (!list.length) return;
          // group by nearest enemy building to the group's centre
          let cx = 0, cy = 0;
          for (const u of list) { cx += u.x; cy += u.y; }
          cx /= list.length; cy /= list.length;
          const tgt = this.pickTargetBuilding(cx, cy, this.wave.enemy);
          if (!tgt) { this.wave = null; return; }
          this.cmd({ type: 'amove', ids: list.map((u) => u.id), x: tgt.x, y: tgt.y });
        };
        if (home.length >= 4 || (home.length && army.length - home.length < 3)) send(home);
        send(away);
      }
    }
    pickEnemy(base) {
      const s = this.sim;
      let best = null, bs = 1e9;
      for (const q of s.players) {
        if (!q.alive || !s.hostile(this.p.id, q.id)) continue;
        let cy = null;
        for (const b of s.buildings.values()) if (b.owner === q.id) { if (!cy || b.type === 'conyard') cy = b; }
        if (!cy) continue;
        const sc = Math.hypot(cy.x - base.x, cy.y - base.y) + Math.random() * 12;
        if (sc < bs) { bs = sc; best = q; }
      }
      return best;
    }
    pickTargetBuilding(x, y, enemyId) {
      const s = this.sim;
      let best = null, bs = 1e9;
      for (const b of s.buildings.values()) {
        if (b.owner !== enemyId) continue;
        const sc = Math.hypot(b.x - x, b.y - y) - (b.type === 'conyard' ? 6 : 0);
        if (sc < bs) { bs = sc; best = b; }
      }
      if (best) return best;
      for (const u of s.units.values()) if (u.owner === enemyId) return u;
      return null;
    }

    // ---------------------------------------------------------- misc
    misc() {
      const s = this.sim, p = this.p;
      const base = this.base();
      if (!base) {
        for (const u of s.units.values()) if (u.owner === p.id && u.def.mcv && !u.order) this.cmd({ type: 'deploy', ids: [u.id] });
        return;
      }
      for (const b of s.buildings.values()) {
        if (b.owner !== p.id) continue;
        if ((b.type === 'barracks' || b.type === 'factory') && !b.rally) {
          const dx = W / 2 - base.x, dy = H / 2 - base.y, l = Math.hypot(dx, dy) || 1;
          let rx = base.x + (dx / l) * 8 + (Math.random() - 0.5) * 4, ry = base.y + (dy / l) * 8 + (Math.random() - 0.5) * 4;
          const n = s.nearestPassable(Math.floor(rx), Math.floor(ry), 6);
          if (n) this.cmd({ type: 'rally', id: b.id, x: n[0] + 0.5, y: n[1] + 0.5 });
        }
        if (this.level !== 'easy' && !b.repair && b.hp < b.mhp * 0.7 && p.credits > 500) this.cmd({ type: 'repair', id: b.id });
      }
      if (p.sw.ready) {
        let best = null, bs = -1;
        for (const b of s.buildings.values()) {
          if (!s.foe(p.id, b.owner)) continue;
          let n = 0;
          for (const o of s.buildings.values()) if (s.foe(p.id, o.owner) && Math.hypot(o.x - b.x, o.y - b.y) < 4.5) n++;
          n += b.type === 'conyard' ? 1 : 0;
          if (n > bs) { bs = n; best = b; }
        }
        if (best) this.cmd({ type: 'sw', x: best.x, y: best.y });
      }
    }
  }
  GA.Bot = Bot;
})();

// Admin-editable configuration layer on top of data.js.
// Overrides are a plain JSON object: { defs:{type:{field:value}}, weapons:{}, mult:{}, bots:{}, settings:{} }
// Shared by the server (validation + persistence), the browser (applied at login / game start) and the admin page.
(function () {
  'use strict';
  const GA = globalThis.GA;
  const clone = (o) => JSON.parse(JSON.stringify(o));

  // Snapshot of the built-in defaults, taken before any override is applied.
  GA.BASE = { defs: {}, weapons: clone(GA.WEAPONS), mult: clone(GA.MULT), bots: clone(GA.BOT_LEVELS), settings: clone(GA.SETTINGS) };
  const DEF_FIELDS = ['name', 'desc', 'cost', 'time', 'hp', 'speed', 'power', 'vision', 'armor', 'weapon', 'req', 'capacity'];
  for (const t of GA.TYPES) {
    const d = GA.DEFS[t], b = {};
    for (const f of DEF_FIELDS) if (d[f] !== undefined) b[f] = clone(d[f]);
    GA.BASE.defs[t] = b;
  }

  const ARMORS = ['inf', 'light', 'heavy', 'bld', 'air'];
  const num = (min, max, step, label, hint) => ({ t: 'num', min, max, step: step || 1, label, hint });
  GA.SCHEMA = {
    armors: ARMORS,
    targets: ['ground', 'air', 'both'],
    wtypes: Object.keys(GA.MULT),
    projs: ['bolt', 'rocket', 'plasma', 'shell', 'rail'],
    defs: {
      name: { t: 'str', max: 24, label: 'Name' },
      desc: { t: 'str', max: 120, label: 'Description' },
      cost: num(0, 20000, 10, 'Cost'),
      time: num(1, 600, 1, 'Build time (s)'),
      hp: num(1, 20000, 10, 'Hit points'),
      speed: num(0.2, 12, 0.1, 'Speed (tiles/s)'),
      power: num(-500, 500, 5, 'Power (+ makes, - uses)'),
      vision: num(2, 25, 0.5, 'Vision'),
      armor: { t: 'enum', values: ARMORS, label: 'Armor' },
      weapon: { t: 'enum', values: [''].concat(Object.keys(GA.WEAPONS)), label: 'Weapon' },
      req: { t: 'req', label: 'Requires (comma separated buildings)' },
      capacity: num(100, 5000, 50, 'Ore capacity'),
    },
    weapons: {
      dmg: num(0, 5000, 1, 'Damage'),
      cd: num(0.05, 30, 0.05, 'Cooldown (s)'),
      range: num(1, 30, 0.5, 'Range'),
      splash: num(0, 10, 0.1, 'Splash radius'),
      speed: num(0, 80, 1, 'Projectile speed (0 = beam)'),
      wtype: { t: 'enum', values: Object.keys(GA.MULT), label: 'Damage class' },
      targets: { t: 'enum', values: ['ground', 'air', 'both'], label: 'Targets' },
      proj: { t: 'enum', values: ['bolt', 'rocket', 'plasma', 'shell', 'rail'], label: 'Visual' },
    },
    mult: num(0, 5, 0.05, 'Multiplier'),
    bots: {
      think: num(0.1, 10, 0.1, 'Think interval (s)'),
      speed: num(0.2, 3, 0.05, 'Production speed x'),
      income: num(0.2, 5, 0.05, 'Income x'),
      waveMin: num(1, 100, 1, 'First wave size'),
      waveGrow: num(0, 20, 1, 'Wave growth / 2 min'),
      delay: num(0, 3600, 10, 'First attack (s)'),
    },
    settings: {
      startCredits: num(0, 200000, 500, 'Default start credits'),
      harvestRate: num(1, 1000, 1, 'Harvest rate (credits/s)'),
      unloadRate: num(10, 5000, 10, 'Unload rate (credits/s)'),
      swCharge: num(5, 3600, 5, 'Orbital Lance charge time (s)'),
      lanceDamage: num(0, 20000, 50, 'Orbital Lance damage'),
      lanceRadius: num(0.5, 15, 0.1, 'Orbital Lance radius'),
      lanceDelay: num(0.5, 15, 0.1, 'Orbital Lance delay (s)'),
      repairRate: num(0.001, 1, 0.005, 'Repair speed (fraction of HP/s)'),
      sellRefund: num(0, 1, 0.05, 'Sell refund (fraction of cost)'),
      buildRadius: num(1, 12, 1, 'Build radius (tiles)'),
      lowPowerMin: num(0.05, 1, 0.05, 'Min. production speed on low power'),
      multiProdBonus: num(0, 2, 0.05, 'Bonus per extra Barracks / Forge'),
    },
  };

  const clampNum = (v, sc) => {
    v = Number(v);
    if (!Number.isFinite(v)) return null;
    return Math.min(sc.max, Math.max(sc.min, v));
  };
  const isBuilding = (t) => GA.DEFS[t] && GA.DEFS[t].kind === 'b';

  // Returns a cleaned copy of `raw` containing only known, in-range values that differ from the defaults.
  GA.cleanConfig = function (raw) {
    const out = { defs: {}, weapons: {}, mult: {}, bots: {}, settings: {} };
    if (!raw || typeof raw !== 'object') return out;
    const diff = (a, b) => JSON.stringify(a) !== JSON.stringify(b);
    for (const [t, fields] of Object.entries(raw.defs || {})) {
      if (!GA.BASE.defs[t] || !fields || typeof fields !== 'object') continue;
      const base = GA.BASE.defs[t];
      for (const [f, v] of Object.entries(fields)) {
        const sc = GA.SCHEMA.defs[f];
        if (!sc || base[f] === undefined && f !== 'weapon') continue;
        let val = null;
        if (sc.t === 'num') val = clampNum(v, sc);
        else if (sc.t === 'str') val = typeof v === 'string' ? v.slice(0, sc.max).replace(/[<>]/g, '') : null;
        else if (sc.t === 'enum') val = sc.values.includes(v) ? v : null;
        else if (sc.t === 'req') {
          const arr = Array.isArray(v) ? v : String(v).split(',').map((x) => x.trim()).filter(Boolean);
          val = arr.every((x) => isBuilding(x)) ? Array.from(new Set(arr)) : null;
        }
        if (val === null) continue;
        if (t === 'conyard' && (f === 'req')) continue;
        if (diff(val, base[f] === undefined ? '' : base[f])) (out.defs[t] = out.defs[t] || {})[f] = val;
      }
    }
    for (const [k, fields] of Object.entries(raw.weapons || {})) {
      if (!GA.BASE.weapons[k] || !fields) continue;
      for (const [f, v] of Object.entries(fields)) {
        const sc = GA.SCHEMA.weapons[f];
        if (!sc || GA.BASE.weapons[k][f] === undefined && f !== 'splash') continue;
        const val = sc.t === 'num' ? clampNum(v, sc) : sc.values.includes(v) ? v : null;
        if (val === null) continue;
        if (diff(val, GA.BASE.weapons[k][f] === undefined ? 0 : GA.BASE.weapons[k][f])) (out.weapons[k] = out.weapons[k] || {})[f] = val;
      }
    }
    for (const [wt, row] of Object.entries(raw.mult || {})) {
      if (!GA.BASE.mult[wt] || !row) continue;
      for (const [ar, v] of Object.entries(row)) {
        if (GA.BASE.mult[wt][ar] === undefined) continue;
        const val = clampNum(v, GA.SCHEMA.mult);
        if (val !== null && val !== GA.BASE.mult[wt][ar]) (out.mult[wt] = out.mult[wt] || {})[ar] = val;
      }
    }
    for (const [lv, row] of Object.entries(raw.bots || {})) {
      if (!GA.BASE.bots[lv] || !row) continue;
      for (const [f, v] of Object.entries(row)) {
        const sc = GA.SCHEMA.bots[f];
        if (!sc) continue;
        const val = clampNum(v, sc);
        if (val !== null && val !== GA.BASE.bots[lv][f]) (out.bots[lv] = out.bots[lv] || {})[f] = val;
      }
    }
    for (const [f, v] of Object.entries(raw.settings || {})) {
      const sc = GA.SCHEMA.settings[f];
      if (!sc) continue;
      const val = clampNum(v, sc);
      if (val !== null && val !== GA.BASE.settings[f]) out.settings[f] = val;
    }
    return out;
  };

  // Reset everything to the defaults, then apply the (cleaned) overrides. Objects are mutated in place.
  GA.applyConfig = function (raw) {
    const cfg = GA.cleanConfig(raw);
    for (const t of GA.TYPES) {
      const d = GA.DEFS[t], b = GA.BASE.defs[t];
      for (const f of DEF_FIELDS) if (b[f] !== undefined) d[f] = clone(b[f]);
      if (b.weapon === undefined) delete d.weapon;
    }
    for (const k of Object.keys(GA.WEAPONS)) for (const f of Object.keys(GA.BASE.weapons[k])) GA.WEAPONS[k][f] = GA.BASE.weapons[k][f];
    for (const w of Object.keys(GA.MULT)) Object.assign(GA.MULT[w], GA.BASE.mult[w]);
    for (const l of Object.keys(GA.BOT_LEVELS)) Object.assign(GA.BOT_LEVELS[l], GA.BASE.bots[l]);
    Object.assign(GA.SETTINGS, GA.BASE.settings);

    for (const [t, f] of Object.entries(cfg.defs)) Object.assign(GA.DEFS[t], f);
    for (const [k, f] of Object.entries(cfg.weapons)) Object.assign(GA.WEAPONS[k], f);
    for (const [w, r] of Object.entries(cfg.mult)) Object.assign(GA.MULT[w], r);
    for (const [l, r] of Object.entries(cfg.bots)) Object.assign(GA.BOT_LEVELS[l], r);
    Object.assign(GA.SETTINGS, cfg.settings);
    for (const t of GA.TYPES) {
      const d = GA.DEFS[t];
      d.wp = d.weapon ? GA.WEAPONS[d.weapon] : undefined;
      if (!d.weapon) delete d.weapon;
      if (d.kind === 'u' && d.air) d.fly = true;
    }
    GA.CONFIG = cfg;
    return cfg;
  };
  GA.CONFIG = { defs: {}, weapons: {}, mult: {}, bots: {}, settings: {} };
})();

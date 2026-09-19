// Admin-editable configuration layer on top of data.js.
// Overrides are a plain JSON object: { defs:{type:{field:value}}, weapons:{}, mult:{}, bots:{}, settings:{} }
// Shared by the server (validation + persistence), the browser (applied at login / game start) and the admin page.
(function () {
  'use strict';
  const GA = globalThis.GA;
  const clone = (o) => JSON.parse(JSON.stringify(o));

  // Snapshot of the built-in defaults, taken before any override is applied.
  GA.BASE = { defs: {}, weapons: clone(GA.WEAPONS), mult: clone(GA.MULT), bots: clone(GA.BOT_LEVELS), settings: clone(GA.SETTINGS) };
  const DEF_FIELDS = ['name', 'desc', 'cost', 'time', 'hp', 'speed', 'power', 'vision', 'armor', 'weapon', 'req', 'capacity', 'income', 'bounty'];
  for (const t of GA.TYPES) {
    const d = GA.DEFS[t], b = {};
    for (const f of DEF_FIELDS) if (d[f] !== undefined) b[f] = clone(d[f]);
    GA.BASE.defs[t] = b;
  }

  GA.BUILTIN_TYPES = GA.TYPES.slice();
  GA.CUSTOM_TYPES = [];
  GA.CUSTOM_WEAPONS = [];
  GA.CUSTOM_LIMITS = { types: 24, weapons: 12 };
  GA.CUSTOM_TYPE_ID = /^x_[a-z0-9]{2,12}$/;
  GA.CUSTOM_WEAPON_ID = /^w_[a-z0-9]{2,12}$/;
  // types that cannot be switched off (the game cannot run without them)
  GA.PROTECTED_TYPES = ['conyard', 'power', 'refinery', 'harvester'];
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
      income: num(0, 500, 1, 'Income (credits/s when owned)'),
      bounty: num(0, 20000, 50, 'Capture bonus (credits)'),
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
    art: { s: num(0.3, 3, 0.05, 'Picture size'), y: num(-0.6, 0.6, 0.01, 'Picture height'), f: num(1, 8, 1, 'Animation frames') },
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
      rockHp: num(50, 20000, 50, 'Rock wall hit points'),
      rockSplash: num(0, 1, 0.05, 'Splash damage to rocks (fraction)'),
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
    const out = { defs: {}, weapons: {}, mult: {}, bots: {}, settings: {}, custom: { types: {}, weapons: {} }, disabled: [], art: {} };
    if (!raw || typeof raw !== 'object') return out;
    const diff = (a, b) => JSON.stringify(a) !== JSON.stringify(b);
    const rawCustom = raw.custom && typeof raw.custom === 'object' ? raw.custom : {};

    // ---- custom weapons: a copy of a built-in weapon with its own numbers
    for (const id of Object.keys(rawCustom.weapons || {}).sort().slice(0, GA.CUSTOM_LIMITS.weapons)) {
      const w = rawCustom.weapons[id];
      if (!GA.CUSTOM_WEAPON_ID.test(id) || !w || typeof w !== 'object' || !GA.BASE.weapons[w.base]) continue;
      const clean = { base: w.base };
      for (const f of Object.keys(GA.SCHEMA.weapons)) {
        const sc = GA.SCHEMA.weapons[f];
        const v = w[f] !== undefined ? w[f] : GA.BASE.weapons[w.base][f];
        const val = v === undefined ? null : sc.t === 'num' ? clampNum(v, sc) : sc.values.includes(v) ? v : null;
        if (val !== null) clean[f] = val;
      }
      if (typeof w.label === 'string') clean.label = w.label.replace(/[<>]/g, '').slice(0, 24);
      out.custom.weapons[id] = clean;
    }
    const weaponIds = Object.keys(GA.BASE.weapons).concat(Object.keys(out.custom.weapons));

    // ---- custom buildings / units: a copy of a built-in type with its own name and numbers
    const cTypes = {};
    for (const id of Object.keys(rawCustom.types || {}).sort().slice(0, GA.CUSTOM_LIMITS.types)) {
      const t = rawCustom.types[id];
      const bd = t && GA.BASE.defs[t.base] && GA.DEFS[t.base];
      if (!GA.CUSTOM_TYPE_ID.test(id) || !bd || bd.neutral || t.base === 'conyard') continue;
      cTypes[id] = { raw: t, kind: bd.kind };
    }
    const buildingIds = GA.BUILTIN_TYPES.filter((x) => GA.DEFS[x].kind === 'b' && !GA.DEFS[x].neutral).concat(Object.keys(cTypes).filter((x) => cTypes[x].kind === 'b'));
    for (const id of Object.keys(cTypes)) {
      const t = cTypes[id].raw, clean = { base: t.base };
      for (const f of Object.keys(GA.SCHEMA.defs)) {
        if (t[f] === undefined) continue;
        const sc = GA.SCHEMA.defs[f];
        let val = null;
        if (sc.t === 'num') val = clampNum(t[f], sc);
        else if (sc.t === 'str') val = typeof t[f] === 'string' ? t[f].slice(0, sc.max).replace(/[<>]/g, '') : null;
        else if (f === 'weapon') val = t[f] === '' || weaponIds.includes(t[f]) ? t[f] : null;
        else if (sc.t === 'enum') val = sc.values.includes(t[f]) ? t[f] : null;
        else if (sc.t === 'req') {
          const arr = Array.isArray(t[f]) ? t[f] : String(t[f]).split(',').map((x) => x.trim()).filter(Boolean);
          val = arr.every((x) => x !== id && buildingIds.includes(x)) ? Array.from(new Set(arr)) : null;
        }
        if (val !== null) clean[f] = val;
      }
      if (!clean.name || !clean.name.trim()) clean.name = id;
      out.custom.types[id] = clean;
    }
    const allIds = GA.BUILTIN_TYPES.concat(Object.keys(out.custom.types));
    out.disabled = Array.from(new Set(Array.isArray(raw.disabled) ? raw.disabled : [])).filter((x) => allIds.includes(x) && !GA.PROTECTED_TYPES.includes(x)).sort();
    // ---- pictures (files live on the server: /art/<type>-<version>.png). Only the reference and the placement are stored here.
    for (const [id, a] of Object.entries(raw.art && typeof raw.art === 'object' ? raw.art : {})) {
      if (!allIds.includes(id) || !a || typeof a !== 'object' || !Number.isSafeInteger(a.v) || a.v < 1 || a.v > 9999999999999) continue;
      const s = clampNum(a.s === undefined ? 1 : a.s, GA.SCHEMA.art.s), y = clampNum(a.y === undefined ? 0 : a.y, GA.SCHEMA.art.y);
      const f = clampNum(a.f === undefined ? 1 : a.f, GA.SCHEMA.art.f);
      out.art[id] = { v: a.v, s: Math.round((s === null ? 1 : s) * 100) / 100, y: Math.round((y === null ? 0 : y) * 100) / 100, f: f === null ? 1 : Math.round(f) };
    }
    for (const [t, fields] of Object.entries(raw.defs || {})) {
      if (!GA.BASE.defs[t] || !fields || typeof fields !== 'object') continue;
      const base = GA.BASE.defs[t];
      for (const [f, v] of Object.entries(fields)) {
        const sc = GA.SCHEMA.defs[f];
        if (!sc || base[f] === undefined && f !== 'weapon') continue;
        let val = null;
        if (sc.t === 'num') val = clampNum(v, sc);
        else if (sc.t === 'str') val = typeof v === 'string' ? v.slice(0, sc.max).replace(/[<>]/g, '') : null;
        else if (f === 'weapon') val = v === '' || weaponIds.includes(v) ? v : null;
        else if (sc.t === 'enum') val = sc.values.includes(v) ? v : null;
        else if (sc.t === 'req') {
          const arr = Array.isArray(v) ? v : String(v).split(',').map((x) => x.trim()).filter(Boolean);
          val = arr.every((x) => isBuilding(x) || buildingIds.includes(x)) ? Array.from(new Set(arr)) : null;
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
    // forget the previous custom weapons / types first
    for (const id of GA.CUSTOM_TYPES) delete GA.DEFS[id];
    for (const id of GA.CUSTOM_WEAPONS) delete GA.WEAPONS[id];
    GA.CUSTOM_TYPES = []; GA.CUSTOM_WEAPONS = [];
    for (const t of GA.BUILTIN_TYPES) {
      const d = GA.DEFS[t], b = GA.BASE.defs[t];
      for (const f of DEF_FIELDS) if (b[f] !== undefined) d[f] = clone(b[f]);
      if (b.weapon === undefined) delete d.weapon;
      delete d.art;
    }
    for (const k of Object.keys(GA.WEAPONS)) for (const f of Object.keys(GA.BASE.weapons[k])) GA.WEAPONS[k][f] = GA.BASE.weapons[k][f];
    for (const w of Object.keys(GA.MULT)) Object.assign(GA.MULT[w], GA.BASE.mult[w]);
    for (const l of Object.keys(GA.BOT_LEVELS)) Object.assign(GA.BOT_LEVELS[l], GA.BASE.bots[l]);
    Object.assign(GA.SETTINGS, GA.BASE.settings);

    for (const [id, a] of Object.entries(cfg.art)) if (GA.DEFS[id] && GA.BASE.defs[id]) GA.DEFS[id].art = { id, v: a.v, s: a.s, y: a.y, f: a.f };
    for (const [t, f] of Object.entries(cfg.defs)) Object.assign(GA.DEFS[t], f);
    for (const [k, f] of Object.entries(cfg.weapons)) Object.assign(GA.WEAPONS[k], f);
    for (const [w, r] of Object.entries(cfg.mult)) Object.assign(GA.MULT[w], r);
    for (const [l, r] of Object.entries(cfg.bots)) Object.assign(GA.BOT_LEVELS[l], r);
    Object.assign(GA.SETTINGS, cfg.settings);
    // custom weapons, then custom types (copies of the possibly edited built-ins they are based on)
    for (const [id, w] of Object.entries(cfg.custom.weapons)) {
      const { base, label, ...fields } = w;
      GA.WEAPONS[id] = Object.assign(clone(GA.WEAPONS[base]), fields);
      GA.CUSTOM_WEAPONS.push(id);
    }
    for (const [id, t] of Object.entries(cfg.custom.types)) {
      const { base, ...fields } = t, src = GA.DEFS[base], d = clone(src);
      delete d.wp; delete d.fly; delete d.neutral; delete d.art;
      Object.assign(d, fields);
      // a copy looks like the type it was made from (including that type's picture) unless it gets a picture of its own
      const own = cfg.art[id];
      if (own) d.art = { id, v: own.v, s: own.s, y: own.y, f: own.f }; else if (src.art) d.art = Object.assign({}, src.art);
      d.id = id; d.custom = true; d.base = base; d.role = src.role || base; d.look = src.look || base; d.buildable = true;
      if (!d.weapon) delete d.weapon;
      GA.DEFS[id] = d;
      GA.CUSTOM_TYPES.push(id);
    }
    // the type table (arrays / objects are updated in place because other modules keep references)
    GA.TYPES.length = 0;
    GA.TYPES.push(...GA.BUILTIN_TYPES, ...GA.CUSTOM_TYPES);
    for (const k of Object.keys(GA.TIDX)) delete GA.TIDX[k];
    GA.TYPES.forEach((id, i) => { GA.TIDX[id] = i; });
    const off = new Set(cfg.disabled);
    for (const t of GA.TYPES) {
      const d = GA.DEFS[t];
      d.wp = d.weapon ? GA.WEAPONS[d.weapon] : undefined;
      if (!d.weapon) delete d.weapon;
      if (d.kind === 'u' && d.air) d.fly = true;
      if (off.has(t)) d.disabled = true; else delete d.disabled;
    }
    GA.CONFIG = cfg;
    return cfg;
  };
  GA.CONFIG = { defs: {}, weapons: {}, mult: {}, bots: {}, settings: {}, custom: { types: {}, weapons: {} }, disabled: [], art: {} };
})();

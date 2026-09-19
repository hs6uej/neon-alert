// Shared game data (runs in both Node and the browser)
(function () {
  'use strict';
  const GA = (globalThis.GA = globalThis.GA || {});

  GA.W = 96;
  GA.H = 96;
  GA.DT = 0.05; // sim tick (20 Hz)

  // Player colour palette (players pick one in the lobby). dark/light variants are derived.
  const mix = (hex, to, t) => {
    const c = (i) => parseInt(hex.slice(i, i + 2), 16);
    const m = (v, i) => Math.round(v + (to[i] - v) * t).toString(16).padStart(2, '0');
    return '#' + m(c(1), 0) + m(c(3), 1) + m(c(5), 2);
  };
  GA.PALETTE = [
    ['Cyan', '#22d3ee'], ['Crimson', '#fb4a68'], ['Lime', '#a3e635'], ['Amber', '#fbbf24'],
    ['Violet', '#a78bfa'], ['Orange', '#fb923c'], ['Pink', '#f472b6'], ['Blue', '#3b82f6'],
  ].map(([name, main]) => ({ name, main, dark: mix(main, [0, 0, 0], 0.45), light: mix(main, [255, 255, 255], 0.65) }));
  // Colours indexed by *player id* for the running game (filled by GA.setOwnerColors at game start).
  // The array identity never changes so modules may keep a reference to it.
  GA.PLAYER_COLORS = GA.PALETTE.slice(0, 3);
  GA.NEUTRAL_COLOR = { name: 'Neutral', main: '#94a3b8', dark: mix('#94a3b8', [0, 0, 0], 0.45), light: mix('#94a3b8', [255, 255, 255], 0.65) };
  GA.setOwnerColors = function (players) {
    GA.PLAYER_COLORS.length = 0;
    for (const p of players) GA.PLAYER_COLORS.push(p.neutral ? GA.NEUTRAL_COLOR : GA.PALETTE[p.color % GA.PALETTE.length]);
  };
  // Rock tiles inside the map can be destroyed; the outermost tiles never can.
  GA.rockBreakable = (x, y) => x >= 2 && y >= 2 && x < GA.W - 2 && y < GA.H - 2;

  // Global tunables (editable in the admin page)
  GA.SETTINGS = {
    startCredits: 6000,
    harvestRate: 90,      // credits per second while mining
    unloadRate: 420,      // credits per second while unloading at a refinery
    swCharge: 150,        // seconds to charge the Orbital Lance
    lanceDamage: 1400,
    lanceRadius: 4.2,
    lanceDelay: 3.4,      // seconds between firing and impact
    repairRate: 0.045,    // fraction of max HP repaired per second
    sellRefund: 0.5,
    buildRadius: 4,       // tiles from an existing building where new structures may be placed
    lowPowerMin: 0.3,     // minimum production speed when power is short
    multiProdBonus: 0.4,  // extra speed per additional Barracks / Forge
    rockHp: 700,          // hit points of a destructible rock tile
    rockSplash: 0.35,     // fraction of splash damage that chips nearby rocks
  };

  // weapon class -> armor class damage multipliers
  GA.MULT = {
    pulse: { inf: 1.0, light: 0.6, heavy: 0.3, bld: 0.3, air: 0.7 },
    arc: { inf: 1.0, light: 1.0, heavy: 0.8, bld: 0.8, air: 1.0 },
    rocket: { inf: 0.45, light: 1.0, heavy: 1.0, bld: 0.7, air: 1.4 },
    plasma: { inf: 0.8, light: 1.0, heavy: 0.9, bld: 1.0, air: 0 },
    rail: { inf: 0.4, light: 1.2, heavy: 1.4, bld: 0.8, air: 0 },
    shell: { inf: 1.2, light: 0.9, heavy: 0.7, bld: 1.6, air: 0 },
  };

  // targets: 'ground' | 'air' | 'both'; speed: projectile tiles/s (0 = beam)
  GA.WEAPONS = {
    pulse: { dmg: 9, cd: 0.6, range: 5, wtype: 'pulse', proj: 'bolt', speed: 24, targets: 'both' },
    lancer: { dmg: 34, cd: 1.7, range: 6.5, wtype: 'rocket', proj: 'rocket', speed: 10, targets: 'both', splash: 0.8 },
    hoverGun: { dmg: 8, cd: 0.4, range: 5.2, wtype: 'pulse', proj: 'bolt', speed: 26, targets: 'both' },
    plasma: { dmg: 42, cd: 1.5, range: 6.2, wtype: 'plasma', proj: 'plasma', speed: 14, targets: 'ground', splash: 0.9 },
    shell: { dmg: 62, cd: 3.6, range: 12.5, wtype: 'shell', proj: 'shell', speed: 8, targets: 'ground', splash: 1.8 },
    rail: { dmg: 115, cd: 3.2, range: 9.5, wtype: 'rail', proj: 'rail', speed: 0, targets: 'ground' },
    titan: { dmg: 60, cd: 1.2, range: 7.5, wtype: 'plasma', proj: 'plasma', speed: 14, targets: 'ground', splash: 1.1 },
    drone: { dmg: 16, cd: 0.9, range: 5, wtype: 'plasma', proj: 'bolt', speed: 18, targets: 'ground' },
    tower: { dmg: 22, cd: 0.6, range: 7.5, wtype: 'arc', proj: 'bolt', speed: 24, targets: 'both' },
  };

  // kind: 'b' building | 'u' unit. cat = sidebar tab / production queue.
  GA.DEFS = {
    // ---------- structures ----------
    conyard: { kind: 'b', name: 'Nexus Core', cat: 'structure', w: 3, h: 3, hp: 2000, cost: 2500, time: 0, power: 0, vision: 9, armor: 'bld', req: [], buildable: false, desc: 'Command hub. Expands your build area.' },
    power: { kind: 'b', name: 'Fusion Reactor', cat: 'structure', w: 2, h: 2, hp: 700, cost: 600, time: 10, power: 150, vision: 6, armor: 'bld', req: ['conyard'], desc: 'Generates power (+150).' },
    refinery: { kind: 'b', name: 'Ore Processor', cat: 'structure', w: 3, h: 2, hp: 1000, cost: 1400, time: 18, power: -30, vision: 7, armor: 'bld', req: ['power'], desc: 'Converts ore to credits. Comes with a free Nano Harvester.' },
    barracks: { kind: 'b', name: 'Neural Barracks', cat: 'structure', w: 2, h: 2, hp: 800, cost: 500, time: 12, power: -20, vision: 6, armor: 'bld', req: ['power'], desc: 'Trains infantry.' },
    factory: { kind: 'b', name: 'Assembly Forge', cat: 'structure', w: 3, h: 3, hp: 1400, cost: 1200, time: 22, power: -40, vision: 7, armor: 'bld', req: ['refinery'], desc: 'Builds vehicles and drones.' },
    radar: { kind: 'b', name: 'Sensor Array', cat: 'structure', w: 2, h: 2, hp: 800, cost: 900, time: 16, power: -40, vision: 12, armor: 'bld', req: ['factory'], desc: 'Enables minimap. Unlocks advanced units.' },
    techlab: { kind: 'b', name: 'Quantum Lab', cat: 'structure', w: 2, h: 2, hp: 900, cost: 1500, time: 24, power: -60, vision: 7, armor: 'bld', req: ['radar'], desc: 'Unlocks elite tech and the Orbital Uplink.' },
    turret: { kind: 'b', name: 'Pulse Tower', cat: 'structure', w: 1, h: 1, hp: 650, cost: 600, time: 12, power: -20, vision: 9, armor: 'bld', weapon: 'tower', req: ['barracks'], desc: 'Defensive tower. Hits ground and air. Needs power.' },
    uplink: { kind: 'b', name: 'Orbital Uplink', cat: 'structure', w: 3, h: 3, hp: 1200, cost: 3500, time: 40, power: -150, vision: 7, armor: 'bld', req: ['techlab'], desc: 'Superweapon: calls down an Orbital Lance.' },
    // ---------- neutral map structures (start unowned; capture with a Breach Engineer or blow up)
    derrick: { kind: 'b', name: 'Crystal Derrick', cat: 'structure', w: 2, h: 2, hp: 900, cost: 500, time: 0, power: 0, vision: 6, armor: 'bld', req: [], buildable: false, neutral: true, income: 6, desc: 'Neutral tech site. Capture it to earn credits every second.' },
    depot: { kind: 'b', name: 'Supply Depot', cat: 'structure', w: 2, h: 2, hp: 700, cost: 300, time: 0, power: 0, vision: 6, armor: 'bld', req: [], buildable: false, neutral: true, bounty: 1500, desc: 'Neutral supply cache. Capture it for a one-time cash bonus.' },

    // ---------- infantry ----------
    trooper: { kind: 'u', name: 'Pulse Trooper', cat: 'infantry', cost: 100, time: 5, hp: 100, speed: 2.4, armor: 'inf', weapon: 'pulse', vision: 7, r: 0.22, req: ['barracks'], desc: 'Cheap all-round infantry.' },
    lancer: { kind: 'u', name: 'Rocket Lancer', cat: 'infantry', cost: 250, time: 8, hp: 90, speed: 2.2, armor: 'inf', weapon: 'lancer', vision: 8, r: 0.22, req: ['barracks'], desc: 'Anti-armor and anti-air rockets.' },
    engineer: { kind: 'u', name: 'Breach Engineer', cat: 'infantry', cost: 400, time: 8, hp: 80, speed: 2.4, armor: 'inf', vision: 6, r: 0.22, capture: true, req: ['barracks'], desc: 'Captures enemy buildings.' },

    // ---------- vehicles ----------
    harvester: { kind: 'u', name: 'Nano Harvester', cat: 'vehicle', cost: 900, time: 14, hp: 700, speed: 2.1, armor: 'heavy', vision: 6, r: 0.45, harvester: true, capacity: 600, req: ['factory', 'refinery'], desc: 'Collects ore automatically.' },
    hover: { kind: 'u', name: 'Vector Hover', cat: 'vehicle', cost: 550, time: 9, hp: 200, speed: 5.2, armor: 'light', weapon: 'hoverGun', vision: 8, r: 0.35, req: ['factory'], desc: 'Fast raider.' },
    arc: { kind: 'u', name: 'Arc Tank', cat: 'vehicle', cost: 850, time: 14, hp: 520, speed: 2.7, armor: 'heavy', weapon: 'plasma', vision: 8, r: 0.45, req: ['factory'], desc: 'Main battle tank.' },
    nova: { kind: 'u', name: 'Nova Mortar', cat: 'vehicle', cost: 1000, time: 17, hp: 220, speed: 2.3, armor: 'light', weapon: 'shell', vision: 13, r: 0.42, req: ['radar'], desc: 'Long-range artillery. Splash damage.' },
    wasp: { kind: 'u', name: 'Wasp Drone', cat: 'vehicle', cost: 1000, time: 16, hp: 170, speed: 5.8, armor: 'air', weapon: 'drone', vision: 8, r: 0.3, air: true, req: ['radar'], desc: 'Flying raider. Ignores terrain.' },
    rail: { kind: 'u', name: 'Rail Striker', cat: 'vehicle', cost: 1400, time: 20, hp: 380, speed: 2.4, armor: 'heavy', weapon: 'rail', vision: 10.5, r: 0.45, req: ['techlab'], desc: 'Piercing railgun. Deadly vs armor.' },
    titan: { kind: 'u', name: 'Titan Walker', cat: 'vehicle', cost: 2400, time: 30, hp: 1500, speed: 1.7, armor: 'heavy', weapon: 'titan', vision: 9, r: 0.6, req: ['techlab'], desc: 'Heavy assault walker.' },
    mcv: { kind: 'u', name: 'Mobile Nexus', cat: 'vehicle', cost: 2500, time: 26, hp: 900, speed: 2.0, armor: 'heavy', vision: 7, r: 0.6, mcv: true, req: ['radar'], desc: 'Deploys into a new Nexus Core.' },
  };

  GA.TYPES = Object.keys(GA.DEFS);
  GA.TIDX = {};
  GA.TYPES.forEach((t, i) => {
    GA.TIDX[t] = i;
    const d = GA.DEFS[t];
    d.id = t;
    if (d.weapon) d.wp = GA.WEAPONS[d.weapon];
    if (d.kind === 'u' && d.air) d.fly = true;
  });

  // Selectable battlefields ('random' = a fresh procedural map every game, 'any' = pick one of the designed maps)
  GA.MAPS = [
    { id: 'crossroads', name: 'Triad Crossing', desc: 'Symmetric open field. Rock spokes with gates split the bases, a walled centre holds the richest ore.' },
    { id: 'isles', name: 'Sunken Isles', desc: 'Island bases joined by narrow land bridges over deep water. Air power and bridge control decide the game.' },
    { id: 'highlands', name: 'Iron Highlands', desc: 'Winding cliff lines and canyons. Ambush country with long detours.' },
    { id: 'random', name: 'Wildlands', desc: 'A brand new random battlefield every game.' },
  ];
  GA.MAP_CHOICES = GA.MAPS.map((m) => m.id);

  GA.CATS = ['structure', 'infantry', 'vehicle'];
  GA.CAT_LABEL = { structure: 'Structures', infantry: 'Infantry', vehicle: 'Vehicles' };

  GA.BOT_LEVELS = {
    easy: { think: 1.8, speed: 0.85, income: 1.0, waveMin: 8, waveGrow: 1, delay: 420 },
    normal: { think: 1.0, speed: 1.0, income: 1.0, waveMin: 12, waveGrow: 2, delay: 330 },
    hard: { think: 0.6, speed: 1.1, income: 1.25, waveMin: 16, waveGrow: 3, delay: 240 },
  };
})();

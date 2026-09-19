// Built-in picture sets (shared by the server, the game and the admin page).
// A set gives buildings / units a picture instead of the vector drawing made by the game code; a type without a
// picture in the active set keeps its vector drawing. Pictures of a built-in set are files in public/sets/<set>/<type>.png.
// Sets made in the admin page are stored in the config (see config.js) and their files in data/art.
(function () {
  'use strict';
  const GA = (globalThis.GA = globalThis.GA || {});
  GA.BUILTIN_SETS = {
    v1: { name: 'V1 - Classic', desc: 'The original vector drawings made by the game code.', tint: false, art: {} },
    v2: {
      name: 'V2 - Neon AI',
      desc: 'Drawn by AI: dark gunmetal armor with neon light strips. The cyan lights change to the colour of the team.',
      tint: true,
      art: {
      conyard: { v: 1, s: 1, y: 0, f: 1 },
      power: { v: 1, s: 1, y: 0, f: 1 },
      refinery: { v: 1, s: 1, y: 0, f: 1 },
      barracks: { v: 1, s: 1, y: 0, f: 1 },
      factory: { v: 1, s: 1, y: 0, f: 1 },
      radar: { v: 1, s: 1, y: 0, f: 1 },
      techlab: { v: 1, s: 1, y: 0, f: 1 },
      turret: { v: 1, s: 1, y: 0, f: 1 },
      uplink: { v: 1, s: 1, y: 0, f: 1 },
      derrick: { v: 1, s: 1, y: 0, f: 1 },
      depot: { v: 1, s: 1, y: 0, f: 1 },
      trooper: { v: 1, s: 1, y: 0, f: 1 },
      lancer: { v: 1, s: 1, y: 0, f: 1 },
      engineer: { v: 1, s: 1, y: 0, f: 1 },
      harvester: { v: 1, s: 1, y: 0, f: 1 },
      hover: { v: 1, s: 1, y: 0, f: 1 },
      arc: { v: 1, s: 1, y: 0, f: 1 },
      nova: { v: 1, s: 1, y: 0, f: 1 },
      wasp: { v: 1, s: 1, y: 0, f: 1 },
      rail: { v: 1, s: 1, y: 0, f: 1 },
      titan: { v: 1, s: 1, y: 0, f: 1 },
      mcv: { v: 1, s: 1, y: 0, f: 1 },
      },
    },
  };
  GA.DEFAULT_ART_SET = 'v1';
})();

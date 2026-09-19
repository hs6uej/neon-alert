// V2 art direction + one prompt per building / unit (used by the one-off generator; the app itself does not need this file)
const STYLE = `Art direction "NEON ALERT V2": a premium, highly detailed stylized 3D-rendered game asset (polished modern strategy-game quality), isometric 2.5D high three-quarter view from above, crisp clean silhouette, strong rim light and soft ambient occlusion. Materials: dark gunmetal and graphite armor plates with subtle wear and panel lines, matte black underside, a few brushed-steel parts. EVERY glowing element (light strips, energy cores, lenses, screens, engine glow, plasma) uses ONE saturated neon cyan (#22D3EE) with white-hot highlights; no other glow colors and no other saturated colors anywhere (tiny amber warning lights are allowed). Angular chunky industrial sci-fi design, believable mechanical detail (vents, pipes, bolts, antennas, hazard stripes in grey).`;
const B = 'BUILDING'; const U = 'UNIT';
const ITEMS = {
  conyard: [B, 'Nexus Core: the fortified command hub of an army base. A wide low armored fortress with four corner pylons, a raised central tower carrying a large glowing cyan reactor dome, a rotating command antenna array and a glowing cyan ring around the roof. Footprint is a square.'],
  power: [B, 'Fusion Reactor: a compact power plant with two tall transparent containment cylinders glowing bright cyan with plasma arcs between them, heavy cooling fins, thick cables and coolant pipes, on a rectangular armored base.'],
  refinery: [B, 'Ore Processor: an industrial ore refinery, wider than deep, with a large open receiving hopper, a conveyor chute, two round processing tanks with glowing cyan windows, a smokestack and pipes. A few small teal ore crystals near the hopper.'],
  barracks: [B, 'Neural Barracks: a compact armored infantry bunker with a domed roof, a large glowing cyan doorway, small vents, an antenna mast and a neural-link dish on top.'],
  factory: [B, 'Assembly Forge: a big vehicle factory with a huge roll-up bay door glowing cyan from inside, a gantry crane arm over the roof, two exhaust stacks, hazard-striped edges and heavy armor plating. Footprint is a square.'],
  radar: [B, 'Sensor Array: a sturdy radar station with a very large tilted parabolic dish on a rotating mount above a low armored bunker; the dish rim and receiver glow cyan.'],
  techlab: [B, 'Quantum Lab: a high-tech research lab with a glass dome roof containing a floating glowing cyan quantum core surrounded by two thin orbiting rings, on an armored octagonal base with lab windows.'],
  turret: [B, 'Pulse Tower: a small single defensive gun tower, narrow footprint, a rotating armored turret head with two long energy barrels glowing cyan at the muzzles, on a sturdy octagonal pedestal.'],
  uplink: [B, 'Orbital Uplink: ONE single (not two) superweapon uplink station, exactly one tower in the picture: a tall tapering antenna spire rising from a heavy armored base, a satellite dish angled at the sky, three stacked glowing cyan energy rings around the spire and a bright cyan beacon at its tip. Footprint is a square.'],
  derrick: [B, 'Crystal Derrick: a neutral mining site: a small drilling rig and a derrick tower made of dark gunmetal steel with cyan warning lights (the tower is NOT pink or magenta) over a cluster of large glowing teal-cyan energy crystals, cracked rock base, a few metal supports and cables.'],
  depot: [B, 'Supply Depot: a neutral supply cache: stacked armored cargo containers and crates on a landing pad, a small loading crane, a fuel tank, faded stencil markings, a few cyan status lights.'],
  trooper: [U, 'Pulse Trooper: a single sci-fi infantry soldier in light powered armor with a helmet with a cyan visor, carrying a compact pulse rifle held forward, standing ready, full body.'],
  lancer: [U, 'Rocket Lancer: a single sci-fi infantry soldier in medium armor with a large shoulder-mounted rocket launcher tube on his right shoulder and a cyan targeting visor, full body.'],
  engineer: [U, 'Breach Engineer: a single sci-fi combat engineer in a light-grey and dark suit with a big backpack of tools, a helmet with a cyan visor and a handheld cutting/hacking device, full body.'],
  harvester: [U, 'Nano Harvester: a bulky heavy ore-harvesting vehicle on four chunky wheels/tracks, with a wide rotating scoop drum at the front, a large cargo bin on the back and a glowing cyan sensor lamp on the cab.'],
  hover: [U, 'Vector Hover: a fast, sleek hover skimmer / light raider, low and wedge-shaped, hovering slightly above the ground on two glowing cyan thrust pads, with a small twin gun on the nose.'],
  arc: [U, 'Arc Tank: the main battle tank: a wide tracked tank with a big rotating turret and one thick barrel with a glowing cyan plasma coil, angled composite armor and side skirts.'],
  nova: [U, 'Nova Mortar: a mobile artillery vehicle on six wheels with a very long, steeply raised mortar tube on top, a stabilizer leg at the back and a glowing cyan breech.'],
  wasp: [U, 'Wasp Drone: a small flying combat drone: a slim body with two angled swept wings, four small glowing cyan rotor discs or thrusters, a chin-mounted gun and a cyan sensor eye. It is hovering in the air.'],
  rail: [U, 'Rail Striker: a heavy tank destroyer with a very long twin-rail cannon along the top with glowing cyan rails and capacitor rings, low armored hull on wide tracks.'],
  titan: [U, 'Titan Walker: a huge assault walker with four thick armored mechanical legs, a heavy armored body with a cockpit slit glowing cyan and two large arm-mounted plasma cannons with cyan glow.'],
  mcv: [U, 'Mobile Nexus: a large construction vehicle on eight wheels carrying a folded-up command base: stacked armored modules, a big folded crane arm and a glowing cyan reactor dome on the roof.'],
};
const prompt = (id, hasStyleRef) => {
  const [kind, desc] = ITEMS[id];
  return `Design a single ${kind === B ? 'sci-fi BUILDING' : 'sci-fi military UNIT'} as a game sprite. ${desc} ` + STYLE + ' ' +
    `Camera: isometric 2.5D, high three-quarter view from above${kind === U ? '; the unit faces to the RIGHT of the image' : ''}. ` +
    (hasStyleRef ? 'The attached image is ONLY a style reference (rendering style, materials, lighting, palette): draw a completely different subject in exactly the same style. ' : '') +
    'Show ONE object, centered, fully inside the image with a small margin. No text, no logos, no UI, no ground plane, no scenery, no cast shadow. The whole image background must be one perfectly flat solid pure magenta color (#FF00FF) with nothing else in it, and the object itself must not contain magenta.';
};
module.exports = { ITEMS, prompt };

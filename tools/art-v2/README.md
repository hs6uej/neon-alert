# V2 picture set (Neon AI)

`public/sets/v2/*.png` were made with these scripts (Google Gemini `gemini-3.1-flash-image`).

- `concept.js` - the art direction (dark gunmetal + ONE neon cyan for every light, isometric, units face right) and the description of each of the 22 buildings / units
- `gen.js` - draws them (3 at a time) on a flat magenta background
- `process.js` - cuts the background (same algorithm as the admin Picture studio), turns stray purple into cyan, crops and downsizes; `npm i --no-save @napi-rs/canvas` first

Because every light is the same cyan, the game recolours it to the team colour when it draws a picture (`tint` in `public/js/artsets.js`).
To add or replace a picture: put the PNG in `public/sets/v2/<type>.png` and raise its `v` in `artsets.js` (the browser caches by `?v=`).

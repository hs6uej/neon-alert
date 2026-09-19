// Pictures for buildings / units: config validation, background removal, and the server side
// (storage, permissions, the AI call against a fake Gemini server).
require('../public/js/data.js');
require('../public/js/artsets.js');
require('../public/js/config.js');
require('../public/js/artstudio.js');
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const os = require('os');
const fs = require('fs');
const zlib = require('zlib');
const assert = require('assert');
const GA = globalThis.GA;

// ---- config: picture sets
{
  const raw = {
    custom: { types: { x_aa: { base: 'arc', name: 'A' }, x_bb: { base: 'arc', name: 'B' }, x_cc: { base: 'barracks', name: 'C' } } },
    artSet: 'c_mine',
    sets: {
      c_mine: {
        name: 'Mine', tint: true,
        art: {
          trooper: { v: 5, s: 1.2, y: 0.1 }, arc: { v: 7 }, x_aa: { v: 9, s: 99, y: -9 }, x_cc: { v: 3.5 },
          nosuch: { v: 1 }, x_zzz: { v: 1 }, power: { v: 0 }, radar: 'x', refinery: { v: -4 }, factory: { v: 'abc' },
          conyard: { ref: 'v2' }, derrick: { ref: 'nope' }, barracks: { ref: 'v2', s: 1.5, v: 99 },
        },
      },
      c_x: { name: 'too short an id' }, bad: { name: 'bad id' },
    },
  };
  const c = GA.cleanConfig(raw);
  assert.deepStrictEqual(Object.keys(c.sets), ['c_mine'], 'sets with invalid ids are dropped');
  assert.deepStrictEqual(Object.keys(c.sets.c_mine.art).sort(), ['arc', 'barracks', 'conyard', 'trooper', 'x_aa'], 'unknown ids, bad versions and unknown refs are dropped');
  assert.deepStrictEqual(c.sets.c_mine.art.arc, { v: 7, s: 1, y: 0, f: 1 }, 'defaults for size / height / frames');
  assert.deepStrictEqual(c.sets.c_mine.art.x_aa, { v: 9, s: 3, y: -0.6, f: 1 }, 'size and height are clamped');
  assert.deepStrictEqual(c.sets.c_mine.art.barracks, { ref: 'v2', v: 1, s: 1.5, y: 0, f: 1 }, 'a reference takes its version from the built-in set');
  assert.strictEqual(c.artSet, 'c_mine'); assert.strictEqual(GA.cleanConfig({}).artSet, 'v1'); assert.deepStrictEqual(GA.cleanConfig({}).sets, {});
  assert.strictEqual(GA.cleanConfig({ artSet: 'c_gone' }).artSet, 'v1', 'an unknown set falls back to V1');
  assert.strictEqual(GA.cleanConfig({ artSet: 'v2' }).artSet, 'v2');
  const many = {}; for (let i = 0; i < 12; i++) many['c_set' + String(i).padStart(2, '0')] = { name: 'S' + i };
  assert.strictEqual(Object.keys(GA.cleanConfig({ sets: many }).sets).length, GA.CUSTOM_LIMITS.sets, 'at most 8 sets');
  GA.applyConfig(raw);
  assert.deepStrictEqual(GA.DEFS.trooper.art, { id: 'trooper', v: 5, s: 1.2, y: 0.1, f: 1, tint: true, url: '/art/trooper-5.png' });
  assert.strictEqual(GA.DEFS.barracks.art.url, '/sets/v2/barracks.png?v=1', 'a reference uses the file of the built-in set');
  assert.strictEqual(GA.DEFS.x_aa.art.url, '/art/x_aa-9.png', 'a custom type can have its own picture');
  assert.strictEqual(GA.DEFS.x_bb.art.url, '/art/arc-7.png', 'a copy uses the picture of the type it was made from');
  assert.strictEqual(GA.DEFS.x_cc.art.url, '/sets/v2/barracks.png?v=1', 'a copy of the barracks uses the barracks picture (its own entry was invalid)');
  assert(!GA.DEFS.power.art, 'no picture where the set has none');
  GA.DEFS.x_bb.art.s = 2; GA.applyConfig(raw);
  assert.strictEqual(GA.DEFS.x_bb.art.s, 1, 'applying again rebuilds pictures from the config');
  // built-in sets
  GA.applyConfig({ artSet: 'v2' });
  for (const t of GA.BUILTIN_TYPES) assert(GA.DEFS[t].art && GA.DEFS[t].art.tint && GA.DEFS[t].art.url === `/sets/v2/${t}.png?v=1`, 'V2 has a picture for ' + t);
  GA.applyConfig({ artSet: 'v2', custom: { types: { x_aa: { base: 'arc', name: 'A' } } } });
  assert.strictEqual(GA.DEFS.x_aa.art.url, '/sets/v2/arc.png?v=1', 'a custom copy inherits the picture from V2');
  GA.applyConfig({ artSet: 'v1' });
  assert(GA.BUILTIN_TYPES.every((t) => !GA.DEFS[t].art), 'V1 = the drawings made by the game code');
  // configs saved before sets existed keep their pictures
  const old = GA.cleanConfig({ art: { arc: { v: 5 }, nosuch: { v: 1 } } });
  assert.deepStrictEqual(Object.keys(old.sets), ['c_mypics']); assert.strictEqual(old.artSet, 'c_mypics'); assert.deepStrictEqual(Object.keys(old.sets.c_mypics.art), ['arc']);
  assert.strictEqual(GA.cleanConfig({ art: { arc: { v: 5 } }, artSet: 'v2' }).artSet, 'v2', 'an explicit choice wins over the migration');
  assert.deepStrictEqual(GA.cleanConfig(GA.cleanConfig({ art: { arc: { v: 5 } } })), old, 'cleaning is stable');
  GA.applyConfig({});
  assert(!GA.DEFS.trooper.art && !GA.DEFS.arc.art && !GA.DEFS.x_aa, 'resetting removes every picture');
  console.log('ok config picture sets');
}

// ---- background removal
{
  const W = 48, H = 48, d = new Uint8ClampedArray(W * H * 4);
  const bg = [230, 9, 138];
  let seed = 1; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const set = (x, y, r, g, b) => { const i = (y * W + x) * 4; d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) set(x, y, bg[0] + rnd() * 10 - 5, bg[1] + rnd() * 10 - 5, bg[2] + rnd() * 10 - 5); // noisy flat background
  for (let y = 12; y < 36; y++) for (let x = 12; x < 36; x++) set(x, y, 60, 70, 90);   // dark object ...
  for (let y = 22; y < 26; y++) for (let x = 22; x < 26; x++) set(x, y, bg[0], bg[1], bg[2]); // ... with a hole that looks like the background
  set(14, 14, 255, 0, 200); // a bright pink detail (must stay)
  const alphaAt = (x, y) => d[(y * W + x) * 4 + 3];
  const a = d.slice();
  assert(GA.cutBackground(d, W, H, 70, false));
  assert.strictEqual(alphaAt(2, 2), 0, 'background removed'); assert.strictEqual(alphaAt(46, 30), 0);
  assert.strictEqual(alphaAt(20, 20), 255, 'object kept'); assert.strictEqual(alphaAt(14, 14), 255, 'pink detail inside the object kept');
  assert.strictEqual(alphaAt(24, 24), 255, 'a hole inside the object is kept by default');
  const b = a.slice();
  GA.cutBackground(b, W, H, 70, true);
  assert.strictEqual(b[(24 * W + 24) * 4 + 3], 0, 'enclosed gaps are removed when asked');
  const bb = GA.alphaBounds(d, W, H, 10);
  assert(bb && bb.x >= 11 && bb.x <= 13 && bb.w >= 22 && bb.w <= 26 && bb.y >= 11 && bb.h >= 22, 'bounds hug the object: ' + JSON.stringify(bb));
  const t = new Uint8ClampedArray(W * H * 4); // already transparent picture: untouched
  assert.strictEqual(GA.cutBackground(t, W, H, 70, false), false);
  assert.strictEqual(GA.alphaBounds(t, W, H, 10), null, 'empty picture has no bounds');
  console.log('ok background removal');
}

// ---- server
const crcTable = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function makePng(w, h) {
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const pngSizeOk = (b) => b.length > 33 && b.readUInt32BE(0) === 0x89504e47 && b.readUInt32BE(16) > 8 && b.readUInt32BE(20) > 8;
const png = (buf) => 'data:image/png;base64,' + buf.toString('base64');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function request(port, method, url, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = http.request({ host: '127.0.0.1', port, path: url, method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (token || ''), ...(data ? { 'Content-Length': data.length } : {}) } }, (res) => {
      const chunks = []; res.on('data', (c) => chunks.push(c));
      res.on('end', () => { const buf = Buffer.concat(chunks); let json = null; try { json = JSON.parse(buf.toString('utf8')); } catch { /* binary */ } resolve({ status: res.statusCode, headers: res.headers, buf, body: json || {} }); });
    });
    req.on('error', reject); req.end(data);
  });
}

(async () => {
  const KEY = 'AIzaFAKEKEY-for-tests-0123456789abcdefg';
  // fake Gemini
  const seen = [];
  let mode = 'ok';
  const fake = http.createServer((req, res) => {
    const chunks = []; req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      seen.push({ url: req.url, key: req.headers['x-goog-api-key'], body });
      res.setHeader('Content-Type', 'application/json');
      if (mode === 'ok') return res.end(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: makePng(64, 48).toString('base64') } }] } }] }));
      if (mode === 'error') { res.statusCode = 400; return res.end(JSON.stringify({ error: { code: 400, message: `API key not valid. Please pass a valid API key: ${KEY}` } })); }
      if (mode === 'text') return res.end(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'I cannot draw that.' }] } }] }));
      res.statusCode = 429; res.end(JSON.stringify({ error: { message: 'quota' } }));
    });
  });
  await new Promise((r) => fake.listen(0, '127.0.0.1', r));
  const fakePort = fake.address().port;

  const start = async (env, prep) => {
    const port = 3700 + Math.floor(Math.random() * 300), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ga-art-'));
    if (prep) prep(dir);
    const srv = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: port, DATA_DIR: dir, ADMIN_USER: '', ADMIN_PASS: '', GEMINI_API_KEY: '', GEMINI_IMAGE_MODEL: '', ...env }, stdio: ['ignore', 'pipe', 'inherit'] });
    for (let i = 0; i < 60; i++) { try { await request(port, 'GET', '/api/info'); break; } catch { await sleep(100); } }
    return { srv, port, dir };
  };
  const A = await start({ GEMINI_API_KEY: KEY, GEMINI_API_BASE: `http://127.0.0.1:${fakePort}`, GEMINI_IMAGE_MODEL: 'test-image-model' });
  let B, C;
  try {
    const api = (m, u, b, t) => request(A.port, m, u, b, t);
    let r = await api('POST', '/api/register', { username: 'Alice', password: 'secret1' });
    const admin = r.body.token;
    r = await api('POST', '/api/register', { username: 'Bob', password: 'secret2' });
    const bob = r.body.token;

    // permissions
    for (const [m, u, b] of [['GET', '/api/admin/art/info'], ['POST', '/api/admin/art/generate', { kind: 'u', prompt: 'a tank' }], ['PUT', '/api/admin/art', { type: 'arc', png: png(makePng(16, 16)) }]]) {
      assert.strictEqual((await api(m, u, b, bob)).status, 403, `${u} is admin only`);
      assert.strictEqual((await api(m, u, b)).status, 401, `${u} needs a sign-in`);
    }
    r = await api('GET', '/api/admin/art/info', null, admin);
    assert.deepStrictEqual(r.body, { ai: true, model: 'test-image-model' });
    console.log('ok art permissions');

    // AI: the key stays on the server, the prompt is wrapped, errors never leak the key
    r = await api('POST', '/api/admin/art/generate', { kind: 'u', prompt: 'heavy hover tank', style: 'pixel' }, admin);
    assert.strictEqual(r.status, 200); assert(/^data:image\/png;base64,/.test(r.body.image));
    assert.strictEqual(seen[0].key, KEY, 'server sends its key to Gemini'); assert(seen[0].url.includes('test-image-model:generateContent'));
    const text = seen[0].body.contents[0].parts[0].text;
    assert(text.includes('heavy hover tank') && text.includes('#FF00FF') && /pixel/i.test(text) && /RIGHT/.test(text), 'prompt is wrapped with the sprite rules');
    assert.strictEqual(seen[0].body.contents[0].parts.length, 1, 'no reference unless asked');
    assert(!JSON.stringify(r.body).includes(KEY));
    r = await api('POST', '/api/admin/art/generate', { kind: 'b', prompt: 'a barracks', ref: png(makePng(32, 32)) }, admin);
    assert.strictEqual(r.status, 200); assert.strictEqual(seen[1].body.contents[0].parts[1].inline_data.mime_type, 'image/png', 'reference picture is forwarded');
    assert(/BUILDING/.test(seen[1].body.contents[0].parts[0].text) && /attached image/.test(seen[1].body.contents[0].parts[0].text));
    r = await api('POST', '/api/admin/art/generate', { kind: 'u', prompt: 'hover tank', frames: 4, motion: 'walk' }, admin);
    assert.strictEqual(r.status, 200);
    const sheet = seen[seen.length - 1].body.contents[0].parts[0].text;
    assert(/2x2 SPRITE SHEET/.test(sheet) && /WALK/.test(sheet) && /hover tank/.test(sheet) && /#FF00FF/.test(sheet), 'animation sheet prompt');
    await api('POST', '/api/admin/art/generate', { kind: 'b', prompt: 'a barracks', frames: 4 }, admin);
    assert(/HOVER \/ IDLE/.test(seen[seen.length - 1].body.contents[0].parts[0].text), 'idle loop is the default motion');
    assert.strictEqual((await api('POST', '/api/admin/art/generate', { kind: 'u', prompt: 'a tank', frames: 3 }, admin)).status, 400, 'only 1 or 4 frames');
    assert.strictEqual((await api('POST', '/api/admin/art/generate', { kind: 'u', prompt: 'x' }, admin)).status, 400, 'too short');
    assert.strictEqual((await api('POST', '/api/admin/art/generate', { kind: 'z', prompt: 'a tank' }, admin)).status, 400, 'bad kind');
    assert.strictEqual((await api('POST', '/api/admin/art/generate', { kind: 'u', prompt: 'a tank', ref: 'data:text/html;base64,AAAA' }, admin)).status, 400, 'reference must be an image');
    const n = seen.length;
    mode = 'error'; r = await api('POST', '/api/admin/art/generate', { kind: 'u', prompt: 'a tank' }, admin);
    assert.strictEqual(r.status, 502); assert(!JSON.stringify(r.body).includes(KEY) && r.body.error.includes('<key>'), 'the key is removed from error messages: ' + r.body.error);
    mode = 'text'; r = await api('POST', '/api/admin/art/generate', { kind: 'u', prompt: 'a tank' }, admin);
    assert.strictEqual(r.status, 422); assert(/did not draw/.test(r.body.error));
    mode = 'quota'; r = await api('POST', '/api/admin/art/generate', { kind: 'u', prompt: 'a tank' }, admin);
    assert.strictEqual(r.status, 429);
    assert.strictEqual(seen.length, n + 3);
    console.log('ok art AI generation');

    // storing pictures
    const good = makePng(80, 60);
    r = await api('PUT', '/api/admin/art', { type: 'trooper', png: png(good) }, admin);
    assert.strictEqual(r.status, 200); const v1 = r.body.v; assert(Number.isInteger(v1) && v1 > 1e9);
    r = await api('PUT', '/api/admin/art', { type: 'trooper', png: png(good) }, admin);
    assert.strictEqual(r.body.v, v1 + 1, 'every upload gets a new version (old versions stay cached forever)');
    for (const [b, why] of [[{ type: 'nosuch', png: png(good) }, 'unknown type'], [{ type: '../x', png: png(good) }, 'path'], [{ type: 'arc', png: 'data:image/png;base64,AAAA' }, 'not a png'],
      [{ type: 'arc', png: 'data:image/jpeg;base64,' + good.toString('base64') }, 'jpeg'], [{ type: 'arc', png: png(makePng(2100, 8)) }, 'too wide'], [{ type: 'arc', png: png(makePng(4, 4)) }, 'too small'], [{ type: 'arc' }, 'missing']]) {
      assert.strictEqual((await api('PUT', '/api/admin/art', b, admin)).status, 400, why + ' is rejected');
    }
    r = await api('GET', `/art/trooper-${v1}.png`);
    assert.strictEqual(r.status, 200); assert.strictEqual(r.headers['content-type'], 'image/png'); assert(/immutable/.test(r.headers['cache-control'])); assert(r.buf.equals(good), 'served bytes are the uploaded bytes');
    assert.strictEqual((await api('GET', '/art/trooper-999.png')).status, 404);
    for (const u of ['/art/..%2Fusers.json', '/art/trooper-1.png/../../users.json', '/art/TROOPER-1.png', '/art/users.json']) assert.strictEqual((await api('GET', u)).status, 404, u + ' is not a picture');
    console.log('ok art storage');

    // config: picture sets are part of it
    await api('PUT', '/api/admin/art', { type: 'x_tank', png: png(good) }, admin); // custom type not saved yet
    r = await api('PUT', '/api/admin/art', { type: 'x_tank', png: png(good) }, admin);
    const vc = r.body.v;
    const cfgWith = (art, extra) => ({ config: { custom: { types: { x_tank: { base: 'arc', name: 'Zap' } } }, artSet: 'c_mine', sets: { c_mine: { name: 'Mine', tint: true, art } }, ...extra } });
    r = await api('PUT', '/api/admin/config', cfgWith({ trooper: { v: v1, s: 1.5, y: 0.1 }, x_tank: { v: vc }, arc: { v: 424242 }, conyard: { ref: 'v2' } }), admin);
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(Object.keys(r.body.config.sets.c_mine.art).sort(), ['conyard', 'trooper', 'x_tank'], 'a reference to a missing file is dropped');
    assert.deepStrictEqual(r.body.config.sets.c_mine.art.trooper, { v: v1, s: 1.5, y: 0.1, f: 1 });
    assert.strictEqual(r.body.config.artSet, 'c_mine');
    r = await api('GET', '/api/config');
    assert.strictEqual(r.body.config.sets.c_mine.art.x_tank.v, vc, 'players get the picture sets with the config'); assert.strictEqual(r.body.config.artSet, 'c_mine');
    // dropping a picture: the file survives the grace period, then it is cleaned up on the next save
    const oldFile = path.join(A.dir, 'art', `trooper-${v1}.png`), spare = path.join(A.dir, 'art', `trooper-${v1 + 1}.png`);
    await api('PUT', '/api/admin/config', cfgWith({ x_tank: { v: vc } }), admin);
    assert(fs.existsSync(oldFile) && fs.existsSync(spare), 'fresh unused files are kept for a while (an admin may still be editing)');
    const old = new Date(Date.now() - 2 * 3600 * 1000);
    fs.utimesSync(oldFile, old, old);
    await api('PUT', '/api/admin/config', cfgWith({ x_tank: { v: vc } }), admin);
    assert(!fs.existsSync(oldFile), 'old unused pictures are deleted'); assert(fs.existsSync(spare), '... recent ones are not'); assert(fs.existsSync(path.join(A.dir, 'art', `x_tank-${vc}.png`)), 'used pictures are never deleted');
    // a picture used by a second set is not deleted either
    fs.utimesSync(path.join(A.dir, 'art', `x_tank-${vc}.png`), old, old);
    await api('PUT', '/api/admin/config', cfgWith({}, { sets: { c_mine: { name: 'Mine', art: {} }, c_other: { name: 'Other', art: { x_tank: { v: vc } } } } }), admin);
    assert(fs.existsSync(path.join(A.dir, 'art', `x_tank-${vc}.png`)), 'files used by any set are kept');
    // built-in set pictures
    r = await api('GET', '/sets/v2/arc.png?v=1');
    assert.strictEqual(r.status, 200); assert.strictEqual(r.headers['content-type'], 'image/png'); assert(/immutable/.test(r.headers['cache-control']));
    assert(r.buf.equals(fs.readFileSync(path.join(__dirname, '..', 'public', 'sets', 'v2', 'arc.png'))), 'served bytes are the file of the set');
    assert(pngSizeOk(r.buf), 'V2 pictures are PNGs');
    for (const u of ['/sets/v2/nosuch.png', '/sets/v3/arc.png', '/sets/v2/../../server.js', '/sets/v2/arc.png/../../../server.js', '/sets/v2/ARC.png', '/sets/../server.js']) assert.strictEqual((await api('GET', u)).status, 404, u + ' is not a picture');
    r = await api('POST', '/api/admin/config/reset', null, admin);
    assert.deepStrictEqual(r.body.config.sets, {}); assert.strictEqual(r.body.config.artSet, 'v1');
    console.log('ok art sets + cleanup');

    // a config saved before picture sets existed keeps its pictures (in a set called "My pictures")
    C = await start({}, (dir) => {
      fs.mkdirSync(path.join(dir, 'art'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'art', 'trooper-1700000000.png'), good);
      fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ art: { trooper: { v: 1700000000, s: 1.1 }, arc: { v: 1700000001 } } }));
    });
    r = await request(C.port, 'GET', '/api/config');
    assert.deepStrictEqual(Object.keys(r.body.config.sets.c_mypics.art), ['trooper'], 'the missing file is dropped, the existing one kept');
    assert.strictEqual(r.body.config.artSet, 'c_mypics'); assert.strictEqual(r.body.config.sets.c_mypics.art.trooper.s, 1.1);
    console.log('ok art config migration');

    // no key configured
    B = await start({});
    r = await request(B.port, 'POST', '/api/register', { username: 'Zed', password: 'secret1' });
    r = await request(B.port, 'GET', '/api/admin/art/info', null, r.body.token);
    assert.deepStrictEqual(r.body, { ai: false, model: '' });
    const t2 = (await request(B.port, 'POST', '/api/login', { username: 'Zed', password: 'secret1' })).body.token;
    r = await request(B.port, 'POST', '/api/admin/art/generate', { kind: 'u', prompt: 'a tank' }, t2);
    assert.strictEqual(r.status, 503); assert(/GEMINI_API_KEY/.test(r.body.error));
    console.log('ok art without an AI key');
    console.log('ALL OK');
  } finally {
    A.srv.kill(); if (B) B.srv.kill(); if (C) C.srv.kill(); fake.close();
    for (const x of [A, B, C]) if (x) try { fs.rmSync(x.dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
})().catch((e) => { console.error(e); process.exit(1); });

// Neon Alert server: accounts, sign-in logs, stats & matchmaking, admin API, static files,
// WebSocket lobby/rooms + authoritative simulation
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

require('./public/js/data.js');
require('./public/js/mapdata.js');
require('./public/js/artsets.js');
require('./public/js/config.js');
require('./public/js/sim.js');
require('./public/js/ai.js');
const GA = globalThis.GA;

const PORT = +process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const TRUST_PROXY = /^(1|true|yes)$/i.test(process.env.TRUST_PROXY || '');
const MM_PAIR_WAIT = +process.env.MM_PAIR_WAIT || 15;   // seconds before a 2-player match is accepted
const MM_BOT_WAIT = +process.env.MM_BOT_WAIT || 40;     // seconds before a lone player gets AI opponents
const MM_START_DELAY = +process.env.MM_START_DELAY || 5; // "match found" countdown
// AI pictures for buildings / units (Admin > Structures / Units > "Draw"). The key never leaves the server.
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || '').trim();
const GEMINI_IMAGE_MODEL = (process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image').trim();
const GEMINI_BASE = (process.env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) for (const i of list || []) if (i.family === 'IPv4' && !i.internal) out.push(i.address);
  return out;
}

// ------------------------------------------------------------------ persistence (plain JSON files)
fs.mkdirSync(DATA_DIR, { recursive: true });
const readJson = (name, fallback) => {
  try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), 'utf8')); } catch { return fallback; }
};
const writers = {};
function writeJson(name, obj) {
  clearTimeout(writers[name]);
  writers[name] = setTimeout(() => {
    const file = path.join(DATA_DIR, name), tmp = file + '.tmp';
    try { fs.writeFileSync(tmp, JSON.stringify(obj, null, 2)); fs.renameSync(tmp, file); } catch (e) { console.error('write failed', name, e.message); }
  }, 150);
}

// ------------------------------------------------------------------ pictures (data/art/<type>-<version>.png)
const ART_DIR = path.join(DATA_DIR, 'art');
fs.mkdirSync(ART_DIR, { recursive: true });
const ART_FILE_RE = /^([a-z0-9_]{2,16})-(\d{1,13})\.png$/;
const ART_MAX_BYTES = 800 * 1024, ART_MAX_SIDE = 2048, ART_MAX_FILES = 300; // a picture may be a strip of up to 8 animation frames
const artPath = (id, v) => path.join(ART_DIR, id + '-' + v + '.png');
const validArtType = (id) => typeof id === 'string' && (GA.BUILTIN_TYPES.includes(id) || GA.CUSTOM_TYPE_ID.test(id));
// Reads width / height of a PNG without decoding it; null when it is not a PNG.
function pngSize(buf) {
  if (buf.length < 33 || buf.readUInt32BE(0) !== 0x89504e47 || buf.readUInt32BE(4) !== 0x0d0a1a0a || buf.toString('latin1', 12, 16) !== 'IHDR') return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}
// Files that no saved config points to are removed once they are a day old - an upload waits for the admin to press Save,
// and a "Reset" must not destroy pictures at once. Only ever run when the config is saved, never at start-up (a deploy must not delete anything).
const ART_KEEP_MS = 24 * 3600 * 1000;
function gcArt(keep) {
  const used = new Set();
  for (const st of Object.values(keep.sets || {})) for (const [id, a] of Object.entries(st.art)) if (!a.ref) used.add(id + '-' + a.v + '.png');
  let names = [];
  try { names = fs.readdirSync(ART_DIR); } catch { return; }
  for (const n of names) {
    if (used.has(n)) continue;
    try { const f = path.join(ART_DIR, n); if (Date.now() - fs.statSync(f).mtimeMs > ART_KEEP_MS) fs.unlinkSync(f); } catch { /* ignore */ }
  }
}
// Drops picture references whose file is missing (e.g. after restoring an old data folder).
function withExistingArt(cfg) {
  for (const st of Object.values(cfg.sets || {})) for (const [id, a] of Object.entries(st.art)) if (!a.ref && !fs.existsSync(artPath(id, a.v))) delete st.art[id];
  return cfg;
}

const ART_STYLES = {
  neon: 'Clean stylized digital game art, dark steel armor with glowing cyan neon accents, crisp edges, soft shading, high contrast.',
  painted: 'Hand-painted concept-art look, rich saturated colors, detailed textures, dramatic lighting.',
  pixel: 'Chunky retro pixel art with a limited palette, hard pixel edges, no blur.',
  toon: 'Bold cartoon game art, thick clean outlines, flat bright colors with simple cel shading.',
};
const ART_MOTIONS = {
  idle: 'a HOVER / IDLE glow loop: cell 1 base pose, cell 2 raised slightly with lights a little brighter, cell 3 raised the most with lights brightest, cell 4 back down slightly; the body, turret and details stay identical',
  walk: 'a WALK / MOVE cycle with clearly different poses: cell 1 right foot (or front wheel/leg) far forward, cell 2 legs together passing, cell 3 left foot far forward, cell 4 legs together passing - exaggerate the difference between poses',
};
function artPrompt(kind, subject, style, hasRef, frames, motion) {
  const what = kind === 'b' ? 'a single sci-fi BUILDING' : 'a single sci-fi military UNIT (vehicle, walker, aircraft or soldier)';
  const rules = 'No text, no logos, no UI, no ground plane, no scenery, no cast shadow. ' +
    'The whole image background must be one perfectly flat solid pure magenta color (#FF00FF) with nothing else in it, and the object itself must not contain magenta.';
  const look = `Subject: ${subject}. ${ART_STYLES[style] || ART_STYLES.neon} Camera: isometric 2.5D, high three-quarter view from above${kind === 'u' ? ', the unit faces to the RIGHT' : ''}. `;
  const ref = hasRef ? 'The attached image is the current picture (or a rough sketch): keep its overall design, proportions and silhouette unless the subject asks for a change. ' : '';
  if (frames === 4) {
    return `Create a 2x2 SPRITE SHEET (four equal square cells in a 2-by-2 grid, no borders or gridlines) for a real-time strategy game: the SAME ${what} in four animation frames. ` + look + ref +
      `Every cell has identical design, colors, size and camera angle; cell order left-to-right, top-to-bottom is one looping animation: ${ART_MOTIONS[motion] || ART_MOTIONS.idle}. ` +
      'Each object is centered in its own cell with a margin, with its base at the same height in every cell. ' + rules;
  }
  return `Design ${what} as a sprite for a real-time strategy game. ` + look + ref +
    'Show ONE object, centered, fully inside the image with a small margin. ' + rules;
}
let artBusy = 0;
function geminiGenerate(text, ref) {
  return new Promise((resolve, reject) => {
    if (!GEMINI_API_KEY) return reject(Object.assign(new Error('AI drawing is not set up: put GEMINI_API_KEY in the .env file and restart the server.'), { status: 503 }));
    const parts = [{ text }];
    if (ref) parts.push({ inline_data: { mime_type: ref.mime, data: ref.data } });
    const body = JSON.stringify({ contents: [{ parts }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } });
    const u = new URL(`${GEMINI_BASE}/v1beta/models/${encodeURIComponent(GEMINI_IMAGE_MODEL)}:generateContent`);
    const req = (u.protocol === 'http:' ? http : https).request(u, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'x-goog-api-key': GEMINI_API_KEY } }, (res) => {
      const chunks = []; let size = 0;
      res.on('data', (c) => { size += c.length; if (size > 30 * 1024 * 1024) req.destroy(new Error('AI answer too large')); else chunks.push(c); });
      res.on('end', () => {
        let j;
        try { j = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return reject(Object.assign(new Error('AI service sent an unreadable answer'), { status: 502 })); }
        if (res.statusCode >= 400 || j.error) {
          const msg = String((j.error && j.error.message) || 'HTTP ' + res.statusCode).replace(/AIza[\w-]+/g, '<key>').slice(0, 300);
          return reject(Object.assign(new Error('AI service: ' + msg), { status: res.statusCode === 429 ? 429 : 502 }));
        }
        const cand = (j.candidates || [])[0], cp = (cand && cand.content && cand.content.parts) || [];
        const img = cp.find((p) => (p.inlineData || p.inline_data));
        if (!img) {
          const why = (j.promptFeedback && j.promptFeedback.blockReason) || (cand && cand.finishReason) || 'no picture returned';
          const said = cp.map((p) => p.text).filter(Boolean).join(' ').slice(0, 200);
          return reject(Object.assign(new Error('The AI did not draw anything (' + why + ')' + (said ? ': ' + said : '') + '. Try a different description.'), { status: 422 }));
        }
        const d = img.inlineData || img.inline_data;
        resolve({ mime: d.mimeType || d.mime_type || 'image/png', data: d.data });
      });
    });
    req.setTimeout(120000, () => req.destroy(new Error('The AI took too long to answer')));
    req.on('error', (e) => reject(e.status ? e : Object.assign(new Error(String(e.message).replace(/AIza[\w-]+/g, '<key>')), { status: 502 })));
    req.end(body);
  });
}
const dataUrl = (s, max) => {
  const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(s || ''));
  return m && m[2].length <= max ? { mime: m[1], data: m[2] } : null;
};

// ------------------------------------------------------------------ users / sessions
const db = readJson('users.json', { users: {} });
if (!db.users) db.users = {};
const sessions = new Map(Object.entries(readJson('sessions.json', {})));
const saveUsers = () => writeJson('users.json', db);
const saveSessions = () => writeJson('sessions.json', Object.fromEntries(sessions));

function ensureStats(u) {
  if (u.games == null) u.games = 0;
  if (u.wins == null) u.wins = 0;
  if (u.rating == null) u.rating = 1000;
  if (u.peak == null) u.peak = u.rating;
  for (const k of ['ranked', 'kills', 'lost', 'built', 'playtime', 'streak', 'bestStreak']) if (u[k] == null) u[k] = 0;
  if (!u.practice) u.practice = { games: 0, wins: 0 };
  return u;
}
for (const u of Object.values(db.users)) ensureStats(u);

const USERNAME_RE = /^[A-Za-z0-9_-]{3,16}$/;
function hashPassword(pw, salt) { return crypto.scryptSync(pw, salt, 64).toString('hex'); }
function checkPassword(user, pw) {
  const a = Buffer.from(hashPassword(pw, user.salt), 'hex'), b = Buffer.from(user.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function createUser(name, pw, role) {
  const salt = crypto.randomBytes(16).toString('hex');
  db.users[name.toLowerCase()] = ensureStats({ name, salt, hash: hashPassword(pw, salt), role: role || 'user', created: Date.now(), lastLogin: 0, lastIp: '' });
  saveUsers();
  return db.users[name.toLowerCase()];
}
const publicUser = (u) => ({
  name: u.name, role: u.role, games: u.games, wins: u.wins, rating: u.rating, peak: u.peak, ranked: u.ranked,
  kills: u.kills, lost: u.lost, built: u.built, playtime: u.playtime, streak: u.streak, bestStreak: u.bestStreak, practice: u.practice,
});
function newSession(u, ip) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, { user: u.name.toLowerCase(), exp: Date.now() + 30 * 24 * 3600 * 1000 });
  u.lastLogin = Date.now(); u.lastIp = ip || '';
  saveUsers(); saveSessions();
  return token;
}
function userFromToken(token) {
  const s = token && sessions.get(token);
  if (!s) return null;
  if (s.exp < Date.now()) { sessions.delete(token); saveSessions(); return null; }
  return db.users[s.user] || null;
}

// ------------------------------------------------------------------ sign-in / audit log (JSON lines + in-memory ring)
const LOG_FILE = path.join(DATA_DIR, 'auth.log');
const LOG_MAX_BYTES = 2 * 1024 * 1024;
const logRing = [];
let logId = 0, logWrites = 0;
(function loadLogs() {
  try {
    const st = fs.statSync(LOG_FILE);
    const len = Math.min(st.size, 1024 * 1024);
    const buf = Buffer.alloc(len);
    const fd = fs.openSync(LOG_FILE, 'r');
    fs.readSync(fd, buf, 0, len, st.size - len);
    fs.closeSync(fd);
    for (const line of buf.toString('utf8').split('\n').slice(st.size > len ? 1 : 0)) {
      if (!line.trim()) continue;
      try { const e = JSON.parse(line); logRing.push(e); if (e.id > logId) logId = e.id; } catch { /* skip torn line */ }
    }
    while (logRing.length > 3000) logRing.shift();
  } catch { /* no log yet */ }
})();
function logEvent(event, o) {
  o = o || {};
  const e = { id: ++logId, t: Date.now(), event, user: o.user || '', ip: o.ip || '', ua: (o.ua || '').slice(0, 160), ok: o.ok !== false, note: (o.note || '').slice(0, 200) };
  logRing.push(e);
  if (logRing.length > 3000) logRing.shift();
  fs.appendFile(LOG_FILE, JSON.stringify(e) + '\n', () => {});
  if (++logWrites % 100 === 0) {
    try { if (fs.statSync(LOG_FILE).size > LOG_MAX_BYTES) fs.renameSync(LOG_FILE, LOG_FILE + '.1'); } catch { /* ignore */ }
  }
  return e;
}
function clientIp(req) {
  let ip = req.socket.remoteAddress || '';
  if (TRUST_PROXY) {
    const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (xf) ip = xf;
  }
  return ip.replace(/^::ffff:/, '');
}
const who = (req) => ({ ip: clientIp(req), ua: String(req.headers['user-agent'] || '') });

// optional bootstrap admin from the environment
if (process.env.ADMIN_USER && process.env.ADMIN_PASS && !db.users[process.env.ADMIN_USER.toLowerCase()] && USERNAME_RE.test(process.env.ADMIN_USER)) {
  createUser(process.env.ADMIN_USER, process.env.ADMIN_PASS, 'admin');
  logEvent('register', { user: process.env.ADMIN_USER, note: 'admin bootstrapped from environment' });
  console.log('  Created admin account from ADMIN_USER / ADMIN_PASS');
}

// ------------------------------------------------------------------ match history + Elo
const matchDb = readJson('matches.json', { nextId: 1, matches: [] });
if (!matchDb.matches) matchDb.matches = [];
const saveMatches = () => writeJson('matches.json', matchDb);
const MATCH_KEEP = 500;

// FFA Elo: every pair of human players is a mini duel decided by placement. Zero-sum.
function eloDeltas(humans) {
  const K = 32, n = humans.length, out = humans.map(() => 0);
  if (n < 2) return out;
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
    const ra = humans[a].rating, rb = humans[b].rating;
    const ea = 1 / (1 + Math.pow(10, (rb - ra) / 400));
    const sa = humans[a].place < humans[b].place ? 1 : humans[a].place > humans[b].place ? 0 : 0.5;
    const d = (K / (n - 1)) * (sa - ea);
    out[a] += d; out[b] -= d;
  }
  return out.map((x) => Math.round(x));
}

// ------------------------------------------------------------------ admin-editable game configuration
// ---- custom maps made in the admin map editor (data/maps.json)
let savedMaps = [];
for (const m of readJson('maps.json', { maps: [] }).maps || []) {
  const v = GA.validateMap(m);
  if (GA.CUSTOM_MAP_ID.test(m.id) && !v.errors.length) savedMaps.push({ id: m.id, ...v.map, by: m.by || '', t: m.t || 0 });
}
GA.setCustomMaps(savedMaps);
const publicMaps = () => savedMaps.map(({ id, name, desc, terrain, ore, starts, neutrals }) => ({ id, name, desc, terrain, ore, starts, neutrals }));
const saveMaps = () => { GA.setCustomMaps(savedMaps); writeJson('maps.json', { maps: savedMaps }); };

let savedConfig = withExistingArt(GA.cleanConfig(readJson('config.json', {})));
GA.applyConfig(savedConfig);
const rooms = new Map();
const anyPlaying = () => [...rooms.values()].some((r) => r.state === 'playing' && r.sim && !r.sim.over);
function applyConfigIfIdle() {
  if (anyPlaying()) return false;
  GA.applyConfig(savedConfig);
  return true;
}

// ------------------------------------------------------------------ HTTP
const loginFails = new Map();
function rateLimited(ip) {
  const f = loginFails.get(ip);
  return f && f.n >= 8 && f.until > Date.now();
}
function noteFail(ip) {
  const f = loginFails.get(ip) || { n: 0, until: 0 };
  if (f.until < Date.now()) f.n = 0;
  f.n++; f.until = Date.now() + 5 * 60 * 1000;
  loginFails.set(ip, f);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (e) { reject(new Error('bad json')); } });
    req.on('error', reject);
  });
}
const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };

// compact view of a match from one player's perspective
function matchView(m, name) {
  const me = m.players.find((p) => p.user === name);
  return {
    id: m.id, t: m.t, dur: m.dur, mode: m.mode, map: m.map || null, of: m.players.length,
    place: me ? me.place : null, won: me ? me.won : false, quit: me ? !!me.quit : false,
    delta: me && me.rating ? me.rating.after - me.rating.before : null, ratingAfter: me && me.rating ? me.rating.after : null,
    kills: me ? me.kills : 0, lost: me ? me.lost : 0, color: me ? me.color : 0,
    opponents: m.players.filter((p) => p.user !== name).map((p) => ({ name: p.user || p.botName || 'AI', bot: !!p.bot, place: p.place })),
  };
}
function leaderboard(limit) {
  return Object.values(db.users).filter((u) => u.ranked > 0).sort((a, b) => b.rating - a.rating || b.wins - a.wins)
    .slice(0, limit || 20).map((u, i) => ({ rank: i + 1, name: u.name, rating: u.rating, peak: u.peak, ranked: u.ranked, games: u.games, wins: u.wins }));
}

async function handleApi(req, res, url) {
  const { ip, ua } = who(req);
  const auth = (req.headers.authorization || '').replace(/^Bearer /, '');
  const me = userFromToken(auth);
  const m = req.method;
  const query = new URLSearchParams((req.url.split('?')[1]) || '');
  try {
    if (url === '/api/info' && m === 'GET') return json(res, 200, { ips: lanAddresses(), port: PORT });
    if (url === '/api/config' && m === 'GET') return json(res, 200, { config: savedConfig, maps: publicMaps() });

    if (url === '/api/register' && m === 'POST') {
      const b = await readBody(req, 4096);
      const name = String(b.username || '').trim(), pw = String(b.password || '');
      if (!USERNAME_RE.test(name)) return json(res, 400, { error: 'Username must be 3-16 characters: letters, numbers, _ or -' });
      if (pw.length < 6 || pw.length > 64) return json(res, 400, { error: 'Password must be 6-64 characters' });
      if (db.users[name.toLowerCase()]) { logEvent('register', { user: name, ip, ua, ok: false, note: 'username taken' }); return json(res, 409, { error: 'That username is already taken' }); }
      const first = Object.keys(db.users).length === 0;
      const u = createUser(name, pw, first ? 'admin' : 'user');
      logEvent('register', { user: u.name, ip, ua, note: first ? 'first account - admin' : '' });
      return json(res, 200, { token: newSession(u, ip), user: publicUser(u), firstAdmin: first });
    }
    if (url === '/api/login' && m === 'POST') {
      const b = await readBody(req, 4096);
      const attempted = String(b.username || '').trim().slice(0, 32);
      if (rateLimited(ip)) { logEvent('login_blocked', { user: attempted, ip, ua, ok: false, note: 'rate limited' }); return json(res, 429, { error: 'Too many attempts. Try again in a few minutes.' }); }
      const u = db.users[attempted.toLowerCase()];
      if (!u || !checkPassword(u, String(b.password || ''))) { noteFail(ip); logEvent('login_failed', { user: u ? u.name : attempted, ip, ua, ok: false, note: u ? 'wrong password' : 'unknown user' }); return json(res, 401, { error: 'Wrong username or password' }); }
      loginFails.delete(ip);
      logEvent('login', { user: u.name, ip, ua });
      return json(res, 200, { token: newSession(u, ip), user: publicUser(u) });
    }
    if (url === '/api/logout' && m === 'POST') {
      if (auth) { if (me) logEvent('logout', { user: me.name, ip, ua }); sessions.delete(auth); saveSessions(); }
      return json(res, 200, { ok: true });
    }
    if (url === '/api/me' && m === 'GET') return me ? json(res, 200, { user: publicUser(me) }) : json(res, 401, { error: 'Not signed in' });

    // ---- signed-in player endpoints
    if (url.startsWith('/api/') && !url.startsWith('/api/admin/') && ['/api/stats/me', '/api/leaderboard', '/api/practice', '/api/matches'].includes(url)) {
      if (!me) return json(res, 401, { error: 'Not signed in' });
      if (url === '/api/stats/me' && m === 'GET') {
        const rankedList = leaderboard(100000);
        const mine = rankedList.find((x) => x.name === me.name);
        const recent = matchDb.matches.filter((x) => x.players.some((p) => p.user === me.name)).slice(-15).reverse().map((x) => matchView(x, me.name));
        const logins = logRing.filter((e) => e.user.toLowerCase() === me.name.toLowerCase() && ['login', 'login_failed', 'register'].includes(e.event)).slice(-12).reverse()
          .map((e) => ({ t: e.t, event: e.event, ok: e.ok, ip: e.ip, ua: e.ua, note: e.note }));
        return json(res, 200, { user: publicUser(me), rank: mine ? mine.rank : null, players: rankedList.length, recent, logins });
      }
      if (url === '/api/leaderboard' && m === 'GET') return json(res, 200, { top: leaderboard(20) });
      if (url === '/api/matches' && m === 'GET') {
        const list = matchDb.matches.slice(-20).reverse().map((x) => ({ id: x.id, t: x.t, dur: x.dur, mode: x.mode, players: x.players.map((p) => ({ name: p.user || p.botName || 'AI', bot: !!p.bot, place: p.place, color: p.color, won: p.won })) }));
        return json(res, 200, { matches: list });
      }
      if (url === '/api/practice' && m === 'POST') {
        // offline skirmish results are reported by the client - kept separate from ranked stats
        const b = await readBody(req, 1024);
        const secs = Math.min(4 * 3600, Math.max(0, +b.seconds || 0));
        if (secs >= 60) {
          me.practice.games++;
          if (b.won === true) me.practice.wins++;
          me.playtime += Math.floor(secs);
          saveUsers();
        }
        return json(res, 200, { ok: true, practice: me.practice });
      }
    }

    // ---- admin
    if (url.startsWith('/api/admin/')) {
      if (!me) return json(res, 401, { error: 'Not signed in' });
      if (me.role !== 'admin') return json(res, 403, { error: 'Admin only' });
      if (url === '/api/admin/users' && m === 'GET') {
        const online = new Set([...wss.clients].filter((w) => w.user).map((w) => w.user.name));
        return json(res, 200, { users: Object.values(db.users).map((u) => ({ ...publicUser(u), created: u.created, lastLogin: u.lastLogin, lastIp: u.lastIp || '', online: online.has(u.name) })) });
      }
      if (url === '/api/admin/users/role' && m === 'POST') {
        const b = await readBody(req, 1024);
        const u = db.users[String(b.name || '').toLowerCase()];
        if (!u) return json(res, 404, { error: 'No such user' });
        if (!['user', 'admin'].includes(b.role)) return json(res, 400, { error: 'Bad role' });
        if (u.role === 'admin' && b.role === 'user' && Object.values(db.users).filter((x) => x.role === 'admin').length <= 1) return json(res, 400, { error: 'Cannot demote the last admin' });
        u.role = b.role; saveUsers();
        logEvent('role_change', { user: me.name, ip, ua, note: `${u.name} -> ${b.role}` });
        return json(res, 200, { ok: true });
      }
      if (url === '/api/admin/users/password' && m === 'POST') {
        const b = await readBody(req, 1024);
        const u = db.users[String(b.name || '').toLowerCase()];
        if (!u) return json(res, 404, { error: 'No such user' });
        const pw = String(b.password || '');
        if (pw.length < 6 || pw.length > 64) return json(res, 400, { error: 'Password must be 6-64 characters' });
        u.salt = crypto.randomBytes(16).toString('hex'); u.hash = hashPassword(pw, u.salt); saveUsers();
        for (const [t, s] of sessions) if (s.user === u.name.toLowerCase()) sessions.delete(t);
        saveSessions();
        logEvent('password_reset', { user: me.name, ip, ua, note: `for ${u.name}` });
        return json(res, 200, { ok: true });
      }
      if (url === '/api/admin/users/resetstats' && m === 'POST') {
        const b = await readBody(req, 1024);
        const u = db.users[String(b.name || '').toLowerCase()];
        if (!u) return json(res, 404, { error: 'No such user' });
        Object.assign(u, { games: 0, wins: 0, rating: 1000, peak: 1000, ranked: 0, kills: 0, lost: 0, built: 0, playtime: 0, streak: 0, bestStreak: 0, practice: { games: 0, wins: 0 } });
        saveUsers();
        logEvent('stats_reset', { user: me.name, ip, ua, note: `for ${u.name}` });
        return json(res, 200, { ok: true });
      }
      if (url === '/api/admin/users/delete' && m === 'POST') {
        const b = await readBody(req, 1024);
        const key = String(b.name || '').toLowerCase();
        const u = db.users[key];
        if (!u) return json(res, 404, { error: 'No such user' });
        if (u.role === 'admin' && Object.values(db.users).filter((x) => x.role === 'admin').length <= 1) return json(res, 400, { error: 'Cannot delete the last admin' });
        delete db.users[key];
        for (const [t, s] of sessions) if (s.user === key) sessions.delete(t);
        saveUsers(); saveSessions();
        logEvent('account_deleted', { user: me.name, ip, ua, note: `deleted ${u.name}` });
        for (const w of wss.clients) if (w.user && w.user.name.toLowerCase() === key) { send(w, { t: 'err', msg: 'Your account was removed', code: 'auth' }); w.close(); }
        return json(res, 200, { ok: true });
      }
      if (url === '/api/admin/logs' && m === 'GET') {
        const events = (query.get('event') || '').split(',').filter(Boolean);
        const user = (query.get('user') || '').toLowerCase();
        const q = (query.get('q') || '').toLowerCase();
        const okOnly = query.get('ok');
        const before = +query.get('before') || Infinity;
        const limit = Math.min(1000, Math.max(1, +query.get('limit') || 100));
        const rows = [];
        for (let i = logRing.length - 1; i >= 0 && rows.length < limit; i--) {
          const e = logRing[i];
          if (e.id >= before) continue;
          if (events.length && !events.includes(e.event)) continue;
          if (user && !e.user.toLowerCase().includes(user)) continue;
          if (q && !(e.ip + ' ' + e.note + ' ' + e.ua).toLowerCase().includes(q)) continue;
          if (okOnly === '1' && !e.ok) continue;
          if (okOnly === '0' && e.ok) continue;
          rows.push(e);
        }
        if (query.get('format') === 'csv') {
          const esc = (v) => '"' + String(v).replace(/"/g, '""') + '"';
          const csv = ['id,time,event,user,ok,ip,note,user_agent'].concat(rows.map((e) => [e.id, new Date(e.t).toISOString(), e.event, e.user, e.ok, e.ip, e.note, e.ua].map(esc).join(','))).join('\n');
          res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="auth-log.csv"', 'Cache-Control': 'no-store' });
          return res.end(csv);
        }
        return json(res, 200, { logs: rows, total: logRing.length });
      }
      if (url === '/api/admin/matches' && m === 'GET') {
        const limit = Math.min(200, Math.max(1, +query.get('limit') || 50));
        return json(res, 200, { total: matchDb.matches.length, matches: matchDb.matches.slice(-limit).reverse() });
      }
      if (url === '/api/admin/rooms' && m === 'GET') {
        return json(res, 200, {
          rooms: [...rooms.values()].map((r) => ({ code: r.code, state: r.state, host: r.slots[0].name, players: r.humans().map((s) => s.name), time: r.sim ? Math.floor(r.sim.time) : 0, ranked: !!r.ranked, matchmade: !!r.matchmade })),
          playing: anyPlaying(), queue: queue.map((q) => ({ name: q.ws.user.name, rating: q.ws.user.rating, waited: Math.floor((Date.now() - q.since) / 1000), bots: q.bots })),
        });
      }
      if (url === '/api/admin/rooms/close' && m === 'POST') {
        const b = await readBody(req, 1024);
        const r = rooms.get(String(b.code || '').toUpperCase());
        if (!r) return json(res, 404, { error: 'No such room' });
        logEvent('room_closed', { user: me.name, ip, ua, note: r.code });
        r.close('Closed by an admin');
        return json(res, 200, { ok: true });
      }
      if (url === '/api/admin/maps' && m === 'GET') return json(res, 200, { maps: savedMaps, limit: GA.MAP_LIMITS.maxMaps });
      if (url === '/api/admin/maps' && m === 'PUT') {
        const b = await readBody(req, 600 * 1024);
        const raw = b.map || {};
        const v = GA.validateMap(raw);
        const fmt = (list) => list.map((x) => (x.v ? x.k.replace(/\{(\w+)\}/g, (mm, k) => (x.v[k] != null ? x.v[k] : mm)) : x.k));
        if (v.errors.length) return json(res, 400, { error: fmt(v.errors).join('; '), errors: v.errors, warnings: v.warnings });
        let entry = raw.id ? savedMaps.find((x) => x.id === raw.id) : null;
        if (raw.id && !entry) return json(res, 404, { error: 'No such map' });
        if (!entry) {
          if (savedMaps.length >= GA.MAP_LIMITS.maxMaps) return json(res, 400, { error: `At most ${GA.MAP_LIMITS.maxMaps} custom maps` });
          let id; do { id = 'c_' + crypto.randomBytes(4).toString('hex'); } while (savedMaps.some((x) => x.id === id));
          entry = { id };
          savedMaps.push(entry);
        }
        Object.assign(entry, v.map, { by: me.name, t: Date.now() });
        saveMaps();
        logEvent('map_saved', { user: me.name, ip, ua, note: entry.name + ' (' + entry.id + ')' });
        return json(res, 200, { map: entry, maps: savedMaps, warnings: v.warnings });
      }
      if (url === '/api/admin/maps/delete' && m === 'POST') {
        const b = await readBody(req, 1024);
        const i = savedMaps.findIndex((x) => x.id === b.id);
        if (i < 0) return json(res, 404, { error: 'No such map' });
        const [gone] = savedMaps.splice(i, 1);
        saveMaps();
        logEvent('map_deleted', { user: me.name, ip, ua, note: gone.name + ' (' + gone.id + ')' });
        return json(res, 200, { maps: savedMaps });
      }
      // ---- pictures for buildings / units
      if (url === '/api/admin/art/info' && m === 'GET') return json(res, 200, { ai: !!GEMINI_API_KEY, model: GEMINI_API_KEY ? GEMINI_IMAGE_MODEL : '' });
      if (url === '/api/admin/art/generate' && m === 'POST') {
        const b = await readBody(req, 3 * 1024 * 1024);
        const prompt = String(b.prompt || '').replace(/\s+/g, ' ').trim().slice(0, 500);
        if (prompt.length < 3) return json(res, 400, { error: 'Describe what to draw (at least a few words).' });
        if (b.kind !== 'b' && b.kind !== 'u') return json(res, 400, { error: 'kind must be b or u' });
        const frames = b.frames === undefined || b.frames === 1 ? 1 : b.frames;
        if (frames !== 1 && frames !== 4) return json(res, 400, { error: 'frames must be 1 or 4' });
        const ref = b.ref ? dataUrl(b.ref, 2.8 * 1024 * 1024) : null;
        if (b.ref && !ref) return json(res, 400, { error: 'The reference picture is not a valid PNG/JPEG/WebP.' });
        if (!GEMINI_API_KEY) return json(res, 503, { error: 'AI drawing is not set up: put GEMINI_API_KEY in the .env file and restart the server.' });
        if (artBusy >= 2) return json(res, 429, { error: 'Two pictures are already being drawn - wait a moment.' });
        artBusy++;
        try {
          const img = await geminiGenerate(artPrompt(b.kind, prompt, b.style, !!ref, frames, b.motion), ref);
          logEvent('art_generated', { user: me.name, ip, ua, note: (b.kind === 'b' ? 'building' : 'unit') + (frames === 4 ? ' x4 frames' : '') + ': ' + prompt.slice(0, 80) });
          return json(res, 200, { image: `data:${img.mime};base64,${img.data}` });
        } catch (e) {
          logEvent('art_generated', { user: me.name, ip, ua, ok: false, note: e.message.slice(0, 120) });
          return json(res, e.status || 502, { error: e.message });
        } finally { artBusy--; }
      }
      if (url === '/api/admin/art' && m === 'PUT') {
        const b = await readBody(req, 1024 * 1024);
        if (!validArtType(b.type)) return json(res, 400, { error: 'Unknown building / unit id' });
        const png = dataUrl(b.png, ART_MAX_BYTES * 1.4);
        const buf = png && png.mime === 'image/png' ? Buffer.from(png.data, 'base64') : null;
        const size = buf && pngSize(buf);
        if (!size) return json(res, 400, { error: 'The picture must be a PNG.' });
        if (buf.length > ART_MAX_BYTES) return json(res, 413, { error: 'The picture is too big (max ' + ART_MAX_BYTES / 1024 + ' KB) - use a smaller size.' });
        if (size.w < 8 || size.h < 8 || size.w > ART_MAX_SIDE || size.h > ART_MAX_SIDE) return json(res, 400, { error: `The picture must be between 8 and ${ART_MAX_SIDE} pixels on each side.` });
        if (fs.readdirSync(ART_DIR).length >= ART_MAX_FILES) return json(res, 507, { error: 'Too many stored pictures - save your config (unused ones are cleaned up after a day) and try again.' });
        let v = Math.floor(Date.now() / 1000);
        while (fs.existsSync(artPath(b.type, v))) v++;
        const tmp = artPath(b.type, v) + '.tmp';
        fs.writeFileSync(tmp, buf); fs.renameSync(tmp, artPath(b.type, v));
        logEvent('art_uploaded', { user: me.name, ip, ua, note: b.type + ' (' + Math.round(buf.length / 1024) + ' KB)' });
        return json(res, 200, { v });
      }
      if (url === '/api/admin/config' && m === 'GET') return json(res, 200, { config: savedConfig, applied: GA.CONFIG, playing: anyPlaying() });
      if (url === '/api/admin/config' && m === 'PUT') {
        const b = await readBody(req, 512 * 1024);
        savedConfig = withExistingArt(GA.cleanConfig(b.config));
        writeJson('config.json', savedConfig);
        gcArt(savedConfig);
        logEvent('config_saved', { user: me.name, ip, ua, note: Object.keys(savedConfig).filter((k) => Object.keys(savedConfig[k]).length).join(', ') || 'defaults' });
        const applied = applyConfigIfIdle();
        return json(res, 200, { config: savedConfig, appliedNow: applied });
      }
      if (url === '/api/admin/config/reset' && m === 'POST') {
        savedConfig = GA.cleanConfig({});
        writeJson('config.json', savedConfig);
        gcArt(savedConfig);
        logEvent('config_reset', { user: me.name, ip, ua });
        return json(res, 200, { config: savedConfig, appliedNow: applyConfigIfIdle() });
      }
      return json(res, 404, { error: 'Unknown admin endpoint' });
    }
    return json(res, 404, { error: 'Not found' });
  } catch (e) {
    return json(res, e.message === 'too large' ? 413 : 400, { error: e.message });
  }
}

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url.startsWith('/api/')) { handleApi(req, res, url); return; }
  if (url.startsWith('/sets/')) { // pictures of the built-in sets (files in public/sets/<set>/<type>.png; the ?v= in the link changes when one is replaced)
    const m = /^\/sets\/(v\d{1,2})\/([a-z0-9_]{2,16})\.png$/.exec(url);
    fs.readFile(m ? path.join(PUBLIC, 'sets', m[1], m[2] + '.png') : '', (err, data) => {
      if (!m || err) { res.writeHead(404); res.end('Not found'); return; }
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' });
      res.end(data);
    });
    return;
  }
  if (url.startsWith('/art/')) {
    const m = ART_FILE_RE.exec(url.slice(5));
    if (!m) { res.writeHead(404); res.end('Not found'); return; }
    fs.readFile(artPath(m[1], m[2]), (err, data) => {
      if (err) { res.writeHead(404); res.end('Not found'); return; }
      // the file name contains its version, so it never changes
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' });
      res.end(data);
    });
    return;
  }
  const rel = url === '/' ? 'index.html' : url === '/admin' ? 'admin.html' : url;
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

// ------------------------------------------------------------------ rooms
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
function newCode() {
  for (;;) {
    let c = '';
    for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    if (!rooms.has(c)) return c;
  }
}
const send = (ws, msg) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); };

class Room {
  constructor(host) {
    this.code = newCode();
    this.slots = [
      { kind: 'human', ws: host, name: host.user.name, team: 0, color: 0 },
      { kind: 'open', team: 1, color: 1 },
      { kind: 'open', team: 2, color: 2 },
    ];
    this.fill = 'normal';
    this.speed = 1;
    this.map = 'crossroads';
    this.state = 'lobby';
    this.sim = null;
    this.matchmade = false;
    this.ranked = false;
    this.quitAt = {};
    this.pidOf = new Map(); // ws -> pid
    host.room = this;
    rooms.set(this.code, this);
  }
  humans() { return this.slots.filter((s) => s.kind === 'human' && s.ws); }
  slotOf(ws) { return this.slots.findIndex((s) => s.ws === ws); }
  freeColor(except) {
    const used = new Set(this.slots.filter((s, i) => i !== except && s.kind !== 'closed').map((s) => s.color));
    for (let c = 0; c < GA.PALETTE.length; c++) if (!used.has(c)) return c;
    return 0;
  }
  summary() {
    const active = this.slots.filter((s) => s.kind !== 'closed');
    return {
      code: this.code, host: this.slots[0].name, state: this.state, map: this.map,
      humans: this.humans().map((s) => s.name), max: active.length,
      joinable: !this.matchmade && this.state === 'lobby' && this.slots.some((s) => s.kind === 'open' || s.kind === 'bot'),
    };
  }
  broadcastLobby() {
    if (this.matchmade) return;
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (s.kind !== 'human' || !s.ws) continue;
      send(s.ws, {
        t: 'room', code: this.code, state: this.state, you: i, host: i === 0, speed: this.speed, fill: this.fill, map: this.map,
        slots: this.slots.map((x) => ({ kind: x.kind, name: x.name || '', team: x.team, level: x.level || null, color: x.color })),
      });
    }
    broadcastRooms();
  }
  join(ws) {
    if (this.matchmade) return 'Room not available';
    if (this.state !== 'lobby') return 'Game already started';
    let i = this.slots.findIndex((s) => s.kind === 'open');
    if (i < 0) i = this.slots.findIndex((s) => s.kind === 'bot');
    if (i < 0) return 'Room is full';
    const old = this.slots[i];
    this.slots[i] = { kind: 'human', ws, name: ws.user.name, team: old.team, color: old.color };
    ws.room = this;
    this.broadcastLobby();
    return null;
  }
  leave(ws) {
    const i = this.slotOf(ws);
    ws.room = null;
    if (i < 0) return;
    if (this.state === 'lobby') {
      if (this.matchmade) {
        // somebody dropped during the "match found" countdown: an AI takes the seat
        const s = this.slots[i];
        this.slots[i] = { kind: 'bot', level: 'normal', name: 'AI', team: s.team, color: s.color };
        if (!this.humans().length) { this.destroy(); return; }
        this.ranked = this.humans().length >= 2;
      } else if (i === 0) {
        const nh = this.slots.findIndex((s, k) => k > 0 && s.kind === 'human' && s.ws);
        if (nh < 0) { this.destroy(); return; }
        const tmp = this.slots[0];
        this.slots[0] = this.slots[nh];
        this.slots[nh] = { kind: 'open', team: tmp.team, color: tmp.color };
        this.slots[0].team = 0;
      } else this.slots[i] = { kind: 'open', team: this.slots[i].team, color: this.slots[i].color };
      this.broadcastLobby();
      sendLobbyState(ws);
    } else {
      const pid = this.pidOf.get(ws);
      this.slots[i].ws = null;
      if (pid != null && this.sim) {
        const p = this.sim.players[pid];
        if (p && !this.sim.over) {
          if (this.quitAt[pid] == null) this.quitAt[pid] = this.sim.time;
          if (p.alive && !p.bot) {
            p.botLevel = 'normal'; p.bot = new GA.Bot(this.sim, p, 'normal');
            this.sim.emit({ e: 'msg', text: `${p.name} disconnected - AI took over`, kind: 'info' });
          }
        }
      }
      if (!this.humans().length) this.destroy();
      else broadcastRooms();
      sendLobbyState(ws);
    }
  }
  start() {
    if (this.state !== 'lobby') return;
    const players = [], slotPid = [];
    this.slots.forEach((s, i) => {
      if (s.kind === 'closed') { slotPid[i] = -1; return; }
      slotPid[i] = players.length;
      if (s.kind === 'human') players.push({ name: s.name, team: s.team, color: s.color, user: s.name });
      else { const lv = s.kind === 'bot' ? s.level : this.fill; players.push({ name: 'AI ' + (players.length + 1) + ' (' + lv + ')', team: s.team, color: s.color, bot: lv }); }
    });
    if (players.length < 2) { send(this.slots[0].ws, { t: 'err', msg: 'Need at least 2 players' }); return; }
    if (players.length > GA.mapMaxPlayers(this.map)) { send(this.slots[0].ws, { t: 'err', msg: `This map is for ${GA.mapMaxPlayers(this.map)} players - close a slot first` }); return; }
    if (new Set(players.map((p) => p.team)).size < 2) { send(this.slots[0].ws, { t: 'err', msg: 'All players are on the same team' }); return; }
    clearTimeout(this.startTimer);
    applyConfigIfIdle(); // pick up saved admin config when nothing else is running
    this.sim = new GA.Sim({ players, map: this.map });
    this.config = GA.CONFIG;
    this.state = 'playing';
    this.startedAt = Date.now();
    const info = this.sim.initInfo();
    this.slots.forEach((s, i) => {
      if (s.kind === 'human' && s.ws) {
        this.pidOf.set(s.ws, slotPid[i]);
        send(s.ws, { t: 'start', me: slotPid[i], map: info, speed: this.speed, config: GA.CONFIG, ranked: this.ranked });
      }
    });
    this.playerNames = players.map((p) => p.user || null);
    this.last = Date.now();
    this.acc = 0;
    this.timer = setInterval(() => this.loop(), 25);
    broadcastRooms();
  }
  loop() {
    const now = Date.now();
    this.acc += (now - this.last) / 1000 * this.speed;
    this.last = now;
    if (this.acc > 1) this.acc = 1;
    const humans = [], wsByPid = new Map();
    for (const s of this.slots) if (s.kind === 'human' && s.ws) { const pid = this.pidOf.get(s.ws); humans.push(pid); wsByPid.set(pid, s.ws); }
    while (this.acc >= GA.DT) {
      this.acc -= GA.DT;
      this.sim.step();
      if (this.sim.tick % 2 === 0) {
        const snaps = this.sim.flush(humans);
        for (const pid of humans) send(wsByPid.get(pid), snaps[pid]);
      }
    }
    if (this.sim.over && !this.overAt) {
      this.overAt = now;
      this.recordMatch(wsByPid);
      applyConfigIfIdle();
    }
    if (this.overAt && now - this.overAt > 5 * 60 * 1000) this.destroy();
  }
  // Placement, Elo, per-user stats and match history. Also used when a room is abandoned mid-game.
  recordMatch(wsByPid) {
    if (this.recorded || !this.sim || !this.playerNames) return;
    this.recorded = true;
    const sim = this.sim;
    const dur = Math.floor(sim.time);
    if (!sim.over && dur < 30) return; // ignore instant abandon
    const winTeam = sim.over ? sim.over.winnerTeam : -1;
    const info = sim.players.map((p, i) => {
      const quit = this.quitAt[i];
      let t;
      if (p.alive && quit == null) t = Infinity;
      else if (quit != null) t = Math.min(quit, p.elimAt != null ? p.elimAt : Infinity);
      else t = p.elimAt != null ? p.elimAt : 0;
      return { i, p, user: this.playerNames[i], quit, t };
    }).filter((x) => !x.p.neutral);
    info.forEach((x) => { x.place = 1 + info.filter((o) => o.t > x.t).length; });
    const humans = info.filter((x) => x.user && db.users[x.user.toLowerCase()]);
    const ranked = this.ranked && humans.length >= 2;
    const before = humans.map((h) => db.users[h.user.toLowerCase()].rating);
    const deltas = ranked ? eloDeltas(humans.map((h, k) => ({ rating: before[k], place: h.place }))) : humans.map(() => 0);
    const rec = { id: matchDb.nextId++, t: Date.now(), dur, mode: ranked ? 'ranked' : this.matchmade ? 'matchmaking' : 'custom', seed: sim.seed, map: sim.mapId, winnerTeam: winTeam, players: [] };
    for (const x of info) {
      const won = x.p.team === winTeam && x.p.alive && x.quit == null;
      const e = { user: x.user || null, bot: x.p.botLevel && !x.user ? x.p.botLevel : null, botName: x.user ? null : x.p.name, color: x.p.color, team: x.p.team, place: x.place, won, quit: x.quit != null, kills: x.p.stats.kills, lost: x.p.stats.lost, built: x.p.stats.built, rating: null };
      const hi = humans.indexOf(x);
      if (hi >= 0) {
        const u = db.users[x.user.toLowerCase()];
        ensureStats(u);
        const after = Math.max(100, before[hi] + deltas[hi]);
        if (ranked) { u.rating = after; u.peak = Math.max(u.peak, after); u.ranked++; e.rating = { before: before[hi], after }; }
        u.games++; if (won) u.wins++;
        u.kills += x.p.stats.kills; u.lost += x.p.stats.lost; u.built += x.p.stats.built; u.playtime += dur;
        u.streak = won ? u.streak + 1 : 0; u.bestStreak = Math.max(u.bestStreak, u.streak);
        const ws = wsByPid && wsByPid.get(x.i);
        if (ws) send(ws, { t: 'result', ranked, place: x.place, of: info.length, won, before: before[hi], after: e.rating ? after : null, delta: e.rating ? after - before[hi] : 0, streak: u.streak });
      }
      rec.players.push(e);
    }
    matchDb.matches.push(rec);
    if (matchDb.matches.length > MATCH_KEEP) matchDb.matches.splice(0, matchDb.matches.length - MATCH_KEEP);
    saveUsers(); saveMatches();
  }
  close(msg) {
    for (const s of this.humans()) { send(s.ws, { t: 'kicked', msg }); s.ws.room = null; sendLobbyState(s.ws); }
    this.destroy();
  }
  destroy() {
    clearTimeout(this.startTimer);
    if (this.timer) clearInterval(this.timer);
    if (this.state === 'playing') this.recordMatch(null);
    for (const s of this.slots) if (s.ws) s.ws.room = null;
    rooms.delete(this.code);
    applyConfigIfIdle();
    broadcastRooms();
  }
}

// ------------------------------------------------------------------ matchmaking
const queue = []; // { ws, since, bots }
const qRemove = (ws) => { const i = queue.findIndex((q) => q.ws === ws); if (i >= 0) queue.splice(i, 1); return i >= 0; };

function makeMatch(wsList, botCount) {
  const room = new Room(wsList[0]);
  room.matchmade = true;
  room.map = 'any'; // matchmaking picks one of the designed maps at random
  room.ranked = wsList.length >= 2;
  const used = new Set();
  const pick = (u) => {
    let c = u && Number.isInteger(u.pref) && u.pref >= 0 && u.pref < GA.PALETTE.length && !used.has(u.pref) ? u.pref : -1;
    if (c < 0) for (let k = 0; k < GA.PALETTE.length; k++) if (!used.has(k)) { c = k; break; }
    used.add(c);
    return c;
  };
  const avg = wsList.reduce((a, w) => a + w.user.rating, 0) / wsList.length;
  const level = avg < 900 ? 'easy' : avg < 1250 ? 'normal' : 'hard';
  room.slots = [0, 1, 2].map((i) => {
    if (i < wsList.length) { wsList[i].room = room; return { kind: 'human', ws: wsList[i], name: wsList[i].user.name, team: i, color: pick(wsList[i].user) }; }
    if (i < wsList.length + botCount) return { kind: 'bot', level, name: 'AI', team: i, color: pick(null) };
    return { kind: 'closed', team: i, color: pick(null) };
  });
  const players = room.slots.filter((s) => s.kind !== 'closed').map((s) => ({ name: s.kind === 'human' ? s.name : 'AI (' + s.level + ')', rating: s.kind === 'human' ? s.ws.user.rating : null, color: s.color, bot: s.kind === 'bot' }));
  for (const w of wsList) send(w, { t: 'matchfound', code: room.code, ranked: room.ranked, players, delay: MM_START_DELAY });
  room.startTimer = setTimeout(() => { if (rooms.has(room.code) && room.state === 'lobby') room.start(); }, MM_START_DELAY * 1000);
  broadcastRooms();
  return room;
}

function mmTick() {
  if (!queue.length) return;
  const now = Date.now();
  for (const q of queue) send(q.ws, { t: 'queue', n: queue.length, waited: Math.floor((now - q.since) / 1000), bots: q.bots });
  let progress = true;
  while (progress && queue.length) {
    progress = false;
    const first = queue[0];
    const w = (now - first.since) / 1000;
    const tol = (q) => 150 + 20 * ((now - q.since) / 1000); // the rating window widens the longer you wait
    const cands = queue.filter((q) => q === first || Math.abs(q.ws.user.rating - first.ws.user.rating) <= Math.min(tol(first), tol(q)))
      .sort((a, b) => (a === first ? -1 : b === first ? 1 : Math.abs(a.ws.user.rating - first.ws.user.rating) - Math.abs(b.ws.user.rating - first.ws.user.rating)));
    let group = null, bots = 0;
    if (cands.length >= 3) group = cands.slice(0, 3);
    else if (cands.length === 2 && w >= MM_PAIR_WAIT) group = cands;
    else if (cands.length === 1 && first.bots && w >= MM_BOT_WAIT) { group = cands; bots = 2; }
    if (group) {
      for (const g of group) qRemove(g.ws);
      makeMatch(group.map((g) => g.ws), bots);
      progress = true;
    }
  }
}
setInterval(mmTick, 1000);

// ------------------------------------------------------------------ websocket
const wss = new WebSocketServer({ server, maxPayload: 64 * 1024, perMessageDeflate: { threshold: 512 } });
const lobbyChat = [];

const roomList = () => [...rooms.values()].filter((r) => !r.matchmade).map((r) => r.summary());
const inLobby = (ws) => ws.user && !ws.room && ws.readyState === 1;
function onlineCount() { let n = 0; for (const w of wss.clients) if (w.user) n++; return n; }
function sendLobbyState(ws) {
  if (!inLobby(ws)) return;
  send(ws, { t: 'rooms', rooms: roomList(), online: onlineCount(), queued: queue.length });
}
function broadcastRooms() {
  const msg = { t: 'rooms', rooms: roomList(), online: onlineCount(), queued: queue.length };
  for (const w of wss.clients) if (inLobby(w)) send(w, msg);
}

wss.on('connection', (ws, req) => {
  ws.user = null;
  ws.alive = true;
  ws.info = who(req);
  ws.on('pong', () => { ws.alive = true; });
  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m.t !== 'string') return;
    if (m.t === 'auth') {
      const u = userFromToken(m.token);
      if (!u) { send(ws, { t: 'err', msg: 'Session expired - please sign in again', code: 'auth' }); return; }
      for (const w of wss.clients) if (w !== ws && w.user && w.user.name === u.name) {
        send(w, { t: 'err', msg: 'You signed in from another window', code: 'auth' });
        logEvent('session_replaced', { user: u.name, ip: ws.info.ip, ua: ws.info.ua, note: 'older connection closed' });
        qRemove(w);
        if (w.room) w.room.leave(w);
        w.user = null; w.close();
      }
      ws.user = u;
      send(ws, { t: 'authed', user: publicUser(u), chat: lobbyChat, rooms: roomList(), online: onlineCount(), queued: queue.length });
      broadcastRooms();
      return;
    }
    if (!ws.user) { send(ws, { t: 'err', msg: 'Not signed in', code: 'auth' }); return; }
    const room = ws.room;
    switch (m.t) {
      case 'lobby': sendLobbyState(ws); break;
      case 'lchat': {
        if (room) break;
        const text = String(m.text || '').slice(0, 160).trim();
        if (!text) break;
        const entry = { from: ws.user.name, text, admin: ws.user.role === 'admin' };
        lobbyChat.push(entry); if (lobbyChat.length > 30) lobbyChat.shift();
        for (const w of wss.clients) if (inLobby(w)) send(w, { t: 'lchat', ...entry });
        break;
      }
      case 'mm_join': {
        if (room) { send(ws, { t: 'err', msg: 'Leave your room before searching for a match' }); break; }
        if (queue.some((q) => q.ws === ws)) break;
        queue.push({ ws, since: Date.now(), bots: m.bots !== false });
        send(ws, { t: 'queue', n: queue.length, waited: 0, bots: m.bots !== false });
        broadcastRooms();
        break;
      }
      case 'mm_cancel': if (qRemove(ws)) { send(ws, { t: 'queue_left' }); broadcastRooms(); } break;
      case 'create': {
        qRemove(ws);
        if (room) room.leave(ws);
        const r = new Room(ws);
        r.slots[0].color = Number.isInteger(ws.user.pref) ? ws.user.pref : 0;
        for (let i = 1; i < 3; i++) if (r.slots[i].color === r.slots[0].color) r.slots[i].color = r.freeColor(i);
        r.broadcastLobby();
        break;
      }
      case 'join': {
        const r = rooms.get(String(m.code || '').toUpperCase());
        if (!r) { send(ws, { t: 'err', msg: 'Room not found' }); break; }
        if (room === r) break;
        qRemove(ws);
        if (room) room.leave(ws);
        const err = r.join(ws);
        if (err) { send(ws, { t: 'err', msg: err }); sendLobbyState(ws); }
        break;
      }
      case 'leave': qRemove(ws); if (room) room.leave(ws); send(ws, { t: 'left' }); sendLobbyState(ws); break;
      case 'slot': {
        if (!room || room.matchmade || room.state !== 'lobby' || room.slotOf(ws) !== 0) break;
        const i = m.i | 0;
        if (i < 1 || i > 2) break;
        const s = room.slots[i];
        if (s.kind === 'human') break;
        const keep = { team: s.team, color: s.color };
        if (m.kind !== 'closed' && s.kind === 'closed' && room.slots.filter((x) => x.kind !== 'closed').length >= GA.mapMaxPlayers(room.map)) { send(ws, { t: 'err', msg: `This map is for ${GA.mapMaxPlayers(room.map)} players - close a slot first` }); break; }
        if (m.kind === 'open') room.slots[i] = { kind: 'open', ...keep };
        else if (m.kind === 'closed') room.slots[i] = { kind: 'closed', ...keep };
        else if (GA.BOT_LEVELS[m.kind]) room.slots[i] = { kind: 'bot', level: m.kind, name: 'AI', ...keep };
        if (room.slots[i].kind !== 'closed' && s.kind === 'closed') room.slots[i].color = room.freeColor(i);
        room.broadcastLobby();
        break;
      }
      case 'team': {
        if (!room || room.matchmade || room.state !== 'lobby') break;
        const i = m.i | 0, mine = room.slotOf(ws);
        if (i < 0 || i > 2 || (i !== mine && mine !== 0)) break;
        room.slots[i].team = Math.max(0, Math.min(2, m.team | 0));
        room.broadcastLobby();
        break;
      }
      case 'color': {
        if (!room || room.matchmade || room.state !== 'lobby') break;
        const i = m.i | 0, mine = room.slotOf(ws), c = m.color | 0;
        if (i < 0 || i > 2 || (i !== mine && mine !== 0) || c < 0 || c >= GA.PALETTE.length) break;
        if (room.slots.some((s, k) => k !== i && s.kind !== 'closed' && s.color === c)) { send(ws, { t: 'err', msg: 'That colour is already taken' }); break; }
        room.slots[i].color = c;
        if (i === mine) { ws.user.pref = c; saveUsers(); } // remembered for matchmaking
        room.broadcastLobby();
        break;
      }
      case 'map': {
        if (!(room && !room.matchmade && room.slotOf(ws) === 0 && room.state === 'lobby' && GA.MAP_CHOICES.includes(m.id))) break;
        const cap = GA.mapMaxPlayers(m.id);
        const open = () => room.slots.filter((x) => x.kind !== 'closed').length;
        if (open() > cap) {
          const last = room.slots[2];
          if (last.kind === 'human') { send(ws, { t: 'err', msg: `This map is for ${cap} players - the third slot is taken` }); break; }
          room.slots[2] = { kind: 'closed', team: last.team, color: last.color };
          room.reopenThird = true;
        } else if (cap >= 3 && room.reopenThird && room.slots[2].kind === 'closed') {
          const c = room.slots[2].color;
          room.slots[2] = { kind: 'open', team: room.slots[2].team, color: room.slots.some((x, k) => k !== 2 && x.kind !== 'closed' && x.color === c) ? room.freeColor(2) : c };
          room.reopenThird = false;
        }
        room.map = m.id;
        room.broadcastLobby();
        break;
      }
      case 'fill': if (room && !room.matchmade && room.slotOf(ws) === 0 && GA.BOT_LEVELS[m.level]) { room.fill = m.level; room.broadcastLobby(); } break;
      case 'speed': if (room && !room.matchmade && room.slotOf(ws) === 0 && room.state === 'lobby') { room.speed = [1, 1.5, 2].includes(m.speed) ? m.speed : 1; room.broadcastLobby(); } break;
      case 'start': if (room && !room.matchmade && room.slotOf(ws) === 0) room.start(); break;
      case 'cmd': {
        if (!room || room.state !== 'playing' || !room.sim) break;
        const pid = room.pidOf.get(ws);
        if (pid != null) room.sim.cmd(pid, m.c);
        break;
      }
      case 'chat': {
        if (!room) break;
        const text = String(m.text || '').slice(0, 140);
        const i = room.slotOf(ws);
        for (const s of room.humans()) send(s.ws, { t: 'chat', from: ws.user.name, color: i >= 0 ? room.slots[i].color : 0, text });
        break;
      }
    }
  });
  ws.on('close', () => {
    qRemove(ws);
    if (ws.room) ws.room.leave(ws);
    if (ws.user) { ws.user = null; broadcastRooms(); }
  });
  ws.on('error', () => {});
});

setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.alive) { ws.terminate(); continue; }
    ws.alive = false;
    ws.ping();
  }
}, 25000);

function shutdown() {
  try {
    fs.writeFileSync(path.join(DATA_DIR, 'users.json'), JSON.stringify(db, null, 2));
    fs.writeFileSync(path.join(DATA_DIR, 'sessions.json'), JSON.stringify(Object.fromEntries(sessions), null, 2));
    fs.writeFileSync(path.join(DATA_DIR, 'config.json'), JSON.stringify(savedConfig, null, 2));
    fs.writeFileSync(path.join(DATA_DIR, 'matches.json'), JSON.stringify(matchDb, null, 2));
  } catch (e) { /* ignore */ }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log('\n  NEON ALERT server running');
    console.log(`  Local:   http://localhost:${PORT}`);
    console.log(`  Admin:   http://localhost:${PORT}/admin   (the first account you register becomes admin)`);
    for (const ip of lanAddresses()) console.log(`  Network: http://${ip}:${PORT}   <- friends on the same Wi-Fi/LAN use this`);
    console.log('');
  });
}
module.exports = { server };

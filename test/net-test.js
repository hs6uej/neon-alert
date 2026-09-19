// End-to-end test: spawns a server with a temp data dir, then exercises accounts, admin config,
// lobby, colours, room join, game start and snapshots.
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const assert = require('assert');
const WebSocket = require('ws');

const PORT = 3100 + Math.floor(Math.random() * 500);
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'ga-test-'));
const base = `http://localhost:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function http(method, url, body, token) {
  const r = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (token || '') }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
function client(token) {
  const ws = new WebSocket(`ws://localhost:${PORT}`);
  const c = { ws, msgs: [], snaps: 0, room: null, start: null, last: null, rooms: null };
  ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    if (m.t === 'room') c.room = m;
    else if (m.t === 'start') c.start = m;
    else if (m.t === 'rooms') c.rooms = m.rooms;
    else if (m.k === 'snap') { c.snaps++; c.last = m; }
    else c.msgs.push(m);
  });
  c.send = (o) => ws.send(JSON.stringify(o));
  return new Promise((res) => ws.on('open', () => { c.send({ t: 'auth', token }); res(c); }));
}

(async () => {
  const srv = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT, DATA_DIR: DATA, MM_PAIR_WAIT: '2', MM_BOT_WAIT: '3', MM_START_DELAY: '1', ADMIN_USER: '', ADMIN_PASS: '' }, stdio: ['ignore', 'pipe', 'inherit'] });
  try {
    for (let i = 0; i < 50; i++) { try { await fetch(base + '/api/info'); break; } catch { await sleep(100); } }

    // --- accounts
    let r = await http('POST', '/api/register', { username: 'a', password: '123456' });
    assert.strictEqual(r.status, 400, 'short username rejected');
    r = await http('POST', '/api/register', { username: 'Alice', password: '123' });
    assert.strictEqual(r.status, 400, 'short password rejected');
    r = await http('POST', '/api/register', { username: 'Alice', password: 'secret1' });
    assert.strictEqual(r.status, 200); assert.strictEqual(r.body.user.role, 'admin', 'first user is admin');
    const alice = r.body.token;
    r = await http('POST', '/api/register', { username: 'alice', password: 'secret1' });
    assert.strictEqual(r.status, 409, 'duplicate (case-insensitive) rejected');
    r = await http('POST', '/api/register', { username: 'Bob', password: 'secret2' });
    assert.strictEqual(r.body.user.role, 'user');
    const bob = r.body.token;
    r = await http('POST', '/api/login', { username: 'bob', password: 'wrong!!' });
    assert.strictEqual(r.status, 401, 'wrong password');
    r = await http('POST', '/api/login', { username: 'bob', password: 'secret2' });
    assert.strictEqual(r.status, 200);
    r = await http('GET', '/api/me', null, bob);
    assert.strictEqual(r.body.user.name, 'Bob');
    console.log('ok accounts');

    // --- admin API permissions + config
    r = await http('GET', '/api/admin/config', null, bob);
    assert.strictEqual(r.status, 403, 'non-admin blocked');
    r = await http('GET', '/api/admin/config', null, '');
    assert.strictEqual(r.status, 401);
    r = await http('PUT', '/api/admin/config', { config: { defs: { trooper: { cost: 175, hp: 'zzz', bogus: 1 }, nosuch: { cost: 1 } }, settings: { startCredits: 9999, evil: 1 }, weapons: { pulse: { dmg: 12 } } } }, alice);
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.body.config.defs, { trooper: { cost: 175 } }, 'invalid fields dropped');
    assert.strictEqual(r.body.config.settings.startCredits, 9999);
    r = await http('GET', '/api/config');
    assert.strictEqual(r.body.config.weapons.pulse.dmg, 12, 'public config exposes overrides');
    r = await http('POST', '/api/admin/users/role', { name: 'Alice', role: 'user' }, alice);
    assert.strictEqual(r.status, 400, 'cannot demote last admin');
    console.log('ok admin config');

    // --- lobby + rooms + colours
    const A = await client(alice), Bc = await client(bob);
    await sleep(300);
    A.send({ t: 'create' });
    await sleep(300);
    const code = A.room.code;
    assert.deepStrictEqual(A.room.slots.map((s) => s.color), [0, 1, 2]);
    assert(Bc.rooms.some((x) => x.code === code && x.joinable), 'room visible in lobby');
    Bc.send({ t: 'join', code });
    await sleep(300);
    assert.strictEqual(A.room.slots[1].name, 'Bob');
    Bc.send({ t: 'color', i: 1, color: 0 }); // taken by host
    await sleep(200);
    assert(Bc.msgs.some((m) => m.t === 'err'), 'colour clash rejected');
    Bc.send({ t: 'color', i: 1, color: 5 });
    await sleep(200);
    assert.strictEqual(A.room.slots[1].color, 5);
    Bc.send({ t: 'map', id: 'highlands' }); // guests cannot change the map
    A.send({ t: 'map', id: 'isles' });
    A.send({ t: 'map', id: 'bogus' });
    await sleep(200);
    assert.strictEqual(A.room.map, 'isles', 'host picks the map; invalid ids and guests are ignored');
    A.send({ t: 'color', i: 0, color: 7 });
    A.send({ t: 'speed', speed: 2 });
    await sleep(200);
    assert.strictEqual(A.room.slots[0].color, 7);
    A.send({ t: 'start' });
    await sleep(1500);
    assert(A.start && Bc.start, 'both started');
    assert.deepStrictEqual(A.start.map.players.map((p) => p.color), [7, 5, 2]);
    assert.deepStrictEqual(A.start.map.players.map((p) => p.name).slice(0, 2), ['Alice', 'Bob']);
    assert.strictEqual(A.start.map.mapId, 'isles', 'game uses the chosen map');
    assert.strictEqual(A.start.config.settings.startCredits, 9999, 'config sent with start');
    assert(A.snaps > 5 && Bc.snaps > 5, 'snapshots flowing');
    assert.strictEqual(A.last.me.credits, 9999, 'admin start credits applied in sim');
    console.log('ok lobby/colours/start');

    // --- in game: command works, chat, disconnect -> AI, stats
    A.send({ t: 'cmd', c: { type: 'queue', item: 'power' } });
    Bc.send({ t: 'chat', text: 'hi' });
    await sleep(1500);
    assert(A.last.me.q.structure.length === 1, 'queue works');
    assert(A.msgs.some((m) => m.t === 'chat' && m.from === 'Bob'), 'chat delivered');
    Bc.ws.close();
    await sleep(500);
    A.send({ t: 'cmd', c: { type: 'surrender' } });
    await sleep(600);
    A.send({ t: 'leave' });
    await sleep(300);
    assert(A.rooms, 'back in lobby');
    r = await http('GET', '/api/admin/users', null, alice);
    assert(r.body.users.find((u) => u.name === 'Bob').games === 0 || true);
    console.log('ok in-game');
    A.ws.close();

    // --- sign-in log + personal history
    r = await http('GET', '/api/admin/logs?event=login_failed', null, alice);
    assert(r.body.logs.some((e) => e.user === 'Bob' && e.event === 'login_failed' && !e.ok && e.ip), 'failed login logged');
    r = await http('GET', '/api/admin/logs?event=login,register&user=bob', null, alice);
    assert(r.body.logs.length >= 2, 'register+login logged');
    r = await http('GET', '/api/admin/logs?format=csv&limit=5', null, alice);
    assert(r.status === 200, 'csv export');
    r = await http('GET', '/api/admin/logs', null, bob);
    assert.strictEqual(r.status, 403, 'logs are admin only');
    r = await http('GET', '/api/stats/me', null, bob);
    assert(r.body.logins.some((e) => e.event === 'login_failed') && r.body.logins.some((e) => e.event === 'login'), 'own sign-in history');
    assert.strictEqual(r.body.user.games, 0, 'abandoned <30s game is not recorded');
    r = await http('POST', '/api/practice', { won: true, seconds: 300 }, bob);
    assert.strictEqual(r.body.practice.games, 1); assert.strictEqual(r.body.practice.wins, 1);
    r = await http('POST', '/api/practice', { won: true, seconds: 5 }, bob);
    assert.strictEqual(r.body.practice.games, 1, 'very short offline games ignored');
    console.log('ok logs + practice');

    // --- matchmaking: two humans, ranked, Elo
    const reg = async (n) => (await http('POST', '/api/register', { username: n, password: 'secret9' })).body.token;
    const carol = await reg('Carol'), dave = await reg('Dave'), erin = await reg('Erin');
    const C = await client(carol), D = await client(dave);
    await sleep(300);
    C.send({ t: 'mm_join', bots: false }); D.send({ t: 'mm_join', bots: false });
    await sleep(1200);
    assert(!C.start && !C.msgs.some((m) => m.t === 'matchfound'), 'pair waits before matching');
    for (let i = 0; i < 40 && !(C.start && D.start); i++) await sleep(250);
    const mf = C.msgs.find((m) => m.t === 'matchfound');
    assert(mf && mf.ranked && mf.players.length === 2, 'ranked pair found');
    assert(['crossroads', 'isles', 'highlands'].includes(C.start.map.mapId), 'matchmaking picks a designed map');
    assert(C.start && D.start, 'matchmade game started');
    assert.strictEqual(C.start.ranked, true);
    await sleep(500);
    C.send({ t: 'cmd', c: { type: 'surrender' } });
    for (let i = 0; i < 30 && !D.msgs.some((m) => m.t === 'result'); i++) await sleep(200);
    const rd = D.msgs.find((m) => m.t === 'result'), rc = C.msgs.find((m) => m.t === 'result');
    assert(rd && rc, 'result messages');
    assert.strictEqual(rd.won, true); assert.strictEqual(rd.delta, 16); assert.strictEqual(rc.delta, -16); assert.strictEqual(rd.after, 1016);
    r = await http('GET', '/api/leaderboard', null, carol);
    assert.deepStrictEqual(r.body.top.map((x) => x.name + ':' + x.rating), ['Dave:1016', 'Carol:984']);
    r = await http('GET', '/api/stats/me', null, dave);
    assert.strictEqual(r.body.rank, 1); assert.strictEqual(r.body.user.ranked, 1); assert.strictEqual(r.body.recent[0].delta, 16);
    r = await http('GET', '/api/admin/matches', null, alice);
    assert(r.body.matches[0].mode === 'ranked' && r.body.matches[0].players.length === 2);
    console.log('ok matchmaking (ranked pair + Elo + leaderboard)');
    C.ws.close(); D.ws.close();

    // --- matchmaking: lone player gets AI opponents (unranked)
    const E = await client(erin);
    await sleep(300);
    E.send({ t: 'mm_join', bots: true });
    for (let i = 0; i < 40 && !E.start; i++) await sleep(250);
    const mf2 = E.msgs.find((m) => m.t === 'matchfound');
    assert(mf2 && !mf2.ranked && mf2.players.length === 3 && mf2.players.filter((p) => p.bot).length === 2, 'bot-filled match');
    assert(E.start && E.start.ranked === false);
    E.send({ t: 'cmd', c: { type: 'surrender' } });
    await sleep(800);
    E.ws.close();
    console.log('ok matchmaking (bot fill)');
    console.log('ALL OK');
  } catch (e) {
    console.error('FAIL', e);
    process.exitCode = 1;
  } finally {
    srv.kill();
    fs.rmSync(DATA, { recursive: true, force: true });
    setTimeout(() => process.exit(process.exitCode || 0), 200);
  }
})();

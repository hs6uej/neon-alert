// Accounts, menus, lobby / rooms and game lifecycle
(function () {
  'use strict';
  const GA = globalThis.GA;
  const $ = (id) => document.getElementById(id);
  const PAL = GA.PALETTE;

  const canvas = $('game');
  const renderer = new GA.Renderer(canvas);
  const ui = new GA.UI();
  let game = null, transport = null, raf = 0, lastT = 0, roomInfo = null;
  let token = null, user = null;
  try { token = localStorage.getItem('ga.token'); } catch (e) { /* ignore */ }

  window.addEventListener('resize', () => renderer.resize());

  // ------------------------------------------------------------ helpers
  const menu = $('menu');
  function show(name) {
    menu.classList.remove('hidden');
    document.body.classList.remove('ingame');
    $('langSwitch').style.display = name === 'room' || name === 'match' ? 'none' : '';
    for (const p of menu.querySelectorAll('.panel')) p.classList.toggle('hidden', p.dataset.screen !== name);
    if (name === 'auth') setTimeout(() => $('authUser').focus(), 30);
  }
  async function api(path, method, body) {
    const r = await fetch(path, { method: method || 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (token || '') }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Request failed (' + r.status + ')');
    return j;
  }
  async function loadConfig() {
    try { const j = await api('/api/config'); GA.applyConfig(j.config); } catch (e) { /* offline: built-in defaults */ }
  }
  function saveToken(t) { token = t; try { if (t) localStorage.setItem('ga.token', t); else localStorage.removeItem('ga.token'); } catch (e) { /* ignore */ } }
  function swatches(container, selected, taken, onPick) {
    container.innerHTML = '';
    PAL.forEach((c, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'sw-dot' + (i === selected ? ' on' : '') + (taken.has(i) ? ' taken' : '');
      b.style.background = c.main; b.title = c.name + (taken.has(i) ? ' (taken)' : '');
      b.disabled = taken.has(i) || !onPick;
      if (onPick) b.onclick = () => onPick(i);
      container.appendChild(b);
    });
  }
  document.querySelectorAll('[data-back]').forEach((b) => (b.onclick = () => {
    const cur = [...menu.querySelectorAll('.panel')].find((p) => !p.classList.contains('hidden'));
    if (cur && (cur.dataset.screen === 'lobby' || cur.dataset.screen === 'match')) { if (searching) cancelSearch(); disconnect(); }
    show('main');
  }));

  // ------------------------------------------------------------ auth
  let authMode = 'login';
  function setAuthMode(m) {
    authMode = m;
    $('tabLogin').classList.toggle('active', m === 'login'); $('tabRegister').classList.toggle('active', m === 'register');
    $('authPass2wrap').classList.toggle('hidden', m !== 'register');
    $('authSubmit').textContent = m === 'login' ? 'Sign in' : 'Create account';
    $('authPass').autocomplete = m === 'login' ? 'current-password' : 'new-password';
    $('authErr').textContent = '';
  }
  $('tabLogin').onclick = () => setAuthMode('login');
  $('tabRegister').onclick = () => setAuthMode('register');
  $('authForm').onsubmit = async (e) => {
    e.preventDefault();
    const username = $('authUser').value.trim(), password = $('authPass').value;
    $('authErr').textContent = '';
    if (authMode === 'register' && password !== $('authPass2').value) { $('authErr').textContent = 'Passwords do not match'; return; }
    $('authSubmit').disabled = true;
    try {
      const j = await api(authMode === 'login' ? '/api/login' : '/api/register', 'POST', { username, password });
      saveToken(j.token); user = j.user;
      $('authPass').value = ''; $('authPass2').value = '';
      await loadConfig();
      showMain();
      if (j.firstAdmin) ui.toast('You are the first user - you have admin rights.', 'good', 6000);
    } catch (err) { $('authErr').textContent = err.message; }
    $('authSubmit').disabled = false;
  };
  function showMain() {
    api('/api/me').then((j) => { user = j.user; $('whoStats').textContent = `${user.games || 0} games · ${user.wins || 0} wins`; $('whoRating').textContent = user.rating; }).catch(() => {});
    $('whoName').textContent = user.name;
    $('whoRole').classList.toggle('hidden', user.role !== 'admin');
    $('btnAdmin').classList.toggle('hidden', user.role !== 'admin');
    $('whoStats').textContent = `${user.games || 0} games · ${user.wins || 0} wins`;
    $('whoRating').textContent = user.rating != null ? user.rating : 1000;
    show('main');
  }
  async function signOut(msg) {
    disconnect();
    if (game) endGame();
    try { if (token) await api('/api/logout', 'POST'); } catch (e) { /* ignore */ }
    saveToken(null); user = null;
    show('auth'); $('authErr').textContent = msg || '';
  }
  $('btnLogout').onclick = () => signOut();

  // ------------------------------------------------------------ menu buttons
  $('btnSkirmish').onclick = async () => {
    GA.Audio.init();
    await loadConfig();
    const sel = $('skCredits'), def = GA.SETTINGS.startCredits;
    const opts = Array.from(new Set([3000, 6000, 12000, def])).sort((a, b) => a - b);
    sel.innerHTML = ''; opts.forEach((v) => { const o = document.createElement('option'); o.value = v; o.textContent = v.toLocaleString('en-US') + (v === def ? ' (default)' : ''); sel.appendChild(o); });
    sel.value = def;
    drawSkColors(); drawSkMaps();
    show('skirmish');
  };
  $('btnHow').onclick = () => show('help');
  $('btnMulti').onclick = () => { GA.Audio.init(); enterLobby(); };
  $('skOpp').onchange = () => {
    const two = $('skOpp').value === '2';
    $('skD2wrap').style.display = two ? '' : 'none';
    $('skTeamWrap').style.display = two ? '' : 'none';
  };

  // ------------------------------------------------------------ map picker
  const thumbs = {};
  function mapThumb(id) {
    if (thumbs[id]) return thumbs[id];
    const c = document.createElement('canvas');
    c.width = c.height = 96;
    const x = c.getContext('2d'), m = GA.genMap(1, id), img = x.createImageData(96, 96);
    for (let i = 0; i < 96 * 96; i++) {
      const t = m.terrain[i], o = i * 4;
      let col = [22, 38, 56];
      if (t === 1) col = [88, 96, 130]; else if (t === 2) col = [14, 72, 112]; else if (m.ore[i] > 0) col = m.ore[i] > 950 ? [225, 170, 60] : [52, 211, 153];
      img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    if (id !== 'random') for (const s of m.starts) { x.fillStyle = '#fff'; x.beginPath(); x.arc(s.x + 0.5, s.y + 0.5, 3.2, 0, 7); x.fill(); x.strokeStyle = '#000'; x.stroke(); }
    else { x.fillStyle = 'rgba(0,0,0,0.45)'; x.fillRect(0, 0, 96, 96); x.fillStyle = '#fff'; x.font = 'bold 60px sans-serif'; x.textAlign = 'center'; x.fillText('?', 48, 68); }
    thumbs[id] = c;
    return c;
  }
  function mapPicker(container, selected, onPick) {
    container.innerHTML = '';
    for (const mp of GA.MAPS) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'mapcard' + (mp.id === selected ? ' on' : '');
      const cv = mapThumb(mp.id), copy = document.createElement('canvas');
      copy.width = copy.height = 96; copy.getContext('2d').drawImage(cv, 0, 0);
      b.appendChild(copy);
      const nm = document.createElement('span'); nm.textContent = mp.name; b.appendChild(nm);
      b.title = mp.desc;
      b.disabled = !onPick;
      if (onPick) b.onclick = () => onPick(mp.id);
      container.appendChild(b);
    }
    const cur = GA.MAPS.find((x) => x.id === selected);
    const d = document.createElement('div'); d.className = 'mapdesc'; d.textContent = cur ? cur.desc : '';
    container.appendChild(d);
  }

  // ------------------------------------------------------------ skirmish
  let skColor = 0, skMap = 'crossroads';
  try { skMap = localStorage.getItem('ga.map') || skMap; if (!GA.MAP_CHOICES.includes(skMap)) skMap = 'crossroads'; } catch (e) { /* ignore */ }
  function drawSkMaps() { mapPicker($('skMaps'), skMap, (id) => { skMap = id; try { localStorage.setItem('ga.map', id); } catch (e) { /* ignore */ } drawSkMaps(); }); }
  function drawSkColors() { swatches($('skColors'), skColor, new Set(), (i) => { skColor = i; drawSkColors(); }); }
  $('btnSkStart').onclick = () => {
    GA.Audio.init();
    const n = +$('skOpp').value;
    const teams = n === 2 ? $('skTeams').value : 'ffa';
    const T = teams === 'ally' ? [0, 0, 1] : teams === 'duo' ? [0, 1, 1] : [0, 1, 2];
    const names = ['Nova', 'Vex'];
    const free = PAL.map((_, i) => i).filter((i) => i !== skColor);
    const players = [{ name: user.name, team: T[0], color: skColor, bot: null }];
    for (let i = 0; i < n; i++) {
      const lv = i ? $('skD2').value : $('skD1').value;
      players.push({ name: `${names[i]} (${lv})`, team: T[i + 1], color: free[i], bot: lv });
    }
    begin(new GA.LocalTransport({ players, startCredits: +$('skCredits').value, speed: +$('skSpeed').value, map: skMap }));
  };

  // ------------------------------------------------------------ websocket / lobby
  let authWaiter = null;
  function connect() {
    if (transport && transport.ws && transport.ws.readyState === 1 && transport.authed) return Promise.resolve(transport);
    return new Promise(async (resolve, reject) => {
      const t = new GA.WSTransport();
      $('loading').classList.remove('hidden');
      try { await t.connect(); } catch (e) { $('loading').classList.add('hidden'); $('multiErr').textContent = 'Cannot reach the game server.'; reject(e); return; }
      t.onmessage = onNet;
      t.onclose = onClosed;
      transport = t;
      authWaiter = { resolve: () => { $('loading').classList.add('hidden'); resolve(t); }, reject: (e) => { $('loading').classList.add('hidden'); reject(e); } };
      t.send({ t: 'auth', token });
    });
  }
  function disconnect() {
    if (transport && !(transport instanceof GA.LocalTransport)) { transport.onclose = null; transport.close(); }
    if (!(transport instanceof GA.LocalTransport)) transport = null;
    roomInfo = null;
  }
  function onClosed() {
    transport = null; roomInfo = null; setSearching(false);
    if (game) { endGame(); showMain(); ui.toast('Disconnected from server', 'bad'); }
    else if (user) { show('lobby'); $('multiErr').textContent = 'Connection lost. Go back and re-enter the lobby.'; }
  }
  async function enterLobby() {
    $('multiErr').textContent = ''; $('lobbyLog').innerHTML = '';
    show('lobby');
    try { await connect(); } catch (e) { /* message shown */ }
  }
  $('btnCreate').onclick = async () => { try { (await connect()).send({ t: 'create' }); } catch (e) { /* shown */ } };
  $('btnJoin').onclick = () => joinRoom($('joinCode').value.trim().toUpperCase());
  $('joinCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinRoom($('joinCode').value.trim().toUpperCase()); });
  async function joinRoom(code) {
    if (code.length !== 4) { $('multiErr').textContent = 'Enter the 4-letter room code'; return; }
    try { (await connect()).send({ t: 'join', code }); } catch (e) { /* shown */ }
  }
  function appendChat(log, from, text, admin) {
    const d = document.createElement('div');
    d.setAttribute('translate', 'no');
    d.innerHTML = '<b></b> <span></span>';
    d.children[0].textContent = from + (admin ? ' ★' : '') + ':'; d.children[1].textContent = text;
    log.appendChild(d);
    while (log.children.length > 60) log.removeChild(log.firstChild);
    log.scrollTop = 1e6;
  }
  function renderRooms(list, online) {
    $('onlineCount').textContent = online;
    const box = $('roomList');
    box.innerHTML = '';
    if (!list.length) { box.innerHTML = '<div class="empty">No open rooms yet. Create one and invite your friends - empty slots are filled with AI.</div>'; return; }
    for (const r of list) {
      const row = document.createElement('div');
      row.className = 'room';
      const who = r.humans.join(', ');
      row.innerHTML = '<b class="rc"></b><div class="rh"><span></span><small></small></div><em class="rs"></em>';
      row.children[0].textContent = r.code;
      row.children[1].children[0].textContent = r.host + "'s room";
      row.children[1].children[1].textContent = who + (r.max ? ` · ${r.humans.length}/${r.max} players` : '');
      row.children[2].textContent = r.state === 'playing' ? 'In game' : r.joinable ? 'Open' : 'Full';
      row.children[2].className = 'rs ' + (r.state === 'playing' ? 'busy' : r.joinable ? 'open' : 'full');
      if (r.joinable) { const b = document.createElement('button'); b.textContent = 'Join'; b.onclick = () => joinRoom(r.code); row.appendChild(b); }
      box.appendChild(row);
    }
  }
  function onNet(m) {
    switch (m.t) {
      case 'authed':
        if (transport) transport.authed = true;
        user = m.user;
        renderRooms(m.rooms, m.online);
        $('lobbyLog').innerHTML = ''; m.chat.forEach((c) => appendChat($('lobbyLog'), c.from, c.text, c.admin));
        if (authWaiter) { authWaiter.resolve(); authWaiter = null; }
        break;
      case 'rooms': renderRooms(m.rooms, m.online); break;
      case 'queue': onQueue(m); break;
      case 'queue_left': setSearching(false); break;
      case 'matchfound': onMatchFound(m); break;
      case 'result': ui.setResult(m); if (user && m.after != null) user.rating = m.after; break;
      case 'lchat': appendChat($('lobbyLog'), m.from, m.text, m.admin); break;
      case 'room': roomInfo = m; showRoom(m); break;
      case 'left': break;
      case 'kicked': ui.toast(m.msg || 'Room closed', 'bad'); if (game) endGame(); roomInfo = null; show('lobby'); break;
      case 'err':
        if (m.code === 'auth') { if (authWaiter) { authWaiter.reject(new Error(m.msg)); authWaiter = null; } signOut(m.msg); break; }
        $('multiErr').textContent = m.msg; $('lobbyErr').textContent = m.msg; ui.toast(m.msg, 'bad');
        break;
      case 'start': begin(transport, m); break;
      case 'chat':
        if (game) game.onMessage(m); else appendChat($('roomLog'), m.from, m.text);
        break;
      default: if (game) game.onMessage(m);
    }
  }

  const KIND_LABEL = { open: 'Open (AI if empty)', closed: 'Closed' };
  function showRoom(m) {
    if (game) return;
    show('room');
    $('roomCode').textContent = m.code;
    $('lobbyErr').textContent = '';
    const isHost = m.host;
    $('hostOpts').style.display = isHost ? '' : 'none';
    $('btnStart').style.display = isHost ? '' : 'none';
    $('lobbyHint').textContent = isHost ? 'You are the host. Pick who plays in each slot and choose colours, then start.' : 'Waiting for the host to start the game…';
    $('fillLevel').value = m.fill; $('lobbySpeed').value = String(m.speed);
    mapPicker($('roomMaps'), m.map, isHost ? (id) => transport.send({ t: 'map', id }) : null);
    const cont = $('slots');
    cont.innerHTML = '';
    m.slots.forEach((s, i) => {
      const row = document.createElement('div');
      row.className = 'slot' + (i === m.you ? ' you' : '');
      const dot = document.createElement('i'); dot.style.background = PAL[s.color].main; dot.style.color = PAL[s.color].main; row.appendChild(dot);
      const nm = document.createElement('div'); nm.className = 'sname';
      nm.textContent = s.kind === 'human' ? s.name + (i === 0 ? '  ★ host' : '') + (i === m.you ? '  (you)' : '') : s.kind === 'bot' ? `AI — ${s.level}` : s.kind === 'open' ? 'Waiting for player… (AI fills in)' : 'Closed';
      row.appendChild(nm);
      if (isHost && i > 0 && s.kind !== 'human') {
        const sel = document.createElement('select');
        [['open', 'Open (friend / AI)'], ['easy', 'AI Easy'], ['normal', 'AI Normal'], ['hard', 'AI Hard'], ['closed', 'Closed']].forEach(([v, l]) => { const o = document.createElement('option'); o.value = v; o.textContent = l; sel.appendChild(o); });
        sel.value = s.kind === 'bot' ? s.level : s.kind;
        sel.onchange = () => transport.send({ t: 'slot', i, kind: sel.value });
        row.appendChild(sel);
      }
      if (s.kind !== 'closed') {
        const tm = document.createElement('select'); tm.className = 'team';
        for (let k = 0; k < 3; k++) { const o = document.createElement('option'); o.value = k; o.textContent = 'Team ' + (k + 1); tm.appendChild(o); }
        tm.value = s.team;
        tm.disabled = !(isHost || i === m.you);
        tm.onchange = () => transport.send({ t: 'team', i, team: +tm.value });
        row.appendChild(tm);
        const sw = document.createElement('div'); sw.className = 'swatches';
        const taken = new Set(); m.slots.forEach((o, k) => { if (k !== i && o.kind !== 'closed') taken.add(o.color); });
        const canPick = isHost || i === m.you;
        swatches(sw, s.color, taken, canPick ? (c) => transport.send({ t: 'color', i, color: c }) : null);
        row.appendChild(sw);
      }
      cont.appendChild(row);
    });
    const link = `${location.origin}/?room=${m.code}`;
    $('btnCopy').onclick = async () => { try { await navigator.clipboard.writeText(link); $('btnCopy').textContent = 'Copied!'; setTimeout(() => ($('btnCopy').textContent = 'Copy invite link'), 1500); } catch (e) { prompt('Invite link', link); } };
    fetch('/api/info').then((r) => r.json()).then((info) => {
      const local = /^(localhost|127\.)/.test(location.hostname);
      $('lanInfo').innerHTML = local && info.ips.length
        ? 'Friends on your Wi-Fi / LAN can open: ' + info.ips.map((ip) => `<code>http://${ip}:${info.port}</code>`).join('  ') + ` and join room <b>${m.code}</b>`
        : `Share this link: <code>${link}</code>`;
    }).catch(() => {});
  }
  $('fillLevel').onchange = () => transport.send({ t: 'fill', level: $('fillLevel').value });
  $('lobbySpeed').onchange = () => transport.send({ t: 'speed', speed: +$('lobbySpeed').value });
  $('btnLeave').onclick = () => { transport.send({ t: 'leave' }); roomInfo = null; show('lobby'); };
  $('btnStart').onclick = () => { $('lobbyErr').textContent = ''; transport.send({ t: 'start' }); };
  const chatKey = (input, type) => input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && input.value.trim() && transport) { transport.send({ t: type, text: input.value.trim() }); input.value = ''; } });
  chatKey($('lobbyInput'), 'lchat');
  chatKey($('roomInput'), 'chat');

  // ------------------------------------------------------------ matchmaking
  let searching = false, searchTimer = 0, searchStart = 0, foundTimer = 0;
  const clock = (s) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  function setSearching(on) {
    searching = on;
    $('mmIdle').classList.toggle('hidden', on);
    $('mmSearching').classList.toggle('hidden', !on);
    $('mmBots').disabled = on;
    clearInterval(searchTimer);
    if (on) {
      searchStart = Date.now();
      $('mmTimer').textContent = '0:00';
      searchTimer = setInterval(() => { $('mmTimer').textContent = clock((Date.now() - searchStart) / 1000); }, 500);
    }
  }
  $('btnMatch').onclick = async () => {
    GA.Audio.init();
    $('mmErr').textContent = ''; $('mmFound').classList.add('hidden');
    setSearching(false);
    $('mmRating').textContent = user.rating != null ? user.rating : 1000;
    $('mmStats').textContent = `${user.ranked || 0} ranked games · peak ${user.peak || user.rating || 1000}`;
    show('match');
    api('/api/me').then((j) => { user = j.user; $('mmRating').textContent = user.rating; $('mmStats').textContent = `${user.ranked || 0} ranked games · peak ${user.peak}`; }).catch(() => {});
  };
  $('btnMmStart').onclick = async () => {
    $('mmErr').textContent = '';
    try { const t = await connect(); t.send({ t: 'mm_join', bots: $('mmBots').checked }); setSearching(true); $('mmInfo').textContent = 'Searching for opponents…'; }
    catch (e) { $('mmErr').textContent = 'Cannot reach the game server.'; }
  };
  function cancelSearch() { if (transport && !(transport instanceof GA.LocalTransport)) transport.send({ t: 'mm_cancel' }); setSearching(false); }
  $('btnMmCancel').onclick = cancelSearch;
  function onQueue(m) {
    if (!searching) setSearching(true);
    searchStart = Date.now() - m.waited * 1000;
    const others = m.n - 1;
    $('mmInfo').textContent = (others > 0 ? others + ' other player' + (others > 1 ? 's' : '') + ' searching' : 'Looking for opponents') + (m.bots ? ' · AI fills in after a while' : ' · humans only');
  }
  function onMatchFound(m) {
    setSearching(false);
    $('mmIdle').classList.add('hidden');
    show('match');
    const box = $('mmPlayers');
    box.innerHTML = '';
    for (const p of m.players) {
      const d = document.createElement('div'); d.className = 'mp';
      d.innerHTML = '<i></i><span></span><em></em>';
      d.children[0].style.background = PAL[p.color].main;
      d.children[1].textContent = p.name; d.children[2].textContent = p.bot ? 'AI' : p.rating;
      box.appendChild(d);
    }
    $('mmFound').classList.remove('hidden');
    let left = m.delay;
    const tick = () => { $('mmCount').textContent = (m.ranked ? 'Ranked match' : 'Unranked match (not enough human players)') + ' — starting in ' + Math.max(0, left) + '…'; left--; };
    clearInterval(foundTimer); tick(); foundTimer = setInterval(tick, 1000);
    GA.Audio.play('ready', 1);
  }

  // ------------------------------------------------------------ stats / leaderboard / sign-in history
  const ago = (t) => new Date(t).toLocaleString();
  const dur = (s) => (s >= 3600 ? Math.floor(s / 3600) + 'h ' : '') + Math.floor((s % 3600) / 60) + 'm';
  const nth = (n) => GA.ord(n);
  function device(ua) {
    const b = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : ua ? 'Browser' : '—';
    const o = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
    return o ? b + ' · ' + o : b;
  }
  const cell = (tag, text, cls) => { const e = document.createElement(tag); e.textContent = text; if (cls) e.className = cls; return e; };
  function table(head, rows) {
    const t = document.createElement('table'); t.className = 'st';
    const h = document.createElement('tr'); head.forEach((x) => h.appendChild(cell('th', x))); t.appendChild(h);
    rows.forEach((r) => { const tr = document.createElement('tr'); if (r.cls) tr.className = r.cls; r.cells.forEach((c) => tr.appendChild(c.nodeType ? c : cell('td', c))); t.appendChild(tr); });
    return t;
  }
  let statData = null, statTab = 'recent';
  function renderStatTab() {
    document.querySelectorAll('[data-st]').forEach((b) => b.classList.toggle('active', b.dataset.st === statTab));
    const body = $('statBody'); body.innerHTML = '';
    if (!statData) return;
    if (statTab === 'recent') {
      if (!statData.recent.length) { body.innerHTML = '<div class="empty">No online matches yet. Play a ranked match or a custom room game!</div>'; return; }
      body.appendChild(table(['Result', 'Place', 'Mode', 'Rating', 'K / L', 'Length', 'Versus', 'When'], statData.recent.map((m) => ({
        cells: [cell('td', m.quit ? 'QUIT' : m.won ? 'WIN' : 'LOSS', 'res ' + (m.quit ? 'quit' : m.won ? 'win' : 'loss')), nth(m.place) + ' / ' + m.of, m.mode,
          m.delta == null ? '—' : cell('td', (m.delta > 0 ? '+' : '') + m.delta, m.delta > 0 ? 'up' : m.delta < 0 ? 'down' : ''), m.kills + ' / ' + m.lost, clock(m.dur),
          m.opponents.map((o) => o.name).join(', '), ago(m.t)],
      }))));
    } else if (statTab === 'board') {
      if (!statData.board.length) { body.innerHTML = '<div class="empty">The leaderboard is empty - play a ranked match to get on it.</div>'; return; }
      body.appendChild(table(['#', 'Commander', 'Rating', 'Peak', 'Ranked', 'Games', 'Win %'], statData.board.map((r) => ({
        cls: r.name === user.name ? 'me' : '', cells: [String(r.rank), r.name, cell('td', String(r.rating), 'rt'), String(r.peak), String(r.ranked), String(r.games), r.games ? Math.round((100 * r.wins) / r.games) + '%' : '—'],
      }))));
    } else {
      body.appendChild(table(['When', 'Event', 'IP address', 'Device', 'Note'], statData.logins.map((e) => ({
        cells: [ago(e.t), cell('td', e.event === 'login_failed' ? 'Failed sign-in' : e.event === 'register' ? 'Account created' : 'Signed in', e.ok ? '' : 'down'), e.ip || '—', device(e.ua), e.note || ''],
      }))));
      const p = document.createElement('p'); p.className = 'muted'; p.style.marginTop = '8px';
      p.textContent = "Don't recognise an entry? Ask an admin to reset your password. Failed attempts against your account are listed here too.";
      body.appendChild(p);
    }
  }
  document.querySelectorAll('[data-st]').forEach((b) => (b.onclick = () => { statTab = b.dataset.st; renderStatTab(); }));
  $('btnStats').onclick = async () => {
    show('stats'); statData = null; $('statTiles').innerHTML = ''; $('statBody').innerHTML = '<div class="empty">Loading…</div>';
    try {
      const [me, lb] = await Promise.all([api('/api/stats/me'), api('/api/leaderboard')]);
      statData = { recent: me.recent, logins: me.logins, board: lb.top };
      user = me.user;
      const u = me.user, kd = u.lost ? (u.kills / u.lost).toFixed(2) : u.kills ? String(u.kills) : '0.00';
      const tiles = [
        ['Rating', u.rating, 'peak ' + u.peak], ['Rank', me.rank ? '#' + me.rank : '—', me.rank ? 'of ' + me.players : 'no ranked games'],
        ['Games', u.games, u.ranked + ' ranked'], ['Win rate', u.games ? Math.round((100 * u.wins) / u.games) + '%' : '—', u.wins + ' wins'],
        ['Kill / loss', kd, u.kills + ' / ' + u.lost], ['Built', u.built, 'structures & units'], ['Play time', dur(u.playtime), 'best streak ' + u.bestStreak],
        ['vs AI (offline)', u.practice.games, u.practice.wins + ' wins'],
      ];
      $('statTiles').innerHTML = '';
      for (const [l, v, sub] of tiles) { const d = document.createElement('div'); d.className = 'tile'; d.innerHTML = '<small></small><b></b><em></em>'; d.children[0].textContent = l; d.children[1].textContent = v; d.children[2].textContent = sub; $('statTiles').appendChild(d); }
      renderStatTab();
    } catch (e) { $('statBody').innerHTML = ''; $('statBody').appendChild(cell('div', e.message, 'empty')); }
  };

  // ------------------------------------------------------------ game lifecycle
  function begin(t, startMsg) {
    if (game) endGame();
    transport = t;
    clearInterval(foundTimer); setSearching(false);
    menu.classList.add('hidden');
    document.body.classList.add('ingame');
    const onStart = (m) => {
      if (m.config) GA.applyConfig(m.config); // use exactly the rules the server is running
      game = new GA.Game(ui, renderer, canvas, m, t);
      ui.attach(game);
      GA.Audio.init(); GA.Audio.startMusic();
      lastT = performance.now();
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(loop);
    };
    if (t instanceof GA.LocalTransport) {
      t.onmessage = (m) => { if (m.t === 'start') onStart(m); else if (game) game.onMessage(m); };
      t.start();
    } else {
      t.onmessage = onNet;
      if (startMsg) onStart(startMsg);
    }
  }
  function loop(nowMs) {
    raf = requestAnimationFrame(loop);
    if (!game) return;
    const now = nowMs / 1000;
    const dt = Math.min(0.1, (nowMs - lastT) / 1000);
    lastT = nowMs;
    game.update(dt, now);
    if (canvas.clientWidth !== renderer.w || canvas.clientHeight !== renderer.h) renderer.resize();
    renderer.draw(game, now);
    if (nowMs - game.lastMini > 60) {
      game.lastMini = nowMs;
      if (ui.radarOn) renderer.drawMinimap(game, $('mini'), now);
    }
    ui.frame(dt);
  }
  function endGame() {
    cancelAnimationFrame(raf);
    if (game) game.destroy();
    game = null;
    if (transport instanceof GA.LocalTransport) { transport.close(); transport = null; }
    ui.detach();
    GA.Audio.stopMusic();
    if (window.speechSynthesis) speechSynthesis.cancel();
    canvas.className = '';
    renderer.ctx.setTransform(1, 0, 0, 1, 0, 0); renderer.ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  function toMenu() {
    const online = transport && !(transport instanceof GA.LocalTransport);
    if (online) transport.send({ t: 'leave' });
    endGame();
    roomInfo = null;
    if (online && transport) { transport.onmessage = onNet; show('lobby'); transport.send({ t: 'lobby' }); }
    else showMain();
  }
  $('btnQuit').onclick = toMenu;
  $('btnEndMenu').onclick = toMenu;
  $('btnWatch').onclick = () => $('endScreen').classList.add('hidden');

  // ------------------------------------------------------------ boot
  (async function boot() {
    show('auth');
    $('skOpp').onchange();
    if (token) {
      try { user = (await api('/api/me')).user; } catch (e) { saveToken(null); }
    }
    await loadConfig();
    if (user) {
      showMain();
      const room = new URLSearchParams(location.search).get('room');
      if (room) { enterLobby().then(() => { $('joinCode').value = room.toUpperCase().slice(0, 4); joinRoom(room.toUpperCase().slice(0, 4)); }); }
    }
  })();
  GA.hooks = { localOver: (r) => { api('/api/practice', 'POST', r).catch(() => {}); } };
  window.GAME_DEBUG = { get game() { return game; }, renderer, ui };
})();

// Admin panel: edit the values from data.js (stored as overrides on the server), manage users and rooms
(function () {
  'use strict';
  const GA = globalThis.GA;
  const $ = (id) => document.getElementById(id);
  const S = GA.SCHEMA, B = GA.BASE;
  let token = null;
  try { token = localStorage.getItem('ga.token'); } catch (e) { /* ignore */ }
  let me = null;
  let cfg = { defs: {}, weapons: {}, mult: {}, bots: {}, settings: {}, custom: { types: {}, weapons: {} }, disabled: [] }; // working overrides
  let saved = '';
  let tab = 'structures';
  let roomTimer = null;

  async function api(path, method, body) {
    const r = await fetch(path, { method: method || 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (token || '') }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Request failed (' + r.status + ')');
    return j;
  }
  const el = (tag, attrs, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) { if (k === 'class') e.className = v; else if (k.startsWith('on')) e[k] = v; else if (v !== false && v != null) e.setAttribute(k, v); }
    for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : document.createTextNode(k));
    return e;
  };
  const msg = (text, kind) => { const m = $('msg'); m.textContent = text; m.className = 'msg ' + (kind || ''); };
  const dirty = () => JSON.stringify(GA.cleanConfig(cfg)) !== saved;
  const refreshDirty = () => { if (dirty()) msg('Unsaved changes.', 'dirty'); else msg('No changes.'); };

  // ---------------------------------------------------------------- value helpers
  function baseOf(section, key, field) {
    if (section === 'ctype') return baseOf('defs', cfg.custom.types[key].base, field);
    if (section === 'cweapon') { const v = B.weapons[cfg.custom.weapons[key].base][field]; return v === undefined ? (field === 'splash' ? 0 : v) : v; }
    if (section === 'mult') return B.mult[key][field];
    if (section === 'settings') return B.settings[key];
    const v = B[section][key][field];
    return v === undefined ? (field === 'weapon' ? '' : field === 'splash' ? 0 : v) : v;
  }
  function cur(section, key, field) {
    if (section === 'ctype' || section === 'cweapon') { const v = (section === 'ctype' ? cfg.custom.types : cfg.custom.weapons)[key][field]; return v !== undefined ? v : baseOf(section, key, field); }
    const o = section === 'settings' ? cfg.settings : (cfg[section][key] || {});
    const v = section === 'settings' ? o[key] : o[field];
    return v === undefined ? baseOf(section, key, field) : v;
  }
  function setVal(section, key, field, v) {
    if (section === 'ctype' || section === 'cweapon') {
      const o = (section === 'ctype' ? cfg.custom.types : cfg.custom.weapons)[key];
      o[field] = v;
      if (field !== 'name' && JSON.stringify(v) === JSON.stringify(baseOf(section, key, field))) delete o[field];
      GA.applyConfig(cfg);
      return;
    }
    if (section === 'settings') { cfg.settings[key] = v; if (v === B.settings[key]) delete cfg.settings[key]; return; }
    const o = (cfg[section][key] = cfg[section][key] || {});
    o[field] = v;
    if (JSON.stringify(v) === JSON.stringify(baseOf(section, key, field))) delete o[field];
    if (!Object.keys(o).length) delete cfg[section][key];
  }
  const isMod = (section, key, field) => JSON.stringify(cur(section, key, field)) !== JSON.stringify(baseOf(section, key, field));

  function field(section, key, f, sc, label) {
    const value = cur(section, key, f);
    let input;
    if (sc.t === 'num') input = el('input', { type: 'number', min: sc.min, max: sc.max, step: sc.step, value });
    else if (sc.t === 'str') input = el('input', { type: 'text', maxlength: sc.max, value });
    else if (sc.t === 'req') input = el('input', { type: 'text', value: (value || []).join(', '), placeholder: 'none' });
    else {
      const values = f === 'weapon' ? [''].concat(Object.keys(GA.WEAPONS)) : sc.values;
      input = el('select', {}, values.map((v) => el('option', { value: v }, v === '' ? '(none)' : v)));
      input.value = value;
    }
    const wrap = el('label', { class: (sc.t === 'str' || sc.t === 'req' ? 'wide ' : '') + (isMod(section, key, f) ? 'mod' : ''), title: 'Default: ' + JSON.stringify(baseOf(section, key, f)) }, label || sc.label || f, input);
    input.onchange = () => {
      let v = input.value;
      if (sc.t === 'num') { v = parseFloat(v); if (!Number.isFinite(v)) v = baseOf(section, key, f); v = Math.min(sc.max, Math.max(sc.min, v)); input.value = v; }
      else if (sc.t === 'req') {
        v = v.split(',').map((x) => x.trim()).filter(Boolean);
        const bad = v.find((x) => !GA.DEFS[x] || GA.DEFS[x].kind !== 'b');
        if (bad) { msg(`"${bad}" is not a building id. Valid: ${GA.TYPES.filter((t) => GA.DEFS[t].kind === 'b').join(', ')}`, 'err'); input.value = (cur(section, key, f) || []).join(', '); return; }
      }
      setVal(section, key, f, v);
      wrap.classList.toggle('mod', isMod(section, key, f));
      wrap.closest('.card').classList.toggle('mod', cardMod(section, key));
      refreshDirty();
    };
    return wrap;
  }
  function cardMod(section, key) {
    if (section === 'settings' || section === 'ctype' || section === 'cweapon') return false;
    return !!(cfg[section][key] && Object.keys(cfg[section][key]).length);
  }
  function resetBtn(section, key, rerender) {
    return el('button', { class: 'ghost', title: 'Reset this entry to defaults', onclick: () => { delete cfg[section][key]; rerender(); refreshDirty(); } }, '↺');
  }

  // ---------------------------------------------------------------- views
  // ---- pictures, on/off switch and the "create new" tools for buildings / units
  const isOff = (t) => cfg.disabled.includes(t);
  const iconEl = (type) => {
    const c = el('canvas', { width: 152, height: 112 });
    try { c.getContext('2d').drawImage(GA.getIcon(type, 0), 0, 0); } catch (e) { /* decorative */ }
    return c;
  };
  const blocked = (t, depth = 0) => { const d = GA.DEFS[t]; return !!d && depth < 8 && (d.req || []).some((r) => GA.DEFS[r] && (GA.DEFS[r].disabled || blocked(r, depth + 1))); };
  const slug = (name, prefix, taken) => {
    let base = String(name).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 9) || 'new', id = prefix + base, n = 2;
    while (taken(id)) id = prefix + base.slice(0, 9 - String(n).length) + n++;
    return id;
  };
  function typeCard(t, kind, rerender) {
    const d = GA.DEFS[t], custom = !!d.custom, prot = GA.PROTECTED_TYPES.includes(t), off = isOff(t);
    const card = el('div', { class: 'card' + (custom ? ' custom' : '') + (off ? ' off' : '') + (!custom && cardMod('defs', t) ? ' mod' : ''), id: 'tc_' + t });
    const tags = el('div', { class: 'tags' });
    if (custom) tags.append(el('span', { class: 'tag gold' }, '★ CUSTOM'), el('span', { class: 'tag' }, 'based on ' + GA.BASE.defs[d.base].name));
    if (off) tags.append(el('span', { class: 'tag red' }, 'SWITCHED OFF'));
    else if (blocked(t)) tags.append(el('span', { class: 'tag red' }, 'NEEDS A SWITCHED-OFF BUILDING'));
    const toggle = el('input', { type: 'checkbox' });
    toggle.checked = !off; toggle.disabled = prot;
    toggle.onchange = () => {
      cfg.disabled = cfg.disabled.filter((x) => x !== t);
      if (!toggle.checked) cfg.disabled.push(t);
      GA.applyConfig(cfg); refreshDirty(); rerender();
    };
    const head = el('div', { class: 'thead' }, iconEl(t),
      el('div', { class: 'tt' }, el('h3', {}, custom ? cfg.custom.types[t].name : GA.BASE.defs[t].name, el('small', {}, t)), tags),
      el('label', { class: 'toggle', title: prot ? 'The game cannot run without this - it always stays on.' : 'Off = it never appears on the battlefield (cannot be built or trained; bots skip it).' }, toggle, 'In battle'));
    card.append(head);
    if (custom) card.querySelector('h3').append(el('button', { class: 'danger', style: 'margin-left:auto;padding:2px 9px;font-size:11px', onclick: () => {
      if (!confirm(GA.tt(`Delete "${cfg.custom.types[t].name}"?`))) return;
      delete cfg.custom.types[t]; cfg.disabled = cfg.disabled.filter((x) => x !== t);
      GA.applyConfig(cfg); refreshDirty(); rerender();
    } }, 'Delete'));
    else card.querySelector('h3').append(resetBtn('defs', t, () => { GA.applyConfig(cfg); rerender(); }));
    const fields = el('div', { class: 'fields' });
    const list = kind === 'b'
      ? ['name', 'cost', 'time', 'hp', 'power', 'vision', 'armor', 'weapon', 'income', 'bounty', 'req', 'desc']
      : ['name', 'cost', 'time', 'hp', 'speed', 'vision', 'armor', 'weapon', 'capacity', 'req', 'desc'];
    for (const f of list) {
      if (f === 'capacity' && !d.harvester) continue;
      if ((f === 'income' || f === 'bounty') && d[f] === undefined) continue;
      if (f === 'time' && t === 'conyard') continue;
      if (f === 'req' && t === 'conyard') continue;
      fields.append(field(custom ? 'ctype' : 'defs', t, f, S.defs[f]));
    }
    card.append(fields);
    return card;
  }
  function defCards(kind, focus) {
    const view = $('view');
    view.innerHTML = '';
    GA.applyConfig(cfg);
    const noun = kind === 'b' ? 'building' : 'unit';
    view.append(el('p', { class: 'note' }, kind === 'b'
      ? 'Structures. The picture is what the game draws. Untick "In battle" to keep a building off the battlefield, or create your own building as a copy of an existing one (it acts like the original: a copy of the Barracks trains infantry, a copy of the Ore Processor refines ore, ...). Yellow fields differ from the built-in defaults (hover a field to see the default). "Requires" is a comma separated list of building ids.'
      : 'Units. The picture is what the game draws. Untick "In battle" to keep a unit off the battlefield, or create your own unit as a copy of an existing one with its own name, stats and weapon. Speed is in tiles per second; build time is in seconds at full power.'));
    const rerender = () => defCards(kind);
    const types = GA.TYPES.filter((t) => GA.DEFS[t].kind === kind);
    const offCount = types.filter((t) => isOff(t)).length;

    // ---- create box
    const bases = GA.BUILTIN_TYPES.filter((t) => GA.DEFS[t].kind === kind && !GA.DEFS[t].neutral && t !== 'conyard');
    const baseSel = el('select', {}, bases.map((t) => el('option', { value: t }, GA.BASE.defs[t].name)));
    const nameIn = el('input', { type: 'text', maxlength: 24, placeholder: kind === 'b' ? 'e.g. Field Barracks' : 'e.g. Storm Tank' });
    let pic = iconEl(baseSel.value);
    baseSel.onchange = () => { const n = iconEl(baseSel.value); pic.replaceWith(n); pic = n; };
    const create = () => {
      const name = nameIn.value.trim();
      if (name.length < 2) { msg('Give it a name first.', 'err'); nameIn.focus(); return; }
      if (Object.keys(cfg.custom.types).length >= GA.CUSTOM_LIMITS.types) { msg(`At most ${GA.CUSTOM_LIMITS.types} custom buildings / units.`, 'err'); return; }
      const id = slug(name, 'x_', (x) => !!cfg.custom.types[x] || !!GA.DEFS[x]);
      cfg.custom.types[id] = { base: baseSel.value, name };
      refreshDirty(); defCards(kind, id);
    };
    const box = el('div', { class: 'newbox hidden' },
      el('h3', { style: 'margin:0 0 10px;font-size:14px;color:var(--amber)' }, kind === 'b' ? 'New building' : 'New unit'),
      el('div', { class: 'row' }, pic, el('label', {}, 'Based on (copies its look, abilities and stats)', baseSel), el('label', {}, 'Name', nameIn), el('button', { class: 'primary', onclick: create }, 'Create')));
    nameIn.onkeydown = (e) => { if (e.key === 'Enter') create(); };
    view.append(el('div', { class: 'toolbar' },
      el('button', { class: 'primary', onclick: () => { box.classList.toggle('hidden'); nameIn.focus(); } }, kind === 'b' ? '＋ New building' : '＋ New unit'),
      el('button', { class: 'ghost', onclick: () => { cfg.disabled = cfg.disabled.filter((x) => !GA.DEFS[x] || GA.DEFS[x].kind !== kind); GA.applyConfig(cfg); refreshDirty(); rerender(); } }, 'Switch everything on'),
      el('span', { class: 'sp' }), el('span', { class: 'note', style: 'margin:0' }, `${types.length - offCount} / ${types.length} ${noun}s in battle`)), box);

    const grid = el('div', { class: 'grid' });
    for (const t of types) grid.append(typeCard(t, kind, rerender));
    view.append(grid);
    if (focus) { const c = $('tc_' + focus); if (c) { c.scrollIntoView({ block: 'center' }); c.classList.add('mod'); } }
  }
  function weaponView(focus) {
    const view = $('view'); view.innerHTML = '';
    GA.applyConfig(cfg);
    const users = {};
    for (const t of GA.TYPES) { const w = GA.DEFS[t].weapon; if (w) (users[w] = users[w] || []).push(GA.DEFS[t].name); }
    view.append(el('p', { class: 'note' }, 'Weapons. Damage class decides which armor multipliers apply (see "Armor" tab). Set a unit\'s weapon on the Units / Structures tab - your own weapons show up in that list too. Projectile speed 0 = instant beam.'));
    const baseSel = el('select', {}, Object.keys(B.weapons).map((k) => el('option', { value: k }, k)));
    const labelIn = el('input', { type: 'text', maxlength: 24, placeholder: 'e.g. Storm cannon' });
    const create = () => {
      const name = labelIn.value.trim();
      if (name.length < 2) { msg('Give it a name first.', 'err'); labelIn.focus(); return; }
      if (Object.keys(cfg.custom.weapons).length >= GA.CUSTOM_LIMITS.weapons) { msg(`At most ${GA.CUSTOM_LIMITS.weapons} custom weapons.`, 'err'); return; }
      const id = slug(name, 'w_', (x) => !!cfg.custom.weapons[x] || !!GA.WEAPONS[x]);
      cfg.custom.weapons[id] = { base: baseSel.value, label: name };
      refreshDirty(); weaponView(id);
    };
    labelIn.onkeydown = (e) => { if (e.key === 'Enter') create(); };
    const box = el('div', { class: 'newbox hidden' }, el('h3', { style: 'margin:0 0 10px;font-size:14px;color:var(--amber)' }, 'New weapon'),
      el('div', { class: 'row' }, el('label', {}, 'Based on', baseSel), el('label', {}, 'Name', labelIn), el('button', { class: 'primary', onclick: create }, 'Create')));
    view.append(el('div', { class: 'toolbar' }, el('button', { class: 'primary', onclick: () => { box.classList.toggle('hidden'); labelIn.focus(); } }, '＋ New weapon')), box);
    const grid = el('div', { class: 'grid' });
    for (const k of Object.keys(GA.WEAPONS)) {
      const custom = !!cfg.custom.weapons[k], sec = custom ? 'cweapon' : 'weapons';
      const card = el('div', { class: 'card' + (custom ? ' custom' : '') + (!custom && cardMod('weapons', k) ? ' mod' : ''), id: 'wc_' + k });
      const title = el('h3', {}, custom ? (cfg.custom.weapons[k].label || k) : k, el('small', {}, (users[k] || ['(unused)']).join(', ')));
      if (custom) title.append(el('button', { class: 'danger', style: 'margin-left:auto;padding:2px 9px;font-size:11px', onclick: () => {
        if (!confirm(GA.tt(`Delete weapon "${cfg.custom.weapons[k].label || k}"? Units using it fall back to their original weapon.`))) return;
        delete cfg.custom.weapons[k]; GA.applyConfig(cfg); refreshDirty(); weaponView();
      } }, 'Delete'));
      else title.append(resetBtn('weapons', k, weaponView));
      card.append(title);
      const fields = el('div', { class: 'fields' });
      for (const f of ['dmg', 'cd', 'range', 'splash', 'speed', 'wtype', 'targets', 'proj']) fields.append(field(sec, k, f, S.weapons[f]));
      card.append(fields); grid.append(card);
    }
    view.append(grid);
    if (focus) { const c = $('wc_' + focus); if (c) { c.scrollIntoView({ block: 'center' }); c.classList.add('mod'); } }
  }
  function multView() {
    const view = $('view'); view.innerHTML = '';
    view.append(el('p', { class: 'note' }, 'Damage multiplier by damage class (rows) versus armor type (columns). 1 = full damage, 0 = immune.'));
    const tbl = el('table', {}, el('tr', {}, el('th', {}, 'Class \\ Armor'), S.armors.map((a) => el('th', {}, a))));
    for (const w of Object.keys(GA.MULT)) {
      const tr = el('tr', {}, el('td', {}, w));
      for (const a of S.armors) {
        const input = el('input', { type: 'number', min: 0, max: 5, step: 0.05, value: cur('mult', w, a), title: 'Default: ' + B.mult[w][a] });
        const td = el('td', { class: isMod('mult', w, a) ? 'mod' : '' }, input);
        input.onchange = () => { let v = parseFloat(input.value); if (!Number.isFinite(v)) v = B.mult[w][a]; v = Math.min(5, Math.max(0, v)); input.value = v; setVal('mult', w, a, v); td.classList.toggle('mod', isMod('mult', w, a)); refreshDirty(); };
        tr.append(td);
      }
      tbl.append(tr);
    }
    view.append(tbl);
  }
  function botView() {
    const view = $('view'); view.innerHTML = '';
    view.append(el('p', { class: 'note' }, 'AI difficulty levels. "First attack" is the game time (seconds) before the bot launches its first wave; income x > 1 gives the bot a harvesting bonus.'));
    const grid = el('div', { class: 'grid' });
    for (const lv of Object.keys(GA.BOT_LEVELS)) {
      const card = el('div', { class: 'card' + (cardMod('bots', lv) ? ' mod' : '') });
      card.append(el('h3', {}, lv[0].toUpperCase() + lv.slice(1), resetBtn('bots', lv, botView)));
      const fields = el('div', { class: 'fields' });
      for (const f of Object.keys(S.bots)) fields.append(field('bots', lv, f, S.bots[f]));
      card.append(fields); grid.append(card);
    }
    view.append(grid);
  }
  function settingsView() {
    const view = $('view'); view.innerHTML = '';
    view.append(el('p', { class: 'note' }, 'Global game rules.'));
    const card = el('div', { class: 'card' });
    const fields = el('div', { class: 'fields' });
    for (const k of Object.keys(S.settings)) fields.append(field('settings', k, k, S.settings[k]));
    card.append(fields);
    view.append(el('div', { class: 'grid', style: 'grid-template-columns:minmax(340px,680px)' }, card));
  }

  // ---------------------------------------------------------------- users
  async function usersView() {
    const view = $('view'); view.innerHTML = '';
    let list;
    try { list = (await api('/api/admin/users')).users; } catch (e) { view.append(el('p', { class: 'note' }, e.message)); return; }
    list.sort((a, b) => (b.online - a.online) || a.name.localeCompare(b.name));
    view.append(el('p', { class: 'note' }, `${list.length} account(s). Passwords are stored as salted scrypt hashes and cannot be viewed - only reset.`));
    const tbl = el('table', {}, el('tr', {}, ['User', 'Role', 'Rating', 'Games', 'Wins', 'Status', 'Last login', 'Last IP', ''].map((h) => el('th', {}, h))));
    for (const u of list) {
      const act = el('td', {},
        el('button', { onclick: async () => { try { await api('/api/admin/users/role', 'POST', { name: u.name, role: u.role === 'admin' ? 'user' : 'admin' }); usersView(); } catch (e) { alert(e.message); } } }, u.role === 'admin' ? 'Remove admin' : 'Make admin'), ' ',
        el('button', { onclick: async () => { const pw = prompt(GA.tt(`New password for ${u.name} (min 6 chars):`)); if (!pw) return; try { await api('/api/admin/users/password', 'POST', { name: u.name, password: pw }); alert(GA.tt('Password changed. The user was signed out.')); } catch (e) { alert(e.message); } } }, 'Reset password'), ' ',
        el('button', { onclick: async () => { if (!confirm(GA.tt(`Reset rating and stats of "${u.name}"?`))) return; try { await api('/api/admin/users/resetstats', 'POST', { name: u.name }); usersView(); } catch (e) { alert(e.message); } } }, 'Reset stats'), ' ',
        el('button', { class: 'danger', onclick: async () => { if (!confirm(GA.tt(`Delete account "${u.name}"?`))) return; try { await api('/api/admin/users/delete', 'POST', { name: u.name }); usersView(); } catch (e) { alert(e.message); } } }, 'Delete'));
      tbl.append(el('tr', {}, el('td', {}, u.name), el('td', {}, u.role === 'admin' ? el('span', { class: 'badge' }, 'ADMIN') : 'user'), el('td', {}, String(u.rating)), el('td', {}, String(u.games)), el('td', {}, String(u.wins)),
        el('td', { class: u.online ? 'on' : 'off' }, u.online ? '● online' : 'offline'), el('td', {}, u.lastLogin ? new Date(u.lastLogin).toLocaleString() : '—'), el('td', {}, u.lastIp || '—'), act));
    }
    view.append(tbl);
  }
  async function roomsView() {
    const view = $('view');
    let data;
    try { data = await api('/api/admin/rooms'); } catch (e) { return; }
    view.innerHTML = '';
    view.append(el('p', { class: 'note' }, data.playing ? 'A game is currently running - saved config changes apply once no game is running.' : 'No game is running.'));
    view.append(el('p', { class: 'note' }, data.queue.length ? 'Matchmaking queue: ' + data.queue.map((q) => `${q.name} (${q.rating}, ${q.waited}s${q.bots ? '' : ', humans only'})`).join(' · ') : 'Matchmaking queue is empty.'));
    if (!data.rooms.length) { view.append(el('p', { class: 'note' }, 'No rooms.')); return; }
    const tbl = el('table', {}, el('tr', {}, ['Code', 'Host', 'State', 'Players', 'Game time', ''].map((h) => el('th', {}, h))));
    for (const r of data.rooms) {
      tbl.append(el('tr', {}, el('td', {}, r.code + (r.ranked ? ' ★' : r.matchmade ? ' (mm)' : '')), el('td', {}, r.host), el('td', {}, r.state), el('td', {}, r.players.join(', ')), el('td', {}, r.state === 'playing' ? Math.floor(r.time / 60) + 'm ' + (r.time % 60) + 's' : '—'),
        el('td', {}, el('button', { class: 'danger', onclick: async () => { if (!confirm(GA.tt('Close room ' + r.code + '?'))) return; try { await api('/api/admin/rooms/close', 'POST', { code: r.code }); roomsView(); } catch (e) { alert(e.message); } } }, 'Close'))));
    }
    view.append(tbl);
  }

  // ---------------------------------------------------------------- sign-in logs
  const LOG_EVENTS = ['login', 'login_failed', 'login_blocked', 'register', 'logout', 'session_replaced', 'password_reset', 'role_change', 'stats_reset', 'account_deleted', 'config_saved', 'config_reset', 'map_saved', 'map_deleted', 'room_closed'];
  const logState = { event: '', user: '', q: '', ok: '', rows: [], done: false };
  function device(ua) {
    const b = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : /curl|node|python|axios/i.test(ua) ? 'script' : ua ? 'Browser' : '—';
    const o = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
    return o ? b + ' · ' + o : b;
  }
  const logQuery = (extra) => {
    const p = new URLSearchParams();
    if (logState.event) p.set('event', logState.event);
    if (logState.user) p.set('user', logState.user);
    if (logState.q) p.set('q', logState.q);
    if (logState.ok) p.set('ok', logState.ok);
    for (const [k, v] of Object.entries(extra || {})) p.set(k, v);
    return p.toString();
  };
  async function logsView(more) {
    const view = $('view');
    if (!more) { logState.rows = []; logState.done = false; }
    let data;
    try { data = await api('/api/admin/logs?' + logQuery({ limit: 100, ...(logState.rows.length ? { before: logState.rows[logState.rows.length - 1].id } : {}) })); } catch (e) { view.innerHTML = ''; view.append(el('p', { class: 'note' }, e.message)); return; }
    logState.rows = logState.rows.concat(data.logs);
    if (data.logs.length < 100) logState.done = true;
    view.innerHTML = '';
    view.append(el('p', { class: 'note' }, 'Every sign-in, failed attempt, registration, sign-out and admin action is recorded (kept in data/auth.log, newest 3000 shown here). Set TRUST_PROXY=1 when running behind a reverse proxy so real client IPs are recorded.'));
    const evSel = el('select', {}, el('option', { value: '' }, 'All events'), LOG_EVENTS.map((e) => el('option', { value: e }, e)));
    evSel.value = logState.event;
    const okSel = el('select', {}, el('option', { value: '' }, 'Any result'), el('option', { value: '1' }, 'Success only'), el('option', { value: '0' }, 'Failures only'));
    okSel.value = logState.ok;
    const userIn = el('input', { type: 'text', placeholder: 'User contains…', value: logState.user });
    const qIn = el('input', { type: 'text', placeholder: 'IP / note / browser contains…', value: logState.q });
    const apply = () => { logState.event = evSel.value; logState.ok = okSel.value; logState.user = userIn.value.trim(); logState.q = qIn.value.trim(); logsView(); };
    for (const x of [evSel, okSel]) x.onchange = apply;
    for (const x of [userIn, qIn]) x.onkeydown = (e) => { if (e.key === 'Enter') apply(); };
    const csv = el('button', { onclick: async () => {
      try {
        const r = await fetch('/api/admin/logs?' + logQuery({ format: 'csv', limit: 1000 }), { headers: { Authorization: 'Bearer ' + token } });
        const blob = await r.blob(); const a = el('a', { href: URL.createObjectURL(blob), download: 'auth-log.csv' }); document.body.append(a); a.click(); a.remove();
      } catch (e) { alert(e.message); }
    } }, 'Export CSV');
    for (const x of [evSel, okSel, userIn, qIn]) x.style.cssText = 'width:auto;flex:1;min-width:150px';
    view.append(el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px' }, evSel, okSel, userIn, qIn, el('button', { onclick: apply }, 'Search'), el('button', { class: 'ghost', onclick: () => logsView() }, '↻ Refresh'), csv));
    const tbl = el('table', {}, el('tr', {}, ['Time', 'Event', 'User', 'Result', 'IP', 'Device', 'Note'].map((h) => el('th', {}, h))));
    for (const e of logState.rows) {
      const bad = !e.ok || e.event === 'login_blocked';
      tbl.append(el('tr', {}, el('td', {}, new Date(e.t).toLocaleString()), el('td', {}, el('span', { class: bad ? 'badge bad' : 'badge' }, e.event)), el('td', {}, e.user || '—'),
        el('td', { class: e.ok ? 'on' : 'bad' }, e.ok ? 'ok' : 'failed'), el('td', {}, e.ip || '—'), el('td', { title: e.ua }, device(e.ua)), el('td', {}, e.note || '')));
    }
    if (!logState.rows.length) view.append(el('p', { class: 'note' }, 'No log entries match.'));
    else view.append(tbl);
    if (!logState.done) view.append(el('p', {}, el('button', { onclick: () => logsView(true) }, 'Load older entries')));
  }

  // ---------------------------------------------------------------- match history
  async function matchesView() {
    const view = $('view');
    let data;
    try { data = await api('/api/admin/matches?limit=60'); } catch (e) { view.innerHTML = ''; view.append(el('p', { class: 'note' }, e.message)); return; }
    view.innerHTML = '';
    view.append(el('p', { class: 'note' }, `${data.total} match(es) stored (newest 500 kept). "Ranked" matches change Elo ratings; placement = survival order (leaving mid-game ranks you last).`));
    if (!data.matches.length) return;
    const tbl = el('table', {}, el('tr', {}, ['#', 'When', 'Mode', 'Length', 'Results (place · rating change)'].map((h) => el('th', {}, h))));
    for (const m of data.matches) {
      const line = m.players.slice().sort((a, b) => a.place - b.place).map((p) => {
        const nm = p.user || p.botName || 'AI';
        const d = p.rating ? ` ${p.rating.after - p.rating.before >= 0 ? '+' : ''}${p.rating.after - p.rating.before}` : '';
        return `${p.place}. ${nm}${p.quit ? ' (quit)' : ''}${d}`;
      }).join('   ·   ');
      tbl.append(el('tr', {}, el('td', {}, String(m.id)), el('td', {}, new Date(m.t).toLocaleString()), el('td', {}, m.mode), el('td', {}, Math.floor(m.dur / 60) + 'm ' + (m.dur % 60) + 's'), el('td', {}, line)));
    }
    view.append(tbl);
  }

  // ---------------------------------------------------------------- shell

  const TABS = [
    ['structures', 'Structures', () => defCards('b')], ['units', 'Units', () => defCards('u')], ['weapons', 'Weapons', weaponView],
    ['armor', 'Armor', multView], ['bots', 'Bot AI', botView], ['settings', 'Rules', settingsView],
    ['maps', 'Maps', () => GA.mapEditorView($('view'), api)],
    ['users', 'Users', usersView], ['logs', 'Sign-in logs', logsView], ['matches', 'Matches', matchesView], ['rooms', 'Rooms', roomsView],
  ];
  function showTab(id) {
    tab = id;
    clearInterval(roomTimer);
    for (const b of $('tabs').children) b.classList.toggle('active', b.dataset.id === id);
    TABS.find((t) => t[0] === id)[2]();
    if (id === 'rooms') roomTimer = setInterval(roomsView, 4000);
    $('bar').classList.toggle('hidden', ['maps', 'users', 'rooms', 'logs', 'matches'].includes(id));
  }
  function buildTabs() {
    $('tabs').innerHTML = '';
    for (const [id, label] of TABS) $('tabs').append(el('button', { 'data-id': id, onclick: () => showTab(id) }, label));
  }
  function load(config) {
    cfg = JSON.parse(JSON.stringify(GA.cleanConfig(config)));
    saved = JSON.stringify(GA.cleanConfig(cfg));
    GA.applyConfig(cfg);
  }
  $('btnSave').onclick = async () => {
    try {
      const j = await api('/api/admin/config', 'PUT', { config: cfg });
      load(j.config);
      showTab(tab);
      msg(j.appliedNow ? 'Saved. New games use these values.' : 'Saved. A game is running - values apply when it ends (new rooms started while idle).', 'ok');
    } catch (e) { msg(e.message, 'err'); }
  };
  $('btnDiscard').onclick = () => { cfg = JSON.parse(saved); GA.applyConfig(cfg); showTab(tab); msg('Edits discarded.'); };
  $('btnReset').onclick = async () => {
    if (!confirm(GA.tt('Reset EVERY value to the built-in defaults from data.js?'))) return;
    try { const j = await api('/api/admin/config/reset', 'POST'); load(j.config); showTab(tab); msg('All values reset to defaults.', 'ok'); } catch (e) { msg(e.message, 'err'); }
  };
  window.addEventListener('beforeunload', (e) => { if (dirty() || (GA.mapEditorDirty && GA.mapEditorDirty())) { e.preventDefault(); e.returnValue = ''; } });

  (async function boot() {
    const gate = (title, text) => { $('gateTitle').textContent = title; $('gateMsg').textContent = text; $('gate').classList.remove('hidden'); };
    if (!token) return gate('Sign in required', 'Sign in on the game page with an admin account first, then reload this page.');
    try { me = (await api('/api/me')).user; } catch (e) { return gate('Sign in required', 'Your session has expired. Sign in on the game page, then reload this page.'); }
    if (me.role !== 'admin') return gate('Admin only', `You are signed in as ${me.name}, which is not an admin account.`);
    $('who').textContent = 'Signed in as ' + me.name;
    const j = await api('/api/admin/config');
    load(j.config);
    $('app').classList.remove('hidden'); $('bar').classList.remove('hidden');
    buildTabs(); showTab('structures');
  })();
})();

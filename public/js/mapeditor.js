// Admin map editor: paint terrain / ore / start positions / neutral structures on a top-down grid, check the map, save it to the server.
(function () {
  'use strict';
  const GA = globalThis.GA;
  const { W, H } = GA;
  const N = W * H, S = 7, C = (W - 1) / 2;
  const OPEN = 0, ROCK = 1, WATER = 2;

  const el = (tag, attrs, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) { if (k === 'class') e.className = v; else if (k.startsWith('on')) e[k] = v; else if (v !== false && v != null) e.setAttribute(k, v); }
    for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : document.createTextNode(k));
    return e;
  };
  const hash = (x, y) => { let h = Math.imul(x * 374761393 + y * 668265263, 1274126177); h = Math.imul(h ^ (h >>> 13), 1103515245); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const START_COLORS = [GA.PALETTE[0].main, GA.PALETTE[1].main, GA.PALETTE[2].main];
  const NEUTRAL_LOOK = { derrick: { color: '#34d399', letter: 'D' }, depot: { color: '#facc15', letter: 'S' } };

  // ------------------------------------------------------------------ state
  let st = null;                 // the map being edited
  let saved = [];                // maps stored on the server
  let dirty = false;
  let undo = [], redo = [];
  const ui = { tool: 'rock', size: 3, shape: 'round', bucket: false, oreAmt: 700, startIdx: 0, sym: 'none', grid: false };
  let cv = null, off = null, hover = null, drawing = null, checkTimer = 0, refs = {};

  GA.mapEditorDirty = () => dirty;

  function newState() { return { id: null, name: '', desc: '', terrain: new Uint8Array(N), ore: new Uint16Array(N), starts: [null, null, null], neutrals: [] }; }
  const inside = (x, y) => x >= 1 && y >= 1 && x < W - 1 && y < H - 1;
  function clearStart(s, x, y) {
    for (let j = Math.floor(y - 11); j <= y + 11; j++) for (let i = Math.floor(x - 11); i <= x + 11; i++) {
      if (inside(i, j) && Math.hypot(i - x, j - y) <= 10.5) { s.terrain[j * W + i] = OPEN; s.ore[j * W + i] = 0; }
    }
  }
  function patch(s, cx, cy, r, amt) {
    for (let j = Math.floor(cy - r - 1); j <= cy + r + 1; j++) for (let i = Math.floor(cx - r - 1); i <= cx + r + 1; i++) {
      if (!inside(i, j) || Math.hypot(i - cx, j - cy) > r) continue;
      s.terrain[j * W + i] = OPEN;
      s.ore[j * W + i] = Math.round(amt * (0.85 + hash(i, j) * 0.3));
    }
  }
  function blankMap() {
    const s = newState();
    for (let i = 0; i < N; i++) { const x = i % W, y = (i / W) | 0; if (!inside(x, y)) s.terrain[i] = ROCK; }
    s.starts = [0, 1, 2].map((k) => { const a = -Math.PI / 2 + (k * Math.PI * 2) / 3; return { x: Math.round(C + Math.cos(a) * 33), y: Math.round(C + Math.sin(a) * 33) }; });
    for (const p of s.starts) {
      clearStart(s, p.x, p.y);
      const a = Math.atan2(C - p.y, C - p.x);
      patch(s, p.x + Math.cos(a + 0.7) * 11, p.y + Math.sin(a + 0.7) * 11, 3.2, 700);
      patch(s, p.x + Math.cos(a - 0.9) * 13, p.y + Math.sin(a - 0.9) * 13, 3, 700);
    }
    patch(s, C, C, 5, 1100);
    return s;
  }
  function fromTemplate(id, seed) {
    if (id === 'blank') return blankMap();
    const m = GA.genMap(seed, id), s = newState();
    s.terrain.set(m.terrain);
    for (let i = 0; i < N; i++) s.ore[i] = Math.round(m.ore[i]);
    s.starts = m.starts.slice(0, 3).map((p) => ({ x: p.x, y: p.y }));
    s.neutrals = (m.neutrals || []).map((n) => ({ type: n.type, x: n.x, y: n.y }));
    return s;
  }
  function fromSaved(m) {
    const d = GA.customMapData(m), s = newState();
    if (!d) return blankMap();
    s.id = m.id; s.name = m.name; s.desc = m.desc || '';
    s.terrain.set(d.terrain);
    for (let i = 0; i < N; i++) s.ore[i] = Math.round(d.ore[i]);
    s.starts = d.starts.map((p) => ({ x: p.x, y: p.y }));
    s.neutrals = d.neutrals;
    return s;
  }
  function serialize() {
    return {
      id: st.id || undefined, name: refs.name.value, desc: refs.desc.value, terrain: GA.terrainEncode(st.terrain), ore: GA.oreEncode(st.ore),
      starts: st.starts.every(Boolean) ? st.starts.map((p) => [p.x, p.y]) : st.starts.filter(Boolean).map((p) => [p.x, p.y]), neutrals: st.neutrals,
    };
  }

  // ------------------------------------------------------------------ undo / redo
  const snapshot = () => ({ t: st.terrain.slice(), o: st.ore.slice(), s: JSON.stringify(st.starts), n: JSON.stringify(st.neutrals) });
  function restore(sn) { st.terrain.set(sn.t); st.ore.set(sn.o); st.starts = JSON.parse(sn.s); st.neutrals = JSON.parse(sn.n); }
  function pushUndo() { undo.push(snapshot()); if (undo.length > 40) undo.shift(); redo = []; }
  function doUndo() { if (!undo.length) return; redo.push(snapshot()); restore(undo.pop()); changed(true); }
  function doRedo() { if (!redo.length) return; undo.push(snapshot()); restore(redo.pop()); changed(true); }
  function changed(mark) {
    if (mark) dirty = true;
    refs.undo.disabled = !undo.length; refs.redo.disabled = !redo.length;
    draw(); scheduleCheck();
  }

  // ------------------------------------------------------------------ symmetry + brush
  function rot(x, y, a) { const dx = x - C, dy = y - C, c = Math.cos(a), s = Math.sin(a); return [Math.round(C + dx * c - dy * s), Math.round(C + dx * s + dy * c)]; }
  function symPoints(x, y) {
    let pts = [[x, y]];
    if (ui.sym === 'rot3') pts = [[x, y], rot(x, y, (Math.PI * 2) / 3), rot(x, y, (Math.PI * 4) / 3)];
    else if (ui.sym === 'mx') pts = [[x, y], [W - 1 - x, y]];
    else if (ui.sym === 'my') pts = [[x, y], [x, H - 1 - y]];
    else if (ui.sym === 'mxy') pts = [[x, y], [W - 1 - x, y], [x, H - 1 - y], [W - 1 - x, H - 1 - y]];
    const seen = new Set();
    return pts.filter(([a, b]) => { const k = a + ',' + b; if (seen.has(k)) return false; seen.add(k); return true; });
  }
  function brushTiles(cx, cy) {
    const n = ui.size, lo = -Math.floor((n - 1) / 2), hi = Math.floor(n / 2), out = [];
    for (let dy = lo; dy <= hi; dy++) for (let dx = lo; dx <= hi; dx++) {
      if (ui.shape === 'round' && n > 2 && Math.hypot(dx - (lo + hi) / 2, dy - (lo + hi) / 2) > n / 2 - 0.15) continue;
      out.push([cx + dx, cy + dy]);
    }
    return out;
  }

  // ------------------------------------------------------------------ editing operations
  function flood(x, y, to) {
    const from = st.terrain[y * W + x];
    if (from === to) return;
    const stack = [[x, y]];
    while (stack.length) {
      const [a, b] = stack.pop();
      if (!inside(a, b)) continue;
      const i = b * W + a;
      if (st.terrain[i] !== from) continue;
      st.terrain[i] = to;
      if (to !== OPEN) st.ore[i] = 0;
      stack.push([a + 1, b], [a - 1, b], [a, b + 1], [a, b - 1]);
    }
  }
  function neutralAt(x, y) { return st.neutrals.findIndex((n) => x >= n.x && x < n.x + 2 && y >= n.y && y < n.y + 2); }
  function placeNeutral(type, x, y) {
    for (let j = y; j < y + 2; j++) for (let i = x; i < x + 2; i++) { if (!inside(i, j)) return; }
    st.neutrals = st.neutrals.filter((n) => !(Math.abs(n.x - x) < 2 && Math.abs(n.y - y) < 2));
    if (st.neutrals.length >= GA.MAP_LIMITS.maxNeutrals) return;
    for (let j = y; j < y + 2; j++) for (let i = x; i < x + 2; i++) { st.terrain[j * W + i] = OPEN; st.ore[j * W + i] = 0; }
    st.neutrals.push({ type, x, y });
  }
  // apply the current tool at tile (x, y); `alt` = right mouse button (paints open ground / removes)
  function applyAt(x, y, alt, first) {
    const tool = ui.tool;
    for (const [px, py] of symPoints(x, y)) {
      if (tool === 'open' || tool === 'rock' || tool === 'water') {
        const v = alt ? OPEN : tool === 'open' ? OPEN : tool === 'rock' ? ROCK : WATER;
        if (ui.bucket) { if (first && inside(px, py)) flood(px, py, v); continue; }
        for (const [i, j] of brushTiles(px, py)) if (inside(i, j)) { st.terrain[j * W + i] = v; if (v !== OPEN) st.ore[j * W + i] = 0; }
      } else if (tool === 'ore' || tool === 'unore') {
        const erase = alt || tool === 'unore';
        for (const [i, j] of brushTiles(px, py)) if (inside(i, j) && st.terrain[j * W + i] === OPEN) st.ore[j * W + i] = erase ? 0 : Math.round(ui.oreAmt * (0.85 + hash(i, j) * 0.3));
      } else if (tool === 'derrick' || tool === 'depot') {
        if (!first) continue;
        if (alt) { const k = neutralAt(px, py); if (k >= 0) st.neutrals.splice(k, 1); } else placeNeutral(tool, px, py);
      } else if (tool === 'erase') {
        if (!first) continue;
        const k = neutralAt(px, py); if (k >= 0) st.neutrals.splice(k, 1);
      }
    }
    if (tool === 'start' && first && !alt && inside(x, y)) {
      const k = ui.startIdx;
      const list = ui.sym === 'rot3' ? [[x, y], rot(x, y, (Math.PI * 2) / 3), rot(x, y, (Math.PI * 4) / 3)] : [[x, y]];
      list.forEach(([a, b], n) => { const idx = (k + n) % 3; st.starts[idx] = { x: a, y: b }; clearStart(st, a, b); });
    }
  }

  // ------------------------------------------------------------------ drawing
  function draw() {
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const img = new ImageData(W, H);
    for (let i = 0; i < N; i++) {
      const t = st.terrain[i], o = i * 4, a = st.ore[i];
      let c = ((i % W) + ((i / W) | 0)) & 1 ? [24, 41, 59] : [21, 37, 54];
      if (t === ROCK) c = [96, 105, 142]; else if (t === WATER) c = [14, 72, 112];
      else if (a > 0) c = a > 950 ? [235, 178, 62] : a > 450 ? [52, 211, 153] : [34, 150, 108];
      img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
    }
    off.getContext('2d').putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, 0, 0, W * S, H * S);
    if (ui.grid) {
      ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1; ctx.beginPath();
      for (let i = 0; i <= W; i++) { ctx.moveTo(i * S + 0.5, 0); ctx.lineTo(i * S + 0.5, H * S); ctx.moveTo(0, i * S + 0.5); ctx.lineTo(W * S, i * S + 0.5); }
      ctx.stroke();
    }
    // symmetry guides
    ctx.strokeStyle = 'rgba(250,204,21,0.45)'; ctx.setLineDash([6, 5]); ctx.lineWidth = 1;
    ctx.beginPath();
    if (ui.sym === 'mx' || ui.sym === 'mxy') { ctx.moveTo(W * S / 2, 0); ctx.lineTo(W * S / 2, H * S); }
    if (ui.sym === 'my' || ui.sym === 'mxy') { ctx.moveTo(0, H * S / 2); ctx.lineTo(W * S, H * S / 2); }
    if (ui.sym === 'rot3') for (let k = 0; k < 3; k++) { const a = -Math.PI / 2 + k * (Math.PI * 2) / 3; ctx.moveTo(W * S / 2, H * S / 2); ctx.lineTo(W * S / 2 + Math.cos(a) * W * S / 2, H * S / 2 + Math.sin(a) * H * S / 2); }
    ctx.stroke(); ctx.setLineDash([]);
    // neutral structures
    for (const n of st.neutrals) {
      const look = NEUTRAL_LOOK[n.type] || { color: '#fff', letter: '?' };
      ctx.fillStyle = look.color; ctx.globalAlpha = 0.9; ctx.fillRect(n.x * S, n.y * S, 2 * S, 2 * S); ctx.globalAlpha = 1;
      ctx.strokeStyle = '#04070c'; ctx.lineWidth = 1.5; ctx.strokeRect(n.x * S + 0.5, n.y * S + 0.5, 2 * S - 1, 2 * S - 1);
      ctx.fillStyle = '#04070c'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(look.letter, (n.x + 1) * S, (n.y + 1) * S + 1);
    }
    // start positions
    st.starts.forEach((p, k) => {
      if (!p) return;
      const cx = (p.x + 0.5) * S, cy = (p.y + 0.5) * S;
      ctx.strokeStyle = START_COLORS[k]; ctx.globalAlpha = 0.55; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx, cy, 10.5 * S, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
      ctx.fillStyle = START_COLORS[k]; ctx.strokeStyle = '#04070c'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, 2.4 * S, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#04070c'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(k + 1), cx, cy + 1);
    });
    // brush preview
    if (hover) {
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1;
      const t = ui.tool;
      for (const [px, py] of symPoints(hover[0], hover[1])) {
        if (t === 'derrick' || t === 'depot') ctx.strokeRect(px * S + 0.5, py * S + 0.5, 2 * S - 1, 2 * S - 1);
        else if (t === 'start') { ctx.beginPath(); ctx.arc((px + 0.5) * S, (py + 0.5) * S, 10.5 * S, 0, Math.PI * 2); ctx.stroke(); }
        else if (t === 'erase' || ui.bucket && (t === 'open' || t === 'rock' || t === 'water')) ctx.strokeRect(px * S + 0.5, py * S + 0.5, S - 1, S - 1);
        else for (const [i, j] of brushTiles(px, py)) ctx.strokeRect(i * S + 0.5, j * S + 0.5, S - 1, S - 1);
      }
    }
  }

  // ------------------------------------------------------------------ validation panel
  function scheduleCheck() { clearTimeout(checkTimer); checkTimer = setTimeout(runCheck, 250); }
  function runCheck() {
    if (!refs.checks) return;
    const v = GA.validateMap(serialize());
    refs.checks.innerHTML = '';
    const line = (cls, x) => refs.checks.append(el('li', { class: cls }, GA.T(x.k, x.v)));
    for (const x of v.errors) line('bad', x);
    for (const x of v.warnings) line('warn', x);
    if (!v.errors.length && !v.warnings.length) refs.checks.append(el('li', { class: 'good' }, 'Looks good - ready to save.'));
    refs.save.disabled = refs.saveNew.disabled = v.errors.length > 0;
    refs.info.textContent = `${st.starts.filter(Boolean).length}/3 ${GA.tt('start positions')} · ${st.neutrals.length} ${GA.tt('neutral structures')}`;
  }

  // ------------------------------------------------------------------ saved maps
  function thumb(m) {
    const c = el('canvas', { width: 96, height: 96, class: 'me-thumb' });
    const d = GA.customMapData(m);
    if (!d) return c;
    const ctx = c.getContext('2d'), img = ctx.createImageData(96, 96);
    for (let i = 0; i < N; i++) {
      const o = i * 4, t = d.terrain[i];
      let col = [22, 38, 56];
      if (t === ROCK) col = [88, 96, 130]; else if (t === WATER) col = [14, 72, 112]; else if (d.ore[i] > 0) col = d.ore[i] > 950 ? [225, 170, 60] : [52, 211, 153];
      img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    for (const s of d.starts) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(s.x + 0.5, s.y + 0.5, 3, 0, 7); ctx.fill(); }
    return c;
  }
  function renderSaved(api) {
    refs.list.innerHTML = '';
    if (!saved.length) { refs.list.append(el('p', { class: 'note' }, 'No custom maps yet. Build one above and press Save.')); return; }
    for (const m of saved) {
      const card = el('div', { class: 'card me-saved' + (st.id === m.id ? ' mod' : '') },
        thumb(m),
        el('div', { class: 'me-saved-info' },
          el('h3', {}, m.name, el('small', {}, m.id)),
          el('p', { class: 'note', style: 'margin:0 0 8px' }, m.desc || '—'),
          el('p', { class: 'note', style: 'margin:0 0 8px;font-size:11px' }, `${m.by || ''} · ${m.t ? new Date(m.t).toLocaleString() : ''}`),
          el('div', {},
            el('button', { onclick: () => loadMap(m, api) }, 'Edit'), ' ',
            el('button', { class: 'danger', onclick: async () => {
              if (!confirm(GA.tt(`Delete map "${m.name}"?`))) return;
              try { saved = (await api('/api/admin/maps/delete', 'POST', { id: m.id })).maps; if (st.id === m.id) st.id = null; renderSaved(api); status('Map deleted.', 'ok'); } catch (e) { status(e.message, 'err'); }
            } }, 'Delete'))));
      refs.list.append(card);
    }
  }
  function status(text, kind) { refs.status.textContent = GA.tt(text); refs.status.className = 'me-status ' + (kind || ''); }
  function setMap(s) {
    st = s; undo = []; redo = []; dirty = false;
    refs.name.value = st.name; refs.desc.value = st.desc;
    changed(false);
    refs.title.textContent = st.id ? GA.tt('Editing') + ': ' + st.name : GA.tt('New map');
  }
  function loadMap(m, api) {
    if (dirty && !confirm(GA.tt('Discard the unsaved changes?'))) return;
    setMap(fromSaved(m)); renderSaved(api); status('Map loaded.', 'ok');
  }

  // ------------------------------------------------------------------ view
  GA.mapEditorView = async function (view, api) {
    view.innerHTML = '';
    const style = el('style', {}, `
      .me { display:flex; gap:18px; flex-wrap:wrap; align-items:flex-start; }
      .me-left { flex:0 1 ${W * S}px; min-width:280px; max-width:100%; }
      .me-left canvas.me-canvas { width:100%; max-width:${W * S}px; aspect-ratio:1; image-rendering:pixelated; border:1px solid var(--line); border-radius:8px; background:#04070c; cursor:crosshair; touch-action:none; display:block; }
      .me-right { flex:1 1 320px; min-width:300px; display:flex; flex-direction:column; gap:12px; }
      .me-panel { background:var(--panel); border:1px solid rgba(127,147,173,.2); border-radius:12px; padding:12px; }
      .me-panel h4 { margin:0 0 8px; font-size:11px; letter-spacing:.1em; text-transform:uppercase; color:var(--cyan); }
      .me-tools { display:grid; grid-template-columns:repeat(3,1fr); gap:6px; }
      .me-tools button { padding:6px 4px; font-size:12px; } .me-tools button.on { background:rgba(50,200,130,.28); border-color:var(--green); color:#fff; }
      .me-row { display:grid; grid-template-columns:1fr 1fr; gap:8px 10px; margin-top:8px; } .me-row.one { grid-template-columns:1fr; }
      .me-checks { list-style:none; margin:0; padding:0; font-size:12.5px; line-height:1.5; } .me-checks li { padding:2px 0; } .me-checks .bad { color:#ff8fa3; } .me-checks .warn { color:var(--amber); } .me-checks .good { color:var(--green); }
      .me-checks .bad::before { content:'✕ '; } .me-checks .warn::before { content:'! '; } .me-checks .good::before { content:'✓ '; }
      .me-status { font-size:12px; color:var(--muted); min-height:16px; } .me-status.ok { color:var(--green); } .me-status.err { color:var(--red); }
      .me-hint { font-size:12px; color:var(--muted); margin:6px 0 0; }
      label.me-check { flex-direction:row; align-items:center; gap:8px; text-transform:none; letter-spacing:normal; font-size:12.5px; color:var(--text); } label.me-check input { width:auto; }
      .me-saved { display:flex; gap:12px; align-items:flex-start; } .me-thumb { width:96px; height:96px; image-rendering:pixelated; border-radius:6px; flex:none; }
      .me-saved-info { min-width:0; flex:1; }
    `);
    refs = {};
    refs.title = el('h3', { style: 'margin:0 0 10px;font-size:15px;color:var(--green)' }, 'New map');
    refs.name = el('input', { type: 'text', maxlength: 24, placeholder: 'Map name' });
    refs.desc = el('input', { type: 'text', maxlength: 120, placeholder: 'Short description' });
    for (const i of [refs.name, refs.desc]) i.oninput = () => { st.name = refs.name.value; st.desc = refs.desc.value; dirty = true; scheduleCheck(); };
    refs.status = el('div', { class: 'me-status' });
    refs.info = el('div', { class: 'me-hint' });
    refs.checks = el('ul', { class: 'me-checks' });
    refs.list = el('div', { class: 'grid' });
    refs.coords = el('div', { class: 'me-hint', style: 'min-height:18px' }, ' ');
    refs.undo = el('button', { class: 'ghost', title: 'Ctrl+Z', onclick: doUndo }, '↶ Undo');
    refs.redo = el('button', { class: 'ghost', title: 'Ctrl+Y', onclick: doRedo }, '↷ Redo');
    const doSave = async (asNew) => {
      const m = serialize(); if (asNew) delete m.id;
      try {
        const j = await api('/api/admin/maps', 'PUT', { map: m });
        saved = j.maps; st.id = j.map.id; dirty = false;
        refs.title.textContent = GA.tt('Editing') + ': ' + j.map.name;
        renderSaved(api); status('Saved. Everyone can pick it in Skirmish and in online rooms.', 'ok');
      } catch (e) { status(e.message, 'err'); }
    };
    refs.save = el('button', { class: 'primary', onclick: () => doSave(false) }, 'Save');
    refs.saveNew = el('button', { onclick: () => doSave(true) }, 'Save as new copy');

    // canvas
    cv = el('canvas', { class: 'me-canvas', width: W * S, height: H * S });
    off = el('canvas', { width: W, height: H });
    const tileOf = (e) => { const r = cv.getBoundingClientRect(); return [Math.max(0, Math.min(W - 1, Math.floor(((e.clientX - r.left) / r.width) * W))), Math.max(0, Math.min(H - 1, Math.floor(((e.clientY - r.top) / r.height) * H)))]; };
    const stroke = (x, y) => {
      const p = drawing.last;
      const steps = p ? Math.max(Math.abs(x - p[0]), Math.abs(y - p[1])) : 0;
      if (!p) applyAt(x, y, drawing.alt, true);
      else for (let i = 1; i <= steps; i++) applyAt(Math.round(p[0] + ((x - p[0]) * i) / steps), Math.round(p[1] + ((y - p[1]) * i) / steps), drawing.alt, false);
      drawing.last = [x, y];
    };
    cv.onpointerdown = (e) => {
      if (e.button !== 0 && e.button !== 2) return;
      e.preventDefault(); cv.setPointerCapture(e.pointerId);
      pushUndo(); drawing = { alt: e.button === 2, last: null };
      const [x, y] = tileOf(e); stroke(x, y); changed(true);
    };
    cv.onpointermove = (e) => {
      const [x, y] = tileOf(e); hover = [x, y];
      const t = st.terrain[y * W + x], o = st.ore[y * W + x];
      refs.coords.textContent = `x ${x}, y ${y} · ${GA.tt(t === ROCK ? 'Rock' : t === WATER ? 'Water' : 'Open ground')}${o ? ' · ' + GA.tt('ore') + ' ' + o : ''}`;
      if (drawing) { stroke(x, y); changed(true); } else draw();
    };
    cv.onpointerup = () => { drawing = null; };
    cv.onpointerleave = () => { hover = null; refs.coords.textContent = ' '; draw(); };
    cv.oncontextmenu = (e) => e.preventDefault();
    const myCanvas = cv;
    const keys = (e) => {
      if (!myCanvas.isConnected) { window.removeEventListener('keydown', keys); return; }
      if (/INPUT|SELECT|TEXTAREA/.test((e.target.tagName || ''))) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); doUndo(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); doRedo(); }
    };
    window.addEventListener('keydown', keys);

    // tool buttons
    const TOOLS = [['open', '⬜ Open ground'], ['rock', '▦ Rock wall'], ['water', '≈ Water'], ['ore', '◈ Ore'], ['unore', '⌫ Erase ore'], ['start', '⚑ Start position'], ['derrick', 'D Crystal Derrick'], ['depot', 'S Supply Depot'], ['erase', '✕ Remove object']];
    const toolBtns = TOOLS.map(([id, label]) => el('button', { 'data-tool': id, class: ui.tool === id ? 'on' : '', onclick: () => { ui.tool = id; toolBtns.forEach((b) => b.classList.toggle('on', b.dataset.tool === id)); draw(); } }, label));
    const sel = (opts, value, on) => { const s = el('select', {}, opts.map(([v, t]) => el('option', { value: v }, t))); s.value = value; s.onchange = () => on(s.value); return s; };
    const size = el('input', { type: 'range', min: 1, max: 15, step: 1, value: ui.size });
    const sizeLbl = el('span', {}, String(ui.size));
    size.oninput = () => { ui.size = +size.value; sizeLbl.textContent = size.value; draw(); };
    const bucket = el('input', { type: 'checkbox' }); bucket.onchange = () => { ui.bucket = bucket.checked; draw(); };
    const grid = el('input', { type: 'checkbox' }); grid.onchange = () => { ui.grid = grid.checked; draw(); };
    const tplSel = sel([['blank', 'Blank map'], ['crossroads', 'Triad Crossing'], ['isles', 'Sunken Isles'], ['highlands', 'Iron Highlands'], ['random', 'Wildlands (random)']], 'blank', () => {});
    const seed = el('input', { type: 'number', value: 1, min: 1, max: 999999, style: 'width:90px' });
    const loadTpl = el('button', { onclick: () => { if (dirty && !confirm(GA.tt('Discard the unsaved changes?'))) return; const keepName = st.name; const s = fromTemplate(tplSel.value, Math.max(1, +seed.value | 0)); s.name = keepName; setMap(s); dirty = true; status('Template loaded.', 'ok'); renderSaved(api); } }, 'Load template');

    const left = el('div', { class: 'me-left' }, cv, refs.coords);
    const right = el('div', { class: 'me-right' },
      el('div', { class: 'me-panel' }, refs.title,
        el('div', { class: 'me-row one' }, el('label', {}, 'Name', refs.name), el('label', {}, 'Description', refs.desc)),
        el('div', { style: 'display:flex;gap:8px;margin-top:10px;flex-wrap:wrap' }, refs.save, refs.saveNew, el('button', { class: 'ghost', onclick: () => { if (dirty && !confirm(GA.tt('Discard the unsaved changes?'))) return; setMap(blankMap()); renderSaved(api); } }, '＋ New map')),
        refs.status, refs.info),
      el('div', { class: 'me-panel' }, el('h4', {}, 'Tools'), el('div', { class: 'me-tools' }, toolBtns),
        el('div', { class: 'me-row' },
          el('label', {}, el('span', {}, 'Brush size ', sizeLbl), size),
          el('label', {}, 'Brush shape', sel([['round', 'Round'], ['square', 'Square']], ui.shape, (v) => { ui.shape = v; draw(); })),
          el('label', {}, 'Ore richness', sel([['400', 'Poor (400)'], ['700', 'Normal (700)'], ['1100', 'Rich (1100)']], String(ui.oreAmt), (v) => { ui.oreAmt = +v; })),
          el('label', {}, 'Start position to place', sel([['0', 'Start 1 (cyan)'], ['1', 'Start 2 (red)'], ['2', 'Start 3 (lime)']], '0', (v) => { ui.startIdx = +v; })),
          el('label', { class: 'me-check' }, bucket, 'Bucket fill (open / rock / water)'),
          el('label', { class: 'me-check' }, grid, 'Show grid')),
        el('p', { class: 'me-hint' }, 'Left mouse paints with the selected tool, right mouse paints open ground / removes. Placing a start position clears open ground around it.')),
      el('div', { class: 'me-panel' }, el('h4', {}, 'Symmetry'),
        sel([['none', 'Off'], ['rot3', 'Rotate x3 (3 bases)'], ['mx', 'Mirror left / right'], ['my', 'Mirror top / bottom'], ['mxy', 'Mirror both']], ui.sym, (v) => { ui.sym = v; draw(); }),
        el('div', { style: 'display:flex;gap:8px;margin-top:10px' }, refs.undo, refs.redo)),
      el('div', { class: 'me-panel' }, el('h4', {}, 'Start from a template'), el('div', { style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap' }, tplSel, el('span', { class: 'me-hint', style: 'margin:0' }, 'Seed'), seed, loadTpl)),
      el('div', { class: 'me-panel' }, el('h4', {}, 'Checks'), refs.checks));
    view.append(style,
      el('p', { class: 'note' }, 'Map editor: build a battlefield for 3 players. Maps you save appear in the map picker for Skirmish and online rooms. The outer edge is always indestructible rock; rock inside the map can be destroyed in-game.'),
      el('div', { class: 'me' }, left, right),
      el('h3', { style: 'margin:26px 0 10px;color:var(--green);font-size:15px' }, 'Saved maps'), refs.list);

    try { saved = (await api('/api/admin/maps')).maps || []; } catch (e) { status(e.message, 'err'); saved = []; }
    if (st) {
      refs.name.value = st.name; refs.desc.value = st.desc;
      refs.title.textContent = st.id ? GA.tt('Editing') + ': ' + st.name : GA.tt('New map');
      changed(false);
    } else setMap(blankMap());
    renderSaved(api);
  };
})();

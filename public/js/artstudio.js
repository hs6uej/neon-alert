// Picture studio (admin page): make the picture of a building / unit with AI, from an uploaded file, or by hand.
// The result is a small transparent PNG stored on the server; the game draws it instead of the built-in vector art.
(function () {
  'use strict';
  const GA = (globalThis.GA = globalThis.GA || {});

  // ------------------------------------------------------------------ background removal (pure: works on RGBA bytes, unit-tested in Node)
  // AI pictures come on a flat magenta background. The background colour is measured on the border, then only the pixels
  // that touch the border and look like it are removed (flood fill), so magenta *inside* the object survives.
  // The rim gets a soft edge with the background colour "unmixed" so no pink halo is left.
  GA.cutBackground = function (d, w, h, tol, enclosed) {
    const samples = [[], [], []];
    const take = (x, y) => { const i = (y * w + x) * 4; if (d[i + 3] < 200) return; samples[0].push(d[i]); samples[1].push(d[i + 1]); samples[2].push(d[i + 2]); };
    for (let x = 0; x < w; x += 3) { take(x, 0); take(x, h - 1); }
    for (let y = 0; y < h; y += 3) { take(0, y); take(w - 1, y); }
    if (samples[0].length < 8) return false; // the border is already transparent: nothing to remove
    const med = (a) => { a.sort((p, q) => p - q); return a[a.length >> 1]; };
    const bg = [med(samples[0]), med(samples[1]), med(samples[2])];
    const dist = (i) => Math.sqrt((d[i] - bg[0]) * (d[i] - bg[0]) + (d[i + 1] - bg[1]) * (d[i + 1] - bg[1]) + (d[i + 2] - bg[2]) * (d[i + 2] - bg[2]));
    const mask = new Uint8Array(w * h), stack = [];
    const push = (p) => { if (!mask[p] && dist(p * 4) <= tol) { mask[p] = 1; stack.push(p); } };
    for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
    while (stack.length) {
      const p = stack.pop(), x = p % w, y = (p / w) | 0;
      if (x > 0) push(p - 1);
      if (x < w - 1) push(p + 1);
      if (y > 0) push(p - w);
      if (y < h - 1) push(p + w);
    }
    if (enclosed) for (let p = 0; p < w * h; p++) if (!mask[p] && dist(p * 4) <= tol) mask[p] = 1;
    const soft = tol * 2 + 1;
    const near = (p, x, y) => (x > 0 && mask[p - 1]) || (x < w - 1 && mask[p + 1]) || (y > 0 && mask[p - w]) || (y < h - 1 && mask[p + w]);
    for (let p = 0, y = 0; y < h; y++) {
      for (let x = 0; x < w; x++, p++) {
        const i = p * 4;
        if (mask[p]) { d[i + 3] = 0; continue; }
        if (!near(p, x, y)) continue;
        const dd = dist(i);
        if (dd >= soft) continue;
        const a = Math.max(0, Math.min(1, (dd - tol) / (soft - tol)));
        if (a > 0.2) for (let c = 0; c < 3; c++) d[i + c] = Math.max(0, Math.min(255, Math.round((d[i + c] - bg[c] * (1 - a)) / a)));
        d[i + 3] = Math.round(d[i + 3] * a);
      }
    }
    return true;
  };
  // bounding box of the visible pixels, null when the picture is empty
  GA.alphaBounds = function (d, w, h, min) {
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > (min || 10)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  };

  if (typeof document === 'undefined') return; // Node (tests): only the pure helpers above

  // ------------------------------------------------------------------ the studio window
  const SIZE = 512;
  const el = (tag, attrs, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) { if (k === 'class') e.className = v; else if (k.startsWith('on')) e[k] = v; else if (v !== false && v != null) e.setAttribute(k, v); }
    for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : document.createTextNode(k));
    return e;
  };
  const newCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const loadImage = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('That picture could not be read.')); i.src = src; });

  // opt: { type, name, desc, kind: 'b'|'u', art: {v,s,y}|undefined (own picture), inherited: bool, api, onDone(result) }
  // onDone gets { v, s, y } for a new picture, or null when the picture was removed.
  GA.openArtStudio = function (opt) {
    const st = { work: newCanvas(SIZE, SIZE), raw: null, edited: false, undo: [], tool: 'pen', drawing: false, ai: false, busy: false, trimmed: null, s: opt.art ? opt.art.s : 1, y: opt.art ? opt.art.y : 0 };
    const wctx = st.work.getContext('2d', { willReadFrequently: true });
    
    // ---------- layout
    const status = el('div', { class: 'as-status' });
    const say = (text, kind) => { status.textContent = text || ''; status.className = 'as-status ' + (kind || ''); };
    const cv = st.work; cv.className = 'as-canvas';
    const prompt = el('textarea', { rows: 4, maxlength: 500, placeholder: 'Describe it in a few words, e.g. "heavy hover tank, twin plasma cannons, glowing blue engines"' });
    prompt.value = [opt.name, opt.desc].filter(Boolean).join('. ');
    const style = el('select', {}, [['neon', 'Neon sci-fi (matches the game)'], ['painted', 'Painted concept art'], ['toon', 'Cartoon'], ['pixel', 'Pixel art']].map(([v, t]) => el('option', { value: v }, t)));
    const useRef = el('input', { type: 'checkbox' });
    const genBtn = el('button', { class: 'primary', onclick: () => generate() }, '✨ Draw with AI');
    const aiNote = el('p', { class: 'note', style: 'margin:6px 0 0' });
    const file = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp' });
    file.onchange = async () => {
      const f = file.files[0]; file.value = '';
      if (!f) return;
      if (f.size > 12 * 1024 * 1024) { say('That file is too big (max 12 MB).', 'err'); return; }
      const url = URL.createObjectURL(f);
      try { setRaw(await loadImage(url), true); say('Picture loaded.', 'ok'); } catch (e) { say(e.message, 'err'); } finally { URL.revokeObjectURL(url); }
    };

    // drawing tools
    const color = el('input', { type: 'color', value: '#22d3ee', title: 'Pen colour' });
    const size = el('input', { type: 'range', min: 1, max: 60, value: 8, title: 'Brush size' });
    const toolBtns = {};
    for (const [id, label] of [['pen', '✏ Pen'], ['eraser', '⌫ Eraser']]) toolBtns[id] = el('button', { class: 'ghost', onclick: () => { st.tool = id; for (const k of Object.keys(toolBtns)) toolBtns[k].classList.toggle('active', k === id); } }, label);
    toolBtns.pen.classList.add('active');
    const undoBtn = el('button', { class: 'ghost', onclick: () => undo() }, '↶ Undo');
    const clearBtn = el('button', { class: 'ghost', onclick: () => { snap(); wctx.clearRect(0, 0, SIZE, SIZE); st.raw = null; st.edited = false; changed(); } }, 'Clear');

    // background removal
    const keyOn = el('input', { type: 'checkbox', checked: 'checked' });
    const tol = el('input', { type: 'range', min: 10, max: 200, value: 70 });
    const encl = el('input', { type: 'checkbox' });
    const keyBox = el('div', { class: 'as-box' },
      el('label', { class: 'toggle' }, keyOn, 'Remove the flat background colour'),
      el('label', {}, 'How much colour to remove', tol),
      el('label', { class: 'toggle' }, encl, 'Also remove background gaps inside the picture'));
    const keyChanged = () => { if (st.raw && !st.edited) applyKey(); };
    for (const c of [keyOn, tol, encl]) c.oninput = () => { clearTimeout(keyChanged.t); keyChanged.t = setTimeout(keyChanged, 90); };

    // placement
    const prev = newCanvas(340, 250); prev.className = 'as-prev';
    const sSize = el('input', { type: 'range', min: 0.3, max: 2.5, step: 0.05, value: st.s });
    const sY = el('input', { type: 'range', min: -0.4, max: 0.4, step: 0.01, value: st.y });
    const foot = el('input', { type: 'checkbox', checked: 'checked' });
    for (const c of [sSize, sY, foot]) c.oninput = () => { st.s = +sSize.value; st.y = +sY.value; drawPreview(); };

    const useBtn = el('button', { class: 'primary', onclick: () => save() }, '✔ Use this picture');
    const removeBtn = opt.art ? el('button', { class: 'danger', onclick: () => { close(); opt.onDone(null); } }, opt.inherited ? 'Remove my picture' : 'Back to the built-in drawing') : null;
    const closeBtn = el('button', { class: 'ghost', onclick: () => close() }, 'Cancel');

    const dlg = el('div', { class: 'as-dlg', role: 'dialog' },
      el('div', { class: 'as-head' }, el('h2', {}, '🎨 Picture studio — ', el('b', {}, opt.name), el('small', {}, opt.type)), el('button', { class: 'ghost', onclick: () => close(), title: 'Close' }, '✕')),
      el('div', { class: 'as-body' },
        el('div', { class: 'as-left' },
          el('div', { class: 'as-tools' }, toolBtns.pen, toolBtns.eraser, color, size, undoBtn, clearBtn),
          el('div', { class: 'as-wrap' }, cv),
          keyBox),
        el('div', { class: 'as-right' },
          el('div', { class: 'as-box' }, el('h4', {}, '1 · Make a picture'),
            el('label', {}, 'What should it look like?', prompt),
            el('div', { class: 'as-row' }, el('label', {}, 'Style', style), genBtn),
            el('label', { class: 'toggle', style: 'margin-top:8px' }, useRef, 'Start from what is on the canvas (sketch or edit it)'),
            aiNote,
            el('label', { style: 'margin-top:10px' }, 'or use your own picture (PNG / JPG)', file),
            el('p', { class: 'note', style: 'margin:8px 0 0' }, 'or draw it yourself with the pen on the left. The pictures face RIGHT; the game flips them when a unit moves left.')),
          el('div', { class: 'as-box' }, el('h4', {}, '2 · Check how it looks in the game'),
            prev,
            el('div', { class: 'as-row' }, el('label', {}, 'Size', sSize), el('label', {}, 'Up / down', sY)),
            el('label', { class: 'toggle' }, foot, 'Show the ground footprint (white outline)')),
          status)),
      el('div', { class: 'as-foot' }, removeBtn, el('span', { class: 'sp' }), closeBtn, useBtn));
    const ov = el('div', { class: 'as-modal' }, dlg);
    document.body.append(ov);
    const onKey = (e) => { if (e.key === 'Escape') close(); else if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); } };
    document.addEventListener('keydown', onKey);
    function close() { document.removeEventListener('keydown', onKey); ov.remove(); }

    // ---------- canvas state
    function snap() {
      st.undo.push({ data: wctx.getImageData(0, 0, SIZE, SIZE), edited: st.edited, raw: st.raw });
      if (st.undo.length > 15) st.undo.shift();
    }
    function undo() {
      const s = st.undo.pop();
      if (!s) return;
      wctx.putImageData(s.data, 0, 0); st.edited = s.edited; st.raw = s.raw; changed();
    }
    function changed() {
      st.trimmed = null;
      keyBox.classList.toggle('locked', st.edited || !st.raw);
      undoBtn.disabled = !st.undo.length;
      drawPreview();
    }
    // the visible part of the picture, cropped
    function trimmed() {
      if (st.trimmed) return st.trimmed;
      const b = GA.alphaBounds(wctx.getImageData(0, 0, SIZE, SIZE).data, SIZE, SIZE, 10);
      if (!b) return null;
      const c = newCanvas(b.w, b.h);
      c.getContext('2d').drawImage(st.work, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
      return (st.trimmed = c);
    }
    let raf = 0;
    function drawPreview() {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const t = trimmed();
        GA.renderPreview(prev, opt.type, t ? { img: t, s: st.s, y: st.y } : null, 0, foot.checked);
        if (!t) { const c = prev.getContext('2d'); c.fillStyle = 'rgba(255,255,255,.6)'; c.font = '13px sans-serif'; c.textAlign = 'center'; c.fillText('Empty canvas - showing the built-in drawing', prev.width / 2, 22); }
      });
    }
    // put a picture on the raw layer (fitted into the square) and cut its background
    function setRaw(img, fromUpload) {
      snap();
      const raw = newCanvas(SIZE, SIZE), k = Math.min(SIZE / img.width, SIZE / img.height, fromUpload ? 4 : 1), w = img.width * k, h = img.height * k;
      const rc = raw.getContext('2d', { willReadFrequently: true });
      rc.imageSmoothingQuality = 'high';
      rc.drawImage(img, (SIZE - w) / 2, (SIZE - h) / 2, w, h);
      st.raw = raw; st.edited = false;
      applyKey();
    }
    function applyKey() {
      if (!st.raw) return;
      const img = st.raw.getContext('2d').getImageData(0, 0, SIZE, SIZE);
      if (keyOn.checked) GA.cutBackground(img.data, SIZE, SIZE, +tol.value, encl.checked);
      wctx.putImageData(img, 0, 0);
      changed();
    }

    // ---------- pen / eraser (pointer events: mouse, touch and pen)
    let last = null;
    const pos = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * SIZE / r.width, (e.clientY - r.top) * SIZE / r.height]; };
    const stroke = (a, b) => {
      wctx.save();
      wctx.lineCap = 'round'; wctx.lineJoin = 'round'; wctx.lineWidth = +size.value;
      if (st.tool === 'eraser') { wctx.globalCompositeOperation = 'destination-out'; wctx.strokeStyle = '#000'; } else wctx.strokeStyle = color.value;
      wctx.beginPath(); wctx.moveTo(a[0], a[1]); wctx.lineTo(b[0] + 0.01, b[1]); wctx.stroke();
      wctx.restore();
    };
    cv.addEventListener('pointerdown', (e) => { e.preventDefault(); cv.setPointerCapture(e.pointerId); snap(); st.drawing = true; st.edited = true; last = pos(e); stroke(last, last); });
    cv.addEventListener('pointermove', (e) => { if (!st.drawing) return; const p = pos(e); stroke(last, p); last = p; });
    const endStroke = () => { if (st.drawing) { st.drawing = false; changed(); } };
    cv.addEventListener('pointerup', endStroke); cv.addEventListener('pointercancel', endStroke);

    // ---------- AI
    async function generate() {
      if (st.busy) return;
      const text = prompt.value.replace(/\s+/g, ' ').trim();
      if (text.length < 3) { say('Describe what to draw first.', 'err'); prompt.focus(); return; }
      st.busy = true; genBtn.disabled = true; say('The AI is drawing… this takes about 10–30 seconds.', '');
      try {
        let ref = null;
        if (useRef.checked) {
          const r = newCanvas(SIZE, SIZE), rc = r.getContext('2d');
          rc.fillStyle = '#ff00ff'; rc.fillRect(0, 0, SIZE, SIZE);
          const t = trimmed();
          if (t) { const k = Math.min(0.8 * SIZE / t.width, 0.8 * SIZE / t.height); rc.drawImage(t, (SIZE - t.width * k) / 2, (SIZE - t.height * k) / 2, t.width * k, t.height * k); }
          else { const ic = GA.getIcon(opt.type, 0); rc.imageSmoothingQuality = 'high'; rc.drawImage(ic, 0, 0, ic.width, ic.height, SIZE * 0.1, SIZE * 0.2, SIZE * 0.8, SIZE * 0.8 * ic.height / ic.width); }
          ref = r.toDataURL('image/png');
        }
        const res = await opt.api('/api/admin/art/generate', 'POST', { kind: opt.kind, prompt: text, style: style.value, ref });
        setRaw(await loadImage(res.image), false);
        say('Done. Not happy? Change the words and draw again, or tick "Start from what is on the canvas" to refine it.', 'ok');
      } catch (e) { say(e.message, 'err'); } finally { st.busy = false; genBtn.disabled = !st.ai; }
    }

    // ---------- save
    async function save() {
      const t = trimmed();
      if (!t) { say('The canvas is empty - draw something first.', 'err'); return; }
      useBtn.disabled = true; say('Saving…', '');
      try {
        let side = opt.kind === 'b' ? 384 : 256, url;
        for (let n = 0; n < 4; n++, side = Math.round(side * 0.8)) {
          const k = Math.min(1, side / Math.max(t.width, t.height));
          let cur = t, w = Math.max(8, Math.round(t.width * k)), h = Math.max(8, Math.round(t.height * k));
          while (cur.width > w * 2) { const half = newCanvas(Math.ceil(cur.width / 2), Math.ceil(cur.height / 2)), hc = half.getContext('2d'); hc.imageSmoothingQuality = 'high'; hc.drawImage(cur, 0, 0, half.width, half.height); cur = half; }
          const out = newCanvas(w + 4, h + 4), oc = out.getContext('2d');
          oc.imageSmoothingQuality = 'high'; oc.drawImage(cur, 2, 2, w, h);
          url = out.toDataURL('image/png');
          if (url.length * 0.75 < 540 * 1024) break;
        }
        const r = await opt.api('/api/admin/art', 'PUT', { type: opt.type, png: url });
        close();
        opt.onDone({ v: r.v, s: st.s, y: st.y });
      } catch (e) { say(e.message, 'err'); useBtn.disabled = false; }
    }

    // ---------- start
    changed();
    genBtn.disabled = true;
    opt.api('/api/admin/art/info').then((info) => {
      st.ai = !!info.ai; genBtn.disabled = st.busy || !st.ai;
      aiNote.textContent = st.ai ? `AI model: ${info.model}. Each picture is one request to Google Gemini (a few cents at most).` : 'AI drawing is switched off: add GEMINI_API_KEY to the server .env file and restart. You can still upload or draw pictures by hand.';
    }).catch(() => { aiNote.textContent = 'Could not check the AI settings.'; });
    if (opt.art && opt.art.v) {
      const a = opt.art;
      loadImage(`/art/${opt.type}-${a.v}.png`).then((img) => {
        const k = Math.min(SIZE * 0.9 / img.width, SIZE * 0.9 / img.height, 2);
        wctx.drawImage(img, (SIZE - img.width * k) / 2, (SIZE - img.height * k) / 2, img.width * k, img.height * k);
        st.edited = true; changed();
      }).catch(() => say('The current picture could not be loaded.', 'err'));
    }
  };
})();

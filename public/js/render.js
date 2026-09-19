// Isometric canvas renderer (procedural neon art, no image assets)
(function () {
  'use strict';
  const GA = globalThis.GA;
  const { W, H, DEFS, PLAYER_COLORS } = GA;

  const shadeCache = new Map();
  function shade(hex, f) {
    const key = hex + '|' + f.toFixed(2);
    let s = shadeCache.get(key);
    if (s) return s;
    let r, g, b;
    if (hex[0] === '#') {
      const n = hex.length === 4 ? hex.replace(/#(.)(.)(.)/, '#$1$1$2$2$3$3') : hex;
      r = parseInt(n.slice(1, 3), 16); g = parseInt(n.slice(3, 5), 16); b = parseInt(n.slice(5, 7), 16);
    } else { r = g = b = 128; }
    const c = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
    s = `rgb(${c(r)},${c(g)},${c(b)})`;
    shadeCache.set(key, s);
    return s;
  }
  function hash(x, y) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  GA.hash = hash;
  GA.rockHeight = (x, y) => 0.35 + hash(x * 3, y * 5) * 1.0;

  const glowCache = new Map();
  function glowSprite(color) {
    let c = glowCache.get(color);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, color); g.addColorStop(0.35, color + '88'); g.addColorStop(1, color + '00');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    glowCache.set(color, c);
    return c;
  }
  function glow(ctx, x, y, r, color, alpha) {
    ctx.globalAlpha = alpha; ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(glowSprite(color), x - r, y - r, r * 2, r * 2);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------------ projection helpers
  const P = (v, x, y, z) => [(x - y) * v.A + v.OX, (x + y) * v.B + v.OY - (z || 0) * v.Z];

  function poly(ctx, pts, fill, stroke, lw) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
  }

  // rotated box in world space. ang = rotation of local +x
  function boxR(v, cx, cy, ang, l, w, z0, zh, base, top) {
    const c = Math.cos(ang), s = Math.sin(ang), hl = l / 2, hw = w / 2;
    const loc = [[hl, hw], [hl, -hw], [-hl, -hw], [-hl, hw]]; // corners CCW-ish
    const cs = loc.map(([lx, ly]) => [cx + lx * c - ly * s, cy + lx * s + ly * c]);
    const ctx = v.ctx;
    // side faces: between corner i and i+1; outward normal
    // face 0: front (+x): corners 0,1 ; face1: (-y): corners 1,2 ; face2: back ; face3: (+y): corners 3,0
    const faces = [[0, 1, [c, s]], [1, 2, [s, -c]], [2, 3, [-c, -s]], [3, 0, [-s, c]]];
    for (const [i, j, n] of faces) {
      if (n[0] + n[1] <= 0.001) continue;
      const d = n[0] * -0.3 + n[1] * 0.95;
      const f = 0.55 + 0.42 * Math.max(0, d);
      const a0 = P(v, cs[i][0], cs[i][1], z0), a1 = P(v, cs[j][0], cs[j][1], z0);
      const b1 = P(v, cs[j][0], cs[j][1], z0 + zh), b0 = P(v, cs[i][0], cs[i][1], z0 + zh);
      poly(ctx, [a0, a1, b1, b0], shade(base, f));
    }
    poly(ctx, cs.map((p) => P(v, p[0], p[1], z0 + zh)), top || shade(base, 1.18));
    return cs;
  }
  // axis aligned box by tile rect
  function boxA(v, x, y, w, h, z0, zh, base, top) { return boxR(v, x + w / 2, y + h / 2, 0, w, h, z0, zh, base, top); }

  function cyl(v, x, y, r, z0, zh, base, topc) {
    const ctx = v.ctx;
    const [sx, sy0] = P(v, x, y, z0), [, sy1] = P(v, x, y, z0 + zh);
    const rx = r * 1.4142 * v.A, ry = r * 1.4142 * v.B;
    const g = ctx.createLinearGradient(sx - rx, 0, sx + rx, 0);
    g.addColorStop(0, shade(base, 1.0)); g.addColorStop(0.55, shade(base, 0.8)); g.addColorStop(1, shade(base, 0.5));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(sx, sy0, rx, ry, 0, 0, Math.PI);
    ctx.lineTo(sx - rx, sy1);
    ctx.ellipse(sx, sy1, rx, ry, 0, Math.PI, 0, true);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = topc || shade(base, 1.25);
    ctx.beginPath(); ctx.ellipse(sx, sy1, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    return [sx, sy1, rx, ry];
  }
  function ringGround(v, x, y, r, color, lw, alpha, z) {
    const ctx = v.ctx;
    const [sx, sy] = P(v, x, y, z || 0);
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.strokeStyle = color; ctx.lineWidth = lw || 1.5;
    ctx.beginPath(); ctx.ellipse(sx, sy, r * 1.4142 * v.A, r * 1.4142 * v.B, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  function line3(v, a, b, color, lw) {
    const ctx = v.ctx;
    ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
  }
  function shadowAt(v, x, y, rx, ry, a) {
    const [sx, sy] = P(v, x, y, 0);
    v.ctx.fillStyle = `rgba(0,0,0,${a == null ? 0.32 : a})`;
    v.ctx.beginPath(); v.ctx.ellipse(sx, sy, rx * v.zoom, ry * v.zoom, 0, 0, Math.PI * 2); v.ctx.fill();
  }
  function hazard(v, x, y, w, z, zh, side) { /* decorative bay door handled inline */ }

  // ------------------------------------------------------------------ building art
  function drawBuilding(v, e, t) {
    const ctx = v.ctx, d = e.def, col = PLAYER_COLORS[e.owner] || PLAYER_COLORS[0];
    const bx = e.bx, by = e.by, w = e.w, h = e.h, cx = bx + w / 2, cy = by + h / 2;
    const dark = '#1a2333', mid = '#26334a', light = '#34445f';
    const pulse = 0.5 + 0.5 * Math.sin(t * 3 + e.id);
    const LK = d.look || e.type;
    switch (LK) {
      case 'conyard': {
        boxA(v, bx, by, w, h, 0, 0.22, dark, '#202b3d');
        boxA(v, bx + 0.25, by + 0.25, w - 0.5, h - 0.5, 0.22, 0.14, mid);
        boxA(v, cx - 0.75, cy - 0.75, 1.5, 1.5, 0.36, 0.9, light, shade(light, 1.2));
        // colored corner pylons
        for (const [px, py] of [[bx + 0.15, by + 0.15], [bx + w - 0.45, by + 0.15], [bx + 0.15, by + h - 0.45], [bx + w - 0.45, by + h - 0.45]]) boxA(v, px, py, 0.3, 0.3, 0.22, 0.5, col.dark, col.main);
        const top = P(v, cx, cy, 1.26);
        cyl(v, cx, cy, 0.4, 1.26, 0.18, '#3d4d6b');
        // antenna + beacon
        line3(v, P(v, cx, cy, 1.44), P(v, cx, cy, 2.1), '#8aa0c4', 2 * v.zoom);
        glow(ctx, ...P(v, cx, cy, 2.12), 14 * v.zoom * (0.7 + 0.5 * pulse), col.main, 0.9);
        // rotating ring
        const a = t * 1.4;
        ctx.strokeStyle = col.main; ctx.lineWidth = 2 * v.zoom; ctx.globalAlpha = 0.8;
        ctx.beginPath(); ctx.ellipse(top[0], top[1] - 0.35 * v.Z, 26 * v.zoom, 13 * v.zoom, 0, a, a + 4); ctx.stroke(); ctx.globalAlpha = 1;
        break;
      }
      case 'power': {
        boxA(v, bx, by, w, h, 0, 0.2, dark, '#1f2a3c');
        for (const [px, py] of [[bx + 0.5, by + 0.5], [bx + 1.5, by + 1.5]]) {
          const [sx, sy] = cyl(v, px, py, 0.34, 0.2, 0.8, '#2a3a55');
          const ry = 0.5 + 0.5 * Math.sin(t * 4 + px);
          glow(ctx, sx, sy, 20 * v.zoom, col.main, 0.5 + 0.4 * ry);
          ctx.fillStyle = col.light; ctx.globalAlpha = 0.85;
          ctx.beginPath(); ctx.ellipse(sx, sy, 0.16 * 1.41 * v.A, 0.16 * 1.41 * v.B, 0, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
        }
        boxA(v, bx + 0.4, by + 1.05, 1.2, 0.18, 0.2, 0.3, col.dark, col.main);
        // arcing between cores
        ctx.strokeStyle = col.light; ctx.lineWidth = 1.4 * v.zoom; ctx.globalAlpha = 0.5 + 0.4 * pulse;
        const a = P(v, bx + 0.5, by + 0.5, 1.02), b = P(v, bx + 1.5, by + 1.5, 1.02);
        ctx.beginPath(); ctx.moveTo(a[0], a[1]);
        for (let i = 1; i < 5; i++) ctx.lineTo(a[0] + (b[0] - a[0]) * i / 5 + Math.sin(t * 30 + i) * 5 * v.zoom, a[1] + (b[1] - a[1]) * i / 5 + Math.cos(t * 27 + i) * 3 * v.zoom);
        ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.globalAlpha = 1;
        break;
      }
      case 'refinery': {
        boxA(v, bx, by, w, h, 0, 0.3, dark, '#212d42');
        boxA(v, bx + 0.15, by + 0.15, 1.6, h - 0.3, 0.3, 0.5, mid, light);
        boxA(v, bx + 1.85, by + 0.2, 1, h - 0.4, 0.3, 0.2, col.dark, col.main);
        cyl(v, bx + 2.35, by + 0.5, 0.42, 0.5, 0.75, '#3a5a4a', '#4ade80');
        cyl(v, bx + 2.35, by + 1.5, 0.36, 0.5, 0.6, '#345048', '#34d399');
        // pipes
        line3(v, P(v, bx + 1.5, by + 0.5, 0.95), P(v, bx + 2.35, by + 0.5, 1.2), '#6b7c99', 3 * v.zoom);
        glow(ctx, ...P(v, bx + 2.35, by + 0.5, 1.25), 16 * v.zoom, '#4ade80', 0.4 + 0.3 * pulse);
        // hopper
        boxA(v, bx + 0.4, by + 0.45, 1.1, 0.9, 0.8, 0.15, '#3a2f1f', '#22c55e');
        break;
      }
      case 'barracks': {
        boxA(v, bx, by, w, h, 0, 0.55, mid, light);
        boxA(v, bx + 0.1, by + 0.1, w - 0.2, h - 0.2, 0.55, 0.14, dark);
        boxA(v, bx + 0.35, by + 0.35, w - 0.7, h - 0.7, 0.69, 0.16, col.dark, col.main);
        // door on front-left face
        const a = P(v, bx + 0.5, by + h, 0), b = P(v, bx + 1.5, by + h, 0), c = P(v, bx + 1.5, by + h, 0.42), dd = P(v, bx + 0.5, by + h, 0.42);
        poly(ctx, [a, b, c, dd], '#0c111b');
        line3(v, P(v, bx + 0.5, by + h, 0.42), P(v, bx + 1.5, by + h, 0.42), col.main, 1.5 * v.zoom);
        break;
      }
      case 'factory': {
        boxA(v, bx, by, w, h, 0, 0.75, mid, light);
        boxA(v, bx + 0.2, by + 0.2, w - 0.4, h - 0.4, 0.75, 0.16, dark, '#1d2637');
        // large bay door (front-left face, +y)
        const a = P(v, bx + 0.5, by + h, 0), b = P(v, bx + 2.5, by + h, 0), c = P(v, bx + 2.5, by + h, 0.62), dd = P(v, bx + 0.5, by + h, 0.62);
        poly(ctx, [a, b, c, dd], '#0a0f18');
        for (let i = 1; i < 5; i++) line3(v, P(v, bx + 0.5, by + h, 0.62 * i / 5), P(v, bx + 2.5, by + h, 0.62 * i / 5), '#1c2740', 1 * v.zoom);
        line3(v, P(v, bx + 0.5, by + h, 0.66), P(v, bx + 2.5, by + h, 0.66), col.main, 2 * v.zoom);
        // stack and crane
        cyl(v, bx + 2.4, by + 0.6, 0.22, 0.91, 0.7, '#3b475f');
        glow(ctx, ...P(v, bx + 2.4, by + 0.6, 1.65), 14 * v.zoom, '#ff9a3c', 0.35 + 0.25 * pulse);
        boxA(v, bx + 0.5, by + 0.5, 1.2, 0.35, 0.91, 0.35, col.dark, col.main);
        line3(v, P(v, bx + 0.6, by + 0.65, 1.26), P(v, bx + 1.6, by + 1.4, 1.6), '#8aa0c4', 2 * v.zoom);
        break;
      }
      case 'radar': {
        boxA(v, bx, by, w, h, 0, 0.5, mid, light);
        boxA(v, bx + 0.3, by + 0.3, 1.4, 1.4, 0.5, 0.15, dark);
        const [sx, sy] = P(v, cx, cy, 0.95);
        const ang = t * 1.6;
        ctx.save();
        ctx.translate(sx, sy - 10 * v.zoom);
        line3(v, [0, 10 * v.zoom], [0, 0], '#6b7c99', 3 * v.zoom);
        ctx.rotate(-0.5);
        ctx.scale(1, 0.55);
        ctx.fillStyle = shade('#c7d2e6', 0.9);
        ctx.beginPath(); ctx.ellipse(0, 0, 30 * v.zoom * Math.abs(Math.cos(ang)) + 4 * v.zoom, 24 * v.zoom, 0, 0, 7); ctx.fill();
        ctx.strokeStyle = col.main; ctx.lineWidth = 2 * v.zoom; ctx.stroke();
        ctx.restore();
        glow(ctx, sx, sy - 10 * v.zoom, 10 * v.zoom, col.main, 0.6 + 0.3 * pulse);
        break;
      }
      case 'techlab': {
        boxA(v, bx, by, w, h, 0, 0.45, mid, light);
        const [sx, sy] = P(v, cx, cy, 0.45);
        const rx = 0.85 * v.A, ry = 0.85 * v.B;
        const g = ctx.createRadialGradient(sx - rx * 0.3, sy - rx * 0.6, 2, sx, sy - rx * 0.3, rx * 1.2);
        g.addColorStop(0, '#d9f7ff'); g.addColorStop(0.5, col.main); g.addColorStop(1, col.dark);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.ellipse(sx, sy, rx, ry, 0, Math.PI, 0); ctx.bezierCurveTo(sx + rx, sy - rx * 1.5, sx - rx, sy - rx * 1.5, sx - rx, sy); ctx.fill();
        glow(ctx, sx, sy - rx * 0.7, 26 * v.zoom, col.main, 0.35 + 0.25 * pulse);
        const a = t * 2;
        ctx.strokeStyle = col.light; ctx.lineWidth = 1.6 * v.zoom; ctx.globalAlpha = 0.9;
        ctx.beginPath(); ctx.ellipse(sx, sy - rx * 1.05, rx * 0.95, ry * 0.7, 0, a, a + 3.6); ctx.stroke(); ctx.globalAlpha = 1;
        break;
      }
      case 'turret': {
        boxA(v, bx + 0.05, by + 0.05, 0.9, 0.9, 0, 0.18, dark, '#222d41');
        cyl(v, cx, cy, 0.3, 0.18, 0.2, '#33445f');
        const a = e.ang;
        const [sx, sy] = P(v, cx, cy, 0.5);
        boxR(v, cx, cy, a, 0.5, 0.36, 0.38, 0.2, '#3d4d6b');
        const b0 = P(v, cx + Math.cos(a) * 0.15, cy + Math.sin(a) * 0.15, 0.5), b1 = P(v, cx + Math.cos(a) * 0.72, cy + Math.sin(a) * 0.72, 0.5);
        line3(v, b0, b1, '#9fb0cc', 3.2 * v.zoom);
        glow(ctx, b1[0], b1[1], 7 * v.zoom, col.main, 0.6);
        boxR(v, cx, cy, a, 0.16, 0.42, 0.5, 0.06, col.dark, col.main);
        break;
      }
      case 'uplink': {
        boxA(v, bx, by, w, h, 0, 0.3, dark, '#212d42');
        boxA(v, bx + 0.35, by + 0.35, w - 0.7, h - 0.7, 0.3, 0.4, mid, light);
        // spire
        const base = P(v, cx, cy, 0.7);
        const tip = P(v, cx, cy, 2.7);
        ctx.fillStyle = shade('#8aa0c4', 0.9);
        ctx.beginPath(); ctx.moveTo(base[0] - 14 * v.zoom, base[1]); ctx.lineTo(tip[0], tip[1]); ctx.lineTo(base[0] + 14 * v.zoom, base[1]); ctx.closePath(); ctx.fill();
        ctx.fillStyle = shade('#5b6d8c', 0.9);
        ctx.beginPath(); ctx.moveTo(base[0], base[1] + 4 * v.zoom); ctx.lineTo(tip[0], tip[1]); ctx.lineTo(base[0] + 14 * v.zoom, base[1]); ctx.closePath(); ctx.fill();
        const ch = e.swCharge == null ? 0 : e.swCharge;
        const ready = e.swReady;
        for (let i = 0; i < 4; i++) {
          const zz = 0.9 + i * 0.4;
          const q = P(v, cx, cy, zz);
          ctx.strokeStyle = ready ? '#fff' : col.main; ctx.globalAlpha = ready ? 0.9 : 0.35 + ch * 0.5;
          ctx.lineWidth = 2 * v.zoom;
          ctx.beginPath(); ctx.ellipse(q[0], q[1], (16 - i * 3) * v.zoom, (8 - i * 1.5) * v.zoom, 0, 0, 7); ctx.stroke();
        }
        ctx.globalAlpha = 1;
        glow(ctx, tip[0], tip[1], (ready ? 44 : 18 + ch * 16) * v.zoom * (ready ? 0.8 + 0.4 * pulse : 1), ready ? '#ffffff' : col.main, ready ? 0.95 : 0.7);
        if (ready) {
          ctx.globalCompositeOperation = 'lighter';
          const g = ctx.createLinearGradient(0, tip[1] - 400, 0, tip[1]);
          g.addColorStop(0, col.main + '00'); g.addColorStop(1, col.main + 'aa');
          ctx.fillStyle = g; ctx.fillRect(tip[0] - 5 * v.zoom, tip[1] - 400, 10 * v.zoom, 400);
          ctx.globalCompositeOperation = 'source-over';
        }
        break;
      }
      case 'derrick': {
        boxA(v, bx, by, w, h, 0, 0.16, dark, '#1f2a3c');
        boxA(v, bx + 0.12, by + 0.12, w - 0.24, h - 0.24, 0.16, 0.1, mid, light);
        cyl(v, cx, cy, 0.42, 0.26, 0.3, '#2f3f5c');
        // crystal cluster
        for (let k = 0; k < 4; k++) {
          const a = k * 1.7 + 0.5, px = cx + Math.cos(a) * (k ? 0.3 : 0), py = cy + Math.sin(a) * (k ? 0.3 : 0), hh = k ? 0.55 + 0.12 * k : 1.05;
          const b0 = P(v, px, py, 0.5), t0 = P(v, px, py, 0.5 + hh), ww = (k ? 6 : 8) * v.zoom;
          ctx.fillStyle = shade('#34d399', 0.55);
          ctx.beginPath(); ctx.moveTo(b0[0] - ww, b0[1]); ctx.lineTo(t0[0], t0[1]); ctx.lineTo(b0[0], b0[1] + 3 * v.zoom); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#6ee7b7';
          ctx.beginPath(); ctx.moveTo(b0[0] + ww, b0[1]); ctx.lineTo(t0[0], t0[1]); ctx.lineTo(b0[0], b0[1] + 3 * v.zoom); ctx.closePath(); ctx.fill();
        }
        glow(ctx, ...P(v, cx, cy, 1.0), 22 * v.zoom * (0.75 + 0.35 * pulse), '#34d399', 0.45);
        for (const [px, py] of [[bx + 0.18, by + 0.18], [bx + w - 0.42, by + 0.18], [bx + 0.18, by + h - 0.42], [bx + w - 0.42, by + h - 0.42]]) boxA(v, px, py, 0.24, 0.24, 0.26, 0.28, col.dark, col.main);
        break;
      }
      case 'depot': {
        boxA(v, bx, by, w, h, 0, 0.12, dark, '#1f2a3c');
        boxA(v, bx + 0.12, by + 0.15, 0.86, 0.8, 0.12, 0.5, '#5b4a2a', '#8a6f3b');
        boxA(v, bx + 1.02, by + 0.2, 0.8, 0.7, 0.12, 0.34, '#4a3d24', '#75602f');
        boxA(v, bx + 0.3, by + 1.05, 0.9, 0.75, 0.12, 0.42, '#5b4a2a', '#8a6f3b');
        boxA(v, bx + 0.42, by + 0.3, 0.6, 0.55, 0.62, 0.28, '#6a5630', '#a3833f');
        line3(v, P(v, bx + 0.12, by + 0.95, 0.4), P(v, bx + 0.98, by + 0.95, 0.4), col.main, 1.6 * v.zoom);
        line3(v, P(v, bx + 0.3, by + 1.8, 0.35), P(v, bx + 1.2, by + 1.8, 0.35), col.main, 1.6 * v.zoom);
        glow(ctx, ...P(v, bx + 1.3, by + 1.3, 0.7), 12 * v.zoom * (0.7 + 0.5 * pulse), '#facc15', 0.5);
        break;
      }
    }
  }

  // a small gold diamond marks buildings / units made in the admin tools
  function customMark(v, p) {
    const ctx = v.ctx, z = v.zoom, s = 4.5 * z;
    glow(ctx, p[0], p[1], 9 * z, '#facc15', 0.55);
    ctx.fillStyle = '#facc15'; ctx.strokeStyle = '#3b2f05'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(p[0], p[1] - s); ctx.lineTo(p[0] + s, p[1]); ctx.lineTo(p[0], p[1] + s); ctx.lineTo(p[0] - s, p[1]); ctx.closePath(); ctx.fill(); ctx.stroke();
  }

  // ------------------------------------------------------------------ unit art
  function facing(v, a, len) {
    return [(Math.cos(a) - Math.sin(a)) * v.A * len, (Math.cos(a) + Math.sin(a)) * v.B * len];
  }
  function drawInfantry(v, e, t) {
    const ctx = v.ctx, col = PLAYER_COLORS[e.owner] || PLAYER_COLORS[0], z = v.zoom;
    const [sx, sy] = P(v, e.rx, e.ry, 0);
    shadowAt(v, e.rx, e.ry, 8, 3.6);
    const sw = e.moving ? Math.sin(t * 11 + e.id) : 0;
    const bob = e.moving ? Math.abs(sw) * 1.4 * z : 0;
    ctx.lineCap = 'round';
    line3(v, [sx - 2 * z, sy - 6 * z], [sx - 2 * z + sw * 3 * z, sy], '#1c2333', 2.6 * z);
    line3(v, [sx + 2 * z, sy - 6 * z], [sx + 2 * z - sw * 3 * z, sy], '#1c2333', 2.6 * z);
    const suit = (e.def.look || e.type) === 'engineer' ? '#e8edf5' : shade(col.dark, 1.1);
    ctx.fillStyle = suit;
    ctx.beginPath(); ctx.roundRect(sx - 4.2 * z, sy - 15 * z - bob, 8.4 * z, 10 * z, 2.5 * z); ctx.fill();
    ctx.fillStyle = col.main; ctx.fillRect(sx - 4.2 * z, sy - 12.5 * z - bob, 8.4 * z, 2.4 * z);
    // head
    ctx.fillStyle = (e.def.look || e.type) === 'engineer' ? '#fbbf24' : '#cbd5e1';
    ctx.beginPath(); ctx.arc(sx, sy - 18.5 * z - bob, 3.8 * z, 0, 7); ctx.fill();
    ctx.fillStyle = (e.def.look || e.type) === 'engineer' ? '#1f2937' : col.light;
    ctx.fillRect(sx - 2.6 * z, sy - 19.6 * z - bob, 5.2 * z, 1.8 * z);
    const f = facing(v, e.ang, 0.5);
    if ((e.def.look || e.type) === 'lancer') {
      const s0 = [sx - f[0] * 0.5, sy - 14 * z - bob - f[1] * 0.5], s1 = [sx + f[0] * 1.6, sy - 15.5 * z - bob + f[1] * 1.6];
      line3(v, s0, s1, '#7f8ea8', 4.4 * z);
      line3(v, s0, s1, col.main, 1.4 * z);
    } else if ((e.def.look || e.type) === 'engineer') {
      ctx.fillStyle = '#f59e0b'; ctx.fillRect(sx + 3 * z, sy - 9 * z - bob, 5 * z, 4 * z);
    } else {
      line3(v, [sx, sy - 11 * z - bob], [sx + f[0] * 1.5, sy - 11 * z - bob + f[1] * 1.5], '#8b9bb5', 2.4 * z);
      if (e.flash > 0) glow(ctx, sx + f[0] * 1.6, sy - 11 * z - bob + f[1] * 1.6, 8 * z, col.light, 0.9);
    }
  }
  function drawVehicle(v, e, t) {
    const ctx = v.ctx, col = PLAYER_COLORS[e.owner] || PLAYER_COLORS[0], z = v.zoom;
    const x = e.rx, y = e.ry, a = e.ang;
    const mv = e.moving;
    switch (e.def.look || e.type) {
      case 'harvester': {
        shadowAt(v, x, y, 26, 12);
        boxR(v, x, y, a, 0.98, 0.72, 0.06, 0.22, '#232e44');
        const c = Math.cos(a), s = Math.sin(a);
        const fill = Math.min(1, (e.cargo || 0) / 600);
        boxR(v, x - c * 0.2, y - s * 0.2, a, 0.52, 0.64, 0.28, 0.3, '#2f3b54', shade('#0b1d14', 1));
        if (fill > 0.02) boxR(v, x - c * 0.2, y - s * 0.2, a, 0.44, 0.56, 0.5 + fill * 0.02, 0.06 + fill * 0.14, '#16a34a', '#4ade80');
        boxR(v, x + c * 0.33, y + s * 0.33, a, 0.34, 0.5, 0.28, 0.2, '#3b465e');
        boxR(v, x + c * 0.5, y + s * 0.5, a, 0.16, 0.66, 0.1, 0.16, '#a16207', '#fbbf24');
        boxR(v, x - c * 0.2, y - s * 0.2, a, 0.2, 0.68, 0.34, 0.06, col.dark, col.main);
        if (mv) glow(ctx, ...P(v, x - c * 0.5, y - s * 0.5, 0.2), 8 * z, '#4ade80', 0.4);
        break;
      }
      case 'hover': {
        const bob = Math.sin(t * 5 + e.id) * 0.03;
        shadowAt(v, x, y, 20, 9, 0.25);
        const c = Math.cos(a), s = Math.sin(a);
        glow(ctx, ...P(v, x, y, 0.08), 16 * z, col.main, 0.55);
        boxR(v, x, y, a, 0.9, 0.42, 0.16 + bob, 0.12, '#263149');
        boxR(v, x + c * 0.05, y + s * 0.05, a, 0.42, 0.3, 0.28 + bob, 0.12, '#33415f', shade(col.main, 0.9));
        boxR(v, x - c * 0.3, y - s * 0.3, a, 0.16, 0.55, 0.26 + bob, 0.05, col.dark, col.main);
        line3(v, P(v, x + c * 0.25, y + s * 0.25, 0.3 + bob), P(v, x + c * 0.62, y + s * 0.62, 0.3 + bob), '#9fb0cc', 2.2 * z);
        glow(ctx, ...P(v, x - c * 0.5, y - s * 0.5, 0.24 + bob), 9 * z, '#8be9ff', 0.8);
        break;
      }
      case 'arc': case 'nova': case 'rail': {
        shadowAt(v, x, y, 26, 12);
        const c = Math.cos(a), s = Math.sin(a), lx = -s, ly = c;
        boxR(v, x + lx * 0.3, y + ly * 0.3, a, 1.05, 0.2, 0, 0.17, '#141b2a');
        boxR(v, x - lx * 0.3, y - ly * 0.3, a, 1.05, 0.2, 0, 0.17, '#141b2a');
        boxR(v, x, y, a, 0.92, 0.5, 0.1, 0.18, '#2b3a58');
        boxR(v, x - c * 0.05, y - s * 0.05, a, 0.7, 0.16, 0.28, 0.03, col.dark, col.main);
        if ((e.def.look || e.type) === 'arc') {
          boxR(v, x, y, a, 0.5, 0.42, 0.28, 0.17, '#36476a');
          const p0 = P(v, x + c * 0.1, y + s * 0.1, 0.42), p1 = P(v, x + c * 0.78, y + s * 0.78, 0.42);
          line3(v, p0, p1, '#a5b4cf', 4 * z); line3(v, p0, p1, '#5b6d8c', 1.6 * z);
          glow(ctx, p1[0], p1[1], 8 * z, col.main, e.flash > 0 ? 1 : 0.5);
          boxR(v, x - c * 0.05, y - s * 0.05, a, 0.22, 0.2, 0.45, 0.05, col.dark, col.main);
        } else if ((e.def.look || e.type) === 'nova') {
          boxR(v, x - c * 0.12, y - s * 0.12, a, 0.42, 0.4, 0.28, 0.14, '#34435f');
          const p0 = P(v, x - c * 0.2, y - s * 0.2, 0.4), p1 = P(v, x + c * 0.38, y + s * 0.38, 1.05);
          line3(v, p0, p1, '#c3cfe4', 6 * z); line3(v, p0, p1, '#516083', 2.4 * z);
          glow(ctx, p1[0], p1[1], 8 * z, '#ffb84d', e.flash > 0 ? 1 : 0.35);
        } else {
          boxR(v, x - c * 0.1, y - s * 0.1, a, 0.4, 0.38, 0.28, 0.13, '#2d3b5a');
          for (const off of [-0.1, 0.1]) {
            const p0 = P(v, x + c * 0.1 - s * off, y + s * 0.1 + c * off, 0.42), p1 = P(v, x + c * 1.0 - s * off, y + s * 1.0 + c * off, 0.42);
            line3(v, p0, p1, '#7488ad', 2.6 * z); line3(v, p0, p1, '#67e8f9', 1.1 * z);
          }
          for (let i = 0; i < 3; i++) glow(ctx, ...P(v, x + c * (0.3 + i * 0.25), y + s * (0.3 + i * 0.25), 0.42), 6 * z, '#67e8f9', 0.5 + 0.4 * Math.sin(t * 6 + i));
          if (e.flash > 0) glow(ctx, ...P(v, x + c * 1.1, y + s * 1.1, 0.42), 14 * z, '#ffffff', 1);
        }
        break;
      }
      case 'titan': {
        shadowAt(v, x, y, 32, 15);
        const c = Math.cos(a), s = Math.sin(a), lx = -s, ly = c;
        const ph = mv ? t * 5 + e.id : 0;
        for (let i = 0; i < 4; i++) {
          const side = i < 2 ? 1 : -1, fw = i % 2 ? 0.4 : -0.4;
          const sw = mv ? Math.sin(ph + (i % 2) * Math.PI) * 0.18 : 0;
          const hip = P(v, x + lx * 0.3 * side + c * fw * 0.5, y + ly * 0.3 * side + s * fw * 0.5, 0.75);
          const foot = P(v, x + lx * 0.6 * side + c * (fw + sw), y + ly * 0.6 * side + s * (fw + sw), 0);
          const knee = P(v, x + lx * 0.72 * side + c * (fw * 0.8 + sw * 0.5), y + ly * 0.72 * side + s * (fw * 0.8 + sw * 0.5), 0.6);
          line3(v, hip, knee, '#3a4966', 6 * z); line3(v, knee, foot, '#2a354d', 5 * z);
        }
        boxR(v, x, y, a, 0.8, 0.8, 0.7, 0.32, '#2b3a58');
        boxR(v, x + c * 0.05, y + s * 0.05, a, 0.5, 0.56, 1.02, 0.2, '#3a4b6e');
        boxR(v, x - c * 0.1, y - s * 0.1, a, 0.25, 0.86, 0.8, 0.06, col.dark, col.main);
        for (const off of [-0.32, 0.32]) {
          const p0 = P(v, x + c * 0.1 - s * off, y + s * 0.1 + c * off, 1.05), p1 = P(v, x + c * 0.9 - s * off, y + s * 0.9 + c * off, 1.05);
          line3(v, p0, p1, '#a5b4cf', 5 * z); line3(v, p0, p1, '#586a8c', 2 * z);
          glow(ctx, p1[0], p1[1], 9 * z, col.main, e.flash > 0 ? 1 : 0.45);
        }
        glow(ctx, ...P(v, x - c * 0.1, y - s * 0.1, 1.25), 16 * z, col.main, 0.6 + 0.2 * Math.sin(t * 4));
        break;
      }
      case 'mcv': {
        shadowAt(v, x, y, 32, 14);
        const c = Math.cos(a), s = Math.sin(a), lx = -s, ly = c;
        boxR(v, x + lx * 0.36, y + ly * 0.36, a, 1.2, 0.22, 0, 0.2, '#141b2a');
        boxR(v, x - lx * 0.36, y - ly * 0.36, a, 1.2, 0.22, 0, 0.2, '#141b2a');
        boxR(v, x, y, a, 1.1, 0.78, 0.12, 0.34, '#2c3b59');
        boxR(v, x - c * 0.1, y - s * 0.1, a, 0.6, 0.6, 0.46, 0.3, '#3a4b6e');
        boxR(v, x + c * 0.4, y + s * 0.4, a, 0.24, 0.5, 0.46, 0.2, '#1a2335', col.light);
        boxR(v, x - c * 0.1, y - s * 0.1, a, 0.3, 0.64, 0.76, 0.05, col.dark, col.main);
        glow(ctx, ...P(v, x - c * 0.1, y - s * 0.1, 0.9), 13 * z, col.main, 0.6);
        break;
      }
    }
  }
  function drawAir(v, e, t) {
    const ctx = v.ctx, col = PLAYER_COLORS[e.owner] || PLAYER_COLORS[0], z = v.zoom;
    const x = e.rx, y = e.ry, a = e.ang;
    const alt = 1.6 + Math.sin(t * 3 + e.id) * 0.06;
    shadowAt(v, x, y, 14, 6.5, 0.22);
    const c = Math.cos(a), s = Math.sin(a);
    boxR(v, x, y, a, 0.62, 0.22, alt, 0.12, '#2a3654');
    boxR(v, x + c * 0.12, y + s * 0.12, a, 0.24, 0.16, alt + 0.11, 0.08, '#3a4b6e', shade(col.main, 0.9));
    const l = P(v, x - s * 0.5, y + c * 0.5, alt + 0.06), r = P(v, x + s * 0.5, y - c * 0.5, alt + 0.06);
    line3(v, l, r, '#5b6d8c', 3 * z);
    for (const p of [l, r]) {
      ctx.globalAlpha = 0.55; ctx.fillStyle = '#c7d7f5';
      ctx.beginPath(); ctx.ellipse(p[0], p[1] - 2 * z, 12 * z, 5 * z, 0, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
      const ang = t * 40;
      line3(v, [p[0] + Math.cos(ang) * 11 * z, p[1] - 2 * z + Math.sin(ang) * 4.5 * z], [p[0] - Math.cos(ang) * 11 * z, p[1] - 2 * z - Math.sin(ang) * 4.5 * z], '#e2e8f0', 1.6 * z);
    }
    glow(ctx, ...P(v, x - c * 0.3, y - s * 0.3, alt + 0.1), 8 * z, col.main, 0.8);
    if (e.flash > 0) glow(ctx, ...P(v, x + c * 0.3, y + s * 0.3, alt + 0.1), 10 * z, '#fff', 1);
  }

  // ------------------------------------------------------------------ Renderer
  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.w = 0; this.h = 0; this.dpr = 1;
      this.v = { ctx: this.ctx, A: 32, B: 16, OX: 0, OY: 0, Z: 34, zoom: 1 };
      this.rockCols = ['#3a3f58', '#444a66', '#33384f', '#4a5070'];
      this.groundCols = ['#17293b', '#182b3e', '#162738', '#1a2e42', '#152535'];
      this.resize();
    }
    resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      this.dpr = dpr;
      this.w = this.canvas.clientWidth; this.h = this.canvas.clientHeight;
      this.canvas.width = Math.floor(this.w * dpr); this.canvas.height = Math.floor(this.h * dpr);
    }
    setView(cam) {
      const v = this.v;
      v.zoom = cam.zoom; v.A = 32 * cam.zoom; v.B = 16 * cam.zoom; v.Z = 34 * cam.zoom;
      v.OX = this.w / 2 - (cam.x - cam.y) * v.A + (cam.shx || 0);
      v.OY = this.h / 2 - (cam.x + cam.y) * v.B + (cam.shy || 0);
    }
    toWorld(sx, sy) {
      const v = this.v;
      const a = (sx - v.OX) / v.A, b = (sy - v.OY) / v.B;
      return [(a + b) / 2, (b - a) / 2];
    }
    draw(g, now) {
      const ctx = this.ctx, v = this.v;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.setView(g.cam);
      ctx.fillStyle = '#05080d'; ctx.fillRect(0, 0, this.w, this.h);
      // visible tile bounds
      const c = [this.toWorld(0, 0), this.toWorld(this.w, 0), this.toWorld(0, this.h), this.toWorld(this.w, this.h)];
      const x0 = Math.max(0, Math.floor(Math.min(c[0][0], c[1][0], c[2][0], c[3][0])) - 2), x1 = Math.min(W - 1, Math.ceil(Math.max(c[0][0], c[1][0], c[2][0], c[3][0])) + 2);
      const y0 = Math.max(0, Math.floor(Math.min(c[0][1], c[1][1], c[2][1], c[3][1])) - 2), y1 = Math.min(H - 1, Math.ceil(Math.max(c[0][1], c[1][1], c[2][1], c[3][1])) + 3);
      this.bounds = [x0, y0, x1, y1];
      this.drawTerrain(g, now, x0, y0, x1, y1);
      this.drawGroundFx(g, now);
      this.drawEntities(g, now, x0, y0, x1, y1);
      this.drawFx(g, now);
      this.drawFog(g);
      this.drawOverlay(g, now);
    }

    drawTerrain(g, now, x0, y0, x1, y1) {
      const ctx = this.ctx, v = this.v, A = v.A, B = v.B;
      const terrain = g.terrain, ore = g.ore;
      ctx.lineWidth = 1;
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const i = y * W + x, t = terrain[i];
          const sx = (x - y) * A + v.OX, sy = (x + y) * B + v.OY;
          if (sx < -A * 2 || sx > this.w + A * 2 || sy < -B * 6 || sy > this.h + B * 6) continue;
          const hv = hash(x, y);
          let col;
          if (t === 2) col = hv < 0.5 ? '#0a3352' : '#0b3a5c';
          else col = this.groundCols[(hv * 5) | 0];
          ctx.fillStyle = col;
          ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + A, sy + B); ctx.lineTo(sx, sy + 2 * B); ctx.lineTo(sx - A, sy + B); ctx.closePath(); ctx.fill();
          if (t === 0) {
            ctx.strokeStyle = 'rgba(90,190,255,0.055)'; ctx.stroke();
            if (hv > 0.94) {
              ctx.fillStyle = 'rgba(120,200,255,0.045)';
              ctx.beginPath(); ctx.moveTo(sx, sy + B * 0.4); ctx.lineTo(sx + A * 0.6, sy + B); ctx.lineTo(sx, sy + B * 1.6); ctx.lineTo(sx - A * 0.6, sy + B); ctx.closePath(); ctx.fill();
            }
          } else if (t === 2) {
            const ph = now * 0.8 + hv * 20;
            ctx.strokeStyle = `rgba(120,210,255,${0.10 + 0.08 * Math.sin(ph)})`;
            ctx.beginPath(); ctx.moveTo(sx - A * 0.4, sy + B * 0.9 + Math.sin(ph) * 2); ctx.lineTo(sx + A * 0.3, sy + B * 1.1 + Math.sin(ph) * 2); ctx.stroke();
          }
          const o = ore[i];
          if (o > 0 && t === 0) this.drawOre(ctx, v, sx, sy + B, o, hv, x, y, now);
        }
      }
    }
    drawOre(ctx, v, cx, cy, amt, hv, x, y, now) {
      const rich = amt > 950;
      const base = rich ? '#f5b942' : '#34d399';
      const n = amt > 500 ? 3 : amt > 200 ? 2 : 1;
      ctx.fillStyle = rich ? 'rgba(245,185,66,0.07)' : 'rgba(52,211,153,0.08)';
      ctx.beginPath(); ctx.ellipse(cx, cy, v.A * 0.62, v.B * 0.62, 0, 0, 7); ctx.fill();
      for (let k = 0; k < n; k++) {
        const hx = hash(x * 3 + k, y * 7), hy = hash(x * 5 + k, y * 11 + 3);
        const px = cx + (hx - 0.5) * v.A * 0.9, py = cy + (hy - 0.5) * v.B * 0.9;
        const hh = (7 + hash(x + k, y * 13) * 8) * v.zoom;
        const ww = (3 + hx * 2.2) * v.zoom;
        ctx.fillStyle = shade(base, 0.55);
        ctx.beginPath(); ctx.moveTo(px - ww, py); ctx.lineTo(px, py - hh); ctx.lineTo(px, py + ww * 0.5); ctx.closePath(); ctx.fill();
        ctx.fillStyle = shade(base, 1.0);
        ctx.beginPath(); ctx.moveTo(px + ww, py); ctx.lineTo(px, py - hh); ctx.lineTo(px, py + ww * 0.5); ctx.closePath(); ctx.fill();
        if (hash(x * 17 + k, y * 3) > 0.7) {
          const tw = 0.5 + 0.5 * Math.sin(now * 3 + hx * 30);
          glow(ctx, px, py - hh * 0.8, 6 * v.zoom, rich ? '#ffe08a' : '#a7f3d0', 0.5 * tw);
        }
      }
    }

    // ---- selection rings, placement ghosts, rally lines, decals (all on the ground)
    drawGroundFx(g, now) {
      const ctx = this.ctx, v = this.v;
      for (const d of g.fx.decals) {
        const a = Math.max(0, 1 - (now - d.t0) / d.dur) * d.a;
        const [sx, sy] = P(v, d.x, d.y, 0);
        ctx.fillStyle = `rgba(0,0,0,${a * 0.5})`;
        ctx.beginPath(); ctx.ellipse(sx, sy, d.r * v.A * 1.4, d.r * v.B * 1.4, 0, 0, 7); ctx.fill();
        if (d.glow && now - d.t0 < 6) glow(ctx, sx, sy, d.r * v.A * 1.5, '#ff8a3c', 0.25 * (1 - (now - d.t0) / 6));
      }
      for (const r of g.fx.rings) {
        const p = (now - r.t0) / r.dur;
        if (p < 0 || p > 1) continue;
        ringGround(v, r.x, r.y, r.r * (0.2 + p * 0.8), r.color, r.lw || 2, (1 - p) * (r.a || 0.9));
      }
      // order markers
      for (const m of g.orderMarks) {
        const p = (now - m.t0) / 0.9;
        if (p > 1) continue;
        const col = m.kind === 'attack' ? '#ff4d6d' : '#4ade80';
        ringGround(v, m.x, m.y, 0.55 * (1 - p * 0.7), col, 2, 1 - p);
        ringGround(v, m.x, m.y, 0.2, col, 2, 1 - p);
      }
      // selection
      for (const id of g.sel) {
        const e = g.ents.get(id);
        if (!e) continue;
        if (e.isB) {
          const pts = [P(v, e.bx - 0.05, e.by - 0.05, 0), P(v, e.bx + e.w + 0.05, e.by - 0.05, 0), P(v, e.bx + e.w + 0.05, e.by + e.h + 0.05, 0), P(v, e.bx - 0.05, e.by + e.h + 0.05, 0)];
          ctx.strokeStyle = '#7dffb2'; ctx.lineWidth = 2; ctx.setLineDash([8, 5]); ctx.lineDashOffset = -now * 20;
          ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < 4; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
          if (e.rally) {
            const a = P(v, e.x, e.y, 0), b = P(v, e.rally.x, e.rally.y, 0);
            ctx.strokeStyle = 'rgba(125,255,178,0.6)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]);
            ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.setLineDash([]);
            ctx.fillStyle = '#7dffb2'; ctx.beginPath(); ctx.moveTo(b[0], b[1]); ctx.lineTo(b[0], b[1] - 22 * v.zoom); ctx.lineTo(b[0] + 12 * v.zoom, b[1] - 17 * v.zoom); ctx.lineTo(b[0], b[1] - 12 * v.zoom); ctx.closePath(); ctx.fill();
            ctx.strokeStyle = '#7dffb2'; ctx.beginPath(); ctx.moveTo(b[0], b[1]); ctx.lineTo(b[0], b[1] - 22 * v.zoom); ctx.stroke();
          }
        } else {
          ringGround(v, e.rx, e.ry, Math.max(0.34, e.def.r + 0.12), '#7dffb2', 1.8, 0.95);
        }
      }
      const hv = g.ents.get(g.hoverId);
      if (hv && !g.sel.has(hv.id) && !hv.ghost) {
        const hostile = hv.owner !== g.me && g.players[hv.owner].team !== g.myTeam;
        const col = g.players[hv.owner].neutral ? '#facc15' : hostile ? '#ff4d6d' : '#7dd3fc';
        if (hv.isB) {
          const pts = [P(v, hv.bx, hv.by, 0), P(v, hv.bx + hv.w, hv.by, 0), P(v, hv.bx + hv.w, hv.by + hv.h, 0), P(v, hv.bx, hv.by + hv.h, 0)];
          poly(ctx, pts, null, col, 1.6);
        } else ringGround(v, hv.rx, hv.ry, Math.max(0.34, hv.def.r + 0.1), col, 1.5, 0.9);
      }
      // placement footprint
      const pl = g.placing;
      if (pl && pl.tx != null) {
        const d = DEFS[pl.type];
        for (let j = 0; j < d.h; j++) for (let i = 0; i < d.w; i++) {
          const tx = pl.tx + i, ty = pl.ty + j;
          const okTile = g.tileFree(tx, ty);
          const a = P(v, tx, ty, 0), b = P(v, tx + 1, ty, 0), c = P(v, tx + 1, ty + 1, 0), dd = P(v, tx, ty + 1, 0);
          poly(ctx, [a, b, c, dd], okTile ? 'rgba(74,222,128,0.35)' : 'rgba(255,77,109,0.42)', okTile ? 'rgba(134,255,180,0.8)' : 'rgba(255,120,140,0.9)', 1);
        }
      }
      if (g.mode === 'sw' && g.mouse.wx != null) {
        const lr = GA.SETTINGS.lanceRadius;
        ringGround(v, g.mouse.wx, g.mouse.wy, lr, '#ff4d6d', 2.5, 0.9);
        ringGround(v, g.mouse.wx, g.mouse.wy, lr * 0.62, '#ff4d6d', 1.5, 0.6);
        ringGround(v, g.mouse.wx, g.mouse.wy, 0.5, '#fff', 1.5, 0.9);
      }
    }

    drawEntities(g, now, x0, y0, x1, y1) {
      const ctx = this.ctx, v = this.v;
      const list = [];
      const air = [];
      const margin = 160;
      for (const e of g.ents.values()) {
        const wx = e.isB ? e.x : e.rx, wy = e.isB ? e.y : e.ry;
        const sx = (wx - wy) * v.A + v.OX, sy = (wx + wy) * v.B + v.OY;
        if (sx < -margin || sx > this.w + margin || sy < -margin || sy > this.h + margin + 60) continue;
        if (e.def.fly) { air.push(e); continue; }
        list.push({ d: wx + wy + (e.isB ? (e.w + e.h) * 0.25 : 0), e });
      }
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        if (g.terrain[y * W + x] !== 1) continue;
        const sx = (x - y) * v.A + v.OX, sy = (x + y) * v.B + v.OY;
        if (sx < -margin || sx > this.w + margin || sy < -margin || sy > this.h + margin + 60) continue;
        list.push({ d: x + y + 1, rock: [x, y] });
      }
      list.sort((a, b) => a.d - b.d);
      for (const it of list) {
        if (it.rock) { this.drawRock(g, it.rock[0], it.rock[1]); continue; }
        this.drawEnt(g, it.e, now);
      }
      for (const e of air) this.drawEnt(g, e, now);
      // health bars on top
      for (const it of list) if (it.e) this.drawBar(g, it.e, now);
      for (const e of air) this.drawBar(g, e, now);
    }
    drawRock(g, x, y) {
      const v = this.v, ctx = this.ctx;
      const hv = hash(x, y);
      const st = g.rockStage[y * W + x];
      const h = GA.rockHeight(x, y) * (1 - 0.13 * st);
      const n0 = parseInt(this.rockCols[(hv * 4) | 0].slice(1), 16), dim = 1 - 0.1 * st;
      const ch = (sh) => Math.max(0, Math.min(255, Math.round(((n0 >> sh) & 255) * dim)));
      const base = '#' + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1);
      boxA(v, x + 0.04, y + 0.04, 0.92, 0.92, 0, h, base, shade(base, 1.35));
      if (hv > 0.6 && st < 2) {
        const inset = 0.2 + (hv - 0.6);
        boxA(v, x + inset, y + inset, 0.92 - inset * 2 + 0.08, 0.92 - inset * 2 + 0.08, h, 0.14 + hv * 0.2, shade(base, 1.1), shade(base, 1.5));
      }
      if (st) {
        for (let k = 0; k < st * 2 + 1; k++) {
          const a = P(v, x + 0.15 + hash(x + k, y * 3) * 0.7, y + 0.15 + hash(x * 5, y + k) * 0.7, h);
          const b = P(v, x + 0.15 + hash(x * 7 + k, y) * 0.7, y + 0.15 + hash(x, y * 11 + k) * 0.7, h);
          line3(v, a, b, 'rgba(6,10,18,0.85)', 1.6 * v.zoom);
        }
        if (st > 1) glow(ctx, ...P(v, x + 0.5, y + 0.5, h * 0.6), 12 * v.zoom, '#ff9a3c', 0.32);
      }
      if (hv > 0.9 && !st) glow(ctx, ...P(v, x + 0.5, y + 0.5, h + 0.1), 10 * v.zoom, '#7c9cff', 0.4);
      if (g.hoverRock === y * W + x && g.selUnits().some((u) => u.def.wp)) {
        const pts = [P(v, x, y, h), P(v, x + 1, y, h), P(v, x + 1, y + 1, h), P(v, x, y + 1, h)];
        poly(ctx, pts, 'rgba(255,77,109,0.22)', '#ff4d6d', 1.8);
      }
    }
    drawEnt(g, e, now) {
      const ctx = this.ctx, v = this.v;
      const t = now;
      let clipped = false, bbox = null, prog = 1;
      const bf = g.fx.build.get(e.id);
      const sf = g.fx.spawn.get(e.id);
      if (e.ghost) ctx.globalAlpha = 0.5;
      if (e.isB) {
        if (bf != null && now - bf < 1.6) {
          prog = (now - bf) / 1.6; prog = 1 - (1 - prog) * (1 - prog);
          const top = P(v, e.x, e.y, 3), bot = P(v, e.x, e.y, 0);
          const half = (e.w + e.h) * v.A * 0.55;
          const cutY = bot[1] + (e.w + e.h) * v.B * 0.5 - (bot[1] + (e.w + e.h) * v.B * 0.5 - top[1]) * prog;
          ctx.save(); ctx.beginPath(); ctx.rect(bot[0] - half - 10, cutY, half * 2 + 20, 1000); ctx.clip();
          clipped = true; bbox = { cx: bot[0], half, cutY };
        }
        if (e.type === 'uplink' || e.type === 'turret') { /* extra state */ }
        if (GA.roleOf(e.def) === 'uplink') { e.swCharge = g.swCharge; e.swReady = g.swReady && e.owner === g.me; }
        drawBuilding(v, e, t);
        if (e.def.custom) customMark(v, P(v, e.x, e.y, ((GA.B_HEIGHT && GA.B_HEIGHT[e.def.look || e.type]) || 1.4) + 0.5));
        if (e.hp < e.mhp * 0.5) {
          const [sx, sy] = P(v, e.x, e.y, 0.6);
          glow(ctx, sx, sy, 22 * v.zoom * (e.hp < e.mhp * 0.25 ? 1.4 : 1), '#ff7a2a', e.hp < e.mhp * 0.25 ? 0.55 + 0.25 * Math.sin(t * 12 + e.id) : 0.2);
        }
        if (e.repair) {
          const [sx, sy] = P(v, e.x, e.y, 1.2);
          ctx.fillStyle = '#4ade80'; ctx.font = `bold ${14 * v.zoom}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('+', sx, sy - 6 * v.zoom - Math.abs(Math.sin(t * 4)) * 5);
        }
      } else {
        if (sf != null && now - sf < 1.0) {
          const p = (now - sf) / 1.0;
          const [sx, sy] = P(v, e.rx, e.ry, e.def.fly ? 1.6 : 0);
          ctx.save(); ctx.beginPath(); ctx.rect(sx - 60, sy + 30 - (110 * v.zoom) * p * 1.05, 120, 1000); ctx.clip();
          clipped = true;
        }
        if (e.def.fly) drawAir(v, e, t);
        else if (e.def.cat === 'infantry') drawInfantry(v, e, t);
        else drawVehicle(v, e, t);
        if (e.def.custom) customMark(v, P(v, e.rx, e.ry, e.def.fly ? 2.3 : e.def.cat === 'infantry' ? 0.95 : 1.05));
      }
      if (clipped) {
        ctx.restore();
        if (bbox) {
          ctx.globalCompositeOperation = 'lighter';
          const col = PLAYER_COLORS[e.owner].main;
          ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.globalAlpha = 0.9;
          ctx.beginPath(); ctx.moveTo(bbox.cx - bbox.half, bbox.cutY); ctx.lineTo(bbox.cx + bbox.half, bbox.cutY); ctx.stroke();
          ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        }
      }
      if (sf != null && now - sf < 1.0) {
        const p = (now - sf) / 1.0;
        const col = PLAYER_COLORS[e.owner].main;
        const [sx, sy] = P(v, e.rx, e.ry, 0);
        ctx.globalCompositeOperation = 'lighter';
        const hgt = 240 * v.zoom;
        const g2 = ctx.createLinearGradient(0, sy - hgt, 0, sy);
        g2.addColorStop(0, col + '00'); g2.addColorStop(0.7, col + '88'); g2.addColorStop(1, col + 'ff');
        ctx.globalAlpha = 1 - p * p;
        ctx.fillStyle = g2;
        const bw = 16 * v.zoom * (1 - p * 0.5);
        ctx.fillRect(sx - bw, sy - hgt, bw * 2, hgt);
        ctx.fillStyle = '#ffffff'; ctx.fillRect(sx - bw * 0.25, sy - hgt, bw * 0.5, hgt);
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        glow(ctx, sx, sy, 34 * v.zoom * (1 - p * 0.4), col, 0.9 * (1 - p));
      }
      if (e.ghost) ctx.globalAlpha = 1;
    }
    drawBar(g, e, now) {
      if (e.ghost) return;
      const sel = g.sel.has(e.id), hov = g.hoverId === e.id;
      const recent = e.hitAt && now - e.hitAt < 4;
      if (!sel && !hov && !(recent && e.hp < e.mhp) && !(g.showBars && e.hp < e.mhp)) return;
      const ctx = this.ctx, v = this.v;
      const isB = e.isB;
      const top = isB ? P(v, e.x, e.y, 0) : P(v, e.rx, e.ry, e.def.fly ? 1.6 : 0);
      const bw = (isB ? (e.w + e.h) * 15 : e.def.r > 0.4 ? 30 : 22) * v.zoom;
      const by = top[1] - (isB ? (e.h + e.w) * v.B * 0.5 + 48 * v.zoom : (e.def.cat === 'infantry' ? 32 : 40) * v.zoom);
      const bx = top[0] - bw / 2;
      const f = Math.max(0, Math.min(1, e.hp / e.mhp));
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(bx - 1, by - 1, bw + 2, 6 * Math.max(0.8, v.zoom) + 2);
      ctx.fillStyle = f > 0.6 ? '#4ade80' : f > 0.3 ? '#facc15' : '#f43f5e';
      ctx.fillRect(bx, by, bw * f, 6 * Math.max(0.8, v.zoom));
      if (e.def.harvester && sel) {
        ctx.fillStyle = '#34d399'; ctx.fillRect(bx, by + 8, bw * Math.min(1, (e.cargo || 0) / 600), 3);
      }
      if (sel && e.owner === g.me && g.groupOf && g.groupOf.get(e.id)) {
        ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'left'; ctx.fillText(g.groupOf.get(e.id), bx + bw + 3, by + 7);
      }
    }

    // ---- projectiles, particles, beams
    drawFx(g, now) {
      const ctx = this.ctx, v = this.v, fx = g.fx;
      const heightOf = (fly, isB) => (fly ? 1.6 : isB ? 0.7 : 0.45);
      // lance beams
      for (const l of fx.lances) {
        const p = (now - l.t0) / l.dur;
        const [sx, sy] = P(v, l.x, l.y, 0);
        if (p < 0 || p > 1.5) continue;
        ctx.globalCompositeOperation = 'lighter';
        if (p < 1) {
          const warn = p;
          ringGround(v, l.x, l.y, l.r * (1.05 - warn * 0.1), '#ff4d6d', 2.5, 0.9);
          ringGround(v, l.x, l.y, l.r * (1 - warn), '#ffb4c0', 2, 0.9);
          const bw = (2 + warn * 8) * v.zoom;
          const g2 = ctx.createLinearGradient(0, sy - 900, 0, sy);
          g2.addColorStop(0, 'rgba(255,255,255,0)'); g2.addColorStop(1, `rgba(255,140,170,${0.25 + warn * 0.65})`);
          ctx.fillStyle = g2; ctx.fillRect(sx - bw, sy - 900, bw * 2, 900);
          glow(ctx, sx, sy, 60 * v.zoom * warn, '#ff4d6d', 0.5 * warn);
        } else {
          const q = (p - 1) / 0.5;
          const bw = (40 * (1 - q) + 8) * v.zoom;
          const g2 = ctx.createLinearGradient(0, sy - 900, 0, sy);
          g2.addColorStop(0, 'rgba(255,255,255,0)'); g2.addColorStop(1, `rgba(255,240,240,${1 - q})`);
          ctx.fillStyle = g2; ctx.fillRect(sx - bw, sy - 900, bw * 2, 900);
          glow(ctx, sx, sy, 200 * v.zoom * (1 - q * 0.4), '#ffffff', 1 - q);
        }
        ctx.globalCompositeOperation = 'source-over';
      }
      // shots
      for (const s of fx.shots) {
        const p = (now - s.t0) / s.dur;
        if (p < 0) continue;
        const col = PLAYER_COLORS[s.o] || PLAYER_COLORS[0];
        const z1 = s.z1, z2 = s.z2;
        const pos = (q) => {
          const arc = s.k === 'shell' ? Math.sin(Math.PI * q) * s.arc : 0;
          return P(v, s.x1 + (s.x2 - s.x1) * q, s.y1 + (s.y2 - s.y1) * q, z1 + (z2 - z1) * q + arc);
        };
        ctx.globalCompositeOperation = 'lighter';
        if (s.k === 'rail') {
          const a = pos(0), b = pos(1);
          const f = 1 - Math.min(1, (now - s.t0) / 0.35);
          ctx.strokeStyle = `rgba(160,240,255,${f})`; ctx.lineWidth = 7 * v.zoom * f + 1; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
          ctx.strokeStyle = `rgba(255,255,255,${f})`; ctx.lineWidth = 2.2 * v.zoom;
          ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
          glow(ctx, b[0], b[1], 26 * v.zoom * f, '#67e8f9', f);
        } else if (p <= 1) {
          const q = Math.min(1, p);
          const pt = pos(q);
          if (s.k === 'bolt') {
            const tail = pos(Math.max(0, q - 0.22));
            ctx.strokeStyle = col.main; ctx.lineWidth = 3.2 * v.zoom; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(tail[0], tail[1]); ctx.lineTo(pt[0], pt[1]); ctx.stroke();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.3 * v.zoom;
            ctx.beginPath(); ctx.moveTo(tail[0], tail[1]); ctx.lineTo(pt[0], pt[1]); ctx.stroke();
            glow(ctx, pt[0], pt[1], 9 * v.zoom, col.main, 0.8);
          } else if (s.k === 'rocket') {
            const tail = pos(Math.max(0, q - 0.08));
            ctx.strokeStyle = '#ffd08a'; ctx.lineWidth = 3 * v.zoom; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(tail[0], tail[1]); ctx.lineTo(pt[0], pt[1]); ctx.stroke();
            glow(ctx, tail[0], tail[1], 12 * v.zoom, '#ff8a3c', 0.9);
            if (Math.random() < 0.8) g.puff((s.x1 + (s.x2 - s.x1) * q), (s.y1 + (s.y2 - s.y1) * q), z1 + (z2 - z1) * q, 'smoke', 0.18);
          } else if (s.k === 'plasma') {
            glow(ctx, pt[0], pt[1], 17 * v.zoom, col.main, 0.95);
            glow(ctx, pt[0], pt[1], 7 * v.zoom, '#ffffff', 1);
          } else if (s.k === 'shell') {
            glow(ctx, pt[0], pt[1], 10 * v.zoom, '#ffb84d', 0.9);
            ctx.globalCompositeOperation = 'source-over';
            ctx.fillStyle = '#fef3c7'; ctx.beginPath(); ctx.arc(pt[0], pt[1], 3 * v.zoom, 0, 7); ctx.fill();
          }
        }
        ctx.globalCompositeOperation = 'source-over';
      }
      // particles
      for (const pt of fx.particles) {
        const life = (now - pt.t0) / pt.dur;
        if (life < 0 || life > 1) continue;
        const [sx, sy] = P(v, pt.x, pt.y, pt.z);
        const sz = pt.size * v.zoom * (pt.grow ? 1 + life * pt.grow : 1 - life * 0.5);
        if (pt.kind === 'fire') {
          glow(ctx, sx, sy, sz * 2.2, life < 0.4 ? '#ffb347' : '#ff5a1f', 0.85 * (1 - life));
        } else if (pt.kind === 'smoke') {
          ctx.globalAlpha = 0.4 * (1 - life); ctx.fillStyle = '#546174';
          ctx.beginPath(); ctx.arc(sx, sy, sz, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
        } else if (pt.kind === 'spark') {
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = pt.color; ctx.globalAlpha = 1 - life; ctx.lineWidth = 2 * v.zoom;
          ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx - pt.vx * 0.06 * v.A, sy - (pt.vy * 0.06) * v.B + pt.vz * 0.06 * v.Z); ctx.stroke();
          ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        } else if (pt.kind === 'flash') {
          glow(ctx, sx, sy, sz * 2.4, pt.color, 1 - life);
        } else if (pt.kind === 'debris') {
          ctx.fillStyle = pt.color; ctx.globalAlpha = 1 - life * life;
          ctx.fillRect(sx - sz / 2, sy - sz / 2, sz, sz); ctx.globalAlpha = 1;
        } else if (pt.kind === 'blast') {
          glow(ctx, sx, sy, sz * (1 + life * 3), pt.color, 0.95 * (1 - life));
        }
      }
    }

    drawFog(g) {
      if (!g.fogCanvas) return;
      const ctx = this.ctx, v = this.v;
      ctx.save();
      ctx.setTransform(this.dpr * v.A, this.dpr * v.B, -this.dpr * v.A, this.dpr * v.B, this.dpr * v.OX, this.dpr * v.OY);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(g.fogCanvas, 0, 0, W, H);
      ctx.restore();
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }

    drawOverlay(g, now) {
      const ctx = this.ctx, v = this.v;
      // placement ghost building
      const pl = g.placing;
      if (pl && pl.tx != null) {
        const d = DEFS[pl.type];
        ctx.globalAlpha = 0.6;
        drawBuilding(v, { type: pl.type, def: d, owner: g.me, bx: pl.tx, by: pl.ty, w: d.w, h: d.h, x: pl.tx + d.w / 2, y: pl.ty + d.h / 2, id: 0, ang: 0.8, hp: 1, mhp: 1 }, now);
        ctx.globalAlpha = 1;
      }
      // drag rectangle
      if (g.drag && g.drag.active) {
        const d = g.drag;
        ctx.strokeStyle = '#7dffb2'; ctx.lineWidth = 1.2; ctx.fillStyle = 'rgba(125,255,178,0.08)';
        const x = Math.min(d.x0, d.x1), y = Math.min(d.y0, d.y1), w = Math.abs(d.x1 - d.x0), h = Math.abs(d.y1 - d.y0);
        ctx.fillRect(x, y, w, h); ctx.strokeRect(x + 0.5, y + 0.5, w, h);
      }
      // alert pings
      for (const p of g.pings) {
        const q = (now - p.t0) / 2.4;
        if (q > 1) continue;
        ringGround(v, p.x, p.y, 1 + q * 3, '#ff4d6d', 3, 1 - q);
      }
      // vignette
      const gr = ctx.createRadialGradient(this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.45, this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.75);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,4,10,0.45)');
      ctx.fillStyle = gr; ctx.fillRect(0, 0, this.w, this.h);
    }

    // ---- minimap (isometric diamond)
    drawMinimap(g, canvas, now) {
      const ctx = canvas.getContext('2d');
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cw = canvas.clientWidth, ch = canvas.clientHeight;
      if (canvas.width !== Math.floor(cw * dpr)) { canvas.width = Math.floor(cw * dpr); canvas.height = Math.floor(ch * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#04070c'; ctx.fillRect(0, 0, cw, ch);
      const ms = cw / (2 * W);
      const proj = (x, y) => [(x - y) * ms + cw / 2, (x + y) * ms * 0.5];
      ctx.save();
      ctx.setTransform(dpr * ms, dpr * ms * 0.5, -dpr * ms, dpr * ms * 0.5, dpr * cw / 2, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(g.miniTerrain(), 0, 0, W, H);
      ctx.restore();
      for (const e of g.ents.values()) {
        const col = PLAYER_COLORS[e.owner].main;
        const [x, y] = proj(e.isB ? e.x : e.rx, e.isB ? e.y : e.ry);
        ctx.fillStyle = e.ghost ? '#6b7280' : col;
        const s = e.isB ? Math.max(2.2, e.w * ms * 0.9) : 1.6;
        ctx.fillRect(x - s / 2, y - s / 2, s, s);
      }
      // fog
      ctx.save();
      ctx.setTransform(dpr * ms, dpr * ms * 0.5, -dpr * ms, dpr * ms * 0.5, dpr * cw / 2, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(g.fogCanvas, 0, 0, W, H);
      ctx.restore();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      for (const p of g.pings) {
        const q = (now - p.t0) / 2.4;
        if (q > 1) continue;
        const [x, y] = proj(p.x, p.y);
        ctx.strokeStyle = `rgba(255,77,109,${1 - q})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, 3 + q * 12, 0, 7); ctx.stroke();
      }
      // camera view
      const corners = [this.toWorld(0, 0), this.toWorld(this.w, 0), this.toWorld(this.w, this.h), this.toWorld(0, this.h)].map(([x, y]) => proj(Math.max(0, Math.min(W, x)), Math.max(0, Math.min(H, y))));
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(corners[0][0], corners[0][1]); for (let i = 1; i < 4; i++) ctx.lineTo(corners[i][0], corners[i][1]); ctx.closePath(); ctx.stroke();
    }
  }

  // ------------------------------------------------------------------ icons for the build menu
  const iconCache = new Map();
  GA.getIcon = function (type, owner) {
    const d = DEFS[type];
    const key = type + '|' + (d.look || '') + '|' + (PLAYER_COLORS[owner] ? PLAYER_COLORS[owner].main : owner);
    if (iconCache.has(key)) return iconCache.get(key);
    const c = document.createElement('canvas');
    const S = 2;
    c.width = 76 * S; c.height = 56 * S;
    const ctx = c.getContext('2d');
    ctx.scale(S, S);
    let zoom, ox, oy, e;
    if (d.kind === 'b') {
      const span = d.w + d.h;
      zoom = Math.min(0.95, 5.2 / span * 0.62 * 2.2 / 2.2);
      zoom = 3.7 / span;
      e = { type, def: d, owner, bx: -d.w / 2, by: -d.h / 2, w: d.w, h: d.h, x: 0, y: 0, id: 3, ang: 0.6, hp: 1, mhp: 1 };
      ox = 38; oy = 36 - (d.w + d.h) * 0.0;
      if (type === 'uplink' || type === 'conyard') oy += 6;
    } else {
      zoom = d.def === undefined && d.cat === 'infantry' ? 1.7 : d.cat === 'infantry' ? 1.9 : d.fly ? 0.85 : 1.15;
      e = { type, def: d, owner, rx: 0, ry: 0, x: 0, y: 0, ang: 0.7, id: 3, hp: 1, mhp: 1, cargo: 0, moving: false };
      ox = 38; oy = d.cat === 'infantry' ? 44 : 38;
      if (d.fly) oy = 53;
    }
    const v = { ctx, A: 32 * zoom, B: 16 * zoom, OX: ox, OY: oy, Z: 34 * zoom, zoom };
    if (d.kind === 'b') drawBuilding(v, e, 0.5);
    else if (d.fly) drawAir(v, e, 0.5);
    else if (d.cat === 'infantry') drawInfantry(v, e, 0.5);
    else drawVehicle(v, e, 0.5);
    if (d.custom) { ctx.fillStyle = '#facc15'; ctx.strokeStyle = '#3b2f05'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(66, 4); ctx.lineTo(71, 10); ctx.lineTo(66, 16); ctx.lineTo(61, 10); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    iconCache.set(key, c);
    return c;
  };

  GA.Renderer = Renderer;
  GA.drawHelpers = { P, glow, shade, ringGround };
})();

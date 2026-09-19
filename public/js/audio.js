// Synthesised sound effects, announcer voice and a small generative synthwave loop
(function () {
  'use strict';
  const GA = globalThis.GA;

  const A = {
    ctx: null, master: null, sfxGain: null, musicGain: null,
    sfxOn: true, musicOn: true, voiceOn: true,
    last: {}, active: 0, musicTimer: null, step: 0, noiseBuf: null,
  };

  A.init = function () {
    if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    A.ctx = new AC();
    A.master = A.ctx.createGain(); A.master.gain.value = 0.9; A.master.connect(A.ctx.destination);
    A.sfxGain = A.ctx.createGain(); A.sfxGain.gain.value = 0.8; A.sfxGain.connect(A.master);
    A.musicGain = A.ctx.createGain(); A.musicGain.gain.value = A.musicOn ? 0.16 : 0; A.musicGain.connect(A.master);
    const len = A.ctx.sampleRate;
    A.noiseBuf = A.ctx.createBuffer(1, len, A.ctx.sampleRate);
    const d = A.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  };

  function tone(o) {
    const c = A.ctx; if (!c) return;
    const t = c.currentTime + (o.delay || 0);
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f0, t);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t + o.dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.vol || 0.1, t + Math.min(0.01, o.dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    osc.connect(g); g.connect(o.dest || A.sfxGain);
    osc.start(t); osc.stop(t + o.dur + 0.02);
  }
  function noise(o) {
    const c = A.ctx; if (!c) return;
    const t = c.currentTime + (o.delay || 0);
    const src = c.createBufferSource(); src.buffer = A.noiseBuf; src.loop = true;
    const f = c.createBiquadFilter(); f.type = o.ftype || 'lowpass';
    f.frequency.setValueAtTime(o.f0, t);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t + o.dur);
    const g = c.createGain();
    g.gain.setValueAtTime(o.vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(f); f.connect(g); g.connect(o.dest || A.sfxGain);
    src.start(t, Math.random() * 0.5); src.stop(t + o.dur + 0.02);
  }

  const SOUNDS = {
    bolt: (v) => { tone({ type: 'square', f0: 1100, f1: 320, dur: 0.09, vol: 0.05 * v }); },
    rocket: (v) => { noise({ f0: 2400, f1: 500, dur: 0.35, vol: 0.12 * v }); tone({ type: 'sawtooth', f0: 220, f1: 90, dur: 0.3, vol: 0.05 * v }); },
    plasma: (v) => { tone({ type: 'sawtooth', f0: 420, f1: 70, dur: 0.22, vol: 0.09 * v }); tone({ type: 'sine', f0: 900, f1: 200, dur: 0.15, vol: 0.06 * v }); },
    shell: (v) => { tone({ type: 'sine', f0: 140, f1: 38, dur: 0.4, vol: 0.28 * v }); noise({ f0: 900, f1: 120, dur: 0.3, vol: 0.14 * v }); },
    rail: (v) => { tone({ type: 'sine', f0: 3000, f1: 160, dur: 0.35, vol: 0.14 * v }); noise({ ftype: 'highpass', f0: 4000, f1: 800, dur: 0.25, vol: 0.09 * v }); },
    boom: (v) => { noise({ f0: 1400, f1: 60, dur: 0.7, vol: 0.4 * v }); tone({ type: 'sine', f0: 90, f1: 30, dur: 0.6, vol: 0.35 * v }); },
    boomSmall: (v) => { noise({ f0: 1800, f1: 200, dur: 0.28, vol: 0.2 * v }); tone({ type: 'sine', f0: 140, f1: 50, dur: 0.2, vol: 0.14 * v }); },
    bigboom: (v) => { noise({ f0: 1000, f1: 40, dur: 1.6, vol: 0.6 * v }); tone({ type: 'sine', f0: 70, f1: 22, dur: 1.4, vol: 0.5 * v }); },
    spawn: (v) => { tone({ type: 'sine', f0: 260, f1: 1500, dur: 0.6, vol: 0.09 * v }); tone({ type: 'triangle', f0: 520, f1: 2400, dur: 0.5, vol: 0.05 * v, delay: 0.1 }); },
    built: (v) => { tone({ type: 'square', f0: 180, f1: 90, dur: 0.15, vol: 0.08 * v }); noise({ f0: 3000, f1: 400, dur: 0.5, vol: 0.1 * v }); tone({ type: 'sine', f0: 500, f1: 1000, dur: 0.4, vol: 0.06 * v, delay: 0.2 }); },
    ready: () => { [660, 880, 1320].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 0.16, vol: 0.09, delay: i * 0.09 })); },
    click: () => { tone({ type: 'square', f0: 700, f1: 500, dur: 0.05, vol: 0.05 }); },
    error: () => { tone({ type: 'sawtooth', f0: 200, f1: 140, dur: 0.18, vol: 0.09 }); },
    select: () => { tone({ type: 'triangle', f0: 900, f1: 1300, dur: 0.06, vol: 0.05 }); },
    order: () => { tone({ type: 'triangle', f0: 500, f1: 760, dur: 0.07, vol: 0.05 }); },
    alert: () => { [520, 390].forEach((f, i) => tone({ type: 'square', f0: f, dur: 0.14, vol: 0.07, delay: i * 0.16 })); },
    sell: () => { [900, 600, 400].forEach((f, i) => tone({ type: 'sine', f0: f, dur: 0.1, vol: 0.08, delay: i * 0.07 })); },
    lance: () => { tone({ type: 'sawtooth', f0: 60, f1: 2400, dur: 3.3, vol: 0.12 }); tone({ type: 'sine', f0: 120, f1: 4000, dur: 3.3, vol: 0.06 }); },
    capture: () => { [400, 600, 800, 1200].forEach((f, i) => tone({ type: 'square', f0: f, dur: 0.1, vol: 0.06, delay: i * 0.07 })); },
  };

  A.play = function (name, vol) {
    if (!A.ctx || !A.sfxOn || vol <= 0.02) return;
    const now = performance.now();
    const cd = name === 'bolt' ? 45 : 35;
    if (A.last[name] && now - A.last[name] < cd) return;
    A.last[name] = now;
    if (A.active > 22) return;
    const fn = SOUNDS[name];
    if (!fn) return;
    A.active++;
    setTimeout(() => { A.active = Math.max(0, A.active - 1); }, 300);
    fn(vol == null ? 1 : vol);
  };

  // ---------------------------------------------------------------- announcer
  const lastSay = {};
  let voice = null;
  A.say = function (text) {
    if (!A.voiceOn || !window.speechSynthesis) return;
    const now = performance.now();
    if (lastSay[text] && now - lastSay[text] < 6000) return;
    lastSay[text] = now;
    try {
      const vs = speechSynthesis.getVoices();
      const thVoice = GA.lang === 'th' ? vs.find((v) => /^th/i.test(v.lang)) : null;
      if (!voice) voice = vs.find((v) => /en-(US|GB)/i.test(v.lang) && /male|david|mark|guy|daniel|alex/i.test(v.name)) || vs.find((v) => /^en/i.test(v.lang)) || null;
      const u = new SpeechSynthesisUtterance(thVoice ? GA.tt(text) : text); // no Thai voice installed -> speak English
      u.lang = thVoice ? thVoice.lang : 'en-US';
      if (thVoice || voice) u.voice = thVoice || voice;
      u.rate = 1.08; u.pitch = 0.75; u.volume = 0.9;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch (e) { /* ignore */ }
  };

  // ---------------------------------------------------------------- music: slow synthwave loop
  const CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]; // Am F C G
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  A.startMusic = function () {
    if (!A.ctx || A.musicTimer) return;
    A.step = 0;
    const stepMs = 260;
    A.musicTimer = setInterval(() => {
      if (!A.musicOn || A.ctx.state !== 'running') return;
      const s = A.step++;
      const bar = Math.floor(s / 16) % CHORDS.length;
      const ch = CHORDS[bar];
      const i = s % 16;
      const d = A.musicGain;
      if (i % 4 === 0) tone({ type: 'sawtooth', f0: mtof(ch[0] - 24), dur: 0.5, vol: 0.5, dest: d });
      if (i % 2 === 0) tone({ type: 'triangle', f0: mtof(ch[(i / 2) % 3] + 12), dur: 0.22, vol: 0.35, dest: d });
      if (i === 0) for (const n of ch) tone({ type: 'sine', f0: mtof(n), dur: 4, vol: 0.18, dest: d });
      if (i % 8 === 4) noise({ ftype: 'highpass', f0: 6000, dur: 0.05, vol: 0.12, dest: d });
    }, stepMs);
  };
  A.stopMusic = function () { if (A.musicTimer) { clearInterval(A.musicTimer); A.musicTimer = null; } };
  A.setMusic = function (on) { A.musicOn = on; if (A.musicGain) A.musicGain.gain.value = on ? 0.16 : 0; };
  A.setSfx = function (on) { A.sfxOn = on; };

  GA.Audio = A;
})();

// Transports: an in-browser local simulation (offline skirmish) and a WebSocket client (multiplayer)
(function () {
  'use strict';
  const GA = globalThis.GA;

  class LocalTransport {
    constructor(cfg) {
      this.cfg = cfg;
      this.sim = new GA.Sim({ players: cfg.players, startCredits: cfg.startCredits, seed: cfg.seed, map: cfg.map });
      this.speed = cfg.speed || 1;
      this.paused = false;
      this.onmessage = null;
      this.timer = null;
    }
    start() {
      this.onmessage({ t: 'start', me: 0, map: this.sim.initInfo(), speed: this.speed, local: true });
      this.acc = 0; this.last = performance.now();
      this.timer = setInterval(() => this.loop(), 25);
    }
    loop() {
      const now = performance.now();
      const dt = (now - this.last) / 1000;
      this.last = now;
      if (this.paused) return;
      this.acc = Math.min(2, this.acc + dt * this.speed);
      let n = 0;
      while (this.acc >= GA.DT && n < 12) {
        this.acc -= GA.DT; n++;
        this.sim.step();
        if (this.sim.tick % 2 === 0) {
          const snap = this.sim.flush([0])[0];
          if (this.onmessage) this.onmessage(snap);
        }
      }
    }
    send(msg) {
      if (msg.t === 'cmd') this.sim.cmd(0, msg.c);
    }
    setSpeed(s) { this.speed = s; }
    close() { if (this.timer) clearInterval(this.timer); this.timer = null; }
  }

  class WSTransport {
    constructor() {
      this.ws = null;
      this.onmessage = null;
      this.onclose = null;
      this.queue = [];
    }
    connect() {
      return new Promise((resolve, reject) => {
        const proto = location.protocol === 'https:' ? 'wss' : 'ws';
        const ws = new WebSocket(`${proto}://${location.host}`);
        this.ws = ws;
        ws.onopen = () => resolve();
        ws.onerror = () => reject(new Error('Cannot reach the game server'));
        ws.onmessage = (ev) => {
          let m;
          try { m = JSON.parse(ev.data); } catch { return; }
          if (this.onmessage) this.onmessage(m);
        };
        ws.onclose = () => { if (this.onclose) this.onclose(); };
      });
    }
    send(msg) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(msg)); }
    close() { if (this.ws) { this.ws.onclose = null; this.ws.close(); } this.ws = null; }
  }

  GA.LocalTransport = LocalTransport;
  GA.WSTransport = WSTransport;
})();

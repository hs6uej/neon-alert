// HUD: top bar, radar, build sidebar, selection panel, toasts, chat, pause / end screens
(function () {
  'use strict';
  const GA = globalThis.GA;
  const { DEFS, TYPES, CATS, CAT_LABEL, PLAYER_COLORS } = GA;
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => Math.floor(n).toLocaleString('en-US');
  const mmss = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  const NAME_OF = (t) => DEFS[t].name;

  class UI {
    constructor() {
      this.el = {
        hud: $('hud'), credits: $('creditsVal'), pwFill: $('pwFill'), pwText: $('pwText'), clock: $('clock'),
        mini: $('mini'), radarOff: $('radarOff'), tabs: $('tabs'), list: $('buildList'), sel: $('selPanel'),
        toasts: $('toasts'), banner: $('alertBanner'), sw: $('swBox'), toolRepair: $('toolRepair'), toolSell: $('toolSell'),
        chatLog: $('chatLog'), chatInput: $('chatInput'), pause: $('pauseMenu'), end: $('endScreen'), players: $('playerList'),
        btnSound: $('btnSound'), btnMusic: $('btnMusic'),
      };
      this.game = null;
      this.tab = 'structure';
      this.dispCredits = 0;
      this.selSig = '';
      this.cards = {};
      this.chatTimer = null;
      this.el.chatInput.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          const text = this.el.chatInput.value.trim();
          if (text && this.game) this.game.transport.send({ t: 'chat', text });
          this.el.chatInput.value = ''; this.el.chatInput.blur(); this.el.chatInput.classList.remove('open');
        } else if (e.key === 'Escape') { this.el.chatInput.blur(); this.el.chatInput.classList.remove('open'); }
      });
      this.el.toolRepair.onclick = () => this.game && this.game.setMode(this.game.mode === 'repair' ? null : 'repair');
      this.el.toolSell.onclick = () => this.game && this.game.setMode(this.game.mode === 'sell' ? null : 'sell');
      this.el.mini.addEventListener('mousedown', (e) => this.miniMouse(e));
      this.el.mini.addEventListener('mousemove', (e) => { if (e.buttons & 1) this.miniMouse(e); });
      this.el.mini.addEventListener('contextmenu', (e) => e.preventDefault());
      this.el.mini.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'touch') return; e.preventDefault(); try { this.el.mini.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } this.miniTouch = true; this.miniMouse(e); });
      this.el.mini.addEventListener('pointermove', (e) => { if (e.pointerType === 'touch' && this.miniTouch) this.miniMouse(e); });
      for (const ev of ['pointerup', 'pointercancel']) this.el.mini.addEventListener(ev, () => { this.miniTouch = false; });
      $('btnMenu').onclick = () => this.togglePause();
      $('btnResume').onclick = () => this.togglePause(false);
      this.el.btnSound.onclick = () => { const on = !GA.Audio.sfxOn; GA.Audio.setSfx(on); GA.Audio.voiceOn = on; this.el.btnSound.classList.toggle('off', !on); };
      this.el.btnMusic.onclick = () => { GA.Audio.init(); GA.Audio.startMusic(); const on = !GA.Audio.musicOn; GA.Audio.setMusic(on); this.el.btnMusic.classList.toggle('off', !on); };
    }

    attach(game) {
      this.game = game;
      this.el.hud.classList.remove('hidden');
      this.el.end.classList.add('hidden');
      this.result = null; $('endRating').classList.add('hidden');
      this.el.pause.classList.add('hidden');
      this.el.toasts.innerHTML = ''; this.el.chatLog.innerHTML = '';
      this.dispCredits = 0; this.selSig = ''; this.tab = 'structure';
      this.buildSidebar(game);
      this.buildPlayers(game);
      const mp = GA.MAPS.find((x) => x.id === game.map.mapId);
      $('mapName').textContent = mp ? '🗺 ' + mp.name : '';
      $('chatBox').classList.toggle('hidden', game.local);
      this.toast(document.body.classList.contains('touch') ? 'Tap a card to build. Tap the map to move / attack · long-press = attack-move · pinch to zoom · drag or use the edge pads to scroll' : 'Build a Fusion Reactor first, then a Refinery.  RMB = move / attack · A = attack-move · H = home', 'info', 9000);
    }
    detach() {
      this.game = null;
      this.el.hud.classList.add('hidden');
      this.el.end.classList.add('hidden');
      this.el.pause.classList.add('hidden');
    }
    typing() { return document.activeElement === this.el.chatInput; }
    openChat() {
      if (this.game && this.game.local) return;
      this.el.chatInput.classList.add('open'); this.el.chatInput.focus();
    }
    chat(m) {
      const d = document.createElement('div');
      d.setAttribute('translate', 'no');
      const col = GA.PALETTE[m.color] ? GA.PALETTE[m.color].main : '#fff';
      d.innerHTML = `<b style="color:${col}"></b> <span></span>`;
      d.children[0].textContent = m.from + ':'; d.children[1].textContent = m.text;
      this.el.chatLog.appendChild(d);
      while (this.el.chatLog.children.length > 6) this.el.chatLog.removeChild(this.el.chatLog.firstChild);
      this.el.chatBox = $('chatBox');
      $('chatBox').classList.add('active');
      clearTimeout(this.chatTimer);
      this.chatTimer = setTimeout(() => $('chatBox').classList.remove('active'), 9000);
    }
    toast(text, kind, ms) {
      const d = document.createElement('div');
      d.className = 'toast ' + (kind || 'info');
      d.textContent = text;
      this.el.toasts.appendChild(d);
      while (this.el.toasts.children.length > 4) this.el.toasts.removeChild(this.el.toasts.firstChild);
      setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 500); }, ms || 4200);
    }
    alert(text) {
      const b = this.el.banner;
      b.textContent = '⚠ ' + text; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
    }
    flashReady(cat) {
      const t = this.el.tabs.querySelector(`[data-cat="${cat}"]`);
      if (t) { t.classList.add('flash'); setTimeout(() => t.classList.remove('flash'), 2500); }
      if (cat === 'structure' && this.tab !== 'structure') this.toast('Structure ready to place', 'good');
    }
    nextTab() {
      const shown = CATS.filter((c) => !this.tabHidden || !this.tabHidden[c]);
      if (shown.length) this.setTab(shown[(shown.indexOf(this.tab) + 1) % shown.length]);
    }
    setTab(cat) {
      this.tab = cat;
      for (const t of this.el.tabs.children) t.classList.toggle('active', t.dataset.cat === cat);
      for (const c of this.el.list.children) if (c.dataset.cat) c.classList.toggle('hidden', c.dataset.cat !== cat);
    }
    syncTools(g) {
      this.el.toolRepair.classList.toggle('active', g.mode === 'repair');
      this.el.toolSell.classList.toggle('active', g.mode === 'sell');
      this.el.hud.dataset.mode = g.mode || '';
    }
    togglePause(force) {
      if (!this.game) return;
      const show = force !== undefined ? force : this.el.pause.classList.contains('hidden');
      this.el.pause.classList.toggle('hidden', !show);
      if (this.game.transport.paused !== undefined) this.game.transport.paused = show;
      $('pauseNote').textContent = this.game.local ? 'Game paused' : 'Online game keeps running';
    }
    miniMouse(e) {
      const g = this.game; if (!g) return;
      const r = this.el.mini.getBoundingClientRect();
      const [wx, wy] = g.minimapPos(e.clientX - r.left, e.clientY - r.top, r.width);
      const x = Math.max(0, Math.min(GA.W, wx)), y = Math.max(0, Math.min(GA.H, wy));
      if (e.button === 2) { g.orderAt(x, y, null, e.shiftKey); e.preventDefault(); return; }
      g.centerOn(x, y);
    }

    // -------------------------------------------------------------- sidebar
    buildSidebar(g) {
      this.el.tabs.innerHTML = ''; this.el.list.innerHTML = ''; this.cards = {};
      for (const cat of CATS) {
        const t = document.createElement('button');
        t.className = 'tab'; t.dataset.cat = cat; t.innerHTML = `<span>${CAT_LABEL[cat]}</span><i></i>`;
        t.onclick = () => this.setTab(cat);
        this.el.tabs.appendChild(t);
        const list = document.createElement('div');
        list.className = 'cards'; list.dataset.cat = cat;
        for (const type of GA.TYPES) {
          const d = DEFS[type];
          if (d.cat !== cat || d.buildable === false) continue;
          const c = document.createElement('div');
          c.className = 'card'; c.dataset.type = type;
          const icon = GA.getIcon(type, g.me);
          icon.className = 'icon';
          c.appendChild(icon);
          const nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = d.name; c.appendChild(nm);
          const cost = document.createElement('div'); cost.className = 'cost'; cost.textContent = '◈ ' + fmt(d.cost); c.appendChild(cost);
          const prog = document.createElement('div'); prog.className = 'prog'; prog.innerHTML = '<i></i>'; c.appendChild(prog);
          const st = document.createElement('div'); st.className = 'state'; c.appendChild(st);
          const bd = document.createElement('div'); bd.className = 'badge'; c.appendChild(bd);
          c.title = `${d.name}\n${d.desc || ''}`;
          c.onclick = (e) => this.cardClick(type, e);
          c.oncontextmenu = (e) => { e.preventDefault(); this.cardCancel(type); };
          list.appendChild(c);
          this.cards[type] = { el: c, prog: prog.firstChild, st, bd };
        }
        this.el.list.appendChild(list);
      }
      this.emptyNote = document.createElement('p');
      this.emptyNote.className = 'emptynote hidden'; this.emptyNote.textContent = 'Nothing to build yet.';
      this.el.list.appendChild(this.emptyNote);
      this.setTab('structure');
    }
    canBuild(g, type) {
      const d = DEFS[type];
      for (const r of d.req) if (!g.counts[r]) return DEFS[r].name;
      const need = d.cat === 'infantry' ? 'barracks' : d.cat === 'vehicle' ? 'factory' : 'conyard';
      if (!g.counts[need]) return DEFS[need].name;
      return null;
    }
    cardClick(type, e) {
      const g = this.game; if (!g) return;
      GA.Audio.init();
      const d = DEFS[type];
      const missing = this.canBuild(g, type);
      if (missing) { this.toast(`${d.name} requires ${missing}`, 'bad'); GA.Audio.play('error', 1); return; }
      const q = g.st.q[d.cat];
      if (d.cat === 'structure' && q[0] && q[0][2] && TYPES[q[0][0]] === type) { g.startPlacing(type); GA.Audio.play('click', 1); return; }
      g.send({ type: 'queue', item: type, n: e.shiftKey ? 5 : 1 });
      GA.Audio.play('click', 1);
    }
    cardCancel(type) {
      const g = this.game; if (!g) return;
      const d = DEFS[type];
      const q = g.st.q[d.cat];
      for (let i = q.length - 1; i >= 0; i--) if (TYPES[q[i][0]] === type) { g.send({ type: 'cancel', cat: d.cat, index: i }); if (i === 0 && g.placing) g.placing = null; GA.Audio.play('click', 1); return; }
    }
    renderBuild(g) {
      const q = g.st.q;
      for (const cat of CATS) {
        const tab = this.el.tabs.querySelector(`[data-cat="${cat}"] i`);
        const front = q[cat][0];
        tab.style.width = front ? Math.floor((front[2] ? 1 : front[1]) * 100) + '%' : '0%';
        this.el.tabs.querySelector(`[data-cat="${cat}"]`).classList.toggle('ready', !!(front && front[2]));
      }
      const shown = {};
      for (const type of Object.keys(this.cards)) {
        const c = this.cards[type], d = DEFS[type];
        const missing = this.canBuild(g, type);
        const queue = q[d.cat];
        let n = 0;
        for (const it of queue) if (TYPES[it[0]] === type) n++;
        // only what can be built right now (or is already in the queue) is listed
        const vis = !missing || n > 0;
        if (c.vis !== vis) { c.vis = vis; c.el.style.display = vis ? '' : 'none'; }
        if (vis) shown[d.cat] = true;
        const front = queue[0];
        const isFront = front && TYPES[front[0]] === type;
        let state = '', prog = 0, cls = '';
        if (missing) { cls = 'locked'; state = 'Needs ' + missing; }
        else if (isFront && front[2]) { cls = 'ready'; state = 'READY'; prog = 1; }
        else if (isFront) { prog = front[1]; state = front[3] === 1 ? 'ON HOLD' : front[3] === 2 ? 'NEED ◈' : Math.floor(prog * 100) + '%'; cls = front[3] ? 'hold' : 'building'; }
        else if (n) { cls = 'queued'; state = 'Queued'; }
        else if (g.st.credits < d.cost * 0.15) cls = 'poor';
        c.el.className = 'card ' + cls;
        c.prog.style.height = Math.floor(prog * 100) + '%';
        c.st.textContent = state;
        c.bd.textContent = n > 1 ? n : '';
        c.bd.style.display = n > 1 ? 'block' : 'none';
      }
      this.tabHidden = {};
      for (const cat of CATS) {
        this.tabHidden[cat] = !shown[cat];
        const btn = this.el.tabs.querySelector(`[data-cat="${cat}"]`);
        if (btn.hidden !== !shown[cat]) btn.hidden = !shown[cat];
      }
      if (this.tabHidden[this.tab]) { const first = CATS.find((c) => shown[c]); if (first) this.setTab(first); }
      const none = !CATS.some((c) => shown[c]);
      this.emptyNote.classList.toggle('hidden', !none);
    }

    // -------------------------------------------------------------- players list
    buildPlayers(g) {
      this.el.players.innerHTML = '';
      this.playerEls = g.players.map((p) => {
        if (p.neutral) return null;
        const d = document.createElement('div');
        d.className = 'pl';
        d.innerHTML = `<i style="background:${PLAYER_COLORS[p.id].main}"></i><span></span><em></em>`;
        d.children[1].textContent = p.name + (p.id === g.me ? ' (you)' : '');
        this.el.players.appendChild(d);
        return d;
      });
    }

    // -------------------------------------------------------------- per-snapshot update
    update(g) {
      this.targetCredits = g.st.credits;
      const [prod, use] = g.st.pw;
      const low = use > prod;
      this.el.pwFill.style.width = Math.min(100, prod ? (use / prod) * 100 : 100) + '%';
      this.el.pwFill.className = low ? 'low' : use > prod * 0.8 ? 'warn' : '';
      this.el.pwText.textContent = `${use}/${prod}`;
      this.el.pwText.parentElement.classList.toggle('low', low);
      this.el.clock.textContent = mmss(g.time);
      const radarOn = (g.counts.radar || 0) > 0 && !low;
      this.radarOn = radarOn || !g.st.alive;
      this.el.radarOff.classList.toggle('hidden', this.radarOn);
      this.el.mini.classList.toggle('dim', !this.radarOn);
      this.renderBuild(g);
      // superweapon
      const has = (g.counts.uplink || 0) > 0;
      this.el.sw.classList.toggle('hidden', !has);
      if (has) {
        const ready = g.swReady;
        this.el.sw.className = 'sw' + (ready ? ' ready' : '');
        this.el.sw.innerHTML = `<div class="swbar"><i style="width:${Math.floor(g.swCharge * 100)}%"></i></div><b>ORBITAL LANCE</b><span>${ready ? 'READY - click to fire' : low ? 'LOW POWER' : Math.floor(g.swCharge * 100) + '%'}</span>`;
        this.el.sw.onclick = () => { if (g.swReady) { g.setMode('sw'); this.toast('Choose a target', 'info'); } };
      }
      // players
      if (this.playerEls && g.pl) g.players.forEach((p, i) => { if (!this.playerEls[i]) return; this.playerEls[i].classList.toggle('dead', !g.pl[i][0]); this.playerEls[i].children[2].textContent = g.pl[i][1] ? '☠' + g.pl[i][1] : ''; });
      this.renderSel(g);
    }
    selectionChanged(g) { this.selSig = ''; this.renderSel(g); }
    renderSel(g) {
      const ents = [];
      for (const id of g.sel) { const e = g.ents.get(id); if (e) ents.push(e); }
      let sig = ents.map((e) => e.id + ':' + Math.floor(e.hp / 10) + (e.repair ? 'r' : '')).join(',') + '|' + g.mode;
      if (sig === this.selSig) return;
      this.selSig = sig;
      const el = this.el.sel;
      if (!ents.length) { el.classList.add('hidden'); return; }
      el.classList.remove('hidden');
      const mine = ents.filter((e) => e.owner === g.me);
      if (ents.length === 1 && ents[0].isB) {
        const e = ents[0];
        const f = e.hp / e.mhp;
        const prodB = e.type === 'barracks' || e.type === 'factory';
        el.innerHTML = `<div class="one"><div class="nm"></div><div class="hpbar"><i style="width:${Math.floor(f * 100)}%;background:${f > 0.6 ? '#4ade80' : f > 0.3 ? '#facc15' : '#f43f5e'}"></i></div><div class="hp">${Math.floor(e.hp)} / ${e.mhp}</div><div class="desc"></div><div class="desc hint"></div><div class="acts"></div></div>`;
        el.querySelector('.nm').textContent = e.def.name;
        el.querySelector('.desc').textContent = e.def.desc || '';
        el.querySelector('.hint').textContent = prodB && e.owner === g.me ? 'Right-click the ground to set a rally point.' : g.players[e.owner].neutral ? 'Neutral structure: capture it with a Breach Engineer, or destroy it.' : '';
        const acts = el.querySelector('.acts');
        if (e.owner === g.me) {
          const b1 = document.createElement('button'); b1.textContent = e.repair ? '🔧 Repairing…' : '🔧 Repair (R)'; b1.onclick = () => g.send({ type: 'repair', id: e.id }); acts.appendChild(b1);
          const b2 = document.createElement('button'); b2.textContent = '$ Sell'; b2.onclick = () => g.send({ type: 'sell', id: e.id }); acts.appendChild(b2);
        }
        return;
      }
      const groups = {};
      let tot = 0, mx = 0;
      for (const e of mine) { groups[e.type] = (groups[e.type] || 0) + 1; tot += e.hp; mx += e.mhp; }
      let chips = '';
      for (const t of Object.keys(groups)) chips += `<div class="chip" title="${DEFS[t].name}"><span class="cnt">${groups[t]}</span><em>${DEFS[t].name}</em></div>`;
      el.innerHTML = `<div class="multi"><div class="chips">${chips}</div><div class="hpbar"><i style="width:${Math.floor((tot / Math.max(1, mx)) * 100)}%"></i></div><div class="acts"></div></div>`;
      const acts = el.querySelector('.acts');
      const add = (label, fn, on) => { const b = document.createElement('button'); b.textContent = label; b.onclick = fn; if (on) b.classList.add('active'); acts.appendChild(b); };
      add('■ Stop (S)', () => g.stopSel());
      if (mine.some((e) => e.def.wp)) add('⚔ Attack-move (A)', () => g.setMode(g.mode === 'amove' ? null : 'amove'), g.mode === 'amove');
      if (mine.some((e) => e.def.mcv)) add('⬢ Deploy (D)', () => g.deploySel());
    }

    // -------------------------------------------------------------- per-frame
    frame(dt) {
      const t = this.targetCredits == null ? 0 : this.targetCredits;
      const diff = t - this.dispCredits;
      this.dispCredits = Math.abs(diff) < 2 ? t : this.dispCredits + diff * Math.min(1, dt * 8);
      this.el.credits.textContent = fmt(this.dispCredits);
    }

    setResult(r) {
      this.result = r;
      this.renderResult();
      const nth = r.place + (['st', 'nd', 'rd'][r.place - 1] || 'th');
      const t = r.ranked ? `Ranked result: ${nth} of ${r.of} · rating ${r.before} → ${r.after} (${r.delta >= 0 ? '+' : ''}${r.delta})` : `Match finished: ${nth} of ${r.of}`;
      this.toast(t, r.won ? 'good' : 'info', 9000);
    }
    renderResult() {
      const el = $('endRating'), r = this.result;
      if (!r) { el.classList.add('hidden'); return; }
      el.classList.remove('hidden');
      const T = GA.T, pl = T('place {p} of {n}', { p: GA.ord(r.place), n: r.of });
      el.innerHTML = r.ranked
        ? `<span>${T('RANKED')}</span> ${pl} &nbsp;·&nbsp; ${T('rating')} <b>${r.before}</b> → <b>${r.after}</b> <em class="${r.delta >= 0 ? 'up' : 'down'}">${r.delta >= 0 ? '+' : ''}${r.delta}</em>`
        : `<span>${T('CASUAL')}</span> ${pl}${r.streak > 1 ? ' &nbsp;·&nbsp; ' + T('{n} win streak', { n: r.streak }) : ''}`;
    }
    gameOver(g, over) {
      const win = over.winnerTeam === g.myTeam && g.st.alive;
      if (g.local && !g.reported && GA.hooks && GA.hooks.localOver) { g.reported = true; GA.hooks.localOver({ won: win, seconds: over.time }); }
      const el = this.el.end;
      setTimeout(() => {
        if (this.game !== g) return;
        const st = g.st.stats || {};
        el.classList.remove('hidden');
        el.className = 'screen ' + (win ? 'win' : 'lose');
        $('endTitle').textContent = win ? 'VICTORY' : 'DEFEAT';
        $('endSub').textContent = win ? 'All enemy forces have been eliminated.' : 'Your base has fallen.';
        this.renderResult();
        $('endStats').innerHTML = `<div><b>${mmss(over.time)}</b><span>Time</span></div><div><b>${st.kills || 0}</b><span>Kills</span></div><div><b>${st.lost || 0}</b><span>Losses</span></div><div><b>${st.built || 0}</b><span>Built</span></div>`;
      }, 1800);
      GA.Audio.say(win ? 'Mission accomplished' : 'You have been defeated');
    }
  }

  GA.UI = UI;
})();

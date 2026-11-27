/* ─────────────────────────────────────────────
   🏢 피클 합동 비서실
   로그인 없이 도는 2D 오피스 + 실시간 협업(P2P)
   ───────────────────────────────────────────── */
(() => {
  'use strict';

  /* ───────── helpers ───────── */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const timeStr = ts => {
    const d = new Date(ts);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  };
  const LS = {
    get(k, def) { try { const v = localStorage.getItem(k); return v == null ? def : JSON.parse(v); } catch { return def; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} }
  };

  /* ───────── 상수 ───────── */
  const INITIALS = ['ㄱ','ㄴ','ㄷ','ㄹ','ㅁ','ㅂ','ㅅ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
  const COLORS = ['#e8d5b5','#ffc9a3','#f6c2c8','#bfe0c8','#bfd9f2','#cfc1f2','#f2e2a2','#d8d8e4'];
  const ZONES = {
    work:   { label: '작업실', x: [92, 306], y: [482, 556] },
    meet:   { label: '회의실', x: [398, 620], y: [512, 556] },
    lounge: { label: '라운지', x: [706, 928], y: [498, 558] }
  };
  const SAMPLES = [
    { id: 's-moa',  name: '모아', initial: 'ㅁ', color: '#bfe0c8', zone: 'meet',   isSample: true, online: true },
    { id: 's-haru', name: '하루', initial: 'ㅎ', color: '#bfd9f2', zone: 'lounge', isSample: true, online: true },
    { id: 's-koko', name: '코코', initial: 'ㄱ', color: '#f6c2c8', zone: 'work',   isSample: true, online: true }
  ];
  const BUBBLES = {
    work:   ['집중 중… ✏️', '정리 중이에요', '커피 한 모금 ☕', '메모 완료! 📝'],
    meet:   ['회의 중이에요', '같이 의논해요 💬', '안건 정리 중'],
    lounge: ['잠깐 쉬는 중 ☕', '여기 자리 좋다 🌿', '5분만 쉬어요'],
    me:     ['부르셨어요? 😊', '같이 해요!', '여기 있어요 ✋']
  };

  /* ───────── 상태 ───────── */
  const params = new URLSearchParams(location.search);
  const roomFromUrl = (params.get('room') || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 20);
  const newRoomCode = () => 'office-' + Math.random().toString(36).slice(2, 7);
  const room = roomFromUrl || LS.get('po:room', '') || newRoomCode();
  LS.set('po:room', room);
  if (!roomFromUrl) {
    try {
      const u = new URL(location.href);
      u.searchParams.set('room', room);
      history.replaceState(null, '', u.toString());
    } catch {}
  }

  const savedIdentity = LS.get('po:identity', null);
  const firstVisit = !savedIdentity;

  const app = {
    room,
    roomName: '우리 사무실',
    roomAt: 0,
    me: savedIdentity || {
      id: uid(),
      name: '',
      initial: INITIALS[Math.floor(Math.random() * INITIALS.length)],
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      zone: 'work'
    },
    members: {},
    messages: [],
    tasks: [],
    connection: LS.get('po:connection', 'auto'),
    firebaseUrl: LS.get('po:firebase', ''),
    samplesOn: true,
    theme: LS.get('po:theme', 'light')
  };
  app.me.id = app.me.id || uid();
  app.me.zone = app.me.zone || 'work';
  if (!app.me.name) app.me.name = roomFromUrl ? '' : '크리';
  if (roomFromUrl && firstVisit && app.me.name === '크리' && app.me.initial === 'ㅋ') {
    // 남이 보낸 초대로 들어온 경우: 내 피클을 새로 고르게
    app.me.name = '';
    app.me.initial = INITIALS[Math.floor(Math.random() * INITIALS.length)];
    app.me.color = COLORS[Math.floor(Math.random() * COLORS.length)];
  }

  const stateKey = 'po:room.' + room;
  const savedRoom = LS.get(stateKey, null);
  if (savedRoom) {
    app.roomName = savedRoom.roomName || app.roomName;
    app.roomAt = savedRoom.roomAt || 0;
    app.messages = Array.isArray(savedRoom.messages) ? savedRoom.messages : [];
    app.tasks = Array.isArray(savedRoom.tasks) ? savedRoom.tasks : [];
  }

  /* ───────── DOM refs ───────── */
  const stage = $('#stage');
  const stageWrap = $('#stageWrap');
  const avatarLayer = $('#avatarLayer');
  const msgList = $('#msgList');
  const chatInput = $('#chatInput');
  const chatForm = $('#chatForm');
  const mentionPop = $('#mentionPop');
  const typingLine = $('#typingLine');
  const newMsgChip = $('#newMsgChip');

  /* ───────── 테마 ───────── */
  function applyTheme(t) {
    app.theme = t;
    document.documentElement.dataset.theme = t;
    $('#themeBtn').textContent = t === 'dark' ? '☀️' : '🌙';
    $('meta[name="theme-color"]').setAttribute('content', t === 'dark' ? '#191722' : '#f6f3ec');
    LS.set('po:theme', t);
  }
  applyTheme(app.theme);

  /* ───────── 스테이지 스케일 / 모바일 카메라 ───────── */
  function fitStage() {
    const w = stageWrap.clientWidth, h = stageWrap.clientHeight;
    if (!w || !h) return;
    const ratio = w / h;
    let s, tx = 0, ty = 0;
    if (ratio >= 1.15) {
      s = Math.min(w / 1000, h / 620);
    } else {
      // 좁은 화면: 방을 크게 보여 주고 내 피클 구역을 따라간다
      const viewH = 560;
      s = Math.min(h / viewH, w / 640);
      const half = (w / s) / 2;
      const z = ZONES[app.me.zone] || ZONES.work;
      const cx = (z.x[0] + z.x[1]) / 2;
      const centerX = clamp(cx, half + 26, 986 - half);
      tx = (500 - centerX) * s;
      ty = -(340 - 310) * s;
    }
    stage.style.transform = `translate(calc(-50% + ${tx.toFixed(1)}px), calc(-50% + ${ty.toFixed(1)}px)) scale(${s.toFixed(4)})`;
    stage.dataset.scale = s;
    stage.dataset.tx = tx;
  }
  new ResizeObserver(fitStage).observe(stageWrap);
  window.addEventListener('resize', fitStage);
  requestAnimationFrame(fitStage);

  /* ───────── 토스트 ───────── */
  let toastTimer;
  function toast(text, ms = 2200) {
    const t = $('#toast');
    t.textContent = text;
    t.hidden = false;
    requestAnimationFrame(() => t.classList.add('show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      t.classList.remove('show');
      setTimeout(() => { t.hidden = true; }, 260);
    }, ms);
  }
  function copy(text, okMsg = '복사했어요!') {
    const done = () => toast(okMsg);
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done).catch(() => fallback());
    } else fallback();
    function fallback() {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch { toast('복사가 안 됐어요. 길게 눌러 복사해 주세요.'); }
      ta.remove();
    }
  }

  /* ───────── 저장 ───────── */
  let saveTimer;
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      LS.set(stateKey, {
        roomName: app.roomName,
        roomAt: app.roomAt,
        messages: app.messages.slice(-250),
        tasks: app.tasks
      });
      LS.set('po:identity', app.me);
    }, 180);
  }

  /* ───────── 동기화 ───────── */
  const Net = {
    bc: null,
    client: null,
    topic: '',
    fbBase: '',
    fbTimer: null,
    fbPushTimer: null,
    lastTypingSent: 0,
    lastSnapshot: 0,

    start() {
      this.stop();
      try {
        this.bc = new BroadcastChannel('pickle-office:' + app.room);
        this.bc.onmessage = e => this.receive(e.data);
      } catch {}
      if (app.connection === 'local') { setConn('local', '이 브라우저에서만'); return; }
      if (app.connection === 'firebase') { this.startFirebase(); return; }
      this.startStream();
    },

    restart() { this.stop(); this.start(); },

    stop() {
      if (this.bc) { try { this.bc.close(); } catch {} this.bc = null; }
      if (this.client) { try { this.client.end(true); } catch {} this.client = null; }
      if (this.fbTimer) { clearInterval(this.fbTimer); this.fbTimer = null; }
    },

    /* ---- 공개 MQTT 브로커(WebSocket)로 방 단위 실시간 공유, 로그인 없음 ---- */
    startStream() {
      if (typeof mqtt === 'undefined') { setConn('local', '실시간 연결을 못 불러왔어요'); return; }
      setConn('connecting', '연결 중…');
      this.topic = 'pickleoffice/v1/' + hash(app.room);
      let client;
      try {
        client = mqtt.connect('wss://broker.emqx.io:8084/mqtt', {
          clientId: 'po_' + Math.random().toString(16).slice(2, 10),
          keepalive: 30,
          clean: true,
          reconnectPeriod: 4000,
          connectTimeout: 9000
        });
      } catch { setConn('local', '연결이 안 돼 로컬로 저장 중'); return; }
      this.client = client;

      client.on('connect', () => {
        if (this.client !== client) return;
        setConn('online', '친구 피클과 연결됨');
        client.subscribe(this.topic, { qos: 0 }, () => {
          // 들어왔다는 인사 + 지금까지의 상태 공유
          this.send({ members: [selfMember()], messages: app.messages.slice(-120), tasks: app.tasks });
          this.send({ hello: app.me.id });
        });
      });
      client.on('message', (topic, payload) => {
        try { this.receive(JSON.parse(payload.toString())); } catch {}
      });
      client.on('reconnect', () => setConn('connecting', '다시 연결하는 중…'));
      client.on('close', () => setConn('local', '연결이 끊겨 다시 시도 중'));
      client.on('error', () => { if (this.client === client) setConn('local', '연결이 끊겨 다시 시도 중'); });
    },

    /* ---- Firebase RTDB (선택, REST만 사용) ---- */
    startFirebase() {
      const url = (app.firebaseUrl || '').trim().replace(/\/+$/, '');
      if (!/^https:\/\//.test(url)) { setConn('local', 'Firebase 주소를 확인해 주세요'); return; }
      this.fbBase = url + '/pickleOffice/' + encodeURIComponent(app.room);
      setConn('connecting', 'Firebase 연결 중…');
      const pull = async () => {
        try {
          const r = await fetch(this.fbBase + '.json');
          if (!r.ok) throw new Error(r.status);
          const data = await r.json();
          if (data) mergeAll(data);
          setConn('online', 'Firebase 연결됨');
        } catch { setConn('local', 'Firebase 연결 실패 · 로컬 저장 중'); }
      };
      pull();
      this.fbTimer = setInterval(pull, 4000);
    },
    fbPush() {
      if (app.connection !== 'firebase' || !this.fbBase) return;
      clearTimeout(this.fbPushTimer);
      this.fbPushTimer = setTimeout(async () => {
        try {
          await fetch(this.fbBase + '.json', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(snapshot())
          });
        } catch {}
      }, 900);
    },

    /* ---- 보내기 ---- */
    send(patch) {
      patch.t = 'patch';
      patch.from = app.me.id;
      if (this.bc) { try { this.bc.postMessage(patch); } catch {} }
      if (app.connection === 'firebase') { this.fbPush(); return; }
      if (this.client && this.client.connected) {
        try { this.client.publish(this.topic, JSON.stringify(patch), { qos: 0 }); } catch {}
      }
    },
    sayTyping() {
      if (app.connection !== 'auto') return;
      if (!this.client || !this.client.connected) return;
      const now = Date.now();
      if (now - this.lastTypingSent < 1400) return;
      this.lastTypingSent = now;
      this.send({ typing: { id: app.me.id, name: app.me.name, at: now } });
    },
    receive(d) {
      if (!d || typeof d !== 'object') return;
      if (d.t === 'patch') {
        if (d.messages || d.tasks || d.members || d.roomName) mergeAll(d);
        if (d.typing && d.from !== app.me.id) showTyping(d.typing);
        if (d.hello && d.from !== app.me.id) {
          setTimeout(() => this.send({ members: [selfMember()], messages: app.messages.slice(-60), tasks: app.tasks }), 300);
        }
        return;
      }
      if (d.typing) { showTyping(d.typing); return; }
      mergeAll(d);
    }
  };


  function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
  }

  function setConn(state, text) {
    const pill = $('#connPill');
    pill.dataset.state = state;
    $('#connText').textContent = text;
    updateBadge();
  }

  /* ───────── 상태 병합 ───────── */
  function snapshot() {
    return {
      v: 1,
      roomName: app.roomName,
      roomAt: app.roomAt,
      members: [selfMember(), ...Object.values(app.members)].filter(m => m.id !== app.me.id),
      messages: app.messages.slice(-200),
      tasks: app.tasks
    };
  }

  function mergeAll(s) {
    if (!s || typeof s !== 'object') return;
    let changed = false;
    if (s.roomName && (s.roomAt || 0) > (app.roomAt || 0)) {
      app.roomName = String(s.roomName).slice(0, 24);
      app.roomAt = s.roomAt; changed = true;
    }
    (s.members || []).forEach(m => {
      if (!m || !m.id || m.id === app.me.id) return;
      const cur = app.members[m.id];
      if (!cur || (m.lastSeen || 0) >= (cur.lastSeen || 0)) {
        app.members[m.id] = {
          id: m.id, name: String(m.name || '피클').slice(0, 10),
          initial: String(m.initial || 'ㅍ').slice(0, 2),
          color: /^#[0-9a-f]{3,8}$/i.test(m.color || '') ? m.color : '#cfc1f2',
          zone: ZONES[m.zone] ? m.zone : 'work',
          lastSeen: m.lastSeen || Date.now()
        };
        changed = true;
      }
    });
    if (Array.isArray(s.messages)) {
      const ids = new Set(app.messages.map(m => m.id));
      s.messages.forEach(m => {
        if (!m || !m.id || ids.has(m.id)) return;
        ids.add(m.id);
        app.messages.push(m);
        changed = true;
      });
      if (changed) app.messages.sort((a, b) => (a.at || 0) - (b.at || 0));
    }
    if (Array.isArray(s.tasks)) {
      s.tasks.forEach(t => {
        if (!t || !t.id) return;
        const i = app.tasks.findIndex(x => x.id === t.id);
        if (i < 0) { app.tasks.push(t); changed = true; }
        else if ((t.updatedAt || 0) > (app.tasks[i].updatedAt || 0)) { app.tasks[i] = t; changed = true; }
      });
    }
    if (changed) { persist(); renderAll(); }
  }

  function selfMember() {
    return {
      id: app.me.id, name: app.me.name || '크리', initial: app.me.initial,
      color: app.me.color, zone: app.me.zone, lastSeen: Date.now()
    };
  }

  /* ───────── 메시지 ───────── */
  function pushMessage(m) {
    app.messages.push(m);
    app.messages = app.messages.slice(-300);
    persist();
    renderChat(true);
    Net.send({ messages: [m] });
  }

  function sendSystem(text) {
    pushMessage({ id: uid(), sys: true, text, at: Date.now() });
  }

  function sendChat(text) {
    const members = Object.values(app.members);
    const mention = members.find(m => text.includes('@' + m.name));
    if (mention) {
      // 실제 피클이 있을 때는 살짝 반응을 준다
      setTimeout(() => showTyping({ id: mention.id, name: mention.name, at: Date.now() }), 600);
    }
    pushMessage({
      id: uid(), authorId: app.me.id, name: app.me.name || '크리',
      initial: app.me.initial, color: app.me.color, text, at: Date.now()
    });
  }

  /* ───────── 렌더: 헤더/배지 ───────── */
  function onlineOthers() {
    return Object.values(app.members).filter(m => Date.now() - (m.lastSeen || 0) < 35000);
  }
  function updateBadge() {
    const others = onlineOthers();
    const solo = others.length === 0;
    const n = others.length;
    $('#badgeText').textContent = solo
      ? (app.me.name || '크리') + ' 혼자 있는 중'
      : `${app.me.name || '크리'} + ${n}명 함께`;
    $('#liveDot').classList.toggle('solo', solo);
  }

  function renderHeader() {
    $('#roomChipName').textContent = app.roomName;
    document.title = (app.roomName || '피클 합동 비서실') + ' · 🏢 피클 합동 비서실';
    $('#roomCodeSmall').textContent = app.room;
    $('#roomCodeBig').textContent = app.room.toUpperCase();
    const others = onlineOthers();
    $('#chatSub').textContent = others.length
      ? `${others.length + 1}명이 같이 쓰는 중`
      : `${app.me.name || '크리'} 혼자 · 초대하면 같이 써요`;
    $('#membersSub').textContent = `지금 ${others.length + 1}명`;
    $('#roomNameInput').value = app.roomName;
    $$('.zone-jump button').forEach(b => b.classList.toggle('on', b.dataset.zone === app.me.zone));
    updateBadge();
  }

  /* ───────── 렌더: 채팅 ───────── */
  let chatBuilt = -1;
  let chatRoom = '';

  function renderChat(force) {
    const msgs = app.messages;
    if (force || chatRoom !== app.room || chatBuilt < 0) {
      msgList.innerHTML = '';
      chatBuilt = 0;
      chatRoom = app.room;
    }
    // 새 메시지만 덧붙임 (append-only)
    if (msgs.length < chatBuilt) { msgList.innerHTML = ''; chatBuilt = 0; }
    const nearBottom = msgList.scrollHeight - msgList.scrollTop - msgList.clientHeight < 120;
    for (let i = chatBuilt; i < msgs.length; i++) {
      msgList.appendChild(messageNode(msgs[i]));
    }
    chatBuilt = msgs.length;
    if (nearBottom) msgList.scrollTop = msgList.scrollHeight;
  }

  function messageNode(m) {
    if (m.sys) {
      const d = document.createElement('div');
      d.className = 'sysmsg';
      d.textContent = m.text;
      return d;
    }
    const mine = m.authorId === app.me.id;
    const el = document.createElement('div');
    el.className = 'msg' + (mine ? ' mine' : '');
    el.innerHTML = `
      <div class="avatar-dot" style="background:${esc(m.color || '#cfc1f2')}">${esc(m.initial || 'ㅍ')}</div>
      <div class="msg-body">
        <div class="msg-meta"><b>${esc(m.name || '피클')}</b><span>${timeStr(m.at)}</span></div>
        <div class="bubble">${renderText(m.text)}</div>
      </div>`;
    return el;
  }

  function renderText(text) {
    let html = esc(text);
    const names = Array.from(new Set([
      app.me.name,
      ...Object.values(app.members).map(m => m.name),
      ...SAMPLES.map(s => s.name)
    ].filter(Boolean))).sort((a, b) => b.length - a.length);
    if (names.length) {
      const re = new RegExp('@(' + names.map(escRe).join('|') + ')', 'g');
      html = html.replace(re, '<mark class="mention">@$1</mark>');
    }
    return html;
  }

  let typingHideAt = 0;
  function showTyping(t) {
    if (!t || t.id === app.me.id) return;
    if (Date.now() - t.at > 6000) return;
    typingHideAt = Date.now() + 2800;
    typingLine.hidden = false;
    typingLine.innerHTML = `<b>${esc(t.name || '피클')}</b> 입력 중<span class="dots"><i></i><i></i><i></i></span>`;
  }
  setInterval(() => {
    if (typingHideAt && Date.now() > typingHideAt) { typingLine.hidden = true; typingHideAt = 0; }
  }, 700);

  /* ───────── 렌더: 업무 보드 ───────── */
  function renderBoard() {
    const list = $('#taskList');
    const live = app.tasks.filter(t => !t.deleted);
    const done = live.filter(t => t.done).length;
    $('#progressPill').textContent = `${done} / ${live.length}`;
    $('#progressBar').style.width = live.length ? Math.round(done / live.length * 100) + '%' : '0%';
    $('#boardSub').textContent = live.length
      ? (done === live.length ? '오늘 할 일 끝! 🎉' : `${live.length - done}개 남았어요`)
      : '오늘의 할 일을 같이 나눠요';

    if (!live.length) {
      list.innerHTML = `<div class="empty"><span class="e-emoji">🗒️</span>아직 할 일이 없어요.<br>위에 적으면 같이 볼 수 있어요.</div>`;
      return;
    }
    list.innerHTML = '';
    const sorted = live.slice().sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0) || (a.at || 0) - (b.at || 0));
    sorted.forEach(t => {
      const el = document.createElement('div');
      el.className = 'task' + (t.done ? ' done' : '');
      el.dataset.id = t.id;
      const color = t.assigneeColor || app.me.color;
      el.innerHTML = `
        <button class="check" aria-label="완료">${t.done ? '✓' : ''}</button>
        <div class="task-text">${esc(t.text)}</div>
        <div class="task-time">${timeStr(t.at || Date.now())}</div>
        <button class="task-del" aria-label="삭제">×</button>`;
      const meta = document.createElement('div');
      if (t.assignee) {
        meta.className = 'task-meta';
        meta.style.cssText = 'flex-basis:100%;order:3';
        meta.innerHTML = `<span class="assignee"><span class="dot" style="background:${esc(color)}"></span>${esc(t.assignee)}</span>`;
      }
      el.querySelector('.check').onclick = e => toggleTask(t.id, e.currentTarget);
      el.querySelector('.task-del').onclick = () => deleteTask(t.id);
      if (meta && meta.innerHTML) el.appendChild(meta);
      list.appendChild(el);
    });
  }

  function addTask(text, assignee) {
    const member = assignee ? findMemberByName(assignee) : null;
    const t = {
      id: uid(), text, at: Date.now(), updatedAt: Date.now(), done: false,
      assignee: assignee || '',
      assigneeColor: member ? member.color : (assignee === (app.me.name || '크리') ? app.me.color : '#cfc1f2'),
      by: app.me.name || '크리'
    };
    app.tasks.push(t);
    persist(); renderBoard();
    Net.send({ tasks: [t] });
  }

  function toggleTask(id, btn) {
    const t = app.tasks.find(x => x.id === id);
    if (!t) return;
    t.done = !t.done;
    t.updatedAt = Date.now();
    persist(); renderBoard();
    Net.send({ tasks: [t] });
    if (t.done && btn) confetti(btn);
  }

  function deleteTask(id) {
    const t = app.tasks.find(x => x.id === id);
    if (!t) return;
    t.deleted = true; t.updatedAt = Date.now();
    persist(); renderBoard();
    Net.send({ tasks: [t] });
  }

  function confetti(anchor) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const r = anchor.getBoundingClientRect();
    const colors = ['#7c5cff', '#ffc9a3', '#bfe0c8', '#bfd9f2', '#f6c2c8', '#f2e2a2'];
    for (let i = 0; i < 16; i++) {
      const p = document.createElement('div');
      p.className = 'confetti';
      p.style.cssText = `position:fixed;left:${r.left + r.width / 2}px;top:${r.top}px;background:${colors[i % colors.length]};z-index:80`;
      document.body.appendChild(p);
      const dx = (Math.random() - .5) * 160, dy = -40 - Math.random() * 90;
      p.animate([
        { transform: 'translate(0,0) rotate(0)', opacity: 1 },
        { transform: `translate(${dx}px,${dy}px) rotate(${Math.random() * 360}deg)`, opacity: 1, offset: .55 },
        { transform: `translate(${dx * 1.25}px,${-dy + 120}px) rotate(${Math.random() * 720}deg)`, opacity: 0 }
      ], { duration: 900 + Math.random() * 400, easing: 'cubic-bezier(.2,.7,.4,1)' })
        .onfinish = () => p.remove();
    }
  }

  /* ───────── 렌더: 멤버 ───────── */
  function findMemberByName(name) {
    if (name === (app.me.name || '크리')) return { name: app.me.name, color: app.me.color };
    return Object.values(app.members).find(m => m.name === name) || null;
  }

  function renderMembers() {
    const box = $('#memberList');
    box.innerHTML = '';
    const me = { id: app.me.id, name: app.me.name || '크리', initial: app.me.initial, color: app.me.color, zone: app.me.zone, isMe: true };
    const others = onlineOthers().sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    const offline = Object.values(app.members).filter(m => !others.includes(m));

    [me, ...others].forEach(m => box.appendChild(memberNode(m, true)));
    offline.forEach(m => box.appendChild(memberNode(m, false)));
    if (!others.length) {
      SAMPLES.forEach(s => {
        const el = memberNode(s, true);
        el.querySelector('.on-dot').classList.add('off');
        const badge = el.querySelector('.m-name');
        const b = document.createElement('span');
        b.className = 'badge-sample'; b.textContent = '샘플';
        badge.appendChild(b);
        box.appendChild(el);
      });
    }
    // 초대 드롭다운 갱신
    const sel = $('#taskAssignee');
    const cur = sel.value;
    sel.innerHTML = '<option value="">담당 없음</option>';
    [me, ...others].forEach(m => {
      const o = document.createElement('option');
      o.value = m.name; o.textContent = '@' + m.name;
      sel.appendChild(o);
    });
    if ([...sel.options].some(o => o.value === cur)) sel.value = cur;
  }

  function memberNode(m, online) {
    const el = document.createElement('div');
    el.className = 'member';
    el.innerHTML = `
      <div class="m-av" style="background:${esc(m.color)}">${esc(m.initial)}</div>
      <div class="m-info">
        <div class="m-name">${esc(m.name)}${m.isMe ? '<span class="badge-me">나</span>' : ''}</div>
        <div class="m-zone">${ZOONS(m.zone)} · ${online ? '지금 접속 중' : '잠시 자리 비움'}</div>
      </div>
      <span class="on-dot ${online ? '' : 'off'}"></span>`;
    return el;
  }
  const ZOONS = z => (ZONES[z] ? ZONES[z].label : '사무실');

  /* ───────── 렌더: 아바타 ───────── */
  const actors = new Map();
  let lastFrame = performance.now();

  function visibleMembers() {
    const me = { ...selfMember(), isMe: true, online: true };
    const others = onlineOthers();
    const list = [me, ...others];
    if (!others.length && app.samplesOn) SAMPLES.forEach(s => list.push({ ...s }));
    return list;
  }

  function actorEl(m) {
    const d = document.createElement('div');
    d.className = 'critter' + (m.isMe ? ' me' : '') + (m.isSample ? ' sample' : '');
    d.dataset.id = m.id;
    d.style.setProperty('--c', m.color);
    d.innerHTML = `
      <div class="bob">
        <div class="c-shadow"></div>
        <div class="c-body">
          <div class="c-ear l"></div><div class="c-ear r"></div>
          <div class="c-leaf"></div>
          <div class="c-sleeve l"></div><div class="c-sleeve r"></div>
          <div class="c-eye l"></div><div class="c-eye r"></div>
          <div class="c-blush l"></div><div class="c-blush r"></div>
          <div class="c-mouth"></div>
          <div class="c-letter">${esc(m.initial)}</div>
          <div class="c-foot l"></div><div class="c-foot r"></div>
        </div>
        <div class="c-name">${esc(m.name)}</div>
        <div class="c-bubble"></div>
      </div>`;
    d.addEventListener('click', () => poke(m));
    return d;
  }

  function syncActors() {
    const wanted = visibleMembers();
    const ids = new Set(wanted.map(w => w.id));
    for (const [id, a] of actors) {
      if (!ids.has(id)) { a.el.remove(); actors.delete(id); }
    }
    wanted.forEach(m => {
      let a = actors.get(m.id);
      if (!a) {
        const el = actorEl(m);
        avatarLayer.appendChild(el);
        const z = ZONES[m.zone] || ZONES.work;
        const x = rand(z.x[0], z.x[1]);
        const y = rand(z.y[0], z.y[1]);
        a = {
          id: m.id, el, x, y, tx: x, ty: y, zone: m.zone || 'work',
          pause: rand(0.2, 4), speed: m.isMe ? 26 : rand(18, 27), member: m
        };
        actors.set(m.id, a);
        place(a);
      } else {
        a.member = m;
        if (m.zone !== a.zone) {
          a.zone = m.zone;
          const z = ZONES[a.zone] || ZONES.work;
          a.tx = rand(z.x[0], z.x[1]);
          a.ty = rand(z.y[0], z.y[1]);
          a.pause = 0;
        }
      }
      // 이름/자음/색이 바뀌었을 수 있으니 갱신
      const nameEl = a.el.querySelector('.c-name');
      if (nameEl.textContent !== m.name) nameEl.textContent = m.name;
      const letterEl = a.el.querySelector('.c-letter');
      if (letterEl.textContent !== m.initial) letterEl.textContent = m.initial;
      a.el.style.setProperty('--c', m.color);
      a.el.classList.toggle('me', !!m.isMe);
      a.el.classList.toggle('sample', !!m.isSample);
    });
    updateBadge();
  }

  function place(a) {
    const s = 0.84 + (a.y - 470) / 104 * 0.22;
    a.el.style.transform = `translate3d(${a.x}px, ${a.y}px, 0) scale(${s.toFixed(3)})`;
    a.el.style.zIndex = String(Math.round(a.y));
  }

  function pickTarget(a) {
    const z = ZONES[a.zone] || ZONES.work;
    for (let i = 0; i < 8; i++) {
      const tx = rand(z.x[0], z.x[1]);
      const ty = rand(z.y[0], z.y[1]);
      let tooClose = false;
      for (const b of actors.values()) {
        if (b === a) continue;
        if (Math.abs(b.tx - tx) < 62 && Math.abs(b.ty - ty) < 34) { tooClose = true; break; }
      }
      a.tx = tx; a.ty = ty;
      if (!tooClose) break;
    }
  }

  function tick(now) {
    const dt = Math.min(0.06, (now - lastFrame) / 1000);
    lastFrame = now;
    for (const a of actors.values()) {
      if (a.pause > 0) { a.pause -= dt; continue; }
      const dx = a.tx - a.x, dy = a.ty - a.y;
      const d = Math.hypot(dx, dy);
      if (d < 1.5) {
        a.el.classList.remove('walking');
        a.pause = rand(1.4, 5.5);
        if (Math.random() < 0.4) autoBubble(a);
        pickTarget(a);
        continue;
      }
      a.x += dx / d * a.speed * dt;
      a.y += dy / d * a.speed * dt;
      a.el.classList.add('walking');
      place(a);
    }
    requestAnimationFrame(tick);
  }

  function rand(a, b) { return a + Math.random() * (b - a); }

  const bubbleTimers = new Map();
  function bubbleText(a, text, ms = 2400) {
    const el = a.el.querySelector('.c-bubble');
    if (!el) return;
    el.textContent = text;
    el.style.setProperty('--bs', '0px');
    el.classList.add('show');
    // 화면 밖으로 나가지 않게 살짝 밀어 준다
    const bw = el.offsetWidth || 80;
    let shift = 0;
    if (a.x - bw / 2 < 34) shift = 34 - (a.x - bw / 2);
    if (a.x + bw / 2 > 966) shift = 966 - (a.x + bw / 2);
    el.style.setProperty('--bs', Math.round(shift) + 'px');
    clearTimeout(bubbleTimers.get(a.id));
    bubbleTimers.set(a.id, setTimeout(() => el.classList.remove('show'), ms));
  }

  function autoBubble(a) {
    const pool = BUBBLES[a.zone] || BUBBLES.work;
    bubbleText(a, pool[Math.floor(Math.random() * pool.length)]);
  }

  function poke(m) {
    const a = actors.get(m.id);
    if (a) {
      bubbleText(a, m.isMe ? '저 여기 있어요! 😊' : (BUBBLES.me[Math.floor(Math.random() * BUBBLES.me.length)]), 2200);
      if (!m.isMe) {
        const x = a.x, y = a.y;
        a.pause = 1.6;
        a.tx = x; a.ty = y;
      }
    }
    switchTab('chat');
    const name = m.name || '피클';
    chatInput.value = (chatInput.value ? chatInput.value.replace(/\s*$/, ' ') : '') + '@' + name + ' ';
    chatInput.focus();
    resizeInput();
    toast(m.isMe ? '내 피클이에요 — 오늘도 화이팅!' : name + '에게 말을 걸어 보세요', 1600);
  }

  requestAnimationFrame(tick);

  // 가끔 저절로 말풍선
  setInterval(() => {
    if (document.hidden) return;
    const list = [...actors.values()];
    if (!list.length) return;
    const a = list[Math.floor(Math.random() * list.length)];
    if (a.pause > 0.4) autoBubble(a);
  }, 9000);

  /* ───────── 전체 렌더 ───────── */
  function renderAll() {
    renderHeader();
    renderChat(false);
    renderBoard();
    renderMembers();
    syncActors();
  }

  /* ───────── 탭 ───────── */
  function switchTab(name) {
    $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    $$('.panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + name));
    if (name === 'chat') {
      $('#chatDot').hidden = true;
      msgList.scrollTop = msgList.scrollHeight;
      setTimeout(resizeInput, 50);
    }
    if (name === 'board') $('#boardSub').textContent = $('#boardSub').textContent;
  }
  $$('.tab').forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));

  /* ───────── 채팅 입력 ───────── */
  function resizeInput() {
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(110, chatInput.scrollHeight) + 'px';
  }
  chatInput.addEventListener('input', () => { resizeInput(); updateMention(); Net.sayTyping(); });
  chatInput.addEventListener('keydown', e => {
    if (mentionOpen) {
      if (e.key === 'ArrowDown') { e.preventDefault(); moveMention(1); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); moveMention(-1); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); chooseMention(); return; }
      if (e.key === 'Escape') { closeMention(); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      chatForm.requestSubmit();
    }
  });

  chatForm.addEventListener('submit', e => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text) return;
    sendChat(text);
    chatInput.value = '';
    resizeInput();
    closeMention();
    msgList.scrollTop = msgList.scrollHeight;
  });

  $$('#emojiRow button').forEach(b => b.addEventListener('click', () => {
    chatInput.value += b.dataset.e;
    chatInput.focus();
    resizeInput();
  }));

  msgList.addEventListener('scroll', () => {
    if (msgList.scrollHeight - msgList.scrollTop - msgList.clientHeight < 60) newMsgChip.hidden = true;
  });
  newMsgChip.addEventListener('click', () => {
    msgList.scrollTop = msgList.scrollHeight;
    newMsgChip.hidden = true;
  });

  /* 멘션 자동완성 */
  let mentionOpen = false, mentionIndex = 0, mentionItems = [];
  function updateMention() {
    const text = chatInput.value;
    const caret = chatInput.selectionStart;
    const before = text.slice(0, caret);
    const m = before.match(/@([^\s@]{0,10})$/);
    if (!m) return closeMention();
    const q = m[1];
    const all = [{ name: app.me.name || '크리', initial: app.me.initial, color: app.me.color },
      ...onlineOthers().map(x => ({ name: x.name, initial: x.initial, color: x.color })),
      ...SAMPLES.map(x => ({ name: x.name, initial: x.initial, color: x.color }))];
    const seen = new Set();
    mentionItems = all.filter(p => {
      if (seen.has(p.name)) return false;
      seen.add(p.name);
      return !q || p.name.startsWith(q);
    }).slice(0, 5);
    if (!mentionItems.length) return closeMention();
    mentionIndex = 0;
    mentionOpen = true;
    mentionPop.hidden = false;
    mentionPop.innerHTML = mentionItems.map((p, i) => `
      <button type="button" data-i="${i}" class="${i === 0 ? 'sel' : ''}">
        <span class="avatar-dot" style="background:${esc(p.color)}">${esc(p.initial)}</span>${esc(p.name)}
      </button>`).join('');
    $$('#mentionPop button').forEach(b => b.addEventListener('mousedown', e => {
      e.preventDefault();
      mentionIndex = Number(b.dataset.i);
      chooseMention();
    }));
  }
  function moveMention(d) {
    mentionIndex = (mentionIndex + d + mentionItems.length) % mentionItems.length;
    $$('#mentionPop button').forEach((b, i) => b.classList.toggle('sel', i === mentionIndex));
  }
  function chooseMention() {
    const p = mentionItems[mentionIndex];
    if (!p) return closeMention();
    const text = chatInput.value;
    const caret = chatInput.selectionStart;
    const before = text.slice(0, caret).replace(/@([^\s@]{0,10})$/, '@' + p.name + ' ');
    chatInput.value = before + text.slice(caret);
    chatInput.selectionStart = chatInput.selectionEnd = before.length;
    closeMention();
    resizeInput();
    chatInput.focus();
  }
  function closeMention() {
    mentionOpen = false;
    mentionPop.hidden = true;
  }

  /* ───────── 업무 보드 이벤트 ───────── */
  $('#taskForm').addEventListener('submit', e => {
    e.preventDefault();
    const input = $('#taskInput');
    const text = input.value.trim();
    if (!text) return;
    addTask(text, $('#taskAssignee').value);
    input.value = '';
    input.focus();
  });

  /* ───────── 방 이름 ───────── */
  $('#roomNameInput').addEventListener('change', e => {
    const v = e.target.value.trim().slice(0, 24) || '우리 사무실';
    setRoomName(v);
  });
  $('#roomChip').addEventListener('click', () => { switchTab('members'); setTimeout(() => $('#roomNameInput').focus(), 60); });

  function setRoomName(v) {
    app.roomName = v;
    app.roomAt = Date.now();
    persist(); renderHeader();
    Net.send({ roomName: app.roomName, roomAt: app.roomAt });
    toast('방 이름을 "' + v + '"(으)로 바꿨어요');
  }

  /* ───────── 모달 ───────── */
  function openModal(id) {
    const m = $('#' + id);
    m.hidden = false;
    document.body.style.overflow = 'hidden';
    const f = m.querySelector('input, button');
    if (f && id !== 'modalInvite') setTimeout(() => f.focus(), 80);
  }
  function closeModal(el) {
    el.hidden = true;
    document.body.style.overflow = '';
  }
  $$('.modal-backdrop').forEach(b => {
    b.addEventListener('mousedown', e => { if (e.target === b) closeModal(b); });
    $$('[data-close]', b).forEach(x => x.addEventListener('click', () => closeModal(b)));
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      const open = $$('.modal-backdrop').find(b => !b.hidden);
      if (open) closeModal(open);
      closeMention();
    }
  });

  /* 초대 */
  function inviteUrl() {
    const u = new URL(location.href);
    u.search = '?room=' + encodeURIComponent(app.room);
    u.hash = '';
    return u.toString();
  }
  function inviteMessage() {
    return `🏢 피클 합동 비서실에 초대해요!\n링크만 열면 바로 들어와요 👉 ${inviteUrl()}\n들어가서 내 피클 이름·자음·색만 고르면 끝이에요. (방 코드: ${app.room.toUpperCase()})`;
  }
  function openInvite() {
    $('#inviteUrl').value = inviteUrl();
    $('#roomCodeBig').textContent = app.room.toUpperCase();
    openModal('modalInvite');
  }
  $('#inviteBtn').addEventListener('click', openInvite);
  $('#inviteCardBtn').addEventListener('click', openInvite);
  $('#chatInviteMini').addEventListener('click', openInvite);
  $('#membersInviteMini').addEventListener('click', openInvite);
  $('#copyUrlBtn').addEventListener('click', () => copy(inviteUrl(), '초대 링크를 복사했어요!'));
  $('#copyMsgBtn').addEventListener('click', () => copy(inviteMessage(), '초대 문구를 복사했어요! 카톡에 붙여넣기 하세요'));
  $('#inviteUrl').addEventListener('click', e => e.target.select());
  $('#copyCodeBtn').addEventListener('click', () => copy(app.room, '방 코드를 복사했어요'));

  /* 설정 */
  function chipRow(box, list, current, onPick) {
    box.innerHTML = '';
    list.forEach(v => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip' + (v === current ? ' sel' : '');
      b.textContent = v;
      b.onclick = () => { $$('.chip', box).forEach(x => x.classList.remove('sel')); b.classList.add('sel'); onPick(v); };
      box.appendChild(b);
    });
  }
  function swatchRow(box, current, onPick) {
    box.innerHTML = '';
    COLORS.forEach(c => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch' + (c === current ? ' sel' : '');
      b.style.background = c;
      b.setAttribute('aria-label', '색 ' + c);
      b.onclick = () => { $$('.swatch', box).forEach(x => x.classList.remove('sel')); b.classList.add('sel'); onPick(c); };
      box.appendChild(b);
    });
  }

  let draft = null;
  function openSettings() {
    draft = { name: app.me.name || '크리', initial: app.me.initial, color: app.me.color, theme: app.theme, connection: app.connection, firebaseUrl: app.firebaseUrl };
    $('#setName').value = draft.name;
    chipRow($('#initialChips'), INITIALS, draft.initial, v => { draft.initial = v; paintPreview(); });
    swatchRow($('#colorSwatches'), draft.color, v => { draft.color = v; paintPreview(); });
    $('#setTheme').value = draft.theme;
    $('#setConn').value = draft.connection;
    $('#setFirebase').value = draft.firebaseUrl;
    $('#fbField').hidden = draft.connection !== 'firebase';
    paintPreview();
    openModal('modalSettings');
  }
  function paintPreview() {
    const p = $('#mePreview');
    p.style.setProperty('--c', draft ? draft.color : app.me.color);
    $('#mePreviewLetter').textContent = draft ? draft.initial : app.me.initial;
    $('#mePreviewName').textContent = (draft ? draft.name : app.me.name) || '크리';
  }
  $('#settingsBtn').addEventListener('click', openSettings);
  $('#setName').addEventListener('input', e => { draft.name = e.target.value; paintPreview(); });
  $('#setConn').addEventListener('change', e => {
    draft.connection = e.target.value;
    $('#fbField').hidden = draft.connection !== 'firebase';
  });
  $('#setTheme').addEventListener('change', e => {
    draft.theme = e.target.value;
    applyTheme(draft.theme);
  });
  $('#saveSettings').addEventListener('click', () => {
    const name = (draft.name || '').trim().slice(0, 10) || '크리';
    app.me.name = name;
    app.me.initial = draft.initial;
    app.me.color = draft.color;
    app.me.id = app.me.id;
    LS.set('po:identity', app.me);
    app.connection = draft.connection;
    app.firebaseUrl = (draft.firebaseUrl || '').trim();
    LS.set('po:connection', app.connection);
    LS.set('po:firebase', app.firebaseUrl);
    persist();
    renderAll();
    Net.send({ members: [selfMember()] });
    Net.restart();
    closeModal($('#modalSettings'));
    toast('저장했어요 · ' + name + ' ' + draft.initial);
  });
  $('#resetDataBtn').addEventListener('click', () => {
    if (!confirm('이 기기에 저장된 대화·업무 기록을 지울까요? (다른 피클의 기록은 그대로예요)')) return;
    Object.keys(localStorage).filter(k => k.startsWith('po:')).forEach(k => LS.del(k));
    location.href = location.pathname + '?room=' + app.room;
  });

  /* 내 피클 첫 설정 */
  let profDraft = { name: app.me.name || '', initial: app.me.initial, color: app.me.color };
  function paintProf() {
    $('#profPreview').style.setProperty('--c', profDraft.color);
    $('#profPreviewLetter').textContent = profDraft.initial;
    $('#profPreviewName').textContent = profDraft.name || '내 피클';
  }
  function openProfile() {
    $('#profName').value = profDraft.name;
    chipRow($('#profChips'), INITIALS, profDraft.initial, v => { profDraft.initial = v; paintProf(); });
    swatchRow($('#profSwatches'), profDraft.color, v => { profDraft.color = v; paintProf(); });
    paintProf();
    openModal('modalProfile');
    $('#modalProfile').querySelector('[data-close]')?.remove();
  }
  $('#profName').addEventListener('input', e => { profDraft.name = e.target.value; paintProf(); });
  $('#profDone').addEventListener('click', () => {
    const name = (profDraft.name || '').trim().slice(0, 10);
    if (!name) {
      toast('내 피클 이름을 먼저 적어 주세요');
      $('#profName').focus();
      return;
    }
    app.me.name = name;
    app.me.initial = profDraft.initial;
    app.me.color = profDraft.color;
    LS.set('po:identity', app.me);
    persist(); renderAll();
    Net.send({ members: [selfMember()] });
    Net.start();
    closeModal($('#modalProfile'));
    toast('환영해요, ' + name + '! 🎉');
    const a = actors.get(app.me.id);
    if (a) bubbleText(a, '안녕하세요! 😊', 2600);
  });

  /* ───────── 구역 이동 ───────── */
  function moveMe(zone) {
    if (!ZONES[zone]) return;
    app.me.zone = zone;
    LS.set('po:identity', app.me);
    const a = actors.get(app.me.id);
    if (a) {
      a.zone = zone;
      const zz = ZONES[zone];
      a.tx = (zz.x[0] + zz.x[1]) / 2;
      a.ty = (zz.y[0] + zz.y[1]) / 2;
      a.pause = 0;
      bubbleText(a, ZOONS(zone) + '(으)로 갑니다~', 1800);
    }
    Net.send({ members: [selfMember()] });
    fitStage();
    $$('.zone-jump button').forEach(b => b.classList.toggle('on', b.dataset.zone === zone));
    toast('내 피클이 ' + ZOONS(zone) + '(으)로 이동했어요');
  }

  $$('[data-zone]').forEach(el => {
    el.style.cursor = 'pointer';
    el.addEventListener('click', () => moveMe(el.dataset.zone));
  });

  /* ───────── 힌트 닫기 ───────── */
  function hideHint() { $('#stageHint').hidden = true; LS.set('po:hintClosed', 1); }
  $('#hintClose').addEventListener('click', hideHint);
  if (LS.get('po:hintClosed', 0)) $('#stageHint').hidden = true;
  setTimeout(() => { if (!$('#stageHint').hidden) { $('#stageHint').style.opacity = '0'; setTimeout(hideHint, 400); } }, 14000);

  $('#themeBtn').addEventListener('click', () => {
    applyTheme(app.theme === 'dark' ? 'light' : 'dark');
  });

  /* ───────── 시작 ───────── */
  function seedIfEmpty() {
    if (app.messages.length || app.tasks.length) return;
    const now = Date.now();
    app.messages.push(
      { id: uid(), sys: true, text: '🏢 피클 합동 비서실이 문을 열었어요.', at: now - 1000 * 60 * 3 },
      {
        id: uid(), authorId: app.me.id, name: app.me.name || '크리',
        initial: app.me.initial, color: app.me.color,
        text: '안녕하세요, 저는 ' + (app.me.name || '크리') + '예요! 오늘 할 일은 업무 보드에 적어 두면 제가 같이 챙길게요 ✨',
        at: now - 1000 * 60 * 2
      },
      { id: uid(), sys: true, text: '친구 피클을 부르려면 오른쪽 위 👥 피클 초대하기를 눌러요.', at: now - 1000 * 60 }
    );
    app.tasks.push(
      { id: uid(), text: '합동 비서실 둘러보기', at: now, updatedAt: now, done: true, assignee: app.me.name || '크리', assigneeColor: app.me.color },
      { id: uid(), text: '친구 피클에게 초대 링크 보내기', at: now + 1, updatedAt: now + 1, done: false, assignee: app.me.name || '크리', assigneeColor: app.me.color }
    );
    persist();
  }

  // 멤버 오프라인 판정
  setInterval(() => {
    const before = onlineOthers().length;
    renderMembers();
    if (onlineOthers().length !== before) { renderAll(); }
    else updateBadge();
  }, 6000);

  // 하트비트
  setInterval(() => {
    Net.send({ members: [selfMember()] });
  }, 12000);

  // 변경사항 저장
  window.addEventListener('beforeunload', () => {
    LS.set(stateKey, { roomName: app.roomName, roomAt: app.roomAt, messages: app.messages.slice(-250), tasks: app.tasks });
  });

  // 문서 제목 알림
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { $('#chatDot').hidden = true; renderHeader(); }
  });

  /* 초기화 */
  seedIfEmpty();
  renderAll();
  Net.start();
  if (firstVisit) {
    setTimeout(openProfile, 350);
  } else if (!LS.get('po:welcomed', 0)) {
    LS.set('po:welcomed', 1);
    setTimeout(() => toast('사무실에 오신 걸 환영해요! 👋', 2400), 700);
  }
  if (roomFromUrl && !firstVisit) {
    setTimeout(() => toast('초대받은 사무실「' + app.roomName + '」에 들어왔어요', 2600), 600);
  }
})();

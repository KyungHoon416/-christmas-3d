// Application shell: HUD layout, dialogs and wiring between net, world, voice and audio.
import * as THREE from 'three';
import { REGIONS, getRegion } from '../../../shared/regions.js';
import { APPEARANCE_OPTIONS, APPEARANCE_DEFAULT, INTERACT_RADIUS, NICK_RE, DUEL } from '../../../shared/constants.js';
import { Engine } from '../engine/engine.js';
import { Input } from '../engine/input.js';
import { World } from '../game/world.js';
import { Net } from '../net/net.js';
import { RoomNet } from '../net/roomNet.js';

// eslint-disable-next-line no-undef
const DEMO = typeof __DEMO__ !== 'undefined' && __DEMO__;
import { Voice } from '../net/voice.js';
import { CarolPlayer } from '../audio/carol.js';
import { DuelController } from '../game/duel.js';
import { Chat } from './chat.js';
import { Minimap, drawRegion } from './minimap.js';
import { el, $, $$, esc, avatar, toast, modal, confirmDialog } from './dom.js';
import { icon } from './icons.js';

const REQ_LABEL = { duel: '1:1 눈싸움 대결 신청', friend: '친구 신청', couple: '커플 신청', holdHand: '손잡기 요청', walk: '함께 걷기 요청', hug: '포옹 요청', party: '파티 초대', invite: '같은 장소로 초대', voice: '음성 대화 초대' };
const REQ_ERR = { unsupported: '이 상대와는 이 기능을 쓸 수 없어요', far: '상대가 너무 멀리 있어요', busy: '이미 손을 잡고 있거나 상대가 다른 상호작용 중입니다', adult: '커플 기능은 성인 확인을 한 사용자끼리만 이용할 수 있습니다', taken: '이미 커플 상태인 사용자입니다', notfriend: '커플 신청은 친구에게만 할 수 있습니다', offline: '상대가 오프라인입니다', blocked: '차단 관계인 사용자입니다', rate: '요청이 너무 잦습니다. 잠시 후 다시 시도하세요', pending: '이미 보낸 요청이 대기 중입니다', declined: '상대가 거절했습니다', expired: '요청 시간이 만료되었습니다', room: '같은 지역에 있어야 합니다', already: '이미 처리된 요청입니다', notfound: '사용자를 찾을 수 없습니다', full: '파티 인원이 가득 찼습니다' };
const EMOTE_LIST = [['wave', '👋', '인사'], ['heart', '💗', '하트'], ['cheer', '🙌', '환호'], ['bow', '🙇', '꾸벅'], ['sit', '🪑', '앉기'], ['dance', '💃', '춤']];

export class App {
  constructor() {
    this.root = document.getElementById('app');
    this.mobile = matchMedia('(pointer: coarse)').matches || window.innerWidth < 900;
    this.updateDeviceClasses();
    const params = new URLSearchParams(location.search);
    const savedQ = params.get('quality') || localStorage.getItem('cw.quality') || 'auto';
    this.qualitySetting = savedQ;
    const initialQ = savedQ === 'auto' ? (this.mobile ? 'low' : 'medium') : savedQ;
    this.engine = new Engine(document.getElementById('game'), { quality: initialQ });
    this.engine.isMobile = this.mobile;
    this.engine.autoQuality = savedQ === 'auto';
    if (params.get('maxfps')) this.engine.maxFps = +params.get('maxfps');
    this.engine.onQualityChange = (q) => toast(`성능을 위해 그래픽 품질을 '${q}'로 낮췄습니다`);
    this.input = new Input(this.engine.canvas, null);
    const wsUrl = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
    this.demo = DEMO;
    if (DEMO) localStorage.removeItem('cw.token'); // in-page server starts fresh each load
    this.net = DEMO ? new RoomNet() : new Net(wsUrl);
    this.self = null;
    this.social = { friends: [], incoming: [], blocked: [], couple: null, party: null };
    this.notifications = [];
    this.scores = new Map();
    this.labels = new Map();
    this.selected = null;
    this.world = new World(this.engine, this.input, this.net, {
      onSelectPlayer: (id, x, y) => (id ? this.openPlayerMenu(id, x, y) : this.closePlayerMenu()),
      onRemoteAdded: (r) => this.addLabel(r.id, r.nick),
      onRemoteRemoved: (r) => this.removeLabel(r.id),
      onFollowerTriedMove: () => this.hintRelease(),
      onFire: () => this.duel.fire(),
    });
    this.voice = new Voice(this.net, this.world, {
      onSpeaking: (id, on) => { this.labels.get(id)?.el.classList.toggle('speaking', on); if (id === this.self?.id) this.micBtn?.classList.toggle('speaking', on); },
      onState: () => this.updateVoiceButtons(),
      isBlocked: (id) => this.social.blocked.some((b) => b.id === id),
      onDuck: (on) => this.carol.setDuck(on),
    });
    this.carol = new CarolPlayer();
    this.duel = new DuelController(this);
    this.carol.onSong = (t) => { if (this.carolTitle) this.carolTitle.textContent = t; };
    this.bindNet();
    this.showLogin();
    window.addEventListener('resize', () => this.updateDeviceClasses());
    window.addEventListener('orientationchange', () => setTimeout(() => this.updateDeviceClasses(), 200));
    // unlock audio on first gesture (mobile autoplay policy)
    const unlock = () => {
      this.carol.init();
      if (localStorage.getItem('cw.carolOn') !== '0' && this.hud) this.carol.play();
      if (localStorage.getItem('cw.ambient') !== '0') this.carol.setAmbient(true);
      this.updateCarolUI();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    this.unlockAudio = unlock;
    // debugging / QA hook
    window.__cw = this;
  }

  updateDeviceClasses() {
    const b = document.body;
    this.mobile = matchMedia('(pointer: coarse)').matches || window.innerWidth < 900;
    b.classList.toggle('mobile', this.mobile);
    const portrait = window.innerHeight > window.innerWidth;
    b.classList.toggle('portrait', portrait);
    b.classList.toggle('landscape', !portrait);
    if (this.engine) this.engine.isMobile = this.mobile;
  }

  // ================================================================= login
  showLogin(error = '') {
    const token = localStorage.getItem('cw.token');
    if (token && !error && !this.loginShown) {
      this.loginShown = true;
      this.showLoading('재접속 중...');
      this.connect({ token });
      return;
    }
    this.loginShown = true;
    this.hideLoading();
    $('.login', this.root)?.remove();
    const look = { ...APPEARANCE_DEFAULT };
    const card = el(`<div class="login"><div class="login-card glass">
      <div class="logo">Christmas World<small>✦ SEOUL ✦</small></div>
      <p>눈 내리는 서울의 크리스마스 거리에서<br/>사람들을 만나고, 이야기하고, 함께 걸어요.</p>
      ${DEMO ? '<p class="note" style="margin-top:-8px">🎮 같은 링크로 들어온 사람들과 실시간으로 만나요. NPC 친구들도 함께 있어요. (음성 대화는 서버 버전에서 사용 가능)</p>' : ''}
      <div class="field"><label>닉네임 (2~12자)</label><input class="input" data-nick maxlength="12" placeholder="예) WinterRin♡" autocomplete="nickname"/></div>
      <div class="field"><label>코트 색</label><div class="swatches" data-coat>${APPEARANCE_OPTIONS.coat.map((c) => `<button class="swatch ${c === look.coat ? 'on' : ''}" data-v="${c}" style="background:${c}"></button>`).join('')}</div></div>
      <div class="field"><label>모자</label><div class="swatches" data-hat>${[['earmuff', '귀마개'], ['beanie', '비니'], ['santa', '산타'], ['none', '없음']].map(([v, l]) => `<button class="chip ${v === look.hat ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}</div></div>
      <label class="check"><input type="checkbox" data-adult/> 만 19세 이상입니다. (커플·손잡기 등 일부 소셜 기능은 성인 사용자 간 상호 동의 시에만 동작합니다)</label>
      <div class="err" data-err>${esc(error)}</div>
      <button class="btn primary" style="width:100%;padding:13px" data-go>입장하기</button>
      ${token ? '<p style="margin:12px 0 0"><button class="btn small" data-resume>기존 계정으로 재접속</button></p>' : ''}
    </div></div>`);
    this.root.appendChild(card);
    const nick = $('[data-nick]', card);
    nick.value = localStorage.getItem('cw.lastNick') || '';
    for (const key of ['coat', 'hat']) {
      $(`[data-${key}]`, card).onclick = (e) => {
        const b = e.target.closest('[data-v]'); if (!b) return;
        look[key] = b.dataset.v;
        $$(`[data-${key}] [data-v]`, card).forEach((x) => x.classList.toggle('on', x === b));
      };
    }
    const go = () => {
      const n = nick.value.trim();
      if (!NICK_RE.test(n)) { $('[data-err]', card).textContent = '닉네임은 2~12자의 한글/영문/숫자로 입력하세요'; return; }
      localStorage.setItem('cw.lastNick', n);
      localStorage.removeItem('cw.token');
      this.showLoading('서울로 이동 중...');
      this.connect({ nick: n, adult: $('[data-adult]', card).checked, appearance: look });
      this.unlockAudio();
    };
    $('[data-go]', card).onclick = go;
    nick.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') go(); });
    const resume = $('[data-resume]', card);
    if (resume) resume.onclick = () => { this.showLoading('재접속 중...'); this.connect({ token }); this.unlockAudio(); };
    setTimeout(() => nick.focus(), 50);
  }

  connect(creds) {
    this.creds = creds;
    if (this.net.state === 'open' || this.net.state === 'connecting') this.net.close();
    this.net.connect(() => {
      const t = localStorage.getItem('cw.token');
      return t ? { token: t, region: this.world.region?.id } : this.creds;
    });
  }

  showLoading(text) {
    let l = $('.loading', this.root);
    if (!l) { l = el('<div class="loading"><div class="spinner"></div><div data-t></div></div>'); this.root.appendChild(l); }
    $('[data-t]', l).textContent = text;
  }
  hideLoading() { $('.loading', this.root)?.remove(); }

  // ================================================================= networking
  bindNet() {
    const n = this.net;
    n.on('error', (m) => {
      if (['nick', 'nick_taken', 'version'].includes(m.code)) { this.net.close(); this.showLogin(m.m || '접속 오류'); }
      else if (m.code === 'replaced') { this.net.close(); modal('연결 종료', `<p class="note">${esc(m.m)}</p>`, { foot: '<button class="btn primary" onclick="location.reload()">다시 접속</button>' }); }
      else if (m.code === 'unauth') { localStorage.removeItem('cw.token'); this.showLogin('세션이 만료되었습니다. 다시 입장해 주세요.'); }
    });
    n.on('welcome', (m) => {
      localStorage.setItem('cw.token', m.token);
      this.self = m.you;
      this.world.setSelf(m.you);
      $('.login', this.root)?.remove();
      if (!this.hud) this.buildHud();
      this.regionCounts = Object.fromEntries(m.regions.map((r) => [r.id, r.count]));
      this.updateProfile();
      if (!this.historyLoaded) { for (const h of m.history) this.chat.push(h); this.historyLoaded = true; }
      this.updateVoiceButtons();
      // rejoin voice after reconnect
      if (this.voice.inVoice) this.voice.sendState();
    });
    n.on('joined', (m) => {
      const region = getRegion(m.region);
      this.showLoading(`${region.name} 불러오는 중...`);
      for (const id of [...this.labels.keys()]) this.removeLabel(id);
      setTimeout(async () => {
        this.world.enterRegion(region, { pos: m.pos, ry: m.ry, players: m.players, holds: m.holds });
        this.addLabel(this.self.id, this.self.nick, true);
        this.scores = new Map(m.scores || []);
        // compile all shaders for the new region while the loading overlay is still up,
        // so the first frames in the world don't hitch
        try {
          this.world.updateCamera(0.016);
          const r = this.engine.renderer;
          if (r.extensions.has('KHR_parallel_shader_compile')) await Promise.race([r.compileAsync(this.engine.scene, this.engine.camera), new Promise((res) => setTimeout(res, 8000))]);
          else r.compile(this.engine.scene, this.engine.camera); // no parallel compile: do it synchronously behind the overlay
        } catch (e) { console.warn('shader precompile skipped', e); }
        this.hideLoading();
        this.updateProfile();
        this.updateCards();
        this.updateActionState();
        toast(`📍 ${region.name}에 도착했어요`);
        if (!this.started) { this.started = true; this.engine.start(); }
      }, 30);
    });
    n.on('pjoin', (m) => { if (this.world.region) this.world.addRemote(m.p); });
    n.on('pleave', (m) => this.world.removeRemote(m.id));
    n.on('snap', (m) => this.world.onSnapshot(m.p));
    n.on('correct', (m) => this.world.correct(m.pos));
    n.on('chat', (m) => this.chat.onMessage(m));
    n.on('chatAck', (m) => this.chat.onAck(m));
    n.on('emote', (m) => { this.world.playEmote(m.id, m.e); if (m.e === 'heart') this.floater(m.id, '💗'); if (m.e === 'wave') this.floater(m.id, '👋'); });
    n.on('req', (m) => this.onRequest(m));
    n.on('reqResult', (m) => this.onRequestResult(m));
    n.on('social', (m) => { this.social = m; this.renderFriends(); this.updateProfile(); this.refreshLabels(); });
    n.on('self', (m) => { this.self = m.you; this.world.setSelf(m.you); this.updateProfile(); this.refreshLabels(); });
    n.on('hold', (m) => {
      this.world.applyHold(m);
      if (m.a === this.self.id || m.b === this.self.id) {
        const other = this.nickOf(m.a === this.self.id ? m.b : m.a);
        toast(m.mode === 'walk' ? `👣 ${other}님과 함께 걷는 중` : `🤝 ${other}님과 손을 잡았어요${m.b === this.self.id ? ' (상대가 이동을 이끕니다)' : ''}`);
      }
      this.updateActionState();
    });
    n.on('unhold', (m) => {
      const mine = this.world.hold && (m.a === this.self.id || m.b === this.self.id);
      this.world.clearHold(m);
      if (mine) toast({ distance: '거리가 멀어져 손을 놓았어요', cancel: '손을 놓았어요', region: '지역 이동으로 손을 놓았어요', leave: '상대가 떠나 손을 놓았어요', blocked: '손잡기가 해제되었어요' }[m.reason] || '손을 놓았어요');
      this.updateActionState();
    });
    n.on('hug', (m) => { this.world.hug(m.a, m.b); this.floater(m.a, '🤗'); });
    n.on('couple', (m) => {
      for (const id of [m.a, m.b]) { const r = this.world.remotes.get(id); if (r) r.couple = m.b ? { with: id === m.a ? m.b : m.a } : null; }
      this.refreshLabels();
      if (m.b) this.floater(m.a, '💞');
    });
    n.on('look', (m) => { const r = this.world.remotes.get(m.id); if (r) r.char.setAppearance(m.appearance); });
    n.on('voice', (m) => { const r = this.world.remotes.get(m.id); if (r) r.voice = m; });
    n.on('throw', (m) => this.world.spawnBall(m));
    n.on('hitfx', (m) => {
      this.world.hitEffect(m.target);
      this.scores.set(this.nickOf(m.by), m.score);
      if (m.target === this.self.id) toast(`❄️ ${this.nickOf(m.by)}님의 눈덩이에 맞았어요!`);
      if (m.by === this.self.id) toast(`🎯 명중! (점수 ${m.score})`);
    });
    n.on('notice', (m) => this.notify(m.m));
    n.on('duel', (m) => { this.duel.onDuel(m); this.updateActionState(); });
    n.on('shot', (m) => this.duel.onShot(m));
    n.on('dscore', (m) => this.duel.onScore(m));
    n.on('duelEnd', (m) => { this.duel.onEnd(m); this.updateActionState(); });
    n.on('rtt', (m) => this.updateNet(m.rtt));
    n.on('status', (m) => {
      if (!this.netPill) return;
      if (m.state === 'reconnecting') { this.netPill.className = 'netpill warn'; this.netPill.textContent = '재연결 중…'; }
      else if (m.state === 'closed') { this.netPill.className = 'netpill bad'; this.netPill.textContent = '연결 끊김'; }
      else if (m.state === 'open') { this.netPill.className = 'netpill'; this.netPill.textContent = '온라인'; }
    });
  }

  nickOf(id) {
    if (id === this.self?.id) return this.self.nick;
    return this.world.remotes.get(id)?.nick || this.social.friends.find((f) => f.id === id)?.nick || '누군가';
  }

  friendIds() { return new Set(this.social.friends.map((f) => f.id)); }

  updateNet(rtt) {
    if (!this.netPill || this.demo) return;
    this.netPill.className = 'netpill' + (rtt > 250 ? ' warn' : '');
    this.netPill.textContent = `온라인 · ${rtt}ms`;
  }

  // ================================================================= HUD
  buildHud() {
    this.hud = true;
    const R = this.root;
    const menu = [['home', 'home', '홈'], ['map', 'map', '서울 월드맵'], ['events', 'gift', '이벤트'], ['shop', 'bag', '상점'], ['wardrobe', 'shirt', '옷장'], ['profile', 'user', '프로필']];
    const nav = el(`<div class="topnav">
      <div class="logo">Christmas World<small>✦ SEOUL ✦</small></div>
      <nav class="menu">${menu.map(([k, ic, l]) => `<button data-menu="${k}" class="${k === 'home' ? 'on' : ''}">${icon(ic, 18)}${l}</button>`).join('')}</nav>
      <div class="nav-right">
        <span class="netpill" data-net>온라인</span>
        <button class="iconbtn" data-act="notifications" title="알림">${icon('bell')}<span class="badge" data-bellbadge></span></button>
        <button class="iconbtn" data-act="messages" title="귓속말">${icon('mail')}<span class="badge" data-mailbadge></span></button>
        <button class="iconbtn" data-act="friends" title="친구">${icon('users')}<span class="badge" data-friendbadge></span></button>
        <button class="iconbtn" data-act="settings" title="설정">${icon('gear')}</button>
        <button class="iconbtn mobile-only" data-act="mobilemenu" title="메뉴">${icon('menu')}</button>
      </div></div>`);
    R.appendChild(nav);
    this.netPill = $('[data-net]', nav);
    nav.querySelector('[data-act="mobilemenu"]').style.display = this.mobile ? '' : 'none';
    $$('[data-menu]', nav).forEach((b) => (b.onclick = () => this.openMenu(b.dataset.menu)));
    nav.querySelector('[data-act="notifications"]').onclick = () => this.openNotifications();
    nav.querySelector('[data-act="messages"]').onclick = () => { this.chat.setTab('whisper'); if (this.mobile) this.openSheet(this.chat.root); this.chat.root.classList.remove('min'); };
    nav.querySelector('[data-act="friends"]').onclick = () => { if (this.mobile) this.openSheet(this.friendsEl); else this.friendsEl.classList.toggle('hidden'); };
    nav.querySelector('[data-act="settings"]').onclick = () => this.openSettings();
    nav.querySelector('[data-act="mobilemenu"]').onclick = () => this.openMobileMenu(menu);

    this.profileEl = el('<div class="profile glass"></div>');
    this.profileEl.onclick = () => this.openMenu('profile');
    R.appendChild(this.profileEl);

    this.chat = new Chat(this);
    R.appendChild(this.chat.root);

    // minimap
    const mm = el('<div class="minimap" title="전체 지도 열기"><canvas></canvas></div>');
    const mml = el(`<div class="minimap-label glass"><button data-z="-1">－</button><span data-rname></span><button data-z="1">＋</button></div>`);
    R.append(mm, mml);
    this.minimap = new Minimap($('canvas', mm), this.world, this);
    mm.onclick = () => this.openMenu('map');
    $$('[data-z]', mml).forEach((b) => (b.onclick = () => this.minimap.setZoom(+b.dataset.z)));
    this.regionNameEl = $('[data-rname]', mml);

    // friends
    this.friendsTab = 'friends';
    this.friendsEl = el(`<div class="friends glass">
      <div class="tabs"><button data-ft="friends" class="on">친구</button><button data-ft="nearby">주변</button><button data-ft="requests">요청<span class="badge" data-reqbadge></span></button><button class="iconbtn sheet-close" data-sheetclose style="width:28px;height:28px;flex:none">${icon('close', 16)}</button></div>
      <div class="search"><input placeholder="친구 검색..." data-fsearch/></div>
      <div class="flist scroll" data-flist></div>
      <div class="foot"><button class="btn primary" data-addfriend>${icon('userPlus', 18)} 친구 추가</button></div></div>`);
    R.appendChild(this.friendsEl);
    $$('[data-ft]', this.friendsEl).forEach((b) => (b.onclick = () => { this.friendsTab = b.dataset.ft; $$('[data-ft]', this.friendsEl).forEach((x) => x.classList.toggle('on', x === b)); this.renderFriends(); }));
    $('[data-fsearch]', this.friendsEl).addEventListener('input', () => this.renderFriends());
    $('[data-fsearch]', this.friendsEl).addEventListener('keydown', (e) => e.stopPropagation());
    $('[data-addfriend]', this.friendsEl).onclick = () => this.openAddFriend();
    $('[data-sheetclose]', this.friendsEl).onclick = () => this.closeSheet(this.friendsEl);
    this.friendsEl.querySelector('[data-flist]').addEventListener('click', (e) => this.onFriendClick(e));

    // side buttons: mic, headset (join voice), heart quick, run
    const side = el(`<div class="sidebtns">
      <button class="roundbtn" data-mic title="마이크 (기본 OFF)">${icon('micOff', 22)}</button>
      <button class="roundbtn" data-voice title="근거리 음성 대화 참여">${icon('headset', 22)}</button>
      <button class="roundbtn big" data-heart title="하트" style="color:#ff8cc0">${icon('heart', 28)}</button>
      <button class="roundbtn" data-run title="달리기 토글">${icon('run', 22)}</button></div>`);
    R.appendChild(side);
    this.micBtn = $('[data-mic]', side);
    this.voiceBtn = $('[data-voice]', side);
    this.micBtn.onclick = () => this.toggleMic();
    this.voiceBtn.onclick = () => this.toggleVoice();
    $('[data-heart]', side).onclick = () => this.emote('heart');
    const runBtn = $('[data-run]', side);
    runBtn.onclick = () => { this.input.runToggle = !this.input.runToggle; runBtn.classList.toggle('on', this.input.runToggle); };

    // action bar
    const acts = [['emotes', 'emoji', '이모티콘'], ['wave', 'wave', '인사'], ['heart', 'heart', '하트'], ['holdHand', 'hands', '손잡기'], ['hug', 'hug', '포옹'], ['dance', 'dance', '댄스'], ['walk', 'walk', '함께걷기'], ['photo', 'camera', '사진'], ['duel', 'snowball', '눈싸움']];
    this.actionsEl = el(`<div class="actions glass">${acts.map(([k, ic, l]) => `<button data-a="${k}">${icon(ic, 24)}<span>${l}</span></button>`).join('')}</div>`);
    R.appendChild(this.actionsEl);
    $$('[data-a]', this.actionsEl).forEach((b) => (b.onclick = () => this.action(b.dataset.a, b)));

    // worlds
    this.worldsEl = el(`<div class="worlds glass">
      <div class="worlds-head"><h3>서울 월드맵</h3><span>방문하고 싶은 곳을 선택하세요</span>
        <button class="btn small" data-fullmap>${icon('map', 16)} 전체 지도</button>
        <button class="iconbtn" data-collapse style="width:30px;height:30px" title="접기/펼치기">${icon('chevDown', 18)}</button>
        <button class="iconbtn sheet-close" data-sheetclose style="width:30px;height:30px">${icon('close', 18)}</button></div>
      <div class="cards">${REGIONS.map((r) => `<button class="card" data-region="${r.id}" style="background-image:url(thumbs/${r.id}.jpg), linear-gradient(135deg,#2a2f5c,#5a2f5a)"><div class="shade"></div><span class="cnt" data-cnt></span><div class="t">${icon('pin', 14)} ${r.name}</div><div class="d">${r.highlights.join(' · ')}</div></button>`).join('')}</div></div>`);
    R.appendChild(this.worldsEl);
    $$('[data-region]', this.worldsEl).forEach((b) => (b.onclick = () => this.travel(b.dataset.region)));
    $('[data-collapse]', this.worldsEl).onclick = () => { document.body.classList.toggle('worlds-collapsed'); localStorage.setItem('cw.worldsCollapsed', document.body.classList.contains('worlds-collapsed') ? '1' : '0'); };
    $('[data-fullmap]', this.worldsEl).onclick = () => this.openMenu('map');
    $('[data-sheetclose]', this.worldsEl).onclick = () => this.closeSheet(this.worldsEl);
    if (localStorage.getItem('cw.worldsCollapsed') === '1') document.body.classList.add('worlds-collapsed');

    // carol mini-player
    const carol = el(`<div class="carol glass">${icon('music', 16)}<span class="title" data-ct>캐럴</span>
      <button class="iconbtn" data-cp style="width:28px;height:28px">${icon('play', 16)}</button>
      <button class="iconbtn" data-cn style="width:28px;height:28px" title="다음 곡">${icon('skip', 16)}</button>
      <input type="range" min="0" max="1" step="0.05" data-cv title="캐럴 음량"/></div>`);
    R.appendChild(carol);
    this.carolTitle = $('[data-ct]', carol);
    this.carolPlayBtn = $('[data-cp]', carol);
    this.carolPlayBtn.onclick = () => { this.carol.playing ? this.carol.pause() : this.carol.play(); this.updateCarolUI(); };
    $('[data-cn]', carol).onclick = () => { this.carol.next(); this.updateCarolUI(); };
    const cv = $('[data-cv]', carol); cv.value = this.carol.volume; cv.oninput = () => this.carol.setVolume(+cv.value);

    // mobile: joystick + controls + left quick buttons
    const joy = el('<div class="joystick"><span class="dir u">▲</span><span class="dir d">▼</span><span class="dir l">◀</span><span class="dir r">▶</span><div class="knob"></div><span class="jlbl">이동 · 끝까지 밀면 달리기</span></div>');
    const lookHint = el('<div class="look-hint">👆 이 쪽을 드래그해서<br/>둘러보기 · 조준</div>');
    R.appendChild(lookHint);
    this.lookHint = lookHint;
    R.appendChild(joy);
    this.input.joystickEl = joy; this.input.knob = $('.knob', joy);
    const mctl = el(`<div class="mctl">
      <button class="roundbtn small-reload hidden" data-m="reload" title="재장전">${icon('skip', 18)}<span class="lbl">장전</span></button>
      <button class="roundbtn big fire" data-m="fire" title="발사">${icon('snowball', 28)}<span class="lbl" data-firelbl>눈싸움</span></button>
      <button class="roundbtn big" data-m="jump">${icon('jump', 26)}<span class="lbl">점프</span></button></div>`);
    R.appendChild(mctl);
    $('[data-m="jump"]', mctl).addEventListener('touchstart', (e) => { this.input.jumpQueued = true; e.preventDefault(); }, { passive: false });
    $('[data-m="jump"]', mctl).onclick = () => { this.input.jumpQueued = true; };
    const fireBtn = $('[data-m="fire"]', mctl);
    // hold the fire button for continuous fire (rate-limited by the gun)
    fireBtn.addEventListener('touchstart', (e) => { e.preventDefault(); this.fireHeld = true; if (!this.duel.fire()) { this.fireHeld = false; this.requestDuel(); } }, { passive: false });
    const release = () => { this.fireHeld = false; };
    fireBtn.addEventListener('touchend', release);
    fireBtn.addEventListener('touchcancel', release);
    fireBtn.onclick = () => { if (!this.duel.fire()) this.requestDuel(); };
    $('[data-m="reload"]', mctl).addEventListener('touchstart', (e) => { e.preventDefault(); this.duel.reload(); }, { passive: false });
    $('[data-m="reload"]', mctl).onclick = () => this.duel.reload();
    this.mctl = mctl;
    const mtop = el(`<div class="mtopbtns">
      <button class="roundbtn" data-o="chat">${icon('chat', 20)}<span class="badge" data-chatbadge></span></button>
      <button class="roundbtn" data-o="friends">${icon('users', 20)}</button>
      <button class="roundbtn" data-o="worlds">${icon('map', 20)}</button>
      <button class="roundbtn" data-o="help" title="조작법"><b style="font-size:18px">?</b></button></div>`);
    R.appendChild(mtop);
    $('[data-o="chat"]', mtop).onclick = () => this.openSheet(this.chat.root);
    $('[data-o="friends"]', mtop).onclick = () => this.openSheet(this.friendsEl);
    $('[data-o="worlds"]', mtop).onclick = () => this.openSheet(this.worldsEl);
    $('[data-o="help"]', mtop).onclick = () => this.openControls();
    if (this.mobile) {
      let seen = null;
      try { seen = localStorage.getItem('cw.mhelp'); } catch {}
      if (!seen) setTimeout(() => this.openControls(), 3600);
    }

    // keyboard shortcuts
    this.input.onKey = (e) => {
      // during a duel Space fires instead of jumping (hold for continuous fire)
      if (e.code === 'Space' && this.duel.inDuel) { this.input.jumpQueued = false; this.duel.fire(); return; }
      if (e.code === 'KeyF') { if (!this.duel.fire()) this.requestDuel(); }
      else if (e.code === 'KeyR') this.duel.reload();
      else if (e.code === 'KeyM') this.openMenu('map');
      else if (e.code === 'KeyV') this.toggleMic();
      else if (e.code === 'Digit1') this.emote('wave');
      else if (e.code === 'Digit2') this.emote('heart');
      else if (e.code === 'Digit3') this.emote('dance');
      else if (e.code === 'KeyX' && this.world.hold) this.net.send({ t: 'release' });
      else if (e.code === 'KeyP') this.photoMode(true);
      else if (e.code === 'F3') { this.toggleStats(); e.preventDefault(); }
    };
    if (localStorage.getItem('cw.stats') === '1') this.toggleStats(true);

    this.engine.onFrame = (dt) => this.frame(dt);
    // keep region player counts fresh
    if (this.net.counts) this.countTimer = setInterval(() => {
      this.regionCounts = this.net.counts(); this.updateCards();
      if (this.net.connectedPeers !== undefined && this.netPill) {
        const n = this.net.connectedPeers;
        this.netPill.className = 'netpill';
        this.netPill.textContent = this.net.room ? `접속 중 · 나 포함 ${n + 1}명` : '오프라인 데모';
      }
    }, 2000);
    else this.countTimer = setInterval(() => fetch('/api/metrics').then((r) => r.json()).then((j) => { this.regionCounts = Object.fromEntries(j.rooms.map((r) => [r.id, r.players])); this.updateCards(); }).catch(() => {}), 20000);
    this.renderFriends();
    this.updateCarolUI();
  }

  setChatBadge(n) {
    const b = $('[data-chatbadge]', this.root);
    if (b) { b.dataset.n = n; b.textContent = n || ''; }
    const m = $('[data-mailbadge]', this.root);
    if (m) { const w = this.chat?.unread.whisper || 0; m.dataset.n = w; m.textContent = w || ''; }
  }

  openSheet(elm) {
    for (const s of [this.chat.root, this.friendsEl, this.worldsEl]) if (s !== elm) s.classList.remove('sheet');
    elm.classList.add('sheet');
    elm.classList.remove('hidden', 'min');
    if (elm === this.chat.root) { this.chat.setTab(this.chat.tab); }
  }
  closeSheet(elm) { elm.classList.remove('sheet'); }

  // ================================================================= frame
  frame(dt) {
    this.world.update(dt);
    this.minimap?.update(dt);
    if (this.duel.inDuel && (this.fireHeld || this.input.keys.has('Space'))) { this.input.jumpQueued = false; this.duel.fire(); }
    this.duel.update(dt);
    if (this.mctl) {
      const d = this.duel.inDuel;
      if (d !== this._mDuel) {
        this._mDuel = d;
        $('[data-firelbl]', this.mctl).textContent = d ? '발사' : '눈싸움';
        $('[data-m="reload"]', this.mctl).classList.toggle('hidden', !d);
        this.mctl.classList.toggle('dueling', d);
        if (d && this.mobile) toast(`❄️ ${this.duel.active?.oppNick || ''}님과 대결! 오른쪽 화면 드래그로 조준 → 발사 버튼 (꾹 = 연사)`, { ms: 4000 });
      }
    }
    if (this.lookHint && !this.lookHintGone && (this.input.lookTouch?.id ?? null) !== null) { this.lookHintGone = true; this.lookHint.classList.add('gone'); }
    this.updateLabels();
    if (this.statsEl) {
      this.statsAcc = (this.statsAcc || 0) + dt;
      if (this.statsAcc > 0.5) {
        this.statsAcc = 0;
        const s = this.engine.stats();
        const mem = performance.memory ? ` · JS ${Math.round(performance.memory.usedJSHeapSize / 1048576)}MB` : '';
        this.statsEl.textContent = `${s.fps} FPS · ${s.frameMs}ms · draw ${s.calls} · tri ${(s.tris / 1000).toFixed(0)}k · geo ${s.geometries} · tex ${s.textures}${mem} · ${s.quality} · ping ${this.net.rtt}ms · 주변 ${this.world.remotes.size}명`;
      }
    }
  }

  toggleStats(on) {
    on = on ?? !this.statsEl;
    localStorage.setItem('cw.stats', on ? '1' : '0');
    if (on && !this.statsEl) { this.statsEl = el('<div class="stats"></div>'); this.root.appendChild(this.statsEl); }
    if (!on && this.statsEl) { this.statsEl.remove(); this.statsEl = null; }
  }

  // ================================================================= labels
  addLabel(id, nick, me = false) {
    this.removeLabel(id);
    const e = el(`<div class="nameplate ${me ? 'me' : ''}"><div class="bubble hidden"></div><div class="np"><span class="mic"></span><span data-n></span></div></div>`);
    document.getElementById('labels').appendChild(e);
    this.labels.set(id, { el: e, me, nick });
    this.refreshLabel(id);
  }

  removeLabel(id) { const l = this.labels.get(id); if (l) { l.el.remove(); this.labels.delete(id); } }

  refreshLabels() { for (const id of this.labels.keys()) this.refreshLabel(id); }

  refreshLabel(id) {
    const l = this.labels.get(id);
    if (!l) return;
    const fr = this.friendIds().has(id);
    const coupleWith = id === this.self?.id ? this.self.couple?.with : this.world.remotes.get(id)?.couple?.with;
    const nick = id === this.self?.id ? this.self.nick : this.world.remotes.get(id)?.nick || l.nick;
    l.el.classList.toggle('friend', fr);
    $('[data-n]', l.el).innerHTML = `${esc(nick)}${coupleWith ? ' <span class="heart">♥</span>' : ''}`;
  }

  updateLabels() {
    const cam = this.engine.camera;
    const w = window.innerWidth, h = window.innerHeight;
    const v = new THREE.Vector3();
    for (const [id, l] of this.labels) {
      const obj = id === this.self?.id ? this.world.me : this.world.remotes.get(id);
      if (!obj) { l.el.style.display = 'none'; continue; }
      v.set(obj.pos.x, obj.pos.y + 2.05, obj.pos.z);
      const d = v.distanceTo(cam.position);
      v.project(cam);
      if (v.z > 1 || d > 45 || Math.abs(v.x) > 1.2 || Math.abs(v.y) > 1.2) { l.el.style.display = 'none'; continue; }
      l.el.style.display = '';
      const s = Math.max(0.65, Math.min(1, 14 / d));
      l.el.style.transform = `translate(${(v.x * 0.5 + 0.5) * w}px, ${(-v.y * 0.5 + 0.5) * h}px) translate(-50%, -100%) scale(${s})`;
    }
  }

  showBubble(id, text) {
    const l = this.labels.get(id);
    if (!l) return;
    const b = $('.bubble', l.el);
    b.textContent = text.length > 60 ? text.slice(0, 58) + '…' : text;
    b.classList.remove('hidden');
    clearTimeout(l.bubbleTimer);
    l.bubbleTimer = setTimeout(() => b.classList.add('hidden'), 5000);
  }

  floater(id, emoji) {
    const l = this.labels.get(id);
    if (!l || l.el.style.display === 'none') return;
    const f = el(`<div class="floater">${emoji}</div>`);
    const r = l.el.getBoundingClientRect();
    f.style.left = r.left + r.width / 2 + 'px';
    f.style.top = r.top + 'px';
    document.getElementById('labels').appendChild(f);
    setTimeout(() => f.remove(), 1700);
  }

  // ================================================================= profile / cards
  updateProfile() {
    if (!this.profileEl || !this.self) return;
    const region = this.world.region ? this.world.region.name : '-';
    const c = this.self.couple;
    this.profileEl.innerHTML = `${avatar(this.self.nick, { online: true })}
      <div><div class="nick">${esc(this.self.nick)}</div>
      <div class="meta"><span class="tag">📍 ${esc(region)}</span>${c ? `<span class="tag pink">♥ ${esc(c.nick)}</span>` : ''}${this.social.party ? `<span class="tag">🎉 파티 ${this.social.party.length}명</span>` : ''}</div></div>`;
    if (this.regionNameEl) this.regionNameEl.textContent = region;
    this.refreshLabel(this.self.id);
  }

  updateCards() {
    if (!this.worldsEl) return;
    for (const c of $$('[data-region]', this.worldsEl)) {
      const id = c.dataset.region;
      const here = this.world.region?.id === id;
      c.classList.toggle('on', here);
      $('[data-cnt]', c).textContent = `${this.regionCounts?.[id] ?? 0}명`;
      $('.here', c)?.remove();
      if (here) c.appendChild(el('<span class="here">현재 위치</span>'));
    }
  }

  async travel(id) {
    if (this.world.region?.id === id) return toast('이미 이 지역에 있어요');
    const r = getRegion(id);
    const holding = this.world.hold ? '<br/>※ 이동하면 손잡기가 해제됩니다.' : '';
    if (!(await confirmDialog(`${r.name}(으)로 이동`, `${esc(r.desc)}<br/>이동하시겠어요?${holding}`, '이동하기'))) return;
    if (this.mobile) this.closeSheet(this.worldsEl);
    this.showLoading(`${r.name}(으)로 이동 중...`);
    this.net.send({ t: 'join', region: id });
    // safety: if the server never answers, don't trap the user under the overlay
    clearTimeout(this.travelTimer);
    this.travelTimer = setTimeout(() => { if ($('.loading', this.root) && this.world.region?.id !== id) { this.hideLoading(); toast('지역 이동에 실패했습니다. 네트워크 상태를 확인하세요.', { type: 'err' }); } }, 8000);
  }

  // ================================================================= friends panel
  renderFriends() {
    if (!this.friendsEl) return;
    const list = $('[data-flist]', this.friendsEl);
    const q = $('[data-fsearch]', this.friendsEl).value.trim().toLowerCase();
    const reqB = $('[data-reqbadge]', this.friendsEl);
    reqB.dataset.n = this.social.incoming.length; reqB.textContent = this.social.incoming.length || '';
    const fb = $('[data-friendbadge]', this.root); if (fb) { fb.dataset.n = this.social.incoming.length; fb.textContent = this.social.incoming.length || ''; }
    let html = '';
    const match = (n) => !q || n.toLowerCase().includes(q);
    if (this.friendsTab === 'friends') {
      const fr = [...this.social.friends].sort((a, b) => (b.online - a.online) || a.nick.localeCompare(b.nick)).filter((f) => match(f.nick));
      if (this.social.party) html += `<div class="note" style="padding:4px 6px">🎉 파티: ${this.social.party.map((p) => esc(p.nick)).join(', ')} <button class="btn small" data-leaveparty>나가기</button></div>`;
      html += fr.map((f) => {
        const same = f.region && f.region === this.world.region?.id;
        const st = f.online ? (f.region ? `${esc(getRegion(f.region)?.name || '')}${same ? ' (같은 지역)' : ''}` : '접속 중') : '오프라인';
        return `<div class="frow" data-fid="${f.id}">${avatar(f.nick, { size: 'sm', online: f.online })}<div class="grow"><div class="name">${esc(f.nick)}${f.couple ? ' <span style="color:var(--pink)">♥ 커플</span>' : ''}</div><div class="st ${f.online ? '' : 'off'}">${st}</div></div><div class="acts">${f.online ? `<button class="iconbtn" data-w title="귓속말" style="width:28px;height:28px">${icon('mail', 16)}</button>` : ''}<button class="iconbtn" data-more title="더보기" style="width:28px;height:28px">${icon('more', 16)}</button></div></div>`;
      }).join('') || `<div class="empty">${q ? '검색 결과가 없습니다' : '아직 친구가 없어요.<br/>캐릭터를 눌러 친구 신청을 해 보세요!'}</div>`;
    } else if (this.friendsTab === 'nearby') {
      const near = [...this.world.remotes.values()].map((r) => ({ r, d: this.world.distanceTo(r.id) })).sort((a, b) => a.d - b.d).filter(({ r }) => match(r.nick));
      html = near.map(({ r, d }) => `<div class="frow" data-pid="${r.id}">${avatar(r.nick, { size: 'sm', online: true })}<div class="grow"><div class="name">${esc(r.nick)}</div><div class="st">${d.toFixed(0)}m${r.voice?.inVoice ? ' · 🎧' : ''}${r.voice?.mic ? '🎙' : ''}</div></div><div class="acts"><button class="iconbtn" data-more style="width:28px;height:28px">${icon('more', 16)}</button></div></div>`).join('') || '<div class="empty">이 지역에 다른 사람이 없어요</div>';
    } else {
      html = this.social.incoming.map((i) => `<div class="frow" data-rid="${i.id}">${avatar(i.nick, { size: 'sm' })}<div class="grow"><div class="name">${esc(i.nick)}</div><div class="st off">친구 신청</div></div><div class="acts"><button class="btn small primary" data-acc>수락</button><button class="btn small" data-dec>거절</button></div></div>`).join('') || '<div class="empty">받은 친구 신청이 없습니다</div>';
      if (this.social.blocked.length) html += `<div class="section-title" style="padding:0 6px">차단 목록</div>` + this.social.blocked.map((b) => `<div class="frow" data-bid="${b.id}"><div class="grow"><div class="name">${esc(b.nick)}</div></div><button class="btn small" data-unblock>해제</button></div>`).join('');
    }
    list.innerHTML = html;
  }

  onFriendClick(e) {
    const row = e.target.closest('.frow');
    if (e.target.closest('[data-leaveparty]')) return this.net.send({ t: 'party', op: 'leave' });
    if (!row) return;
    if (row.dataset.rid) {
      if (e.target.closest('[data-acc]')) this.net.send({ t: 'friend', op: 'accept', id: row.dataset.rid });
      if (e.target.closest('[data-dec]')) this.net.send({ t: 'friend', op: 'decline', id: row.dataset.rid });
      return;
    }
    if (row.dataset.bid && e.target.closest('[data-unblock]')) return this.net.send({ t: 'friend', op: 'unblock', id: row.dataset.bid });
    const id = row.dataset.fid || row.dataset.pid;
    if (!id) return;
    const f = this.social.friends.find((x) => x.id === id);
    if (e.target.closest('[data-w]') && f) return this.chat.startWhisper(f.id, f.nick);
    const r = row.getBoundingClientRect();
    this.openPlayerMenu(id, r.left - 230, r.top);
  }

  openAddFriend() {
    const m = modal('친구 추가', `<div class="field"><label>닉네임으로 친구 신청</label><input class="input" data-n placeholder="닉네임 입력"/></div>
      <p class="note">상대가 오프라인이어도 신청할 수 있어요. 같은 지역에 있다면 캐릭터를 눌러서 바로 신청할 수도 있어요.</p>`, { foot: '<button class="btn primary" data-go>신청 보내기</button>' });
    const inp = $('[data-n]', m);
    inp.addEventListener('keydown', (e) => e.stopPropagation());
    $('[data-go]', m).onclick = () => {
      const nick = inp.value.trim();
      if (!nick) return;
      const online = [...this.world.remotes.values()].find((r) => r.nick === nick);
      this.net.send({ t: 'req', kind: 'friend', to: online?.id || '', nick });
      m.close();
    };
    setTimeout(() => inp.focus(), 50);
  }

  pickWhisperTarget() {
    const cands = [...this.social.friends.filter((f) => f.online), ...[...this.world.remotes.values()].filter((r) => !this.friendIds().has(r.id)).map((r) => ({ id: r.id, nick: r.nick }))];
    const m = modal('귓속말 대상 선택', cands.length ? cands.map((c) => `<div class="frow" data-id="${c.id}" data-nick="${esc(c.nick)}">${avatar(c.nick, { size: 'sm', online: true })}<div class="grow"><div class="name">${esc(c.nick)}</div></div></div>`).join('') : '<div class="empty">접속 중인 친구나 주변 사람이 없어요</div>');
    m.querySelector('.modal-body').onclick = (e) => { const r = e.target.closest('[data-id]'); if (r) { m.close(); this.chat.startWhisper(r.dataset.id, r.dataset.nick); } };
  }

  // ================================================================= player menu & requests
  openPlayerMenu(id, x, y) {
    this.closePlayerMenu();
    const r = this.world.remotes.get(id);
    const f = this.social.friends.find((q) => q.id === id);
    const nick = r?.nick || f?.nick;
    if (!nick) return;
    this.selected = id;
    const isFriend = !!f;
    const near = r && this.world.distanceTo(id) <= INTERACT_RADIUS;
    const couple = this.self.couple?.with === id;
    const peer = this.voice.peers.get(id);
    const items = [
      ['profile', 'user', '프로필 보기'],
      !isFriend && ['friend', 'userPlus', '친구 추가'],
      ['whisper', 'mail', '귓속말'],
      r && ['voice', 'headset', '음성 대화 초대'],
      r && !this.duel.inDuel && ['duel', 'snowball', '1:1 눈싸움 대결'],
      r && ['holdHand', 'hands', `손잡기 요청${near ? '' : ' (가까이)'}`],
      r && ['walk', 'walk', `함께 걷기${near ? '' : ' (가까이)'}`],
      r && ['hug', 'hug', `포옹 요청${near ? '' : ' (가까이)'}`],
      ['party', 'party', '파티 초대'],
      isFriend && f.online && !r && ['invite', 'pin', '내 위치로 초대'],
      isFriend && !couple && !this.self.couple && ['couple', 'ring', '커플 신청'],
      couple && ['uncouple', 'ring', '커플 해제'],
      isFriend && ['remove', 'close', '친구 삭제'],
      ['block', 'ban', '차단'],
      ['report', 'flag', '신고'],
    ].filter(Boolean);
    const m = el(`<div class="pmenu glass"><div class="head">${avatar(nick, { size: 'sm', online: !!r || f?.online })}<div><div style="font-weight:700">${esc(nick)}</div><div class="note">${couple ? '♥ 커플' : isFriend ? '친구' : '주변 사람'}${r ? ` · ${this.world.distanceTo(id).toFixed(1)}m` : ''}</div></div></div>
      ${items.map(([k, ic, l]) => `<button class="item ${['block', 'report', 'remove', 'uncouple'].includes(k) ? 'danger' : ''}" data-k="${k}">${icon(ic, 18)}${l}</button>`).join('')}
      ${peer ? `<div class="vol">🔊 <input type="range" min="0" max="1.5" step="0.05" value="${this.voice.userVolume.get(id) ?? 1}" data-vol/><button class="btn small" data-mute>${this.voice.userMuted.has(id) ? '음소거 해제' : '음소거'}</button></div>` : ''}</div>`);
    const W = 220, H = 52 + items.length * 38 + (peer ? 40 : 0);
    m.style.left = Math.max(8, Math.min(window.innerWidth - W - 8, x)) + 'px';
    m.style.top = Math.max(60, Math.min(window.innerHeight - H - 8, y)) + 'px';
    this.root.appendChild(m);
    this.pmenu = m;
    m.onclick = (e) => {
      const b = e.target.closest('[data-k]');
      if (b) { this.playerAction(b.dataset.k, id, nick); this.closePlayerMenu(); }
      if (e.target.closest('[data-mute]')) { const muted = this.voice.toggleMute(id); e.target.textContent = muted ? '음소거 해제' : '음소거'; }
    };
    const vol = $('[data-vol]', m);
    if (vol) vol.oninput = () => this.voice.setUserVolume(id, +vol.value);
    setTimeout(() => document.addEventListener('pointerdown', this._pmClose = (e) => { if (!m.contains(e.target)) this.closePlayerMenu(); }), 0);
  }

  closePlayerMenu() {
    this.pmenu?.remove(); this.pmenu = null;
    if (this._pmClose) document.removeEventListener('pointerdown', this._pmClose);
  }

  async playerAction(k, id, nick) {
    switch (k) {
      case 'profile': {
        const f = this.social.friends.find((q) => q.id === id);
        modal(`${esc(nick)}`, `<div class="row">${avatar(nick, { online: true })}<div><div style="font-weight:700;font-size:16px">${esc(nick)}</div><div class="note">${f ? (f.couple ? '♥ 나의 커플' : '친구') : '친구가 아님'}${f?.region ? ` · ${esc(getRegion(f.region)?.name)}` : ''}</div></div></div><p class="note">ID: ${esc(id)}</p>`);
        break;
      }
      case 'whisper': this.chat.startWhisper(id, nick); break;
      case 'friend': case 'party': case 'invite':
        this.net.send({ t: 'req', kind: k, to: id }); break;
      case 'voice':
        if (!this.voice.inVoice) await this.toggleVoice();
        this.net.send({ t: 'req', kind: 'voice', to: id }); break;
      case 'holdHand': case 'walk': case 'hug':
        this.requestInteraction(k, id); break;
      case 'duel': this.requestDuel(id); break;
      case 'couple':
        if (!this.self.adult) return toast('커플 기능은 성인 확인(로그인 시 체크)한 사용자만 이용할 수 있어요', { type: 'err' });
        if (await confirmDialog('커플 신청', `${esc(nick)}님에게 커플을 신청할까요?<br/>상대가 수락해야만 커플이 됩니다.`, '신청')) this.net.send({ t: 'req', kind: 'couple', to: id });
        break;
      case 'uncouple':
        if (await confirmDialog('커플 해제', `${esc(nick)}님과의 커플을 해제할까요?`, '해제')) this.net.send({ t: 'friend', op: 'uncouple', id });
        break;
      case 'remove':
        if (await confirmDialog('친구 삭제', `${esc(nick)}님을 친구 목록에서 삭제할까요?`, '삭제')) this.net.send({ t: 'friend', op: 'remove', id });
        break;
      case 'block':
        if (await confirmDialog('차단', `${esc(nick)}님을 차단할까요?<br/>서로의 채팅·귓속말·요청·음성이 차단되고 친구/커플 관계가 해제됩니다.`, '차단')) { this.net.send({ t: 'friend', op: 'block', id }); this.voice.closePeer(id); }
        break;
      case 'report': {
        const m = modal('신고하기', `<p class="note">${esc(nick)}님을 신고하는 사유를 선택하세요.</p>
          <div class="swatches" data-r>${['욕설/비방', '성희롱', '스팸/도배', '사칭', '기타'].map((r) => `<button class="chip" data-v="${r}">${r}</button>`).join('')}</div>
          <div class="field" style="margin-top:12px"><textarea class="input" rows="3" data-d placeholder="상세 내용 (선택)"></textarea></div>`, { foot: '<button class="btn danger" data-go>신고</button>' });
        let reason = '';
        $('[data-r]', m).onclick = (e) => { const b = e.target.closest('[data-v]'); if (b) { reason = b.dataset.v; $$('[data-v]', m).forEach((x) => x.classList.toggle('on', x === b)); } };
        $('[data-d]', m).addEventListener('keydown', (e) => e.stopPropagation());
        $('[data-go]', m).onclick = () => { if (!reason) return toast('사유를 선택하세요'); this.net.send({ t: 'report', id, reason: `${reason}: ${$('[data-d]', m).value}` }); m.close(); };
        break;
      }
    }
  }

  // nearest player in range (or the one selected) for hold/hug/walk
  interactionTarget() {
    if (this.selected && this.world.distanceTo(this.selected) <= INTERACT_RADIUS) return this.selected;
    let best = null, bd = INTERACT_RADIUS;
    for (const r of this.world.remotes.values()) { const d = this.world.distanceTo(r.id); if (d <= bd) { bd = d; best = r.id; } }
    return best;
  }

  requestInteraction(kind, id = null) {
    if ((kind === 'holdHand' || kind === 'walk') && this.world.hold) { this.net.send({ t: 'release' }); return; }
    const target = id || this.interactionTarget();
    if (!target) return toast('4m 안에 있는 사람에게 다가가거나 캐릭터를 눌러 선택하세요');
    if (this.world.distanceTo(target) > INTERACT_RADIUS) return toast(REQ_ERR.far);
    this.net.send({ t: 'req', kind, to: target });
  }

  onRequest(m) {
    const label = REQ_LABEL[m.kind] || m.kind;
    const extra = m.kind === 'invite' ? ` (${esc(getRegion(m.region)?.name || '')})` : m.kind === 'couple' ? '<br/><span class="note">수락하면 서로의 커플로 표시됩니다</span>' : '';
    this.notify(`${m.nick}님의 ${label}`);
    toast(`<b>${esc(m.nick)}</b>님의 ${label}${extra}`, {
      type: 'req', html: true, ms: 28000,
      actions: [
        { label: '수락', primary: true, onClick: async () => { this.net.send({ t: 'resp', id: m.id, accept: true }); if (m.kind === 'voice' && !this.voice.inVoice) await this.toggleVoice(); } },
        { label: '거절', onClick: () => this.net.send({ t: 'resp', id: m.id, accept: false }), onTimeout: () => this.net.send({ t: 'resp', id: m.id, accept: false }) },
      ],
    });
  }

  onRequestResult(m) {
    const label = REQ_LABEL[m.kind] || m.kind;
    if (!m.ok) return toast(`${label}: ${REQ_ERR[m.err] || m.err}`, { type: 'err' });
    if (m.pending) return toast(`${label}을(를) 보냈어요. 상대의 응답을 기다리는 중…`);
    if (m.final) {
      const msg = { couple: `💞 ${m.nick}님과 커플이 되었어요!`, party: `🎉 ${m.nick}님이 파티에 참여했어요`, invite: `${m.nick}님이 초대를 수락했어요`, voice: `🎧 ${m.nick}님이 음성 대화에 참여했어요`, hug: `🤗 ${m.nick}님과 포옹!`, holdHand: '', walk: '' }[m.kind];
      if (msg) toast(msg);
    }
  }

  hintRelease() {
    const now = performance.now();
    if (now - (this.lastHint || 0) < 4000) return;
    this.lastHint = now;
    toast('손을 잡고 있는 동안은 상대가 이동을 이끕니다. 놓으려면 손잡기 버튼(또는 X키)을 누르세요.');
  }

  notify(text, opts = {}) {
    this.notifications.unshift({ text, ts: Date.now() });
    if (this.notifications.length > 50) this.notifications.pop();
    const b = $('[data-bellbadge]', this.root);
    if (b) { const n = (+b.dataset.n || 0) + 1; b.dataset.n = n; b.textContent = n; }
    if (opts.whisperFrom) toast(text.length > 70 ? text.slice(0, 68) + '…' : text);
  }

  // ================================================================= actions
  emote(e) {
    if (this.world.hold && e === 'sit') return;
    this.world.playEmote(this.self.id, e);
    this.net.send({ t: 'emote', e });
    if (e === 'heart') this.floater(this.self.id, '💗');
    if (e === 'wave') this.floater(this.self.id, '👋');
  }

  action(k, btn) {
    if (k === 'emotes') {
      const old = $('.emote-pop', this.root);
      if (old) return old.remove();
      const r = btn.getBoundingClientRect();
      const pop = el(`<div class="emoji-pop glass emote-pop" style="position:fixed;left:${r.left}px;bottom:${window.innerHeight - r.top + 8}px;grid-template-columns:repeat(3,1fr)">${EMOTE_LIST.map(([e, em, l]) => `<button data-e="${e}" title="${l}">${em}</button>`).join('')}</div>`);
      pop.onclick = (ev) => { const b = ev.target.closest('[data-e]'); if (b) { this.emote(b.dataset.e); pop.remove(); } };
      this.root.appendChild(pop);
      return;
    }
    if (['wave', 'heart', 'dance'].includes(k)) return this.emote(k);
    if (k === 'holdHand' || k === 'walk' || k === 'hug') return this.requestInteraction(k);
    if (k === 'photo') return this.photoMode(true);
    if (k === 'duel') return this.duel.inDuel ? this.duel.forfeit() : this.requestDuel();
  }

  updateActionState() {
    if (!this.actionsEl) return;
    const h = this.world.hold;
    const hb = $('[data-a="holdHand"]', this.actionsEl), wb = $('[data-a="walk"]', this.actionsEl);
    hb.classList.toggle('on', !!h && h.mode === 'hand');
    wb.classList.toggle('on', !!h && h.mode === 'walk');
    $('span', hb).textContent = h?.mode === 'hand' ? '손 놓기' : '손잡기';
    $('span', wb).textContent = h?.mode === 'walk' ? '그만 걷기' : '함께걷기';
    const db = $('[data-a="duel"]', this.actionsEl);
    db.classList.toggle('on', this.duel.inDuel);
    $('span', db).textContent = this.duel.inDuel ? '항복' : '눈싸움';
  }

  // ================================================================= voice
  async toggleVoice() {
    if (this.demo) return toast('이 공유 링크에서는 Claude 보안 정책 때문에 마이크를 쓸 수 없어요. 음성 대화는 정식 서버 버전에서 사용할 수 있어요.', { ms: 6000 });
    try {
      if (this.voice.inVoice) { this.voice.leave(); toast('음성 대화에서 나왔어요'); }
      else { await this.voice.join(); toast('🎧 근거리 음성 대화에 참여했어요. 가까운(10m 이내) 사람의 목소리가 들립니다. 마이크는 꺼져 있어요.'); }
    } catch (e) { toast(e.message, { type: 'err', ms: 6000 }); }
    this.updateVoiceButtons();
  }

  async toggleMic() {
    if (this.demo) return this.toggleVoice();
    try {
      await this.voice.setMic(!this.voice.mic);
      toast(this.voice.mic ? '🎙 마이크 ON — 주변 사람들이 내 목소리를 들을 수 있어요' : '마이크 OFF');
    } catch (e) { toast(e.message, { type: 'err', ms: 7000 }); }
    this.updateVoiceButtons();
  }

  updateVoiceButtons() {
    if (!this.micBtn) return;
    this.micBtn.classList.toggle('on', this.voice.mic);
    this.micBtn.innerHTML = icon(this.voice.mic ? 'mic' : 'micOff', 22);
    this.voiceBtn.classList.toggle('on', this.voice.inVoice);
  }

  updateCarolUI() {
    if (!this.carolPlayBtn) return;
    this.carolPlayBtn.innerHTML = icon(this.carol.playing ? 'pause' : 'play', 16);
    this.carolTitle.textContent = this.carol.playing ? this.carol.title : '캐럴 (일시정지)';
  }

  // ================================================================= photo mode
  photoMode(on) {
    document.body.classList.toggle('photo', on);
    this.world.photoMode = on;
    $('.photo-ui', this.root)?.remove();
    if (!on) return;
    const partner = this.self.couple && this.world.remotes.get(this.self.couple.with);
    const ui = el(`<div class="photo-ui"><div class="bar glass">
      <button class="btn primary" data-shot>${icon('camera', 18)} 촬영</button>
      ${partner ? '<button class="btn" data-frame>💞 커플 프레임 OFF</button>' : ''}
      <button class="btn" data-exit>닫기</button></div></div>`);
    this.root.appendChild(ui);
    let frame = false;
    const fb = $('[data-frame]', ui);
    if (fb) fb.onclick = () => { frame = !frame; fb.textContent = `💞 커플 프레임 ${frame ? 'ON' : 'OFF'}`; };
    $('[data-exit]', ui).onclick = () => this.photoMode(false);
    $('[data-shot]', ui).onclick = () => this.capture(frame && partner ? `${this.self.nick} ♥ ${partner.nick}` : null);
  }

  capture(coupleCaption) {
    const data = this.engine.screenshot();
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      const s = c.width / 1280;
      if (coupleCaption) {
        g.strokeStyle = 'rgba(255,140,192,0.9)'; g.lineWidth = 14 * s; g.strokeRect(20 * s, 20 * s, c.width - 40 * s, c.height - 40 * s);
        g.font = `bold ${46 * s}px "Great Vibes", cursive`; g.fillStyle = '#fff'; g.textAlign = 'center'; g.shadowColor = '#ff5fa2'; g.shadowBlur = 18 * s;
        g.fillText(coupleCaption, c.width / 2, 90 * s);
      }
      g.shadowBlur = 0;
      g.font = `${18 * s}px "Noto Sans KR", sans-serif`; g.fillStyle = 'rgba(255,255,255,0.85)'; g.textAlign = 'right';
      g.fillText(`Christmas World Seoul · ${this.world.region.name} · ${new Date().toLocaleDateString('ko-KR')}`, c.width - 40 * s, c.height - 40 * s);
      if (this.demo) {
        // downloads are blocked inside an artifact: show the photo to long-press / right-click save
        modal('📸 사진', `<img src="${c.toDataURL('image/jpeg', 0.9)}" style="width:100%;border-radius:12px" alt="촬영한 사진"/><p class="note">이미지를 길게 누르거나 우클릭해서 저장하세요.</p>`, { wide: true });
        return;
      }
      const a = document.createElement('a');
      a.href = c.toDataURL('image/jpeg', 0.92);
      a.download = `christmas-world-${this.world.region.id}-${Date.now()}.jpg`;
      a.click();
      this.root.appendChild(el('<div class="flash"></div>'));
      setTimeout(() => $('.flash', this.root)?.remove(), 450);
      toast('📸 사진이 저장되었어요');
    };
    img.src = data;
  }

  // ================================================================= menus & modals
  openMenu(k) {
    $$('[data-menu]', this.root).forEach((b) => b.classList.toggle('on', b.dataset.menu === k));
    const reset = () => $$('[data-menu]', this.root).forEach((b) => b.classList.toggle('on', b.dataset.menu === 'home'));
    if (k === 'home') { document.querySelectorAll('.modal-bg').forEach((m) => m.close?.()); this.world.cam.yaw = this.world.me.ry + Math.PI; return; }
    if (k === 'map') return this.openFullMap(reset);
    if (k === 'events') return this.openEvents(reset);
    if (k === 'shop') {
      const m = modal('상점', '<p><span class="status-chip">준비 중</span></p><p class="note">아바타 아이템 상점은 재화(결제/포인트) 시스템이 아직 구현되지 않아 비활성화되어 있습니다.<br/>가짜 가격이나 재화를 표시하지 않습니다. 현재는 <b>옷장</b>에서 모든 기본 의상을 무료로 바꿀 수 있어요.</p>', { onClose: reset, foot: '<button class="btn primary" data-wd>옷장 열기</button>' });
      $('[data-wd]', m).onclick = () => { m.close(); this.openWardrobe(reset); };
      return;
    }
    if (k === 'wardrobe') return this.openWardrobe(reset);
    if (k === 'profile') return this.openProfile(reset);
  }

  openMobileMenu(menu) {
    const m = modal('메뉴', `<div class="region-list">${menu.map(([k, ic, l]) => `<button class="btn" data-k="${k}">${icon(ic, 18)} ${l}</button>`).join('')}<button class="btn" data-k="settings">${icon('gear', 18)} 설정</button><button class="btn" data-k="notifications">${icon('bell', 18)} 알림</button><button class="btn" data-k="controls">🕹 조작법</button></div>`);
    m.querySelector('.modal-body').onclick = (e) => {
      const b = e.target.closest('[data-k]'); if (!b) return;
      m.close();
      if (b.dataset.k === 'settings') this.openSettings(); else if (b.dataset.k === 'notifications') this.openNotifications(); else if (b.dataset.k === 'controls') this.openControls(); else this.openMenu(b.dataset.k);
    };
  }

  openFullMap(onClose) {
    const r = this.world.region;
    const m = modal('서울 월드맵', `<canvas class="fullmap" data-map></canvas>
      <p class="note">● 흰색: 주변 사람 · <span style="color:#57e39a">●</span> 친구 · <span style="color:#ff5fa2">●</span> 커플 · ▲ 나 — 1칸 = 실제 ${r.scale}m (게임 좌표 1m 기준)</p>
      <div class="section-title">다른 지역으로 이동</div>
      <div class="region-list">${REGIONS.map((x) => `<button class="btn ${x.id === r.id ? 'primary' : ''}" data-r="${x.id}">${x.name}</button>`).join('')}</div>`, { wide: true, onClose });
    const c = $('[data-map]', m);
    const draw = () => {
      if (!c.isConnected) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      c.width = c.clientWidth * dpr; c.height = c.clientHeight * dpr;
      const b = r.bounds;
      const bw = b.circle ? b.r * 2 : b.maxX - b.minX, bh = b.circle ? b.r * 2 : b.maxZ - b.minZ;
      const cx = b.circle ? b.x : (b.minX + b.maxX) / 2, cz = b.circle ? b.z : (b.minZ + b.maxZ) / 2;
      const scale = Math.min(c.width / (bw + 20), c.height / (bh + 20));
      const me = this.world.me;
      drawRegion(c.getContext('2d'), r, { cx, cz, scale, w: c.width, h: c.height, players: [...this.world.remotes.values()], me: { x: me.pos.x, z: me.pos.z, ry: me.ry }, labels: true, friendIds: this.friendIds(), coupleId: this.self.couple?.with });
      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
    m.querySelector('.region-list').onclick = (e) => { const b = e.target.closest('[data-r]'); if (b) { m.close(); this.travel(b.dataset.r); } };
  }

  openEvents(onClose) {
    const st = this.duel.stats;
    const m = modal('시즌 이벤트 · 크리스마스 한정', `
      <div class="section-title">❄️ 1:1 눈덩이 총 대결</div>
      <p class="note">하단 <b>눈싸움</b> 버튼이나 캐릭터 메뉴에서 ${DUEL.range}m 안의 상대에게 대결을 신청하세요. 수락하면 둘 다 눈덩이 총을 들고 3초 뒤 시작해요.<br/>
      • 체력 ${DUEL.hp} · 한 발 맞으면 -${DUEL.damage} (${DUEL.hp / DUEL.damage}발이면 승리) · 제한 시간 ${DUEL.seconds / 60}분<br/>
      • 화면 중앙 조준점으로 조준 → <b>스페이스바</b>(꾹 누르면 연사) · 클릭 · F로 발사, 탄창 ${DUEL.mag}발 · <b>R</b> 재장전<br/>
      • 모바일: 오른쪽 화면 드래그로 조준, 오른쪽 아래 <b>발사</b> 버튼(꾹 누르면 연사), <b>장전</b> 버튼<br/>
      • 마우스 드래그로 조준 방향을 돌리고, WASD로 옆걸음하며 피하세요. 건물과 트리는 엄폐물이 됩니다.</p>
      <p><b>내 전적:</b> ${st.w}승 ${st.l}패 ${st.d}무</p>
      <button class="btn primary" data-duelnow>가장 가까운 상대에게 대결 신청</button>
      <div class="section-title">🎄 트리 점등 & 포토존</div>
      <p class="note">광화문광장 메인 트리, 서울광장 스케이트장, 청계천 빛 터널, DDP 미디어아트, 남산 사랑의 자물쇠 포토존을 방문해 사진 모드(P)로 기념사진을 남겨 보세요.</p>
      <div class="section-title">🎵 캐럴</div>
      <p class="note">우측 하단 플레이어에서 재생/일시정지/음량을 조절할 수 있어요. 음성 대화 중에는 자동으로 배경음이 줄어듭니다.</p>`, { onClose });
    $('[data-duelnow]', m).onclick = () => { m.close(); this.requestDuel(); };
  }

  requestDuel(id = null) {
    if (this.duel.inDuel) return;
    let target = id && this.world.remotes.has(id) ? id : null;
    if (!target && this.selected && this.world.distanceTo(this.selected) <= DUEL.range) target = this.selected;
    if (!target) {
      let bd = DUEL.range;
      for (const r of this.world.remotes.values()) { const d = this.world.distanceTo(r.id); if (d < bd) { bd = d; target = r.id; } }
    }
    if (!target) return toast(`${DUEL.range}m 안에 대결할 상대가 없어요. 캐릭터를 눌러 선택하거나 가까이 가 보세요.`);
    this.net.send({ t: 'req', kind: 'duel', to: target });
  }

  openProfile(onClose) {
    const s = this.self;
    const c = s.couple;
    const m = modal('프로필', `<div class="row">${avatar(s.nick, { online: true })}<div><div style="font-weight:700;font-size:17px">${esc(s.nick)}</div><div class="note">ID ${esc(s.id)} · ${s.adult ? '성인 확인됨' : '성인 미확인 (커플 기능 제한)'}</div></div></div>
      <div class="section-title">커플</div>
      ${c ? `<p>💞 <b>${esc(c.nick)}</b>님과 커플 · ${new Date(c.since).toLocaleDateString('ko-KR')}부터</p><button class="btn danger small" data-unc>커플 해제</button>` : '<p class="note">커플이 아닙니다. 친구의 메뉴에서 커플을 신청할 수 있어요 (양쪽 모두 성인 확인 + 상대의 수락 필요).</p>'}
      <div class="section-title">소셜</div>
      <p class="note">친구 ${this.social.friends.length}명 · 받은 신청 ${this.social.incoming.length}건 · 차단 ${this.social.blocked.length}명</p>
      <label class="check"><input type="checkbox" data-share ${s.shareLocation ? 'checked' : ''}/> 친구에게 내가 있는 지역 공개 (위치 공유 동의)</label>
      <p class="note">레벨·경험치·재화 시스템은 아직 구현되지 않아 표시하지 않습니다.</p>`, { onClose });
    $('[data-share]', m).onchange = (e) => this.net.send({ t: 'settings', shareLocation: e.target.checked });
    const u = $('[data-unc]', m);
    if (u) u.onclick = async () => { if (await confirmDialog('커플 해제', '정말 커플을 해제할까요?', '해제')) { this.net.send({ t: 'friend', op: 'uncouple', id: c.with }); m.close(); } };
  }

  openWardrobe(onClose) {
    const orig = { ...this.self.appearance };
    const look = { ...orig };
    const names = { coat: '코트', scarf: '목도리', hair: '머리색', hat: '모자', skin: '피부톤', pants: '바지' };
    const hatNames = { earmuff: '귀마개', beanie: '비니', santa: '산타 모자', none: '없음' };
    let saved = false;
    const m = modal('옷장 · 캐릭터 꾸미기', Object.entries(APPEARANCE_OPTIONS).map(([k, opts]) => `<div class="section-title">${names[k]}</div><div class="swatches" data-k="${k}">${opts.map((v) => k === 'hat' ? `<button class="chip ${look[k] === v ? 'on' : ''}" data-v="${v}">${hatNames[v]}</button>` : `<button class="swatch ${look[k] === v ? 'on' : ''}" data-v="${v}" style="background:${v}"></button>`).join('')}</div>`).join('') + '<p class="note" style="margin-top:14px">변경 사항은 캐릭터에 바로 미리보기로 적용됩니다.</p>', {
      foot: '<button class="btn" data-cancel>취소</button><button class="btn primary" data-save>저장</button>',
      onClose: () => { if (!saved) this.world.me.char.setAppearance(orig); onClose?.(); },
    });
    m.querySelector('.modal-body').onclick = (e) => {
      const b = e.target.closest('[data-v]'); if (!b) return;
      const k = b.parentElement.dataset.k;
      look[k] = b.dataset.v;
      $$('[data-v]', b.parentElement).forEach((x) => x.classList.toggle('on', x === b));
      this.world.me.char.setAppearance(look);
      this.world.cam.yaw = this.world.me.ry; // look at the character's face
    };
    $('[data-cancel]', m).onclick = () => m.close();
    $('[data-save]', m).onclick = () => { saved = true; this.net.send({ t: 'appearance', appearance: look }); m.close(); toast('옷차림을 저장했어요 ✨'); };
  }

  openControls() {
    try { localStorage.setItem('cw.mhelp', '1'); } catch {}
    const mobile = this.mobile;
    const body = mobile ? `
      <div class="ctl-phone" aria-hidden="true">
        <div class="ctl-zone left"><div class="ctl-stick"><i></i></div><b>이동 조이스틱</b><span>왼쪽 아무 곳이나 대고 밀기<br/>끝까지 밀면 달리기</span></div>
        <div class="ctl-zone right"><div class="ctl-swipe">⟵ ⟶</div><b>시점 · 조준</b><span>오른쪽을 드래그<br/>탭하면 캐릭터 선택</span></div>
        <div class="ctl-btns"><span class="b">❄️<em>발사</em></span><span class="b">⬆<em>점프</em></span></div>
      </div>
      <ul class="ctl-list">
        <li><b>🕹 조이스틱 (왼쪽)</b> 화면 왼쪽에 손가락을 대면 그 자리에 조이스틱이 생겨요. 밀어서 이동하고, 끝까지 밀면 달려요.</li>
        <li><b>👆 시점 (오른쪽)</b> 오른쪽 화면을 드래그하면 카메라가 돌아가요. 이동과 동시에 할 수 있어요.</li>
        <li><b>👤 캐릭터 탭</b> 다른 사람을 탭하면 메뉴가 열려요 (귓속말, 친구, 손잡기, 대결 등).</li>
        <li><b>⬆ 점프</b> 오른쪽 아래 버튼</li>
        <li><b>❄️ 눈싸움</b> 평소에는 가까운 사람에게 대결 신청, 대결 중에는 <b>발사</b> 버튼이 돼요. 꾹 누르면 연사, <b>장전</b> 버튼으로 재장전해요.</li>
        <li><b>💬 👥 🗺</b> 왼쪽 버튼으로 채팅, 친구 목록, 서울 월드맵을 열어요. 아래에서 올라오는 창은 ✕로 닫아요.</li>
        <li><b>📱 가로 모드</b> 휴대폰을 가로로 돌리면 화면이 더 넓어요. 돌려도 위치와 연결은 그대로예요.</li>
      </ul>` : `
      <ul class="ctl-list">
        <li><b>WASD / 방향키</b> 이동 · <b>Shift</b> 달리기 · <b>Space</b> 점프</li>
        <li><b>마우스 드래그</b> 시점 회전 · <b>휠</b> 줌 · <b>클릭</b> 캐릭터 메뉴</li>
        <li><b>Enter</b> 채팅 · <b>1/2/3</b> 인사·하트·춤 · <b>P</b> 사진 · <b>M</b> 지도 · <b>X</b> 손 놓기</li>
        <li><b>❄️ 눈싸움 대결</b> <b>F</b>로 가까운 사람에게 신청 → 대결 중 <b>스페이스바</b>(꾹 누르면 연사)·클릭·F로 발사, <b>R</b> 재장전, 마우스 드래그로 조준</li>
      </ul>`;
    modal(mobile ? '📱 모바일 조작법' : '⌨️ 조작법', body, { foot: '<button class="btn primary" data-ok>알겠어요!</button>' }).querySelector('[data-ok]').onclick = (e) => e.target.closest('.modal-bg').close();
  }

  openNotifications() {
    const b = $('[data-bellbadge]', this.root); if (b) { b.dataset.n = 0; b.textContent = ''; }
    modal('알림', this.notifications.length ? this.notifications.map((n) => `<div class="msg">${esc(n.text)}<span class="time">${new Date(n.ts).toLocaleTimeString('ko-KR')}</span></div>`).join('') : '<div class="empty">새 알림이 없습니다</div>');
  }

  async openSettings() {
    const dev = await this.voice.devices();
    const q = this.qualitySetting;
    const m = modal('설정', `
      <div class="section-title">그래픽</div>
      <div class="row"><label>그래픽 품질</label><select data-q>${[['auto', '자동 (권장)'], ['low', '낮음'], ['medium', '보통'], ['high', '높음']].map(([v, l]) => `<option value="${v}" ${q === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <p class="note">자동: FPS가 낮으면 눈 입자 밀도 → 그림자 → 블룸 순으로 품질을 낮춥니다. 현재: ${this.engine.quality}</p>
      <label class="check"><input type="checkbox" data-stats ${this.statsEl ? 'checked' : ''}/> 성능 정보 표시 (FPS, 드로우콜, 메모리, 핑) — F3</label>
      <div class="section-title">음성 대화</div>
      <div class="row"><label>입력 장치 (마이크)</label><select data-in><option value="">기본 장치</option>${dev.inputs.map((d) => `<option value="${d.deviceId}" ${d.deviceId === this.voice.inputDeviceId ? 'selected' : ''}>${esc(d.label || '마이크')}</option>`).join('')}</select></div>
      <div class="row"><label>출력 장치</label>${dev.canSelectOutput ? `<select data-out><option value="">기본 장치</option>${dev.outputs.map((d) => `<option value="${d.deviceId}" ${d.deviceId === this.voice.outputDeviceId ? 'selected' : ''}>${esc(d.label || '스피커')}</option>`).join('')}</select>` : '<span class="note">이 브라우저는 출력 장치 선택을 지원하지 않습니다</span>'}</div>
      <div class="row"><label>음성 전체 음량</label><input type="range" min="0" max="1.5" step="0.05" value="${this.voice.masterVolume}" data-vv/></div>
      <p class="note">근거리 음성: 0~3m 선명 · 3~10m 거리 감쇠 · 10m 초과 음소거. 에코 제거·노이즈 억제·자동 음량이 켜져 있습니다. 장치 이름은 마이크 권한 허용 후 표시됩니다.</p>
      <div class="section-title">사운드</div>
      <div class="row"><label>캐럴 음량</label><input type="range" min="0" max="1" step="0.05" value="${this.carol.volume}" data-cv/></div>
      <div class="row"><label>바람 환경음</label><input type="checkbox" data-amb ${localStorage.getItem('cw.ambient') !== '0' ? 'checked' : ''}/><input type="range" min="0" max="1" step="0.05" value="${this.carol.ambientVolume}" data-av/></div>
      <div class="section-title">개인정보</div>
      <label class="check"><input type="checkbox" data-share ${this.self.shareLocation ? 'checked' : ''}/> 친구에게 현재 지역 공개 (미니맵/친구목록)</label>
      <div class="section-title">조작법</div>
      <p class="note">PC: WASD/방향키 이동 · Shift 달리기 · Space 점프(대결 중에는 발사) · 마우스 드래그 시점 · 휠 줌 · Enter 채팅 · F 눈싸움 신청/발사 · R 재장전 · V 마이크 · 1/2/3 인사/하트/춤 · P 사진 · X 손 놓기 · M 지도<br/>모바일: 왼쪽 화면 드래그 = 조이스틱 · 오른쪽 화면 드래그 = 시점 (동시 조작 가능)</p>`,
    { foot: '<button class="btn danger" data-logout>로그아웃</button>' });
    $('[data-q]', m).onchange = (e) => {
      const v = e.target.value;
      this.qualitySetting = v; localStorage.setItem('cw.quality', v);
      this.engine.autoQuality = v === 'auto';
      this.engine.applyQuality(v === 'auto' ? (this.mobile ? 'low' : 'medium') : v);
      if (this.world.region) this.engine.loadRegion(this.world.region);
    };
    $('[data-stats]', m).onchange = (e) => this.toggleStats(e.target.checked);
    $('[data-in]', m).onchange = (e) => this.voice.setInputDevice(e.target.value).catch((err) => toast(err.message, { type: 'err' }));
    const out = $('[data-out]', m); if (out) out.onchange = (e) => this.voice.setOutputDevice(e.target.value).catch(() => toast('출력 장치를 변경하지 못했습니다', { type: 'err' }));
    $('[data-vv]', m).oninput = (e) => { this.voice.masterVolume = +e.target.value; if (this.voice.master) this.voice.master.gain.value = +e.target.value; };
    $('[data-cv]', m).oninput = (e) => this.carol.setVolume(+e.target.value);
    $('[data-amb]', m).onchange = (e) => { localStorage.setItem('cw.ambient', e.target.checked ? '1' : '0'); this.carol.setAmbient(e.target.checked); };
    $('[data-av]', m).oninput = (e) => this.carol.setAmbientVolume(+e.target.value);
    $('[data-share]', m).onchange = (e) => this.net.send({ t: 'settings', shareLocation: e.target.checked });
    $('[data-logout]', m).onclick = () => { localStorage.removeItem('cw.token'); this.voice.leave(); this.net.close(); location.reload(); };
  }
}

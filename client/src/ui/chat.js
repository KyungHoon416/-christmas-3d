import { el, esc, fmtTime, toast, $ } from './dom.js';
import { icon } from './icons.js';
import { CHAT_MAX_LEN } from '../../../shared/constants.js';

const CH_LABEL = { all: '전체', region: '지역', nearby: '주변', whisper: '귓속말', party: '파티' };
const ERR = { rate: '메시지를 너무 빠르게 보내고 있어요', offline: '상대가 오프라인이거나 존재하지 않습니다', blocked: '차단 관계인 사용자에게는 보낼 수 없습니다', noparty: '파티에 속해 있지 않습니다. 플레이어 메뉴에서 파티에 초대하세요', empty: '빈 메시지', noroom: '지역에 입장한 뒤 이용하세요' };
const EMOJIS = ['😀', '😂', '🥰', '😍', '😭', '😳', '🤗', '👍', '👏', '🙏', '🎄', '🎅', '⛄', '❄️', '🎁', '🔔', '⭐', '💖', '💕', '🔥', '☕', '📸', '🌙', '✨'];

export class Chat {
  constructor(app) {
    this.app = app;
    this.tab = 'all';
    this.msgs = [];
    this.unread = { all: 0, region: 0, nearby: 0, whisper: 0, party: 0 };
    this.whisperTo = null; // { id, nick }
    this.cid = 0;
    this.pending = new Map();
    this.root = el(`<div class="chat glass">
      <div class="tabs">
        ${Object.entries(CH_LABEL).map(([k, v]) => `<button data-tab="${k}" class="${k === 'all' ? 'on' : ''}">${v}<span class="badge" data-badge="${k}"></span></button>`).join('')}
        <span class="spacer"></span>
        <button class="iconbtn" data-min title="최소화" style="width:28px;height:28px">${icon('chevUp', 16)}</button>
        <button class="iconbtn sheet-close" data-sheetclose style="width:28px;height:28px">${icon('close', 16)}</button>
      </div>
      <div class="chat-body scroll" data-body></div>
      <button class="newmsg hidden" data-new>새 메시지 ↓</button>
      <div class="chat-input">
        <span class="to hidden" data-to title="귓속말 대상 변경"></span>
        <input data-input maxlength="${CHAT_MAX_LEN}" placeholder="메시지를 입력하세요..." enterkeyhint="send" />
        <button class="iconbtn" data-emoji style="width:32px;height:32px">${icon('smile', 20)}</button>
        <button class="send" data-send aria-label="전송">${icon('send', 17)}</button>
      </div>
      <div class="resize" data-resize></div>
    </div>`);
    this.body = $('[data-body]', this.root);
    this.input = $('[data-input]', this.root);
    this.root.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => this.setTab(b.dataset.tab)));
    $('[data-send]', this.root).onclick = () => this.submit();
    this.input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      // Enter sends and hands focus back to the game so WASD moves the character again
      if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); this.submit(); this.input.blur(); }
      if (e.key === 'Escape') this.input.blur();
    });
    $('[data-min]', this.root).onclick = () => this.toggleMin();
    $('[data-sheetclose]', this.root).onclick = () => app.closeSheet(this.root);
    $('[data-new]', this.root).onclick = () => this.scrollBottom();
    $('[data-to]', this.root).onclick = () => this.app.pickWhisperTarget();
    this.body.addEventListener('scroll', () => { if (this.atBottom()) $('[data-new]', this.root).classList.add('hidden'); });
    this.body.addEventListener('click', (e) => {
      const w = e.target.closest('[data-uid]');
      if (w && w.dataset.uid !== app.self?.id) this.startWhisper(w.dataset.uid, w.dataset.nick);
    });
    $('[data-emoji]', this.root).onclick = () => this.toggleEmoji();
    this.setupResize();
    window.addEventListener('keydown', (e) => {
      const a = document.activeElement;
      if (e.key === 'Enter' && a?.tagName !== 'INPUT' && a?.tagName !== 'TEXTAREA' && !document.querySelector('.modal-bg')) {
        e.preventDefault();
        if (this.app.mobile) this.app.openSheet(this.root);
        if (this.root.classList.contains('min')) this.toggleMin();
        this.input.focus();
      }
    });
    this.updateInputState();
  }

  toggleMin() { this.root.classList.toggle('min'); }

  setupResize() {
    const h = $('[data-resize]', this.root);
    let start = null;
    h.addEventListener('pointerdown', (e) => { start = { y: e.clientY, h: this.root.offsetHeight }; h.setPointerCapture(e.pointerId); });
    h.addEventListener('pointermove', (e) => { if (start) this.root.style.height = Math.max(160, Math.min(window.innerHeight * 0.7, start.h + e.clientY - start.y)) + 'px'; });
    h.addEventListener('pointerup', () => { start = null; });
  }

  toggleEmoji() {
    let pop = $('.emoji-pop', this.root);
    if (pop) return pop.remove();
    pop = el(`<div class="emoji-pop glass">${EMOJIS.map((e) => `<button>${e}</button>`).join('')}</div>`);
    pop.onclick = (e) => { if (e.target.tagName === 'BUTTON') { this.input.value += e.target.textContent; this.input.focus(); pop.remove(); } };
    this.root.appendChild(pop);
  }

  setTab(t) {
    this.tab = t;
    this.root.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
    if (t === 'all') for (const k in this.unread) this.unread[k] = 0; else this.unread[t] = 0;
    this.updateBadges();
    this.render();
    this.updateInputState();
  }

  updateInputState() {
    const to = $('[data-to]', this.root);
    if (this.tab === 'whisper') {
      to.classList.remove('hidden');
      to.textContent = this.whisperTo ? `To. ${this.whisperTo.nick}` : '대상 선택 ▸';
      this.input.placeholder = this.whisperTo ? '귓속말을 입력하세요...' : '먼저 귓속말 대상을 선택하세요';
    } else {
      to.classList.add('hidden');
      this.input.placeholder = `[${CH_LABEL[this.tab]}] 메시지를 입력하세요...`;
    }
  }

  startWhisper(id, nick) {
    this.whisperTo = { id, nick };
    this.setTab('whisper');
    if (this.app.mobile) this.app.openSheet(this.root);
    this.root.classList.remove('min');
    this.input.focus();
  }

  submit() {
    const text = this.input.value.trim();
    if (!text) return;
    const ch = this.tab;
    if (ch === 'whisper' && !this.whisperTo) return this.app.pickWhisperTarget();
    const cid = ++this.cid;
    const msg = { t: 'chat', ch, text, cid };
    if (ch === 'whisper') msg.to = this.whisperTo.id;
    const ok = this.app.net.send(msg);
    this.input.value = '';
    // optimistic pending marker (replaced by the server echo, or flagged on failure)
    this.pending.set(cid, { text, ch, ts: Date.now() });
    setTimeout(() => {
      const p = this.pending.get(cid);
      if (p) { this.pending.delete(cid); this.addSystem(`전송 실패: "${p.text.slice(0, 20)}" (서버 응답 없음)`, true); }
    }, ok ? 6000 : 100);
  }

  onAck(m) {
    const p = this.pending.get(m.cid);
    this.pending.delete(m.cid);
    if (!m.ok) {
      toast(ERR[m.err] || '메시지 전송 실패', { type: 'err' });
      if (p) this.push({ ch: p.ch, nick: this.app.self.nick, from: this.app.self.id, text: p.text, ts: p.ts, fail: true });
    }
  }

  onMessage(m) {
    this.push(m);
    if (m.ch !== 'whisper' && m.from !== this.app.self.id) this.app.showBubble(m.from, m.text);
  }

  push(m) {
    this.msgs.push(m);
    if (this.msgs.length > 250) this.msgs.shift();
    const visible = this.tab === 'all' || this.tab === m.ch;
    const mine = m.from === this.app.self?.id;
    const sheetHidden = this.app.mobile && !this.root.classList.contains('sheet');
    if ((!visible || sheetHidden || this.root.classList.contains('min')) && !mine && m.ch) {
      this.unread[m.ch]++;
      if (!visible && this.tab !== 'all') this.unread.all++;
      this.updateBadges();
      if (m.ch === 'whisper') this.app.notify(`💌 ${m.nick}님의 귓속말: ${m.text}`, { whisperFrom: m });
    }
    if (visible) {
      const stick = this.atBottom();
      this.body.appendChild(this.renderMsg(m));
      while (this.body.children.length > 250) this.body.firstChild.remove();
      if (stick || mine) this.scrollBottom();
      else $('[data-new]', this.root).classList.remove('hidden');
    }
  }

  addSystem(text, fail = false) { this.push({ sys: true, text, ts: Date.now(), fail }); }

  renderMsg(m) {
    if (m.sys) return el(`<div class="msg sys ${m.fail ? 'fail' : ''}">${esc(m.text)}</div>`);
    const me = this.app.self?.id;
    let who = `<span class="who" data-uid="${esc(m.from)}" data-nick="${esc(m.nick)}">${esc(m.nick)}</span>`;
    if (m.ch === 'whisper') who = m.from === me ? `To. <span class="who" data-uid="${esc(m.to)}" data-nick="${esc(m.toNick)}">${esc(m.toNick)}</span>` : `From. ${who}`;
    return el(`<div class="msg ${m.fail ? 'fail' : ''}"><span class="ch c-${m.ch}">[${CH_LABEL[m.ch]}]</span>${who} : ${esc(m.text)}<span class="time">${fmtTime(m.ts)}</span></div>`);
  }

  render() {
    this.body.innerHTML = '';
    const list = this.msgs.filter((m) => m.sys || this.tab === 'all' || m.ch === this.tab);
    for (const m of list.slice(-200)) this.body.appendChild(this.renderMsg(m));
    if (!list.length) this.body.appendChild(el(`<div class="empty">${this.tab === 'whisper' ? '친구 목록이나 캐릭터를 눌러 귓속말을 시작하세요.' : this.tab === 'party' ? '파티원끼리만 보이는 채팅입니다.' : this.tab === 'nearby' ? '20m 안에 있는 사람에게만 보입니다.' : '첫 메시지를 남겨 보세요 ❄️'}</div>`));
    this.scrollBottom();
  }

  atBottom() { return this.body.scrollHeight - this.body.scrollTop - this.body.clientHeight < 40; }
  scrollBottom() { this.body.scrollTop = this.body.scrollHeight; $('[data-new]', this.root).classList.add('hidden'); }

  updateBadges() {
    for (const [k, n] of Object.entries(this.unread)) {
      const b = this.root.querySelector(`[data-badge="${k}"]`);
      b.dataset.n = n; b.textContent = n ? (n > 99 ? '99+' : n) : '';
    }
    const total = Object.entries(this.unread).filter(([k]) => k !== 'all').reduce((a, [, n]) => a + n, 0);
    this.app.setChatBadge(total);
  }
}

// Proximity voice chat: WebRTC mesh between nearby players.
// - one RTCPeerConnection + one independent WebAudio chain PER remote user, so any
//   number of people can talk at the same time (no single shared "remote source").
// - signalling (offer/answer/ICE) is relayed by the game server (in-room, in-range only)
// - distance attenuation uses world metres: 0~3m full, 3~10m fade, >10m muted.
import { VOICE_CONNECT, VOICE_DISCONNECT, voiceGain } from '../../../shared/constants.js';

const SPEAK_THRESHOLD = 0.02;

export class Voice {
  constructor(net, world, hooks = {}) {
    this.net = net;
    this.world = world;
    this.hooks = hooks;
    this.peers = new Map();
    this.inVoice = false;
    this.mic = false;
    this.micStream = null;
    this.ctx = null;
    this.userVolume = new Map(); // id -> 0..1.5
    this.userMuted = new Set();
    this.masterVolume = 1;
    this.inputDeviceId = localStorage.getItem('cw.micDevice') || '';
    this.outputDeviceId = localStorage.getItem('cw.outDevice') || '';
    this.iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
    this.speakingLocal = false;
    // eslint-disable-next-line no-undef
    if (!(typeof __DEMO__ !== 'undefined' && __DEMO__)) fetch('/api/config').then((r) => r.json()).then((c) => { if (c.iceServers) this.iceServers = c.iceServers; }).catch(() => {});
    net.on('rtc', (m) => this.onSignal(m.from, m.data));
    net.on('pleave', (m) => this.closePeer(m.id));
    net.on('joined', () => { for (const id of [...this.peers.keys()]) this.closePeer(id); this.sendState(); });
    net.on('voice', (m) => { if (!m.inVoice) this.closePeer(m.id); });
    this.timer = setInterval(() => this.manage(), 500);
    // level metering runs on its own clock so speaking indicators / ducking keep
    // working even when the render loop is slow
    this.meter = setInterval(() => { this.update(); this.measure(); }, 50);
  }

  get supported() { return !!(navigator.mediaDevices?.getUserMedia && window.RTCPeerConnection); }

  ensureContext() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.masterVolume;
      this.master.connect(this.ctx.destination);
      if (this.outputDeviceId && this.ctx.setSinkId) this.ctx.setSinkId(this.outputDeviceId).catch(() => {});
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  // Join = start listening to nearby voices. Mic stays OFF until toggled.
  async join() {
    if (!this.supported) throw new Error(window.isSecureContext ? '이 브라우저는 음성 대화를 지원하지 않습니다' : '마이크는 HTTPS 주소에서만 쓸 수 있어요. 서버를 npm run start:https 로 실행하고 https:// 주소로 접속하세요');
    this.ensureContext();
    this.inVoice = true;
    this.sendState();
    this.manage();
  }

  leave() {
    this.inVoice = false;
    this.setMic(false);
    for (const id of [...this.peers.keys()]) this.closePeer(id);
    this.sendState();
  }

  async setMic(on) {
    if (on) {
      if (!this.inVoice) await this.join();
      try {
        this.micStream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: this.inputDeviceId ? { exact: this.inputDeviceId } : undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      } catch (e) {
        const msg = e.name === 'NotAllowedError' ? '마이크 권한이 거부되었습니다. 브라우저 주소창의 권한 설정에서 허용해 주세요.'
          : e.name === 'NotFoundError' ? '사용 가능한 마이크를 찾을 수 없습니다.'
          : e.name === 'OverconstrainedError' ? '선택한 마이크를 사용할 수 없습니다. 기본 장치로 다시 시도하세요.' : '마이크를 시작하지 못했습니다: ' + e.message;
        if (e.name === 'OverconstrainedError') { this.inputDeviceId = ''; localStorage.removeItem('cw.micDevice'); }
        this.mic = false;
        this.sendState();
        throw new Error(msg);
      }
      this.mic = true;
      const track = this.micStream.getAudioTracks()[0];
      this.localAnalyser = this.ctx.createAnalyser();
      this.localAnalyser.fftSize = 512;
      this.ctx.createMediaStreamSource(this.micStream).connect(this.localAnalyser);
      for (const p of this.peers.values()) this.attachMic(p, track);
    } else {
      this.mic = false;
      for (const p of this.peers.values()) p.tr?.sender.replaceTrack(null).catch(() => {});
      this.micStream?.getTracks().forEach((t) => t.stop());
      this.micStream = null;
      this.localAnalyser = null;
      this.speakingLocal = false;
    }
    this.sendState();
  }

  attachMic(p, track) {
    if (!p.tr) return;
    p.tr.sender.replaceTrack(track).catch(() => {});
  }

  async setInputDevice(id) {
    this.inputDeviceId = id;
    localStorage.setItem('cw.micDevice', id);
    if (this.mic) { await this.setMic(false); await this.setMic(true); }
  }

  async setOutputDevice(id) {
    this.outputDeviceId = id;
    localStorage.setItem('cw.outDevice', id);
    if (this.ctx?.setSinkId) await this.ctx.setSinkId(id);
  }

  async devices() {
    if (!navigator.mediaDevices?.enumerateDevices) return { inputs: [], outputs: [] };
    const list = await navigator.mediaDevices.enumerateDevices();
    return {
      inputs: list.filter((d) => d.kind === 'audioinput'),
      outputs: list.filter((d) => d.kind === 'audiooutput'),
      canSelectOutput: !!(window.AudioContext && AudioContext.prototype.setSinkId),
    };
  }

  sendState() {
    this.net.send({ t: 'voice', inVoice: this.inVoice, mic: this.mic, speaking: this.speakingLocal });
    this.hooks.onState?.(this);
  }

  // ---------------------------------------------------------------- peers
  manage() {
    if (!this.inVoice || !this.world.me) return;
    const myId = this.world.self.id;
    for (const r of this.world.remotes.values()) {
      const d = r.pos.distanceTo(this.world.me.pos);
      const p = this.peers.get(r.id);
      const blocked = this.hooks.isBlocked?.(r.id);
      if (!p && r.voice?.inVoice && d < VOICE_CONNECT && !blocked && (this.net.voiceInitiator?.(r.id) ?? myId < r.id)) this.createPeer(r.id, true);
      else if (p && (d > VOICE_DISCONNECT || !r.voice?.inVoice || blocked)) this.closePeer(r.id);
      else if (p && p.initiator && p.pc.connectionState !== 'connected' && performance.now() - p.created > 12000) {
        // stalled negotiation (e.g. ICE failed) -> retry
        this.closePeer(r.id);
      }
    }
    for (const id of this.peers.keys()) if (!this.world.remotes.has(id)) this.closePeer(id);
  }

  createPeer(id, initiator) {
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    const p = { id, pc, initiator, created: performance.now(), pendingIce: [], speaking: false, level: 0 };
    this.peers.set(id, p);
    pc.onicecandidate = (e) => { if (e.candidate) this.net.send({ t: 'rtc', to: id, data: { ice: e.candidate.toJSON() } }); };
    pc.ontrack = (e) => this.onRemoteTrack(p, e);
    pc.onconnectionstatechange = () => {
      this.hooks.onPeer?.(id, pc.connectionState);
      if (pc.connectionState === 'failed') this.closePeer(id);
    };
    if (initiator) {
      p.tr = pc.addTransceiver('audio', { direction: 'sendrecv' });
      if (this.mic && this.micStream) this.attachMic(p, this.micStream.getAudioTracks()[0]);
      (async () => {
        try {
          await pc.setLocalDescription(await pc.createOffer());
          this.net.send({ t: 'rtc', to: id, data: { sdp: pc.localDescription.toJSON() } });
        } catch (err) { console.warn('[voice] offer failed', err); this.closePeer(id); }
      })();
    }
    return p;
  }

  async onSignal(from, data) {
    if (!this.inVoice || !data) return;
    try {
      if (data.sdp?.type === 'offer') {
        let p = this.peers.get(from);
        if (p && p.initiator) return; // deterministic roles: should not happen
        if (p) this.closePeer(from);
        p = this.createPeer(from, false);
        await p.pc.setRemoteDescription(data.sdp);
        p.tr = p.pc.getTransceivers()[0];
        if (p.tr) p.tr.direction = 'sendrecv';
        if (this.mic && this.micStream) this.attachMic(p, this.micStream.getAudioTracks()[0]);
        await p.pc.setLocalDescription(await p.pc.createAnswer());
        this.net.send({ t: 'rtc', to: from, data: { sdp: p.pc.localDescription.toJSON() } });
        for (const c of p.pendingIce.splice(0)) await p.pc.addIceCandidate(c).catch(() => {});
      } else if (data.sdp?.type === 'answer') {
        const p = this.peers.get(from);
        if (!p || p.pc.signalingState !== 'have-local-offer') return;
        await p.pc.setRemoteDescription(data.sdp);
        for (const c of p.pendingIce.splice(0)) await p.pc.addIceCandidate(c).catch(() => {});
      } else if (data.ice) {
        const p = this.peers.get(from);
        if (!p) return;
        if (!p.pc.remoteDescription) p.pendingIce.push(data.ice);
        else await p.pc.addIceCandidate(data.ice).catch(() => {});
      }
    } catch (err) {
      console.warn('[voice] signalling error', err);
    }
  }

  onRemoteTrack(p, e) {
    const ctx = this.ensureContext();
    const stream = e.streams[0] || new MediaStream([e.track]);
    // Chrome only feeds remote WebRTC audio into WebAudio when the stream is also
    // attached to a (muted) media element.
    p.el = new Audio();
    p.el.muted = true;
    p.el.srcObject = stream;
    p.el.play().catch(() => {});
    p.source = ctx.createMediaStreamSource(stream);
    p.gain = ctx.createGain();
    p.gain.gain.value = 0;
    p.analyser = ctx.createAnalyser();
    p.analyser.fftSize = 512;
    p.source.connect(p.analyser);
    p.source.connect(p.gain);
    p.gain.connect(this.master);
    p.buf = new Float32Array(p.analyser.fftSize);
  }

  closePeer(id) {
    const p = this.peers.get(id);
    if (!p) return;
    try { p.pc.close(); } catch {}
    try { p.source?.disconnect(); p.gain?.disconnect(); } catch {}
    if (p.el) { p.el.srcObject = null; }
    this.peers.delete(id);
    if (p.speaking) this.hooks.onSpeaking?.(id, false);
    this.hooks.onPeer?.(id, 'closed');
  }

  // per-frame: distance attenuation + per-user volume
  update() {
    if (!this.ctx) return;
    const me = this.world.me;
    for (const p of this.peers.values()) {
      if (!p.gain) continue;
      const r = this.world.remotes.get(p.id);
      const d = r && me ? r.pos.distanceTo(me.pos) : 99;
      // 3D distance + floor/room attenuation (DDP: other floor or other hall is quieter)
      const room = r && me && this.world.region?.voiceFactor ? this.world.region.voiceFactor(me.pos, r.pos) : 1;
      p.targetGain = this.userMuted.has(p.id) ? 0 : voiceGain(d) * room * (this.userVolume.get(p.id) ?? 1);
      p.gain.gain.setTargetAtTime(p.targetGain, this.ctx.currentTime, 0.08);
    }
  }

  // speaking detection (RMS) per remote stream and for the local mic
  measure() {
    if (!this.ctx) return;
    let anyRemoteSpeaking = false;
    for (const p of this.peers.values()) {
      if (!p.analyser) continue;
      const g = p.targetGain ?? 0;
      p.analyser.getFloatTimeDomainData(p.buf);
      let sum = 0;
      for (let i = 0; i < p.buf.length; i++) sum += p.buf[i] * p.buf[i];
      p.level = Math.sqrt(sum / p.buf.length);
      p.peak = Math.max(p.peak || 0, p.level);
      const speaking = p.level > SPEAK_THRESHOLD && g > 0.01;
      if (speaking !== p.speaking) { p.speaking = speaking; this.hooks.onSpeaking?.(p.id, speaking); }
      anyRemoteSpeaking ||= speaking;
    }
    if (this.localAnalyser) {
      const buf = this.localBuf || (this.localBuf = new Float32Array(this.localAnalyser.fftSize));
      this.localAnalyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      this.localLevel = Math.sqrt(sum / buf.length);
      const s = this.localLevel > SPEAK_THRESHOLD;
      if (s !== this.speakingLocal) { this.speakingLocal = s; this.hooks.onSpeaking?.(this.world.self.id, s); }
    }
    this.anyoneSpeaking = anyRemoteSpeaking || this.speakingLocal;
    // ducking with a short release hold so music doesn't pump between words
    const now = performance.now();
    if (this.anyoneSpeaking) this.lastSpeechAt = now;
    const duck = now - (this.lastSpeechAt || -1e9) < 800;
    if (duck !== this.ducking) { this.ducking = duck; this.hooks.onDuck?.(duck); }
  }

  resetPeaks() { for (const p of this.peers.values()) p.peak = 0; }

  setUserVolume(id, v) { this.userVolume.set(id, v); }
  toggleMute(id) { if (this.userMuted.has(id)) this.userMuted.delete(id); else this.userMuted.add(id); return this.userMuted.has(id); }

  debug() {
    return {
      inVoice: this.inVoice, mic: this.mic, ctx: this.ctx?.state,
      peers: [...this.peers.values()].map((p) => ({ id: p.id, state: p.pc.connectionState, initiator: p.initiator, level: +(p.level || 0).toFixed(4), peak: +(p.peak || 0).toFixed(4), gain: p.gain ? +p.gain.gain.value.toFixed(3) : null, hasAudio: !!p.source })),
    };
  }
}

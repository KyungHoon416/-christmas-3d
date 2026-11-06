// Deployed (Firebase) networking: the in-page game + NPCs from LocalNet, real players
// through RoomNet, carried over Firebase Realtime Database, plus proximity voice
// (WebRTC signalling through the database; audio flows peer-to-peer).
import { RoomNet } from './roomNet.js';
import { createFirebaseRoom, loadFirebaseConfig } from './firebaseRoom.js';

export class FirebaseNet extends RoomNet {
  async initRoom() {
    try {
      const params = new URLSearchParams(location.search);
      const emu = params.get('emu'); // e.g. ?emu=localhost:9000,localhost:9099 for local testing
      const cfg = emu ? { apiKey: 'demo-key', projectId: 'demo-christmas', databaseURL: `http://${emu.split(',')[0]}?ns=demo-christmas-default-rtdb`, authDomain: 'localhost' } : await loadFirebaseConfig();
      const room = await createFirebaseRoom(cfg, emu ? { emulator: { db: emu.split(',')[0], auth: emu.split(',')[1] } } : {});
      this.room = room;
      this.myPeer = room.uid;
      room.onPeers((ch) => this.onPeers(ch));
      room.onRtc((from, data) => this.emit('rtc', { t: 'rtc', from: this.pid(from), data }));
      this.publishAll();
      this.emit('status', { t: 'status', state: 'open' });
    } catch (e) {
      console.warn('[firebase] multiplayer unavailable, playing offline with NPCs', e);
      this.roomError = e?.code || e?.message || String(e);
      this.emit('notice', { t: 'notice', m: '실시간 서버에 연결하지 못해 NPC와 함께 오프라인으로 진행돼요.' });
    }
  }

  debugWriteOther(uid) { return this.room?.debugWriteOther?.(uid); }

  send(m) {
    if (m.t === 'voice') {
      this.presence({ vc: { i: !!m.inVoice, m: !!m.mic && !!m.inVoice, s: !!m.speaking } });
      return super.send(m);
    }
    if (m.t === 'rtc' && this.isPeer(m.to)) {
      const st = this.peerOf(m.to);
      if (!this.room?.sendRtc || !st?.present || this.pblocked.has(m.to)) return true;
      this.room.sendRtc(st.label, m.data).catch(() => {});
      return true;
    }
    return super.send(m);
  }
}

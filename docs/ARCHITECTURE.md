# ARCHITECTURE

```
┌──────────────── Browser (client/) ────────────────┐        ┌──────── Node server (server/) ────────┐
│ ui/app.js  HUD, dialogs, player menu              │        │ index.js  HTTP static + /api + /ws     │
│ ui/chat.js, minimap.js                            │  WS    │ game.js   authoritative game core      │
│ game/world.js  local prediction, camera,          │◀──────▶│   rooms (6 regions), pose validation   │
│                remote interpolation, interactions │  JSON  │   chat routing, social graph, consent  │
│ engine/*  Three.js renderer, regions, snow, chars │        │   WebRTC signalling relay              │
│ net/net.js  reconnecting WebSocket                │        │ db.js     JSON-file persistence        │
│ net/voice.js  WebRTC mesh + WebAudio per peer ────┼─ P2P ─▶│ (media never touches the server)      │
│ audio/carol.js  synthesized carols, wind          │ audio  └────────────────────────────────────────┘
└───────────────────────────────────────────────────┘
                 shared/  constants.js · regions.js · collision.js  (imported by both sides)
```

## Key decisions

| Decision | Why |
|---|---|
| **Vanilla JS + Three.js r170 + Vite** (no React) | Small bundle (~205 KB gz), no framework overhead in the render loop. HUD is plain DOM over the canvas. |
| **Shared region data** (`shared/regions.js`) | One source of truth: the client generates geometry from building footprints, the server uses the same footprints as colliders. A building can never be visible-but-walkable or invisible-but-solid. |
| **Server-authoritative movement** | Client predicts locally for responsiveness; server rejects speed hacks / wall clipping (`pose` → `correct`). |
| **2.5D collision** (XZ shapes + Y range) | Enough for bridges over walkways (Cheonggyecheon) and railings while staying cheap enough to run per message on the server. Spatial hash grid (16 m cells). |
| **WebRTC mesh** for voice | Proximity voice only needs a handful of peers (connect <18 m, drop >26 m). No SFU to operate. Each peer has its own `RTCPeerConnection` + `MediaStreamSource → Gain → master` chain, so simultaneous speakers are mixed by WebAudio, never overwritten. |
| **JSON over WebSocket** | Simple and debuggable. Load test: ~24 KB/s per client with 50 players in a room (see QA_REPORT). Binary encoding is the first optimisation if rooms grow. |
| **JSON file DB** | Zero-ops for a single instance. Must be replaced (Postgres/Redis) for multi-instance deploys — `Store` is the only module that needs to change. |
| **Procedural assets** | No 3rd-party 3D/texture/audio assets with unclear licences. Textures are canvas-generated, carols are public-domain compositions synthesised in code. |

## Message protocol (v4)

Client → server: `hello{v,token|nick,adult,appearance}`, `join{region}`, `pose{x,y,z,ry,anim}` (15 Hz), `chat{ch,text,to?,cid}`, `emote{e}`, `req{kind,to}`, `resp{id,accept}`, `friend{op,id}`, `report{id,reason}`, `release`, `appearance`, `settings{shareLocation}`, `voice{inVoice,mic,speaking}`, `rtc{to,data}`, `party{op}`, `throw{v}`, `hit{id,target}`, `ping`.

Server → client: `welcome`, `joined{region,pos,players,holds}`, `snap{p:[[id,x,y,z,ry,anim]…]}` (12 Hz; players >45 m every 4th tick), `pjoin/pleave`, `correct{pos,reason}`, `chat`, `chatAck`, `req`, `reqResult`, `social`, `self`, `hold/unhold`, `hug`, `couple`, `look`, `voice`, `rtc`, `throw`, `hitfx`, `notice`, `error`, `pong`.

Request kinds (all require explicit acceptance by the target): `friend, couple, holdHand, walk, hug, party, invite, voice`.

## Security / abuse controls

- Identity = random 24-byte token (stored as SHA-256 hash). Re-login with the same token replaces the old socket.
- Rate limits: 60 msgs/s per socket, chat 6 burst / 1.5 per s, requests 5 burst / 0.5 per s, snowballs 3 burst / 1.5 per s. `maxPayload` 16 KB.
- Whisper delivered only to sender + recipient; blocked pairs cannot chat/whisper/request/voice-signal.
- Couple requires: both self-declared adults, existing friendship, explicit acceptance.
- RTC relay only between two in-voice players in the same room within range.
- Reports appended to the DB for moderation (`data.reports`).

**Not implemented**: real accounts (email/OAuth), age verification beyond self-declaration, moderation dashboard, TLS termination (deploy behind HTTPS reverse proxy — required for microphones on non-localhost).

## Running

```bash
npm install
npm run build
npm start              # http://localhost:3000
```
Dev mode with hot reload: `npm run dev` (Vite on :5173 proxies `/ws` and `/api` to :3000).

Env: `PORT`, `STUN_URL`, `TURN_URL`, `TURN_USER`, `TURN_PASS` (TURN is needed for users behind symmetric NAT / strict corporate networks).

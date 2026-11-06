# MULTIPLAYER SPEC

Files: `server/game.js`, `server/index.js`, `client/src/net/net.js`, `client/src/game/world.js`.

## Flow
1. `hello` with token (resume) or nickname (new guest). Server replies `welcome` (+ last 30 global messages) then `joined` for the last/default region.
2. Client predicts movement locally and sends `pose` at 15 Hz (only when changed, keepalive 1 s).
3. Server validates each pose: max distance `(6.5 + 1.6) m/s × dt + 0.6`, Y range, collision vs shared colliders, hand-hold follower must stay within 7 m of the leader → otherwise `correct{pos,reason}`.
4. Server broadcasts per-recipient `snap` at 12 Hz: full rate within 45 m, every 4th tick beyond (bandwidth LOD).
5. Clients render remotes 130 ms in the past and interpolate (positions, shortest-arc yaw); animation states sync (`idle/walk/run/jump/skate/emotes`).

## Rooms & lifecycle
- One room per region. `pjoin`/`pleave` on enter/leave/disconnect.
- WebSocket ping every 15 s; dead sockets terminated (mobile sleep).
- Client reconnects with exponential backoff (0.5 s → 15 s, jitter) and resumes with its token into the same region/position. Re-login elsewhere replaces the old socket (`error: replaced`).

## Social systems
- Friends (persisted; offline requests allowed; accept/decline/remove), block (also clears friendship/couple/hand-hold, filters chat), report (stored).
- Party (≤6, party chat), invite-to-my-region, voice invite.
- Couple: adults + friends + acceptance; dissolve by either side.
- Hand-hold / walk-together: target within 4 m, both free, acceptance. Leader drives; follower is placed at the leader's side (0.75 m, 0.98 m for walk) on both screens. Auto-release: cancel (either side / X key), distance > 6 m, region change, disconnect, block.
- Hug: consent, both play the hug animation facing each other.
- Snowball fight: throws broadcast; hits reported by the thrower and validated (throw exists, < 4 s old, target in room within 40 m of the origin).

## Measured (scripts/loadtest.js, 50 bots, 20 s, one room)
| Metric | Value |
|---|---|
| Server tick (12 Hz) avg | 2.7 ms |
| Server egress | ~1.2 MB/s |
| Per-client downlink | ~24 KB/s, 15.5 msgs/s |
| Chat latency (localhost) | p50 1 ms, p95 2 ms |
| RSS | 78 MB |
Bottleneck is JSON snapshot bandwidth (O(n²)). Next steps: binary snapshots, delta compression, interest radius cut-off.

## Verification
- `npm test` — 13 server integration tests with real WebSocket clients.
- `npm run test:e2e` — real Chromium clients (2 desktop + emulated iPhone) on one server.

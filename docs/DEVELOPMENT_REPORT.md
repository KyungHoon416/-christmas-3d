# DEVELOPMENT REPORT — CHRISTMAS WORLD SEOUL v4.0

## Starting point
The repository was empty (no commits, no branches, no other accessible repo — see `CURRENT_PROJECT_AUDIT.md`). Everything was built from scratch to the v4.0 specification.

## What was built
| Phase | Delivered |
|---|---|
| 1 UI/UX | Reference-style HUD: top nav, profile, 5-tab chat, circular minimap, friends panel, side voice buttons, action bar, region cards with real-scene thumbnails, carol player, dialogs, photo mode, mobile layouts |
| 2 Seoul world | 6 walkable regions with hand-modelled landmarks, varied procedural buildings with alleys, lamps, trees, stalls, subway entrances, skyline; shared colliders |
| 3 Weather | Continuous heavy snow (2 GPU layers, gusting wind, camera-anchored wrap, lamp glints), roof/ledge/ground snow, piles, footprints, fog, quality scaling |
| 4 Multiplayer | Authoritative WebSocket server, region rooms, validated movement, interpolation, reconnect |
| 5 Voice | WebRTC mesh proximity voice, independent per-peer audio graph, device selection, per-user volume/mute, speaking indicators, error handling |
| 6 Chat | 전체/지역/주변/파티/귓속말, unread badges, failure handling, bubbles |
| 7 Social | Friends, block, report, party, invite, couple (adult + consent), hand-hold / walk together / hug (consent) |
| 8 Sound | Public-domain carols synthesised live, wind ambience, voice ducking, optional licensed `public/audio/k-carol.mp3` hook |
| 9 Mobile | Multi-touch joystick + look, bottom sheets / drawers, rotation-safe |
| 10 Performance | Batching, instancing, LOD, adaptive quality, resource disposal, shader precompile |
| Extra | Snowball fight mini-game with server-validated hits and per-room leaderboard |

## Bugs found and fixed during verification
- NaN vertices in Korean roofs (float overshoot in `pow`) → clamped.
- Closed Catmull-Rom curve with duplicate end point (photo-zone heart) → NaN geometry.
- Spawn yaw convention mismatch → players faced away from the landmarks.
- Near-camera snowflakes rendered as huge discs → size clamp + near fade.
- Chat input kept focus after sending → WASD stopped working. Enter now sends and returns focus.
- `InstancedMesh` buffers not released on region change → explicit dispose.
- Voice gain / ducking tied to frame rate → moved to a 50 ms meter.
- Shader-compile hitch on entering a region → precompile behind the loading overlay (sync fallback without `KHR_parallel_shader_compile`).

## Not done / blocked (and what's needed)
| Item | Blocker | Needed |
|---|---|---|
| GIS-accurate Seoul | No licensed geodata/3D assets in repo | OSM (ODbL, attribution) or Seoul Open Data 3D buildings after licence review; drop footprints into `shared/regions.js` |
| Real accounts / age verification | Out of scope for a guest prototype | OAuth/identity provider + server sessions |
| TURN | No TURN server/credentials | Deploy coturn or managed TURN; set `TURN_URL/USER/PASS` |
| Device perf targets | No GPU in CI container | Measure on target PCs/phones with the F3 overlay |
| Physical phone test | No devices | Test iOS Safari + Android Chrome over HTTPS |
| Shop / currency / levels | No economy design or payment provider | Product decision first |
| `k-carol.mp3` | File not provided, licence unknown | Place a licensed file at `client/public/audio/k-carol.mp3` |
| Horizontal scaling | JSON file DB, in-memory rooms | Postgres/Redis + sticky sessions or room sharding |

## Tests
- `npm test` — 18 passing (collision, regions, voice curve, server integration).
- `npm run test:e2e` — real-browser suite, see `QA_REPORT.md` and `qa-e2e-results.json`.
- `node scripts/loadtest.js` — 50-bot room load test.

# DDP 3D — Architecture

## One layout, three consumers
`shared/ddp.js` is the single source of truth for the DDP building:

```
shared/ddp.js ──► shared/regions.js (region 'ddp': colliders, surfaces, seats, warps, zones, voiceFactor, ceilingAt)
      │                 ├─► server/game.js     (movement validation, seat occupancy, zone warps)
      │                 └─► client world.js    (prediction, camera, isIndoor)
      └──────────────────► client/src/engine/ddpBuilder.js (procedural meshes generated from the same data)
```

Because walls, 2F slabs, stairs, rails and seats are **rendered from the collision data**,
what is visible is exactly what is walkable (no invisible walls / no walk-through walls).

## Modules
| File | Role |
|---|---|
| `shared/ddp.js` | DDP constants (`DDP`), outline (`ddpRim`, `insideDDP`), shell height (`ddpShellY`), openings, `buildDDPLayout()` (surfaces, colliders, seats, artworks, products), `ZONES` + `ddpZoneOf`, `CEILINGS` + `ddpCeiling`, `ddpVoiceFactor` |
| `shared/regions.js` → `ddp()` | wraps the layout into the region (plaza buildings, lamps, planters, signposts, roses, warps, map labels, `high` = 2F+jump) |
| `client/src/engine/ddpBuilder.js` | shell with world-space cut-outs (entrance arch, store windows, loop windows), window glass that follows the shell, media facade, entrance tunnel, inner wall ring, floors, 2F slabs, walls/rails/stairs from colliders/surfaces, lobby, corridor, store, art hall, wayfinding |
| `client/src/engine/landmarks.js` → `buildDDP` | calls the builder + LED rose garden |
| `client/src/game/ddpInteract.js` | zone tracking, breadcrumb, indoor ambience switch, E-key / touch prompt, artwork & product panels (rotating 3D viewer), seat sit/stand, zone warp |
| `client/src/game/world.js` | `seated` state, `isIndoor()` = `insideDDP(x,z,0.9)`, indoor camera clamp (distance ≤ 6, pitch ≤ 0.6, below `ceilingAt`) |
| `client/src/engine/engine.js` | snow roof exclusion (outline × 0.93), warm indoor light blend (`updateAmbience`) |
| `client/src/net/voice.js` | voice gain = 3D distance falloff × `region.voiceFactor` |
| `server/game.js` | `seat` / `standUp` / `warp` handlers, seat release on move / region leave, `region.high` height limit |

## Data flow — sitting down
1. Client finds the nearest free seat in the row next to the player (`ddpInteract.findTarget`).
2. `E` / tap → `{t:'seat', id, sit:true}`.
3. Server checks: seat exists, not in a duel, within 4.5 m and 1.3 m height, not occupied → stores `room.seats[id] = userId`, snaps the player, replies `{t:'seat', ok, id, pos, ry}` and broadcasts `{t:'seats', taken}`.
4. Client sets `world.seated`; animation `sit` is sent in poses, so everyone sees it.
5. Moving / jumping / `일어나기` → `{t:'seat', sit:false}`; the server also frees the seat when the player moves away > 0.4 m or leaves the region.

In the peer-to-peer modes (artifact room / Firebase) each client runs its own game server;
there a seat is additionally treated as taken when a remote player is sitting on it
(anim `sit` within 0.3 m). Two players pressing E at the same instant can still both sit in
P2P mode (no central authority) — documented limitation.

## Snow and windows
* The snow vertex shader drops flakes inside the ellipse `outline × 0.93` below 30 m.
* The inner wall ring is at `outline × 0.88`; between the inner wall and the shell snow keeps
  falling, and the store / design-loop windows (glass in the inner wall + cut-outs in the shell
  + glass panes that follow the shell) show it. → no snow indoors, snow visible outside.

# DDP — Implementation report

## What was built
* **Exterior**: free-form metal-panel shell (28 m, estimated), glazed base band, media facade
  following the shell, arched entrance tunnel with portal, sign, beacon + floating marker,
  signposts, curved planters with "DDP", LED rose garden, Christmas tree, photo zone.
* **Interior (connected, walkable, collision-backed)**
  * 메인 로비 — atrium under the shell, 20-step wooden grand stairs with LED nosing, 2F gallery with
    glass rail and media strip, floating ornament, tree, red ribbon sculpture, benches, info desk,
    LED light curves under the roof, wayfinding boards.
  * 전시 공간 — concrete barrel-vault corridor, floor LED line, track lights, purple glow,
    6 interactive artworks (test content), west landing + ramp/stairs to 2F.
  * 디자인 스토어 — concrete lettering wall, 6 tables with rotating display props (no prices),
    shelves, counter, plants, light panels, south windows to the snowy plaza.
  * 아트홀 — 14 raked rows, 168 instanced red seats (server-side occupancy), stage + steps,
    LED screen, truss, speakers, exit signs, aisle lights.
  * 디자인 둘레길 (2F) — walkway along the north windows with glass rail and LED edge, diagonal
    mullions, snow visible outside; east stairs down to the foyer.
* **Systems**: E/touch interactions, seat sit/stand, zone warps, breadcrumb, floor-aware
  minimap & full map, indoor camera clamp (distance, pitch, ceilings), warm indoor light blend,
  muffled wind indoors, voice floor/room attenuation, server height limit raised to 2F + jump.

## Files
New: `shared/ddp.js`, `client/src/engine/ddpBuilder.js`, `client/src/game/ddpInteract.js`,
`tests/ddp.test.js`, `docs/DDP_*.md`, `docs/reference/ddp/README.md`, `docs/screenshots/ddp/*`.
Changed: `shared/regions.js`, `client/src/engine/landmarks.js` (old DDP code removed),
`engine.js`, `world.js`, `voice.js`, `carol.js`, `app.js`, `minimap.js`, `styles.css`,
`server/game.js`, `tests/server.test.js`.

## Verification
* `npm test`: 26/26 pass.
* Playwright (SwiftShader): every zone loads, zone/breadcrumb/prompt states logged, 0 errors.
* QA table: `docs/DDP_QA_REPORT.md` (19 PASS, 1 PARTIAL, 1 BLOCKED, 1 PASS with code-only evidence noted).

## Not done / honest limits
* No GLB models (Blender unavailable) — procedural geometry.
* Sizes are estimates; the building is a scaled game layout, not a survey-accurate replica.
* FPS on real devices not measured in this environment.

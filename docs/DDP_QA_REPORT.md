# DDP — QA report (master prompt v1.0, DDP-01 … DDP-22)

Environment: Node 22 (`npm test`), Chromium + SwiftShader (software WebGL) via Playwright,
build `vite build --mode demo` / artifact build. Screenshots: `docs/screenshots/ddp/`.

| ID | Item | Result | Evidence |
|---|---|---|---|
| DDP-01 | DDP selectable from the Seoul world map | PASS | world-map card / region list (`travel('ddp')`), screenshot 0 |
| DDP-02 | Exterior is a real 3D building, walk around it | PASS | shell mesh + 140-segment outline colliders; `tests/ddp.test.js` "outer shell … solid" |
| DDP-03 | Entrance findable & enterable | PASS | beacon + ENTRANCE marker + 7 signposts; route test walks plaza → tunnel → lobby; screenshot 1 |
| DDP-04 | Main lobby: stairs, 2F gallery | PASS | 20 wooden steps with LED, gallery slab + glass rail; route test climbs to 5.6 m; screenshots 2–3 |
| DDP-05 | Exhibition corridor reachable | PASS | route test; screenshot 4 (vault, LED line, artworks) |
| DDP-06 | Design store reachable | PASS | route test (east door); screenshot 5 |
| DDP-07 | Art hall reachable, seats | PASS | route test (hall door → aisle → top platform); screenshot 6 (168 instanced seats) |
| DDP-08 | Design loop (2F) reachable and connected back | PASS | route test west ramp → loop → east stairs; screenshot 7 |
| DDP-09 | Sit on a seat, server occupancy | PASS | `tests/server.test.js` "DDP: zone warp, seat occupancy…" (exclusive, far rejected, released on stand / leave); browser shows `E 좌석에 앉기` |
| DDP-10 | Artwork interaction panel, marked as test content | PASS | browser prompt `E 작품 보기 · 서울의 밤 #12`; panel shows tag `테스트용 콘텐츠` |
| DDP-11 | Product panel with rotating 3D view, no fake price/purchase | PASS (code) | `openProduct` WebGL viewer; text "가격·결제·구매 기능은 제공하지 않습니다"; not screenshot-verified |
| DDP-12 | No snow indoors | PASS | snow roof ellipse ×0.93; lobby/corridor/hall screenshots show no flakes |
| DDP-13 | Snow visible through windows | PASS | screenshot 7 (design-loop windows: flakes + city outside) |
| DDP-14 | Zone warp from the full map | PASS | server test (warp lands in zone, unknown zone → error); `tests/ddp.test.js` warps valid |
| DDP-15 | Full map: zones + 1F/2F toggle | PASS (code) | `openFullMap` zone buttons + floor toggle; minimap follows floor; not screenshot-verified |
| DDP-16 | Breadcrumb 대한민국 > 서울 > DDP > zone | PASS | all browser runs log e.g. `대한민국 > 서울 > DDP > 전시 공간`; profile card in screenshots |
| DDP-17 | E key / touch interaction | PASS (desktop) / PASS (code, mobile) | prompt is a button (tap) + `KeyE`; mobile layout not re-tested on a device |
| DDP-18 | No walking through walls / falling through floors | PASS | route test asserts every step unblocked and y ≥ 0; server validates poses with the same colliders |
| DDP-19 | Voice: 3D distance + floor/zone attenuation | PASS (unit) | `ddpVoiceFactor` (other floor 0.15, other room 0.35, in/out 0.2) applied in `voice.js`; not tested with two live microphones |
| DDP-20 | Warm indoor / cold outdoor ambience | PASS | `engine.updateAmbience` blend; wind ambience ×0.2 indoors; screenshots 2 vs 0 |
| DDP-21 | Performance | PARTIAL | one batched build per region, instanced seats, point lights limited by quality (2/4/6). FPS not measurable on SwiftShader; real-GPU/mobile FPS not measured |
| DDP-22 | GLB/Blender asset pipeline | BLOCKED | Blender not available in the build environment → procedural Three.js geometry instead (see DDP_ASSET_MANIFEST.md) |

Automated totals: `npm test` → 26 tests, 26 pass (incl. 5 DDP layout tests + 1 DDP server test).
Browser run: 0 console/page errors.

Known limitations
* In the peer-to-peer modes (Claude artifact room / Firebase) each client validates seats locally;
  two people pressing E on the same seat in the same instant can both sit (no central authority).
* Real DDP dimensions are not reproduced (scaled game layout; estimates marked in the modeling spec).
* Reference image 6 (design loop) was not provided.

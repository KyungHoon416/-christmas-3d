# DDP — Modeling spec (game layout v1)

> **All sizes are game estimates** inspired by the reference images. They are *not* survey
> data of the real Dongdaemun Design Plaza (the real building is far larger: roughly 280 m
> long — here the footprint is scaled down so the region stays playable). 1 unit = 1 game metre.

## Shell
| Item | Value | Note |
|---|---|---|
| Centre | (-4, -26) world | |
| Half axes | rx 60, rz 26 | estimate (scaled) |
| Outline wobble | `1 + 0.03 sin(3a+0.6) + 0.02 sin(5a)` | free-form look |
| Height | 28 m peak, dip over the middle (-28 %) | estimate |
| Profile | `y = py^0.45 · H · dip · (0.82 + 0.18 cos(1.4·lx/rx))` | `ddpShellY` |
| Panels | procedural panel texture, metalness 0.65 | |
| Inner wall ring | outline × 0.88 | |

## Openings (world space)
| Opening | Where | Size |
|---|---|---|
| Entrance arch | south, centre x | 8.6 m wide, spring 2.6 m, crown ≈ 6.0 m |
| Store windows | south-east, x -4+15 … -4+36 | y 0.4 – 4.6 m |
| Design-loop windows | north, x -4-38 … -4+34 | y 6.3 – 10.6 m |

## Floors
| Level | Height | Areas |
|---|---|---|
| 1F | 0 | lobby, exhibition corridor, store, art-hall front, east foyer |
| 2F | 5.6 m (estimate) | lobby gallery, design loop, hall-foyer deck, art-hall top platform, bridge |

## Zones (local coords: lx east+, lz south+ from the centre)
| Zone | Area (local) | Notes |
|---|---|---|
| 외부 광장 plaza | outside the outline | LED rose garden, planters, signposts, media facade, entrance |
| 메인 로비 lobby | lx -13…13 | atrium to the shell, grand stairs (lx -13…-9, lz -8…6, 20 steps), 2F gallery lz -22…-8, ornament, tree, sculpture, info desk |
| 전시 공간 exhibition | lx -40…-13, lz 6.3…12.4 + west landing | concrete barrel vault (crown 5.6 m), LED floor line, 6 test artworks, west ramp/stairs to 2F |
| 디자인 스토어 store | lx 13…37, lz 1…outline | ceiling 7 m, 6 tables with display props, 3 shelves, counter, concrete text wall, south windows |
| 아트홀 hall | lx 13…37, lz -11…1 | 14 raked rows (0.4 m rise, 1 m deep), 168 seats, stage lx 35…37 (1 m), LED screen, ceiling 11 m |
| 디자인 둘레길 loop | 2F north band, path width 5 m | glass rail, LED edge line, north windows |

## Route (verified in `tests/ddp.test.js`)
plaza → entrance tunnel → lobby → corridor → west ramp (2F) → design loop → east stairs → foyer → store → art hall → aisle → top platform → bridge → gallery → grand stairs → lobby → plaza.

# WORLD MAP SPEC

All layouts live in `shared/regions.js`. Coordinates: 1 unit = 1 game metre, −Z = north, +X = east.

## Accuracy statement (honest)
Layouts are **hand-authored approximations** from public knowledge of each site: correct axis, which side landmarks are on, relative order and rough proportions. They are **not** survey/GIS accurate and contain **no** extracted map or 3D data (no Google/Naver/Kakao/OSM geometry). To reach true accuracy, import OpenStreetMap building footprints (ODbL — attribution required) or Seoul Open Data 3D building data after a licence check, feeding the same `buildings` array format.

Real distances are compressed by `scale` (real metres per game metre) so each region is walkable in minutes; gameplay rules (speed, voice range) always use game metres.

| Region | scale | Bounds (m) | Contents |
|---|---|---|---|
| 광화문광장 `gwanghwamun` | 2.4 | 142 × 170 | Gwanghwamun gate (stone base with 3 arches, two-tier hip-and-gable roofs with dancheong, 광화문 signboard, flood-lit), palace walls, Sejong-daero (lanes + markings), plaza on the west of the axis, King Sejong statue (seated, north), Admiral Yi statue (column, south), Sejong Center (colonnade), 22 m main tree, winter market stalls with string lights, fountain, benches, subway exits, office rows with alleys |
| 서울광장·시청 `seoulplaza` | 2.0 | 144 × 118 | New City Hall (curved glass "wave" facade), Seoul Library (old City Hall with clock dome), skating rink (slippery ice physics, boards with entrances, light arches), Daehanmun gate, tree, photo zone |
| 청계천 `cheonggyecheon` | 3.0 | 184 × 48 | Sunken channel (−4 m) with stone walls, water shader, walkways, 3 stepping-stone crossings, 2 bridges you can walk **over and under**, west stairs from Cheonggye Plaza with the "Spring" spiral sculpture, east ramps, light tunnel (colour-cycling arches), floating lanterns, street level roads |
| 명동 `myeongdong` | 2.0 | 160 × 123 | Main shopping street + 3 cross streets + back alleys, 40+ shops with neon fascia and vertical blade signs (fictional names), street stalls, criss-crossing string lights, Myeongdong Cathedral (brick, spire, rose window) |
| DDP `ddp` | 2.2 | 144 × 128 | Curved aluminium-panel shell (ellipse collider), ground glass band, animated media-art facade, LED rose garden (up to 2,200 animated roses) with paths, photo zone, tree, high-rise row |
| 남산서울타워 `namsan` | 1.5 | circle r 43 | N Seoul Tower (base, shaft with colour-cycling lighting, decks, striped antenna), love-lock fences (≈3,600 locks) + lock tree, Palgakjeong pavilion, beacon mounds, benches, couple photo zone, city-light panorama (≈42k points, Han river band, tower clusters), forested hillside |

Every region also has: street lamps (instanced, with halo + light pool on the snow and pooled real point lights near the player), deco trees, snow piles, a distant skyline ring and snowy mountains.

## Collision & walkability
- Building footprints → box colliders automatically; lamps/trees/stalls too. Gaps between buildings (3–6 m) are alleys.
- Surfaces with heights (`surfaces`) support ramps, stairs and bridges; `canStep` blocks stepping onto ledges higher than 0.7 m.
- Server validates every pose against the same world (QA-04 tests: wall clipping rejected, alleys walkable, under-bridge vs on-bridge, water blocked).

## Travel
Region cards / full map → confirm → `join` → server leaves old room (hand-holds released), spawns at the region spawn with jitter → client disposes the old scene (geometries, InstancedMesh buffers, non-shared materials & textures) and builds the new one, precompiling shaders behind the loading overlay. Last region/position is restored on reconnect.

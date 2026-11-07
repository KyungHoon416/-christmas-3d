# DDP — Asset manifest

No external 3D models, textures, fonts-in-textures or audio were added for DDP.
Blender was not available in the build environment, so the GLB pipeline from the master
prompt is **BLOCKED**; everything is generated procedurally at runtime with Three.js.

| Asset | Source | License |
|---|---|---|
| Shell, walls, slabs, stairs, rails, vault, seats, furniture | procedural geometry (`ddpBuilder.js`) | project code |
| Panel / concrete / rib / band textures | Canvas 2D, generated at runtime | project code |
| Artworks 1–6 | procedural gradients + text, marked **테스트용 콘텐츠** | project code (placeholder) |
| Store products p1–p6 | procedural meshes, marked **(전시 소품)**, no price / no purchase | project code |
| Media facade / LED screen | GLSL shader | project code |
| Text (signs, wayfinding) | Canvas 2D with the page font (Noto Sans KR via Google Fonts, OFL) | OFL |
| Real DDP logos / brand artwork | **not used** | — |

Replacing placeholders later: swap `D.artworks` / `D.products` in `shared/ddp.js` for real
data and load images/GLBs in `ddpBuilder.js`; positions and interactions stay the same.

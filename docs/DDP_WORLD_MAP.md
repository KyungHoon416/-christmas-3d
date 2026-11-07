# DDP — World map & navigation

* **Seoul map → DDP**: the region list in the world map / 월드 panel (`travel('ddp')`).
* **Spawn**: south plaza (0, 54) facing the building; the entrance is marked by a pink light
  beam, a floating `입구 ENTRANCE` sign and 7 signposts around the building.
* **Full map (M)** inside DDP:
  * `1F / 2F` toggle — 1F hides the 2F-only rails; 2F shows the walkable 2F decks and hides
    1F-only walls; other players are filtered by floor.
  * Zone buttons `외부 광장 · 메인 로비 · 전시 공간 · 디자인 스토어 · 아트홀 · 디자인 둘레길 (2F)` →
    server-validated warp (`{t:'warp', zone}`) to a safe spot in that zone. Not allowed
    during a snowball duel; hand-holding and seats are released.
* **Breadcrumb**: profile card shows `대한민국 › 서울 › DDP › 메인 로비` (adds `(2F)` upstairs);
  the minimap label shows `DDP · <zone>`. A toast announces each zone change.
* **Minimap** follows the player's floor automatically.

| Zone | Warp point (world) |
|---|---|
| plaza | (-4, 0, 8) |
| lobby | (-4, 0, -12) |
| exhibition | (-31, 0, -16.6) |
| store | (20, 0, -11) |
| hall | (28.5, 0, -31) |
| loop | (-29, 5.6, -43.5) |

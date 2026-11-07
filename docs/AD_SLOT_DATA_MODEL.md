# Ad slot data model (Firebase Realtime Database)

Existing project uses RTDB (no Firestore), so the collections from the prompt map to RTDB paths.

```
/admins/{uid}: true                       # set by the owner in the Firebase console only
/ads/slots/{slotId}                       # public read, admin write
    slotId, locationId, slotName, advertiserName, imageUrl, targetUrl, description,
    isActive (bool), priority (number), startDate, endDate (ISO strings), createdAt, updatedAt, updatedBy
/ads/locations/{locationId}               # public read, admin write
    isActive (bool), updatedAt            # on/off switch; geometry lives in shared/ads.js (AD_LOCATIONS)
/ads/images/{slotId}: "data:image/jpeg;base64,…"   # Storage fallback (< 450 KB), imageUrl = "rtdb:{slotId}"
/adStats/{slotId}/{event}/{yyyymmdd}: number        # +1 only; read: admins
```

`imageUrl` may be an https URL (e.g. Firebase Storage download URL), a bundled test asset (`/test-assets/…`) or `rtdb:{slotId}`.

## Rules summary (`database.rules.json`)
* `/ads` readable by everyone; writes only if `admins/{auth.uid} === true`.
* Slot fields are type/length checked, unknown fields rejected, `targetUrl` must start with `http://` or `https://`.
* `/admins` cannot be written by clients (no self-promotion).
* `/adStats/...` – any signed-in player may increment a counter by exactly 1; event/slot/day keys are pattern-checked;
  only admins can read the totals (a single counter is readable so transactions work).

## Location model (code, `shared/ads.js`)
```js
{ locationId, region, placeName, type: 'triple', title,
  position: {x,y,z}, rotation: {x,y,z}, scale: {x,y,z},
  slots: { A: 'test-slot-a', B: 'test-slot-b', C: 'test-slot-c' }, isActive }
```
Locations are code (not DB) so collision is identical on server and client; the DB only toggles them.

## Seed data
`DEFAULT_SLOTS` in `shared/ads.js` = the three TEST slots (2026-11-01 → 2027-01-31). Used when the DB is empty
and restored by "기본 테스트 배너로 복원"; "TEST SLOT A/B/C 초기 데이터 저장" writes them to the DB.

## Analytics events
`ad_banner_view` (once per session per board), `ad_slot_visible` (once per session per active slot),
`ad_slot_interaction` (panel opened), `ad_slot_click` (사이트 방문 pressed), `ad_external_link_open` (confirmed).
Fields logged locally (window event `cw-ad`): slotId, locationId, region, deviceType, timestamp; persisted as daily counters.
userId / sessionId are not persisted (privacy; anonymous counters only). Firebase Analytics (GA4) is not configured in this project.

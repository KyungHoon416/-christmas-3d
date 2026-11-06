# Firebase 배포 가이드 (프로젝트: `christmas-3d`)

배포되면 `https://christmas-3d.web.app` 에서 누구나 접속해 멀티플레이 · 채팅 · 1:1 눈싸움 대결 · **근거리 음성 대화**를 할 수 있습니다.

## 구조
| 구성 | 역할 |
|---|---|
| Firebase Hosting | 게임 파일 제공 (HTTPS → 브라우저가 마이크 허용) |
| Firebase Authentication (익명) | 플레이어마다 고유 ID. 자기 데이터만 쓸 수 있게 하는 기준 |
| Realtime Database | `rooms/main/peers` 상태·채팅·요청, `rooms/main/pose` 위치, `rooms/main/rtc/{uid}` 음성 연결 신호 |
| WebRTC (P2P) | 음성 자체는 플레이어끼리 직접 전송 (DB를 거치지 않음) |
| GitHub Actions | 저장소에 push 하면 자동으로 빌드·테스트·배포 (`.github/workflows/firebase-deploy.yml`) |

보안 규칙: `database.rules.json` — 로그인(익명) 필수, 각자 `auth.uid` 경로만 쓰기 가능, 음성 신호는 받는 사람만 읽기 가능.

## 콘솔에서 한 번만 할 일
1. **Realtime Database**: 빌드 → Realtime Database → 데이터베이스 만들기 → 위치 **싱가포르(asia-southeast1)** → 잠금 모드로 시작 (규칙은 배포 때 자동 적용)
2. **익명 로그인**: 빌드 → Authentication → 시작하기 → 로그인 방법 → **익명** → 사용 설정
3. **웹 앱 등록**: ⚙️ 프로젝트 설정 → 일반 → 내 앱 → `</>` 웹 → 앱 닉네임 입력 → 등록 (설정값은 Hosting이 자동 제공하므로 복사할 필요 없음)
4. **배포 키를 GitHub에 등록**: ⚙️ 프로젝트 설정 → 서비스 계정 → **새 비공개 키 생성** → JSON 파일 다운로드 →
   GitHub 저장소 → Settings → Secrets and variables → Actions → **New repository secret**
   - Name: `FIREBASE_SERVICE_ACCOUNT`
   - Secret: 다운로드한 JSON 파일 내용 전체 붙여넣기
   - ⚠️ 이 키는 비밀번호와 같습니다. 채팅·메신저에 붙여넣지 말고 GitHub Secret에만 넣으세요.
5. GitHub 저장소 → **Actions** → "Deploy to Firebase" → **Run workflow** (이후에는 push 할 때마다 자동)

배포 키 권한 오류(`403`, `permission denied`)가 나면 Google Cloud 콘솔 → IAM에서 해당 서비스 계정에 **Firebase Hosting 관리자**, **Firebase Realtime Database 관리자** 역할을 추가하세요.

## 내 컴퓨터에서 직접 배포 (대안)
```bash
npm install
npm run build:firebase
npx firebase login
npx firebase deploy --only hosting,database
```

## 로컬 테스트 (에뮬레이터)
```bash
npx firebase emulators:start --only database,auth --project demo-christmas &
npm run build:firebase && (cd dist-firebase && python3 -m http.server 8766 &)
node tests/e2e/firebase-e2e.mjs      # 8/8: 접속, presence, 이동, 채팅, 음성, 대결, 보안 규칙, 오류 없음
```

## 무료(Spark) 플랜 한도
- Realtime Database: 동시 접속 100명, 다운로드 월 10GB. 위치는 초당 약 10회만 보내고 별도 노드로 분리해 사용량을 줄였습니다.
- 음성은 P2P라 DB 사용량에 포함되지 않습니다. 회사·모바일 망처럼 엄격한 네트워크에서는 TURN 서버가 필요할 수 있습니다.
- 친구·커플 관계는 접속 중에만 유지됩니다 (영구 저장은 다음 단계).

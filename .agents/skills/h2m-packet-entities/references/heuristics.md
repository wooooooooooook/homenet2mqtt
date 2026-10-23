# 패킷 역산 판정 규칙과 함정 (실측 기반)

## 1. 체크섬 검증으로 프레이밍 확정

캡처 hex의 마지막 바이트로 알고리즘을 검증한다. `add`면 `sum(bytes[0..n-2]) & 0xFF`.

- 예: `82 80 01 25 13 00 00 | 3b` → 130+128+1+37+19 = 315 → `0x3b` 일치
- 안 맞으면 순서대로 의심: `add_no_header`/`xor_no_header`(헤더 제외), 2바이트 `rx_checksum2`, footer 포함 여부
- `add_final_xor(0xNN)` 변형도 존재하므로 실패 시 gallery 같은 벤더 프리셋의 `packet_defaults`를 참조

## 2. 정적 버스는 증거가 아니다

첫 캡처에서 `variance.mjs`가 `STATIC`만 출력하는 경우가 많다. 폴링 트래픽만 도는 버스에서는 상태 변화가 없어 **어떤 바이트가 데이터인지 확정할 수 없다**.

- 대응: 사용자에게 구체적 조작 요청(전원 ON→OFF, 목표값 2단계 변경, 채널별 개별 조작)
- 조치가 끝난 뒤 캡처를 `--base`로 1차와 대조해 NEW 값만 분석한다
- **STATIC 그룹에 억지로 엔티티를 만들지 않는다.** 추측 시그니처는 재시작 후 다른 디바이스의 패킷을 삼킬 수 있다

## 3. mask는 관측된 값보다 느슨하게

벤더 프리셋은 상태 패킷(`0x82`)과 커맨드 응답/ack(`0x84`)을 **같은 엔티티**로 먹이려고 `mask: 0xF9`처럼 필요한 비트만 본다.

- 실측 예: 프리셋 `state: { data: [0x80,0x00,i], mask: [0xF9,0x00,0xFF] }`
  → `0x82 & 0xF9 = 0x80`, `0x84 & 0xF9 = 0x80` 으로 ack까지 매칭
- 블라인드 초안은 `data: [0x82,...], mask: [0xFF,...]`가 되기 쉽고, 그러면 ack 패킷이 `MINE=NONE OTHER=<기존>`으로 나타난다
- 판정: 같은 채널·같은 필드 구조를 갖는 다른 접두 hex가 bus에 존재하면 mask를 넓혀 포함시킬지 결정한다 (ack를 상태 갱신에 쓸지 여부)

## 4. 하위 상태(action/idle/heating)는 긴 창이 필요

`byte1`이 `0x80`(off) / `0x81`(idle) / `0x83`(heating) 처럼 3값 이상 사용하는 디바이드가 있다. 3분 캡처에서 `0x80`/`0x81`만 관측되면 `state_action_heating`은 도출할 수 없다.

- 초안에서 빠진 하위 상태가 있으면 `analyze` 결과가 `mode`만 나오고 `action`은 누락된다 → 해당 필드를 보류하거나 사용자에게 추가 관찰을 요청
- 값이 안 나오는 필드는 아예 정의하지 않는 편이 낫다(HA에서 unknown 상태로 표시되지만 오매칭보다는 안전)

## 5. RX/TX 방향 구분

로그의 `[RX]`/`[TX]`는 **브리지 기준**이다.

- `RX 30 0i …` 쿼리에 즉시 `TX b0 00 i …`가 따라오면 설정의 자동화가 대신 응답한 것이다. 이 TX를 엔티티 커맨드로 착각하지 말 것
- 실제 HA→버스 커맨드는 MQTT 서비스 호출 시에만 튀므로, 커맨드 도출은 **사용자가 HA UI로 조작한 순간의 TX**를 포획해야 한다
- TX가 전혀 안 보이는 경우: `/packets/preview`로 후보 바이트를 생성하고 checksum/header/footer 적용 결과가 다른 디바이스의 관측 TX 패턴과 같은 형태로 보이는지 비교

## 6. 커맨드 초안은 preview로 1바이트 단위 대조

```bash
node scripts/h2m.mjs preview <portId> 04010481000000
# -> {"packet":"040104810000008A"}  === 버스에서 관측한 TX hex
```

- 일치해야 `command_*` 초신을 신뢰할 수 있다
- 값 필드는 `data` 접두 + `value_index` + `value_encode`로 분리한다. 예: `04 i 03 14 00 00 00` → 온도 값이 `index 3`, BCD(`0x14` = 14도)
- `sub-command` 자리(byte2 등)가 동작별로 다른 값(0x03=온도, 0x04=전원)이면 `data`에 하드코딩

## 7. BCD / 값 인코딩 알아보는 법

- `0x25` → 25, `0x13` → 13, `0x05` → 5 처럼 hex 표기가 곧 10진으로 읽히면 `decode: bcd`
- `0x00`~`0x64` 범위인데 10진 변환값이 물리적으로 말도 안 되면(예: 실내온도 130도) bcd가 아니고 plain 값
- `add_0x80`, `signed_byte_half_degree` 같은 변형은 gallery 프리셋에 자주 나오니 벤더가 밝혀졌으면 `gallery/<vendor>/*.yaml`을 grep 하는 것이 가장 빠르다

## 8. glued 패킷

캡처 로그 한 줄에 8바이트×2가 붙어서 `30050000000000353006000000000036` 형태로 기록될 수 있다(serial frame 분할). `variance.mjs --length <rx_length>`로 나누면 NEW로 오인하지 않는다.

## 9. API 사용 시 실전 제약

- rate limit: 분당 120요청(전역 300과 별도). 캡처 반복 루프에서 `capture status`를 난사하지 말 것
- `similarityThreshold`는 **응답에 "이런 초안을 추천"을 만들지 않는다.** 충돌 경고(signature 유사) 용도이므로 초안 자동 생성은 agent가 가설→`analyze` 반복으로 해야 한다
- `analyze`는 활성 설정을 복제하고 초안을 **병합**한다. `MINE`과 `OTHER`가 동시에 나오는 건 정상이지만, `OTHER`에 기존 엔티티가 떠 있으면 시그니처가 겹친다는 뜻으로 읽고 충돌 여부를 판단한다
- `draftHash`는 파일+정규화된 초안의 해시. between validate/apply 사이에 다른 경로(UI 등)가 파일을 건드리면 `409 DRAFT_STALE` → 재검증 필요
- 기존 `/api/*`(UI API)는 무인증이라 같은 정보를 토큰 없이도 볼 수 있다. 테스트 의도로 블라인드를 유지하려면 `/entities` 응답을 일부러 읽지 않는 선택도 필요

## 10. 적용 전 체크리스트

1. `validate` → `valid=true`, `applicable=true`, `errors=[]`, `conflicts=[]`
2. 대표 hex 3개(상태 OFF / ON / 값변경)로 `analyze` → `MINE`이 관측 사실과 일치
3. 커맨드 전부 `preview`로 실측 TX와 일치
4. `discoveryPreview`로 나온 topic/unique*id가 기존 장치와 중복되지 않는지 확인 (`unique_id`는 `homenet*<portId>\_<id>`)
5. 사용자에게 재시작 영향(전 디바이스 briefly unavailable)을 알리고 승인

## 11. 사용자가 말한 벤더·모델명은 입력값이 아니라 가설

동일 벤더 내부에도 프로토콜 세대가 여러 개이고, 혼선 배선·파생 모델 때문에 **모델명과 실제 버스 프로토콜이 어긋나는** 사례가 있다. 시리얼 주소만 받고 예제 선택은 관측 바이트로 한다.

- 사용자가 지목한 예제가 `probe.mjs` 순위에서 2위 이하로 밀리면 적용하지 않고 coverage 수치를 보여준 뒤 확인을 요청한다
- 반대도 성립: coverage 100%라도 프레임 길이가 짧은(4바이트 등) 예제가 이기면 우연일 수 있다. 체크섬 검증 실패 사례가 0이어야 하고, 2위와 격차가 30%p 이상이어야 확정
- 예제 확정 후에도 `/packets/unmatched`에 다른 벤더 계열 접두가 다수 남으면 혼선·복수 버스 가능성을 다시 의심한다

## 12. 초기 설정의 미매칭은 대개 "예제가 스니펫보다 적게 펼쳤다"

`/setup/apply`가 쓰는 `packages/core/config/examples/<vendor>.homenet_bridge.yaml`은 대표 엔티티만 축약해 넣은 파일이라, 갤러리 스니펫(`gallery/<vendor>/*.yaml`)의 `discovery.match`+개수 파라미터로 확장하면 미매칭이 한 번에 사라지는 경우가 많다.

- `h2m.mjs gallery-match <portId|-> [vendor]`(또는 폴백 `gallery.mjs check <vendor> --length <rx_length> --packets "<unmatched>"`)가 `params={"heater_count":4}` / `채널값=0x03,0x04 → max=4`를 돌려주면 `heater_count`를 4로 채우는 근거
- `/gallery*`는 GitHub을 우선 읽고 동봉 `gallery/`는 폴백이므로, 응답의 `source=local`이면 프리셋이 배포본 사본(구버전 리비전)일 수 있다. 아래 리비전 어긋남 규칙을 특히 주의
- `/gallery*`는 **조회 전용**이다. Agent API에는 스니펫을 설정에 반영하는 엔드포인트가 없고 서버가 `$repeat`/`{{i}}`를 펼쳐주지도 않는다. 관측 채널만큼 explicit 엔티티로 풀어 `/entities/validate`·`/entities/apply`로 반영해야 미매칭이 실제로 줄어든다
- 폴링형에서는 **RX가 아니라 브리지 TX의 인덱스**가 채널 상한을 먼저 알려준다. `TX b0 00 03`이 관측됐다면 3번 조명 실물이 존재하지만 `RX b0 …`는 아직 안 나온 상태 — 이때도 확장 대상
- 단, 스니펫의 `discovery.match`에 HIT하지 않는 고정 프레임(`STATIC n=수백`, 페이로드 0 채움)은 요청/하트비트 잡음이다. 벤더 갤러리 전체와 대조해 HIT이 없으면 미매칭으로 남긴다
- 예제 파일과 갤러리 스니펫의 프로토콜 리비전이 어긋날 수 있다. 필드 조합은 갤러리에서, mask/ack/버튼값 같은 구체 바이트는 `/entities --full`로 읽은 **라이브 동일 타입 엔티티**에서 복사하고 채널 인덱스만 바꾼다

## 13. 무트래픽: 폴링형 vs 이벤트형(월패드) 구분

일부 제조사는 월패드 화면을 켜거나 물리 스위치를 조작할 때만 송수신이 발생한다. 일정 시간 캡처에도 아무 안 잡히면 "배선 문제"가 아니라 "조작 안 함"일 수 있다.

- 판정은 **원시 프레임 기준**: `h2m.mjs capture wait <portId> 60 5`는 `/capture`의 `packetCount`를 본다. `TRAFFIC`이면 폴링형, `NO_TRAFFIC`(exit 3)면 이벤트형으로 취급
- 함정: `/packets/history`는 매칭된 패킷만 담는다. 설정이 없는 신규 환경에서 history로 판단하면 미매칭 프레임이 계속 들어오는데도 조용한 버스로 오인한다
- 이벤트형으로 판정되면 대기하지 말고 즉시 사용자에게 요청: "월패드 화면을 켜서 전등 ON/OFF, 난방 목표온도 변경, 환기팬 모드 변경 등을 1~2분간 조작해 주세요"
- `NO_TRAFFIC`은 RX/TX 모두 0건이라는 뜻이다. `/ports` status가 `error`/`stopped`면 프레이밍·경로 문제이고, `started`인데 계속 0건이어야 이벤트형(조작 대기)으로 본다
- 이벤트형 버스는 사용자 조작 1회가 곧 1차·2차 캡처를 겸한다. 조작 직전에 캡처를 켜고 조작 순서를 메모해 두면 `--base` 대조 없이도 시간순으로 필드가 전개된다

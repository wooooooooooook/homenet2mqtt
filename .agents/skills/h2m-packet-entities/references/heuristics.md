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
4. `discoveryPreview`로 나온 topic/unique_id가 기존 장치와 중복되지 않는지 확인 (`unique_id`는 `homenet_<portId>_<id>`)
5. 사용자에게 재시작 영향(전 디바이스 briefly unavailable)을 알리고 승인

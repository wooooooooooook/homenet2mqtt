---
name: h2m-packet-entities
description: Homenet2MQTT 에이전트 API의 원시 RS485 패킷만으로 브릿지 설정과 디바이스 엔티티(climate/light/sensor/fan)를 역산하는 방법론. 신규 환경에서는 raw 바이트 수집 -> 예제(벤더) 자동 매칭 스코어링 -> /setup/apply 초기 설정, 이후 버스 캡처 -> 바이트 레이아웃/인코딩 추론 -> 엔티티 초안 작성 -> /packets/analyze·/packets/preview 증명 -> /entities/validate·/entities/apply 적용의 가설-검증 루프를 제공한다. "패킷만 보고 엔티티를 만들어줘", "이 unmatched 패킷이 뭔지 분석해줘", "설정을 모른 채 버스 관측만으로 히터/조명 설정을 찾아줘", "처음 설치된 환경인데 어느 벤더 예제인지 확인해줘", "역공학으로 커맨드 바이트를 증명해" 같은 요청에 사용.
argument-hint: <portId>
---

# 패킷 → 엔티티 설정 역산 방법론

## Overview

Homenet2MQTT Agent API(전용 포트 `/api/v1/agent`)의 관측·분석 엔드포인트만 사용해, RS485 버스를 오가는 hex 패킷에서 상태/커맨드 매핑을 추론하고 `/entities/*`로 적용 가능한 엔티티 초안을 만든다. 설정 파일을 읽지 않고 시작하는 **블라인드 역산**이 기본이다.

## 세 가지 불변 원칙

1. **변동이 유일한 증거다.** 값이 바뀌지 않는 바이트는 필드 의미를 확정할 수 없다. 정적 관측만으로 시그니처를 지으면 다른 디바이스를 삼킨다.
2. **추측 시그니처는 미매칭보다 해롭다.** 설명되지 않는 패킷은 엔티티를 만들지 말고 미해결로 보고한다.
3. **커맨드는 관측 바이트로 증명한다.** `state` 파싱이 맞어도 `command_*`가 버스에서 실측된 TX hex와 1바이트 차이까지 일치해야 신뢰할 수 있다.

## 전제와 범위

- **시리얼 프레이밍은 알려진 상태**에서 시작한다: `/ports`의 `serial`(path/baudRate/parity/stopBits)과 `packetDefaults`(`rx_length`, `rx_checksum`, `rx_header`, `tx_header`, footer)를 그대로 쓴다.
- **체크섬 로직도 알려진 상태**(`add` / `xor` / `add_no_header` / `xor_no_header` / `add_final_xor(..)`).
- 범위 밖(확장 예정): 시리얼 주소·보드레이트 자동 탐색(포트 스캔, parity/stop 브루트포스), 물리 `/dev/tty*` 예제별 baud 최적화
- 블라인드를 유지하려면 초안 완성 전 `/entities` 응답을 보지 말 것. 채점·중복 회피용으로 최종 단계에서만 참조한다.

## 0단계 — 완전 신규 환경에서는 예제 매칭부터

`/setup`의 `setupRequired: true`(설정 0개)라면 엔티티 역산 전에 브릿지 설정을 잡는다.

```bash
node scripts/probe.mjs <serialPath> [--baud 9600] [--parity none] [--stop 1] [--rounds 3]
```

`probe.mjs`의 판정 원리:

1. `POST /setup/test-serial`을 `example:"__empty__"` + 명시적 `serialConfig`으로 호출해 **벤더 편향 없는 raw 바이트**를 수집한다
2. `GET /setup/examples/<file>`로 13종 예제의 `rx_header`/`rx_footer`/`rx_length`/`rx_checksum`을 읽고
3. 수집 바이트에 대해 예제별 프레이밍 + 체크섬 검증을 자체 수행해 **coverage(설명된 바이트 비율)**로 순위화한다
4. 체크섬을 검증할 수 없는 예제(`none`, `bestin_sum`, `samsung_xor`, crc8 계열)은 순위에서 분리해 "판정 불가"로 별도 표시한다 — 길이 무제약 예제는 아무 바이트에서도 100%가 나오므로 추천 근거가 될 수 없다

::: warning `test-serial`은 벤더 판별 능력이 없다
`testSerial`은 예제의 serial 설정으로 포트만 열어 **data 이벤트 hex를 그대로** 돌려준다(`collectSerialPackets`는 `rx_checksum`/`rx_length`를 전혀 보지 않는다). TCP 브리지(`ip:port`)에서는 예제별 baud/parity가 socket에 영향 없는 경우가 많아 응답이 예제마다 동일하니, 판별은 반드시 `probe.mjs` 같은 자체 스코어링으로 해야 한다. 실제 물리 `/dev/tty*`에서는 baud/parity가 응답 자체를 바꾸므로 예제별 결과가 달라질 수 있다.
:::

후보 확정은 coverage 60% 이상 + 2위와 격차 30%p 이상을 기준으로 하고, 부족하면 `--rounds`를 늘리거나 상태 변동을 만든 뒤 재시행한다. 확정 후 적용:

```bash
node scripts/h2m.mjs post "/setup/apply" '{"mode":"init","example":"<winner>.homenet_bridge.yaml","serialPath":"<path>","portId":"<portId>","restart":true}'
```

- `mode:"init"`은 설정이 0개일 때만(`409 SETUP_NOT_REQUIRED` 방지). 이미 로드된 환경의 신규 포트는 `mode:"add"` + 미사용 `portId`
- 재시작 후 `/ports`(status=started), `/state`, `/packets/history`, `/packets/unmatched`를 확인한다
- **예제 수는 실제 디바이스 수와 무관하다.** 예: commax 예제는 climate 2개지만 버스에 4대가 있으면 `8280 04 …`가 unmatched로 남는다 → 1단계부터 7단계 역산 루프로 잔여를 채운다
- MQTT 접속 정보(브로커 주소/계정)는 config가 아니라 환경변수/애드온 옵션이므로 API로 설정 불가

## 방법론: 이중 캡처 가설 루프

### 1단계 — 프레이밍 파악

`/ports`에서 `portId`, `rx_length`, `rx_checksum`, `rx_header`, 엔티티 수를 읽는다. `portId`가 2개 이상이면 모든 호출에 명시해야 한다(`400 PORT_ID_REQUIRED`). 상태가 `error`인 포트는 트래픽이 없으므로 다른 포트를 고른다.

### 2단계 — 기준선 캡처 (변동 없는 상태)

`mode: all`로 시작해 60~120초 포팅 트래픽을 받고 정지·다운로드한 뒤 그룹별 변동을 본다.

```bash
node scripts/h2m.mjs capture start <portId> all
node scripts/h2m.mjs capture stop <portId>
node scripts/h2m.mjs capture files
node scripts/h2m.mjs capture get <filename> cap1.txt
node scripts/variance.mjs cap1.txt --length <rx_length>
```

`variance.mjs` 출력 해석:

- `uniq=N varyBytes=[i,j]` — **변하는 바이트가 데이터 필드 후보**, 접두는 디바이스/타입 식별자 후보
- `STATIC n=… <hex>` — 필드 의미 **확정 불가** 신호. 이 항목이 많을수록 3단계가 중요하다

### 3단계 — 상태 변동 확보 (병목)

STATIC이 많으면 추측하지 말고 **사용자에게 구체적으로 조작을 요청**한다. 한 번에 묶어서, 순서와 유지 시간을 명시해서 요청하는 것이 효율적이다:

- 히터/에어컨: 전원 ON → 목표 온도 2~3단계 변경(각 5초 유지) → OFF
- 조명: 1번만 ON → 5초 → OFF, 그 다음 2번 (여러 개를 동시에 켜면 어느 ID인지 구분 불가)
- 센서: 값이 실제로 변하도록 환기/냉방 등
- 미상 계열(`0f`/`8f` 등): 해당 장치를 직접 조작 가능하면 요청

조작 후 2차 캡처를 받아 1차와 대조한다:

```bash
node scripts/h2m.mjs capture get <newFilename> cap2.txt
node scripts/variance.mjs cap2.txt --base cap1.txt --length <rx_length>
```

NEW로 표시된 값과 `varyBytes`를 시간순으로 나란히 정렬하면 조작 순서 ↔ 바이트 대응이 성립한다(ON/OFF 비트, 목표값 인코딩).

### 4단계 — 레이아웃·인코딩 확정

- **체크섬**: 마지막 바이트가 앞 바이트 합(`add`)인지 xor인지 검증. 어긋나면 `_no_header` 변형, `rx_checksum2`(2바이트), footer 포함 여부를 순서대로 의심
- **index 좌표계**: `rx_header`가 비어 있으면 패킷 절대 바이트 위치, 있으면 헤더 이후 상대 위치
- **BCD**: `0x25`→25, `0x13`→13처럼 hex 표기가 곧 10진으로 읽히면 `decode: bcd`
- **채널 바이트**: 접두가 같은 그룹에서 한 바이트만 `01..0N`으로 도는 패턴은 디바이스 인덱스
- **RX/TX 쌍**: `RX 30 0i` 쿼리에 곧바로 `TX b0 00 i`가 따라오면 자동화/브리지 응답이지 엔티티 상태가 아니다

### 5단계 — 초안 작성

`references/entity-schema.md`로 필드명을, `references/draft-climate-example.json`으로 형태를 본린다. YAML이 아니라 숫자(JSON) 초안이라는 점에 주의(`0x82` → `130`, gallery의 `$repeat`/`{{i}}`는 펼친다).

- ID는 `^[A-Za-z0-9_-]+$`, 기존과 구별되는 접두(예: `draft_`)를 붙인다
- `state`를 비우지 말 것 — `{}`는 절대 매칭되지 않는다(미매칭의 흔한 원인)
- 타입 선택: 온도/모드 2개 이상 → `climate`, 단일 수치 → `sensor`, ON/OFF 2값 → `light`/`switch`
- mask는 **관측된 값보다 좁게** 잡지 말 것 — ack 패킷까지 같은 엔티티로 흡수하는 벤더 프리셋 관례 참고(`references/heuristics.md` §3)

### 6단계 — 증명 (저장 없음)

```bash
node scripts/h2m.mjs analyze <portId> <draft.json> <hex> <hex> ...
node scripts/h2m.mjs preview <portId> <txHex>
node scripts/h2m.mjs validate <portId> <draft.json>
```

판정 기준:

| 출력 | 뜻 | 행동 |
|---|---|---|
| `MINE=<id>={...}` 값이 관측 사실과 일치 | 초안 통과 | 다음 hex로 확장 |
| `MINE=NONE OTHER=<기존id>` | 시그니처가 기존 설정보다 좁음 | mask/index 재조정 |
| `MINE=... OTHER=<기존id>` | 시그니처가 겹침 | 중복 등록 여부·ID 충돌 판단 |
| `UNMATCHED <hex>` | 초안으로 설명 불가 | 추측 금지. 3단계로 돌아가 변동 요청 |
| `preview` 결과가 실측 TX와 다름 | 커맨드 오도출 | `data` 접두/`value_index`/`value_encode` 재검토 |

`validate`는 `valid`/`applicable`/`errors`/`conflicts`/`discoveryPreview`와 `draftHash`를 준다.

### 7단계 — 적용 (사용자 승인 필수)

`/entities/apply`는 YAML 기록 + 백업 + **서비스 재시작**을 수행하고, 재시작 전까지 라이브 등록이 안 된다. 반드시 방금 받은 `draftHash`로만 호출하며(파일/초안이 바뀌면 `409 DRAFT_STALE`), 재시작 영향(전 디바이스 일시 unavailable)과 `restart: false` 대안을 사용자에게 알리고 승인받는다. ID 충돌은 `resolutions`(`overwrite`/`skip`) 또는 `renames`로 해결한다.

`/packets/send`는 실제 버스에 트래픽을 흘리는 옵트인 기능이다. 테스트 토큰이라도 실제 디바이스가 붙은 버스에서는 쓰지 말 것.

### 8단계 — 보고

| 패킷 그룹 | 변동 | 도출 필드 | 상태 파싱 | TX preview | validate |
|---|---|---|---|---|---|
| 예시 그룹 | byte1 bit0, byte3/4 | `state_off`, 온도 `bcd` | 일치 | 일치 | applicable |
| 미해결 그룹 | 없음(STATIC) | 확정 불가 | - | - | - |

미해결 항목을 성공 항목과 섞어 보고하지 말 것.

## 도구

```bash
export H2M_URL="http://<H2M-HOST>:3001/api/v1/agent"   # Agent API 전용 포트 (UI 포트 아님)
export H2M_TOKEN="<설정 > Agent API에서 발급한 토큰>"
cd .agents/skills/h2m-packet-entities
node scripts/h2m.mjs info
```

- `scripts/h2m.mjs` — API 래퍼. `info|setup|get|post|entities|unmatched|history|capture|analyze|validate|apply|preview`
- `scripts/probe.mjs` — 신규 환경 예제 자동 매칭. raw 수집 → 예제별 프레이밍/체크섬 자체 검증 → coverage 순위화
- `scripts/variance.mjs` — 캡처 로그 그룹별 변동 분석(`--base`, `--length`, `--prefix`, `--show`)
- 순수 ESM, 외부 의존성 없음, node 18+ 필요(`fetch` 내장). `node`가 PATH에 없는 환경에선 해당 런타임 경로를 직접 지정한다
- rate limit 분당 120회 — 캡처 대기 중 `capture status`를 난사하지 말 것

## Resources

- `references/entity-schema.md` — 타입별 초안 필드명, 매칭 로직, core 소스 위치, YAML→JSON 변환
- `references/heuristics.md` — 체크섬·mask·ack·BCD·정적 버스·glued 패킷·API 제약에 대한 실측 판정 규칙과 함정
- `references/draft-climate-example.json` — `analyze`/`validate` 통과가 검증된 climate 초안 샘플(형태 참고용)
- API 규약: 리포 문서 `docs/guide/agent-api.md`, 라이브 스키마 `$H2M_URL/openapi.json`
- 같은 도메인 로직은 MCP(`POST $H2M_URL/mcp`)로도 노출되나, 캡처 파일 다운로드와 `packets/preview`는 REST 전용이다

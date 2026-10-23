---
name: h2m-packet-entities
description: Homenet2MQTT 에이전트 API의 원시 RS485 패킷만으로 브릿지 설정과 디바이스 엔티티(climate/light/sensor/fan)를 역산하는 방법론. 신규 환경에서는 사용자에게 시리얼 주소만 받아(벤더·모델명은 가설로 취급) raw 바이트 수집 -> 예제 자동 매칭 스코어링 -> /setup/apply 초기 설정, 확정된 벤더의 갤러리 스니펫을 대조해 미매칭 패킷이 남지 않도록 엔티티 개수를 확장, 이후 버스 캡처(무트래픽이면 월패드 조작을 사용자에게 요청) -> 바이트 레이아웃/인코딩 추론 -> 엔티티 초안 작성 -> /packets/analyze·/packets/preview 증명 -> /entities/validate·/entities/apply 적용의 가설-검증 루프를 제공한다. "패킷만 보고 엔티티를 만들어줘", "이 unmatched 패킷이 뭔지 분석해줘", "설정을 모른 채 버스 관측만으로 히터/조명 설정을 찾아줘", "처음 설치된 환경인데 어느 벤더 예제인지 확인해줘", "패킷이 안 잡히는데 어떻게 하나요", "역공학으로 커맨드 바이트를 증명해" 같은 요청에 사용.
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

사용자에게는 **시리얼 주소(TCP `ip:port` 또는 `/dev/tty*`)만** 받는다. 이 단계에서 다른 정보는 필요 없다.

::: warning 벤더명·모델명은 가설이지 증거가 아니다
"벤더가 commax예요", "모델은 ○○-100입니다" 같은 답변은 그대로 믿지 말 것. 실사례로 **모델명과 프로토콜이 어긋나는** 경우(동일 벤더 내부 프로토콜 세대 차이, 혼선 배선, 갤러리 미탑재 파생 모델)가 있다. 이름만으로 `/setup/apply`하면 잘못된 프레이밍으로 버스 전체를 잘못 파싱한다. 반드시 `probe.mjs`가 수집 바이트로 **프레이밍 + 체크섬 검증**을 통과한 예제만 확정하고, 사용자가 지목한 예제가 2위 이하로 밀리면 그 사실을 수치와 함께 보여준다.
:::

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
- **예제 수는 실제 디바이스 수와 무관하다.** 예: commax 예제는 climate 2개지만 버스에 4대가 있으면 `8280 04 …`가 unmatched로 남는다 → 다음 0.5단계에서 갤러리로 확장하고, 갤러리로도 설명 못 하는 잔여는 1~8단계 역산 루프로 채운다
- MQTT 접속 정보(브로커 주소/계정)는 config가 아니라 환경변수/애드온 옵션이므로 API로 설정 불가

## 0.5단계 — 갤러리를 훑어 미매칭부터 없애기

`/setup/apply`로 잡은 예제는 **대표 엔티티 몇 개만** 펼친 축약본이다. 같은 벤더의 갤러리(`gallery/<vendor>/*.yaml`)에는 디바이스 타입별 스니펫과 개수 파라미터가 있어, 관측 패킷과 대조하면 "예제에 없어서 unmatched로 남은" 잔여를 한 번에 채울 수 있다.

```bash
node scripts/h2m.mjs gallery                              # 벤더 목록: 스니펫 수/엔티티 타입/requirements
node scripts/h2m.mjs gallery <vendor>                     # 스니펫 인덱스: 파라미터 범위 + discovery.match
node scripts/h2m.mjs gallery-match <portId|-> [vendor]    # 관측 패킷으로 채점 → HIT + 개수 파라미터 추정치
node scripts/h2m.mjs gallery-show <vendor>/heaters_new.yaml   # 스니펫 원본 YAML
```

Agent API는 갤러리를 **GitHub을 우선**으로 읽고, 도달 불가일 때만 컨테이너에 동봉된 `gallery/`를 폴백으로 쓴다. 출력 마지막 줄의 `# source=`가 `local`이면 프리셋 리비전이 구버전일 수 있으니 아래 "라이브 설정에서 복사" 규칙으로 교정한다. `gallery-match`은 로그 리텐션이 켜져 있어야 채점되고, 꺼져 있으면 `UNAVAILABLE: …`을 돌려준다(에러가 아니라 안내). MCP를 쓰는 에이전트에는 `list_gallery` / `match_gallery` / `get_gallery_snippet`이 같은 기능이다 — 코드베이스 체크아웃 없이 API만으로 작업한다면 이 셋이 유일한 갤러리 소스다.

로컬 체크아웃이 있거나 `/gallery`가 없는 구버전 배포(`capabilities`의 `features.gallery`가 없는 경우)에서는 파일로 훑는다:

```bash
node scripts/gallery.mjs list <vendor>                 # 스니펫/타입/개수 파라미터/discovery.match 전체 목록
node scripts/gallery.mjs check <vendor> --length <rx_length> --packets "<unmatched hex 목록>"
node scripts/gallery.mjs show <vendor> <hit>.yaml      # meta 프로토콜 표 + entities 템플릿
```

`gallery-match`(API)와 `check`(파일)의 해석은 같다:

- `HIT <file> n=<패킷수>` — 그 스니펫의 `discovery.match`(data/mask)가 관측 프레임을 설명한다 → **초안에 반드시 반영**
- `params={"heater_count":4}` / `채널값=0x03,0x04 → max=4 (허용 1..9, 기본 4)` — `$repeat` 인덱스(`dimensions.index`)에서 관측된 최대 채널. **개수 파라미터를 정하는 근거**를 직접 계산한 값이다. 예제가 2개, 갤러리 기본값이 4인데 버스에 4번 채널이 보이면 4로 채운다
- HIT 없는 프레임은 0.5단계 범위가 아니다 → 1~8단계 역산 대상

gallery가 있는 로컬 체크아웃에서는 `--dir` 생략(기본 `gallery`), 배포본에서만 보이는 환경이면 `--dir /<컨테이너 갤러리 경로>`로 지정한다. 배포본 갤러리는 버전이 달라질 수 있으므로 `list`의 `v<version>`을 적용 설정의 메타와 대조한다.

::: warning 새 엔티티의 바이트 원본은 "라이브 설정"에서 복사
같은 벤더라도 `packages/core/config/examples/<vendor>.homenet_bridge.yaml`(setup이 적용한 파일)과 `gallery/<vendor>/*.yaml` 스니펫의 프로토콜 리비전이 다를 수 있다. `gallery-show`(API) 또는 `gallery.mjs show`로 **구조(필드 조합)**를 잡고, mask/ack/버튼값 같은 **구체 바이트는 `/entities --full`의 기존 동일 타입 엔티티**에서 복사해 채널 인덱스만 바꾼다. 두 소스가 어긋나면 라이브 설정이 정답이다(그 설정으로 이미 다른 채널이 정상 파싱되고 있다).
:::

`expand`는 위 주의사항을 지킨 초안을 빠르게 뽑기 위한 도구다. `$repeat`를 채널 목록으로 펼치고 `0xNN`→10진으로 바꿔 YAML을 출력한다(`{{i}}` 치환, folded scalar 안의 스크립트 문자열은 손대지 않는다):

```bash
node scripts/gallery.mjs expand <vendor> heaters_new.yaml --ids 3,4 > draft.yaml
node scripts/gallery.mjs expand <vendor> lights_new.yaml --ids 3 | tail -n +2 >> draft.yaml
# YAML → JSON(숫자 배열) 변환 후 h2m.mjs analyze/validate/apply 에 전달
```

`--ids`는 `gallery-match`/`check`가 알려준 **관측 채널만** 지정한다(빈 채널을 미리 만들어 두면 미매칭이 줄지 않고 경고만 늘어난다). YAML→JSON 변환에는 환경의 YAML 파서를 쓰고, 파서가 없으면 필드값을 직접 JSON으로 옮긴다.

API로 받은 스니펫을 펼칠 때는 `gallery-show <vendor>/<file>.yaml > snippet.yaml`로 저장한 뒤 같은 `expand`를 그 파일에 적용하면 된다. API 응답이 갤러리 원본 YAML이므로 `--dir`을 그 파일이 있는 경로로 바꿔 주는 것과 동일하다. 서버에 UI 포트가 열려 있는 환경이라면 레거시 `GET /api/gallery/discovery`(무인증)도 같은 채점을 하지만, Agent API `/gallery/match`가 토큰으로 보호되는 정상이므로 UI 포트를 일부러 열 필요는 없다.

미매칭 최소화에서 특히 놓치기 쉬운 것이 **요청/폴링 프레임이 알려주는 채널 상한**이다. `30 01`~`30 0a`처럼 인덱스 바이트만 도는 고정 프레임은 자체로 상태가 아니지만, 그 쿼리에 대한 브릿지 `TX b0 00 03` 응답은 **3번 채널 실물이 존재**한다는 증거다. RX만 보지 말고 variance 출력의 `TX|` 그룹 인덱스도 개수 파라미터에 반영한다.

반대로 **긴 시간이 지나도 단 1바이트도 변하지 않고(`STATIC n=수백`), 페이로드가 0으로 채워진 프레임**은 요청·하트비트 계열 잡음일 가능성이 높다. `list`로 그 벤더 스니펫 전부의 `discovery.match`를 대조해 HIT이 없으면, 미매칭으로 남기는 것이 엔티티를 지어내는 것보다 정확하다(불변 원칙 2).

## 방법론: 이중 캡처 가설 루프

### 1단계 — 프레이밍 파악

`/ports`에서 `portId`, `rx_length`, `rx_checksum`, `rx_header`, 엔티티 수를 읽는다. `portId`가 2개 이상이면 모든 호출에 명시해야 한다(`400 PORT_ID_REQUIRED`). 상태가 `error`인 포트는 트래픽이 없으므로 다른 포트를 고른다.

### 2단계 — 기준선 캡처 (변동 없는 상태)

먼저 **이 버스가 폴링형인지 이벤트형인지** 가른다. 캡처를 켜지 않고 20~60초만 들어보면 된다:

```bash
node scripts/h2m.mjs capture wait <portId> 60 5
```

- `TRAFFIC +N패킷` — 폴링형. 방치해도 프레임이 쌓인다 → 아래 기준선 캡처로 진행
- `NO_TRAFFIC`(exit 3) — **조작 시에만 오가는 버스**(월패드 화면을 켜야, 물리 스위치를 눌러야 송수신 발생). 이 상태로 3단계를 기다리지 말고 즉시 사용자에게 요청한다: "월패드 화면을 켜서 전등 ON/OFF, 난방 목표온도 변경, 환기팬 모드 변경 등을 1~2분간 직접 조작해 주세요". `capture wait`은 필요 시 캡처를 열었다가 결과 판정 후 스스로 닫는다

`NO_TRAFFIC`과 `무배선`은 다르다. `capture wait`이 0건이면 RX뿐 아니라 TX도 한 프레임 없는 상태다. `/ports`의 status가 `started`인데도 아무 안 오가면 배선/브리지 경로(터미널 서버 대역폭, 포트 충돌)을 먼저 의심하고, status가 `error`/`stopped`면 시리얼 주소·프레이밍 단계로 되돌아간다. 둘 다 아니어야 이벤트형 버스로 취급한다.

::: warning `capture wait`의 무트래픽 판정은 원시 프레임 기준
`/packets/history`는 **엔티티에 매칭된 패킷만** 담는다. 설정이 아직 없는 신규 환경에서 history 기준으로 "트래픽 없음"을 판단하면, 미매칭 프레임이 계속 들어오고 있는데도 조용한 버스로 오인한다. `capture wait`은 `/capture`의 `packetCount`(원시 프레임)를 보므로 이 함정이 없다.
:::

`mode: all`로 시작해 60~120초 버스 트래픽을 받아 정지·다운로드한 뒤 그룹별 변동을 본다.

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

STATIC이 많으면 추측하지 말고 **사용자에게 구체적으로 조작을 요청**한다. 폴링형 버스라도 폴링은 *현재값*을 반복 전송할 뿐이므로, 조작이 없으면 필드 의미가 영원히 정적이며 모드/액션 비트는 존재 자체가 관측되지 않는다. 한 번에 묶어서, 순서와 유지 시간을 명시해서 요청하는 것이 효율적이다:

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

| 출력                                    | 뜻                            | 행동                                            |
| --------------------------------------- | ----------------------------- | ----------------------------------------------- |
| `MINE=<id>={...}` 값이 관측 사실과 일치 | 초안 통과                     | 다음 hex로 확장                                 |
| `MINE=NONE OTHER=<기존id>`              | 시그니처가 기존 설정보다 좁음 | mask/index 재조정                               |
| `MINE=... OTHER=<기존id>`               | 시그니처가 겹침               | 중복 등록 여부·ID 충돌 판단                     |
| `UNMATCHED <hex>`                       | 초안으로 설명 불가            | 추측 금지. 3단계로 돌아가 변동 요청             |
| `preview` 결과가 실측 TX와 다름         | 커맨드 오도출                 | `data` 접두/`value_index`/`value_encode` 재검토 |

`validate`는 `valid`/`applicable`/`errors`/`conflicts`/`discoveryPreview`와 `draftHash`를 준다.

### 7단계 — 적용 (사용자 승인 필수)

`/entities/apply`는 YAML 기록 + 백업 + **서비스 재시작**을 수행하고, 재시작 전까지 라이브 등록이 안 된다. 반드시 방금 받은 `draftHash`로만 호출하며(파일/초안이 바뀌면 `409 DRAFT_STALE`), 재시작 영향(전 디바이스 일시 unavailable)과 `restart: false` 대안을 사용자에게 알리고 승인받는다. ID 충돌은 `resolutions`(`overwrite`/`skip`) 또는 `renames`로 해결한다.

`/packets/send`는 실제 버스에 트래픽을 흘리는 옵트인 기능이다. 테스트 토큰이라도 실제 디바이스가 붙은 버스에서는 쓰지 말 것.

### 8단계 — 보고

| 패킷 그룹   | 변동                | 도출 필드               | 상태 파싱 | TX preview | validate   |
| ----------- | ------------------- | ----------------------- | --------- | ---------- | ---------- |
| 예시 그룹   | byte1 bit0, byte3/4 | `state_off`, 온도 `bcd` | 일치      | 일치       | applicable |
| 미해결 그룹 | 없음(STATIC)        | 확정 불가               | -         | -          | -          |

미해결 항목을 성공 항목과 섞어 보고하지 말 것.

## 도구

```bash
export H2M_URL="http://<H2M-HOST>:3001/api/v1/agent"   # Agent API 전용 포트 (UI 포트 아님)
export H2M_TOKEN="<설정 > Agent API에서 발급한 토큰>"
cd .agents/skills/h2m-packet-entities
node scripts/h2m.mjs info
```

- `scripts/h2m.mjs` — API 래퍼. `info|setup|get|post|entities|unmatched|history|capture(start|stop|status|wait|files|get|delete)|gallery|gallery-show|gallery-match|analyze|validate|apply|preview`
- `scripts/probe.mjs` — 신규 환경 예제 자동 매칭. raw 수집 → 예제별 프레이밍/체크섬 자체 검증 → coverage 순위화
- `scripts/gallery.mjs` — **폴백**(API에 `/gallery`가 없는 구버전 배포 또는 로컬 스니펫 편집 시). `list`(스니펫/파라미터 전체 목록) · `check`(discovery.match로 관측 프레임 설명 + 채널 max) · `show`(스니펫 원문) · `expand`(`$repeat` 펼침)
- `scripts/variance.mjs` — 캡처 로그 그룹별 변동 분석(`--base`, `--length`, `--prefix`, `--show`)
- 순수 ESM, 외부 의존성 없음, node 18+ 필요(`fetch` 내장). `node`가 PATH에 없는 환경에선 해당 런타임 경로를 직접 지정한다
- rate limit 분당 120회 — `capture wait`의 폴링 간격은 5초 이상 유지하고 `capture status`를 난사하지 말 것

## Resources

- `references/entity-schema.md` — 타입별 초안 필드명, 매칭 로직, core 소스 위치, YAML→JSON 변환
- `references/heuristics.md` — 체크섬·mask·ack·BCD·정적 버스·glued 패킷·API 제약에 대한 실측 판정 규칙과 함정
- `references/draft-climate-example.json` — `analyze`/`validate` 통과가 검증된 climate 초안 샘플(형태 참고용)
- API 규약: 리포 문서 `docs/guide/agent-api.md`, 라이브 스키마 `$H2M_URL/openapi.json`
- 같은 도메인 로직은 MCP(`POST $H2M_URL/mcp`)로도 노출되나, 캡처 파일 다운로드와 `packets/preview`는 REST 전용이다

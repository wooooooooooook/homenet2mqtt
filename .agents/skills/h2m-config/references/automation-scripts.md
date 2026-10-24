# 자동화(automation)·스크립트(scripts) 레퍼런스

갤러리에는 엔티티만으로 끝나지 않는 디바이스가 많다. 집계 시점 기준 `gallery/`의 32개 스니펫이 `automation`을, 11개가 `scripts`를 포함하며, 이들은 **디바이스 동작의 일부**다(최신 개수는 `h2m.mjs gallery <vendor>`의 `auto=N scripts=M`으로 확인). 엔티티만 옮기고 automation을 빠뜨리면 상태가 갱신되지 않거나, 월패드 버스 질의에 응답하지 못하거나, 벨/엘리베이터 시퀀스가 동작하지 않는다.

반대로 무조건 automation부터 만들면 안 된다. **상태 파싱은 엔티티가 하고, automation은 엔티티가 못 하는 일(요청·응답·시퀀스·복합 패킷 생성)만 맡는다.**

## 1. 언제 필요한가 (빠른 판단)

| 상황                                                     | 해법                                             | 갤러리 예                                                         |
| -------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------- |
| 디바이스가 주기적으로 상태 패킷을 스스로 보냄            | automation 불필요 (엔티티 `state`만)             | 대부분의 조명/센서                                                |
| 상태를 요청해야만 응답함                                 | `schedule` + `command_update` 또는 `send_packet` | `ezville/fan.yaml`, `commax/heaters_request.yaml`                 |
| 시작 시 등록/핸드셰이크 후 keepalive가 필요함            | `startup` + `schedule`                           | `samsung_hvac/climate.yaml`                                       |
| 월패드/브리지가 버스 질의에 대신 응답해야 함             | `packet` 트리거 + `send_packet`                  | `samsung_sds/elevator_new.yaml`, `commax/virtual_lights.yaml`     |
| 수신 패킷을 여러 엔티티 상태로 동시에 풀어야 함          | `packet` 트리거 + `update_state`                 | `hyundai_imazu/periodic_update.yaml`                              |
| 벨 울림 → 통화 → 문열기처럼 지연·대기가 있는 시퀀스      | `state` 트리거 + `delay`/`wait_until`/`command`  | `kocom/doorbell.yaml`, `ezville/door_auto.yaml`                   |
| 같은 TX 패킷 생성 로직을 여러 커맨드/버튼이 공유함       | `scripts` + 엔티티 `command_*: { script: ... }`  | `bestin/climate_new.yaml`, `hyundai_imazu_doorbell/doorbell.yaml` |
| 시퀀스 번호·카운터를 상태로 유지하며 패킷을 만들어야 함  | `scripts` + `internal` number 엔티티             | `bestin/fan.yaml`, `bestin/valve.yaml`                            |
| 실제 상태 패킷이 없어 낙관적 상태를 명령/응답으로 관리함 | `optimistic` 엔티티 + `update_state`             | `samsung_sds/gas_valve_close.yaml`                                |

피해야 할 것:

- 이미 엔티티 `state`로 파싱되는 값을 automation `update_state`로 중복 갱신하지 않는다.
- 단일 커맨드를 `send_packet`으로 다시 쓰지 않는다. 엔티티 `command_*`가 이미 한다.
- 관측 변동이 없는 STATIC 패킷을 automation으로 억지 해석하지 않는다(`heuristics.md` §2).
- 사용자가 확인하지 않은 채널·기기를 위한 폴링 automation을 미리 만들지 않는다.

## 2. 갤러리에서 automation/scripts를 읽는 법

```bash
node scripts/h2m.mjs gallery <vendor>          # 각 스니펫의 auto=N scripts=M 표시
node scripts/h2m.mjs gallery-show <vendor>/<file>.yaml
node scripts/h2m.mjs gallery-expand <vendor>/<file>.yaml '{"<count_param>":4}' --out draft.json
node scripts/h2m.mjs automations <portId>      # 라이브 automation(ID·트리거·액션)
node scripts/h2m.mjs scripts <portId>          # 라이브 script(ID·액션)
```

- `gallery-expand`(MCP `expand_gallery_snippet`)는 스니펫의 `automation`/`scripts`까지 같은 파라미터로 펼쳐 `draft.automations`/`draft.scripts`에 넣는다. 직접 계산하기 전에 이 결과를 먼저 쓰고, `counts`로 개수를 확인한다.
- 초안을 쓰기 전에 `/automations`·`/scripts`(MCP `get_automations`/`get_scripts`)로 기존 ID와 동작을 확인한다. 같은 질의에 응답하거나 같은 상태를 갱신하는 automation이 이미 있으면 추가하지 않는다.
- API 응답의 `contentSummary.automations`/`contentSummary.scripts`(=`h2m.mjs gallery <vendor>`의 `auto=N scripts=M`)가 0보다 크면 스니펫 원문에 해당 블록이 있다.
- **automation 전용 스니펫은 `discovery.match`가 없어 `gallery-match` HIT에 나오지 않는다**(`commax/heaters_request.yaml`, `hyundai_imazu/periodic_update.yaml`). 벤더 목록에서 `auto=N`과 이름/설명으로 후보를 찾아 `gallery-expand`로 펼친다.
- `meta.description`에 "통합됨", "사용할 필요 없음" 같은 deprecated 표시가 있으면 옮기지 않는다(`hyundai_imazu/periodic_update.yaml`은 조명 스니펫에 통합됨). 최신 동등 스니펫을 먼저 찾는다.
- `gallery-match`는 `discovery.match`만 채점한다. **automation이 필요한지 여부는 알려주지 않는다.** HIT 스니펫이라도 `gallery-expand`의 `draft.automations`/`draft.scripts`와 `auto=N scripts=M`을 직접 확인한다.
- `automation`도 엔티티와 같은 `$repeat`/`$nested`/`{{i}}` 템플릿을 쓴다. `gallery-expand`가 펼쳐 주며, 서버 펼침이 없는 버전에서만 직접 펼친다.
- automation 안의 `target: id(<entity_id>)...`와 `target_id`는 **같은 설정 파일의 엔티티 ID**를 가리킨다. 라이브에 이미 있는 ID이거나 이번 초안에 함께 넣은 ID여야 한다.
- `scripts`의 `mode` 필드는 `ScriptConfig` 스키마에 없다(일부 갤러리 파일에 잔재). 옮겨도 무시되므로 의존하지 않는다.
- 일부 구형 갤러리 automation은 `trigger: { type: state, entity: ..., to: ... }`를 쓴다. 현재 런타임은 `entity_id`/`property`/`match`만 본다. 발견하면 **`entity_id` + `property` + `match`로 고쳐 쓴다.**

## 3. 주요 패턴

### 3.1 주기 폴링 — `schedule` + 커맨드/패킷

가장 흔한 패턴이다. 엔티티에 `command_update`가 있으면 `command` 액션으로 호출하고, 없으면 요청 패킷을 직접 보낸다.

```yaml
automation:
  - id: update_fan_state
    trigger:
      - type: schedule
        every: 1m
    then:
      - action: command
        target: id(heat_exchanger_fan).command_update()
```

채널이 여러 개면 `$repeat`를 쓴다(초안에서는 펼친다).

```yaml
- id: request_state
  trigger:
    - type: schedule
      every: 5s
  then:
    - action: send_packet
      data: [0x02, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00]
      checksum: true
    - action: delay
      milliseconds: 100ms
```

- 시작 직후에도 한 번 받아야 하면 `startup` 트리거를 함께 건다(`kocom/lights_new.yaml`).
- **`schedule` 트리거가 있는 automation의 최상위 `command` 액션은 `low_priority: true`로 자동 설정된다.** `if`/`choose`/`repeat` 안에 중첩된 `command`와 script 내부 `command`는 자동 적용되지 않으므로, 폴링이 사용자 조작을 막으면 `low_priority: true`를 명시한다.
- 폴링 주기는 벤더 스니펫 값을 따른다. 임의로 1초 폴링을 만들지 않는다.

### 3.2 시작 등록 + keepalive

```yaml
- id: samsung_hvac_register
  trigger:
    - type: startup
  then:
    - action: delay
      duration: 3s
    - action: send_packet
      data: [0xD0, 0xC8, 0xD1, 0xD2, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]
      header: true
      footer: true
      checksum: true
- id: samsung_hvac_keepalive
  trigger:
    - type: schedule
      every: 10s
  then:
    - action: send_packet
      data: [0xD0, 0xC8, 0xD1, 0xD2, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]
      header: true
      footer: true
      checksum: true
```

`startup`은 브리지 시작 시 한 번이다. 장비가 늦게 뜨면 `delay`를 먼저 둔다.

### 3.3 버스 질의 대리 응답 — `packet` 트리거 + `send_packet`

월패드나 다른 제어기가 보내는 질의에 브리지가 응답해야 하는 경우다.

```yaml
- id: response_init
  trigger:
    - type: packet
      match:
        data: [0xA4, 0x5A]
        mask: [0xFF, 0xFF]
        index: 0
  then:
    - action: send_packet
      data: [0xB0, 0x5A, 0x00]
      checksum: true
```

- `match.index`를 생략하면 `rx_header` **다음 바이트**부터, 명시하면 **패킷 절대 위치(헤더 포함)** 기준이다.
- `match`가 비어 있으면 패킷 트리거는 매칭되지 않는다.
- `data`는 두 방식 중 하나로 쓴다. 스니펫 관례를 그대로 따른다.
  - **payload 방식**: `data`에 헤더/푸터/체크섬을 뺀 본문만 넣고 `header`/`footer`/`checksum: true`
  - **full packet 방식**: 헤더·체크섬·푸터까지 `data`에 넣고 `checksum: false` (`ezville/door_auto.yaml`)
- 같은 질의에 응답하는 automation이 이미 있으면 추가하지 않는다. 응답이 두 개면 버스가 깨진다.
- `trigger.prev_packet`으로 직전 패킷을 조건에 쓸 수 있다(`samsung_sds/gas_valve_close.yaml`).

```yaml
guard: 'has(trigger.prev_packet) && trigger.prev_packet[0] == 0xAB && trigger.prev_packet[1] == 0x41'
```

### 3.4 수신 패킷 → 여러 엔티티 상태 갱신

한 패킷에 여러 채널 상태가 실려 있을 때 `update_state`를 연속 사용한다.

```yaml
- id: update_lights_1
  trigger:
    - type: packet
      match:
        data: [0x00, 0x01, 0x19, 0x04, 0x40, 0x10]
        mask: [0x00, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]
  then:
    - action: update_state
      target_id: room_1_light_1
      state:
        state_on: { index: 9, data: [0x01] }
        state_off: { index: 9, data: [0x02] }
```

- `update_state.state`의 키는 **대상 엔티티에 이미 정의된 상태 필드**여야 한다. 없으면 런타임 오류다.
- `state_*` 원형 키와 정규화 이름(`state`, `target_temperature` 등)을 모두 쓸 수 있다.
- `target_id`는 CEL로 동적 지정할 수 있다: `"'light_' + string(trigger.packet[1])"`(`commax/virtual_lights.yaml`).
- 상태 패킷이 없는 낙관적 엔티티는 `optimistic: true` + automation `update_state`로 상태를 관리한다. 이때 엔티티에 `state` 스키마를 정의해 두어야 `update_state`가 허용된다.

### 3.5 상태 트리거 기반 시퀀스

벨 울림, 엘리베이터 호출처럼 여러 단계를 시간 순서로 보내야 할 때 쓴다.

```yaml
- id: auto_open_front_door_automation
  mode: single
  trigger:
    - type: state
      entity_id: front_doorbell
      property: state
      match:
        eq: 'ON'
  guard: get_from_states('auto_open_front_door', 'state', 'OFF') == 'ON'
  then:
    - action: delay
      milliseconds: 1000
    - action: command
      target: id(call_front_doorbell).command_press()
    - action: wait_until
      condition: get_from_states('front_doorbell', 'state') == 'OFF'
      timeout: 5s
    - action: command
      target: id(open_front_door).command_press()
```

- 상태 트리거는 `entity_id`가 필수다. `property`를 생략하면 상태 객체 전체를 비교한다.
- `match`는 원시 값, 정규식(`'/^D_/'`), 비교 객체(`{ gt, gte, lt, lte, eq }`)를 지원한다.
- **문자열 비교는 대소문자를 구분하고, 정규화된 상태는 대문자**(`ON`/`OFF`, `OPEN`/`CLOSED` 등)다. 구형 스니펫의 `eq: 'on'`/`== 'on'`은 `/state`의 실제 값으로 고친다. YAML에서 맨 `on`/`off`는 불리언으로 파싱될 수 있으므로 반드시 인용한다.
- 긴 시퀀스는 `mode: single`(실행 중 무시) 또는 `restart`(이전 실행 취소)를 쓴다. `parallel`은 같은 시퀀스가 겹칠 수 있다.
- 사용자가 끄고 켤 수 있는 자동열기 스위치가 있으면 `guard`(또는 `if`)로 막는다(`hyundai_imazu_doorbell/doorbell.yaml`).

### 3.6 스크립트 — 복합 패킷 생성과 재사용

`scripts`는 automation 액션 시퀀스를 이름으로 묶는다. 엔티티 `command_*`에서도 호출할 수 있다.

```yaml
scripts:
  - id: make_heating_packet
    args:
      room_id: { type: number, default: 1, min: 1, max: 8 }
      power: { type: number, default: 1, min: 1, max: 2 }
      temp: { type: number, default: 20, min: 10, max: 30 }
    actions:
      - action: send_packet
        data: >-
          [0x28, 0x0E, 0x12,
           int(get_from_states('sequence_number', 'number', 0)),
           bitAnd(int(args.room_id), 0x0F), int(args.power), int(args.temp),
           0x00, 0x00, 0x00, 0x00, 0x00, 0x00]
        ack: [0x02, 0x28, 0x81]
        header: true
        checksum: true

entities:
  climate:
    - id: room1_heating
      command_temperature:
        script: make_heating_packet
        args:
          room_id: 1
          power: 1
          temp: x
```

- `actions`는 1개 이상이어야 하고, `script`가 자기 자신을 (간접) 호출하면 실행이 중단된다.
- `args` 값이 문자열이고 `(`, `.`, `[`를 포함하면 CEL로 평가된다. 리터럴 문자열은 이런 문자를 피하거나 실패 시 원문 유지 동작을 염두에 둔다.
- 버튼/스위치에서 시퀀스를 실행할 때는 `command_press: { script: ... }` 또는 `command_on/off: { script: ... }`를 쓴다(`hyundai_imazu_doorbell/doorbell.yaml`).
- 시퀀스 번호를 쓰는 벤더(bestin 계열)는 `internal` number 엔티티와 `update_sequence_number` 스크립트를 세트로 복사한다. 수정 후 `/state`에서 값이 실제로 증가하는지 확인한다.

## 4. 초안에 넣는 법

automation/scripts도 엔티티와 같은 초안으로 validate/apply한다.

```json
{
  "entities": { "fan": [{ "id": "heat_exchanger_fan", "...": "..." }] },
  "automations": [
    {
      "id": "poll_heat_exchanger_fan",
      "trigger": [{ "type": "schedule", "every": "1m" }],
      "then": [{ "action": "command", "target": "id(heat_exchanger_fan).command_update()" }]
    }
  ],
  "scripts": [
    {
      "id": "open_door_script",
      "actions": [
        { "action": "send_packet", "data": [0xb4, 0x00, 0x00], "header": true, "footer": true }
      ]
    }
  ]
}
```

| 규칙      | 내용                                                                                                                                                                                                   |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 필드명    | API 초안은 `automations`(복수)만 받는다. 설정 파일 최상위 키는 `automation`(단수)이며, `scripts`는 양쪽 동일. `h2m.mjs`는 로컬 초안의 `automation` 별칭도 변환한다                                     |
| 액션 목록 | `then`을 쓴다. `actions`는 deprecated 별칭이며 `then`과 동시에 정의할 수 없다                                                                                                                          |
| ID        | 엔티티·automation·script 전체에서 중복 불가. 초안에는 구별되는 접두(`draft_`)를 권장                                                                                                                   |
| 충돌      | automation/script는 **정확한 ID 충돌만** 감지된다. 엔티티처럼 시그니처 유사 충돌은 없다. 같은 기능의 automation이 다른 ID로 이미 있을 수 있으므로 `/automations`·`/scripts`로 동작을 확인하고 추가한다 |
| `$repeat` | 자동 펼침 없음. 관측/확인된 채널만큼 명시적으로 펼친다                                                                                                                                                 |
| 검증      | `validate`는 ID·필수 필드·`then`/`actions` 동시 정의·script `actions` 비어 있음 등 **정적 규칙**만 본다. script 참조 존재 여부와 실행 의미는 검증하지 않는다                                           |
| 분석      | `analyze`는 초안을 병합해 RX 매칭만 평가한다. automation의 송신·상태 변경은 시뮬레이션하지 않는다                                                                                                      |

적용 결과의 `applied.entities`/`applied.automations`/`applied.scripts`(반영된 ID 배열)와 `validate`의 `counts`로 실제 반영 여부를 확인한다.

## 5. 실행 의미 체크리스트

### 트리거

- `state`: `entity_id` 필수, `property`로 비교 대상 지정, `match` 생략 시 모든 변경.
- `packet`: `match.data` 필수. `index` 생략 = 헤더 이후, 명시 = 헤더 포함 절대 위치.
- `schedule`: `every` 또는 `cron`. 타임존은 설정에 없으면 UTC다.
- `startup`: 브리지 시작 시 1회.

### CEL 컨텍스트

- `trigger.packet` / `trigger.prev_packet`은 바이트 배열(BigInt)이다. 숫자 비교·산술 전에 `int(...)`로 캐스팅한다.
- 여러 트리거를 한 automation에 두고 분기하려면 트리거 `id`를 주고 `trigger.id`를 비교한다.
- 상태 조회는 `get_from_states('<entity_id>', '<key>', <default>)` 또는 `get_from_state('<key>', <default>)`를 쓴다.

### 액션

- `command`: `id(<entity_id>).command_<name>(<value>)`. 복잡한 인자는 `input` 객체를 쓴다.
- `send_packet`: `checksum` 기본값은 `true`. `header`/`footer` 기본값은 `false`. `ack`를 주면 응답까지 대기한다.
- `update_state`: 대상 엔티티에 정의된 상태 필드만 갱신 가능.
- `delay`: `milliseconds` 또는 `duration`.
- `wait_until`: `condition`이 참이 될 때까지 대기, `timeout` 기본 30s.
- `if`/`choose`: `then`/`else`, 첫 일치 조건만 실행.
- `repeat`: `count` 또는 `while` + `max`. 무한 루프 방지.
- `stop`: 이후 액션을 중단.

### 모드

| mode       | 용도                                             |
| ---------- | ------------------------------------------------ |
| `parallel` | 기본. 겹쳐도 되는 폴링                           |
| `single`   | 시퀀스 중복 방지(벨/문열기)                      |
| `restart`  | 새 이벤트가 오면 이전 시퀀스 취소(엘리베이터/벨) |
| `queued`   | 순차 처리                                        |

## 6. 안티패턴과 주의

- **중복 폴러/응답자**: 같은 질의에 응답하는 automation을 두 개 만들면 버스 트래픽과 상태가 꼬인다. 추가 전에 `h2m.mjs automations <portId>`로 기존 자동화 동작을 확인한다.
- **자동화 루프**: `send_packet` → `packet` 트리거 → 다시 `send_packet` 구조를 만들지 않는다. `guard`/`mode`/`prev_packet`으로 끊는다.
- **폴링 폭주**: 채널마다 별도 automation + 짧은 `every`는 버스와 MQTT를 포화시킨다. 한 automation에서 `$repeat`/`send_packet`으로 묶는다.
- **낙관적 상태 남용**: 실제 상태 패킷이 있으면 `optimistic`을 쓰지 않는다. 써야 하면 명령/응답 automation이 상태를 반드시 갱신하게 한다.
- **`low_priority` 누락**: `schedule` + 중첩 `command`/script 내부 `command`는 자동 적용 대상이 아니다.
- **`/packets/send`로 자동화 테스트**: 실제 버스에 트래픽을 흘린다. 실기기가 연결된 환경에서는 쓰지 않는다.
- **적용 후 검증 생략**: 재시작 후 최소 1회 폴링 주기와 실제 조작 1회를 관찰한다.

## 7. 적용 후 검증

1. `validate` — `counts.entities/automations/scripts`, `valid`, `applicable`.
2. `apply` — `applied.entities`/`applied.automations`/`applied.scripts`의 ID 목록.
3. 재시작 후:
   - `/state`에서 폴링으로 값이 갱신되는지
   - `/packets/history`에 요청/응답 TX가 보이는지
   - `/events`(`automation:*`, `script:action`)로 트리거·액션 실행 확인
   - `/packets/unmatched`가 늘지 않았는지
4. 사용자 조작 1회(스위치/월패드/벨)로 시퀀스 전체를 확인한다.
5. 동작하지 않으면 `enabled: false`, 트리거 `entity_id`/`id`, `guard`, `mode`, script ID, `low_priority`, 타임존 순으로 확인한다.

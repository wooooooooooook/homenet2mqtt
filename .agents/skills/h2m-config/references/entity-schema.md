# 엔티티 초안 필드 레퍼런스

**정본은 라이브 스키마다.** 필드명·enum·required가 기억나지 않으면 추측하지 말고 먼저 확인한다(Agent API, Bearer 토큰):

```bash
node scripts/schema.mjs fields climate          # 필드명·타입·required
node scripts/schema.mjs fields light --desc     # 설명 포함
node scripts/schema.mjs def StateNumSchema      # 제약 원문(JSON)
```

MCP 클라이언트면 `get_config_schema`가 같은 문서를 준다(기본 `homenet-bridge`, 이름 목록은 `list_config_schemas`). 다만 MCP 결과는 **문서 전체**(약 120KB)라 필드 단위로 잘려 있지 않으니, 위 스크립트가 없다는 이유로 무비교로 통째로 올리지 말 것.

스키마는 이 빌드의 Zod 정의에서 생성되므로 저장소 사본과 어긋날 일이 없다. 아래 표는 그 스키마의 **요약**이며, `/schema`가 없는 구버전·오프라인에서 쓰는 폴백이다. 최종 판정은 언제나 `validate`다.

체크섬(`rx_checksum`/`tx_checksum`)처럼 스키마에서 `string`으로 느슨하게 표현된 항목은 스키마만으로 값 목록을 알 수 없다 — `heuristics.md`의 실측 규칙과 기존 엔티티의 실제 값을 함께 본다.

개발 체크아웃에서만 유효한 좌표(단독 배포에는 이 파일들이 없다):

- `packages/core/src/protocol/types.ts` — `StateSchema`(~206), `StateNumSchema`(~247), `PacketDefaults`(~102), `ChecksumType`(~32), `DecodeEncodeType`(~88)
- `packages/core/src/domain/entities/base.entity.ts` — `EntityConfig`, `CommandSchema`
- `packages/core/src/domain/entities/{light,climate,sensor,fan,switch}.entity.ts` — 타입별 필드
- `packages/core/src/utils/packet-matching.ts:13` — `matchesPacket()` (시그니처 매칭 로직)
- JSON 스키마 파일: `packages/core/static/schema/homenet-bridge.schema.json` (= `GET /schema/homenet-bridge` 응답과 같은 파일)
- 벤더 프리셋(필드 사용 예): `/gallery*` API의 스니펫(`gallery-show`)

## 공통 (EntityConfig)

`id`, `name`, `device`, `area`, `icon`, `optimistic`, `restore_mode`, `state_proxy`/`target_id`, `packet_parameters`(엔티티별 `packet_defaults` 오버라이드: rx/tx header, checksum, length).

## StateSchema (시그니처 / 조건)

| 필드       | 의미                                                                                                             |
| ---------- | ---------------------------------------------------------------------------------------------------------------- |
| `data`     | 기대 바이트 배열                                                                                                 |
| `mask`     | number 또는 number[]. `패킷바이트 & mask == data & mask` 로 비교. 좁은 mask = 여러 패킷형을 하나의 엔티티로 흡수 |
| `index`    | 비교 시작 바이트. `offset`은 deprecated 별칭                                                                     |
| `inverted` | 매칭 결과 반전                                                                                                   |
| `guard`    | CEL 표현식 (`data`, `state` 컨텍스트)                                                                            |
| `except`   | 제외 조건(배열)                                                                                                  |

**`state: {}` 는 절대 매칭되지 않는다.** optimistic 전용 placeholder일 뿐이므로 미매칭 패킷의 원인이 된다.

`index` 좌표계: `rx_header`가 비어 있으면 패킷 절대 위치, 헤더가 있으면 헤더 이후 상대 위치.

## StateNumSchema (숫자 상태)

`StateSchema` + `length`, `precision`(소수), `signed`, `endian`, `decode`, `mapping`.

`decode`: `none` | `bcd` | `ascii` | `signed_byte_half_degree` | `multiply` | `add_0x80`.

## CommandSchema

| 필드                                            | 의미                                             |
| ----------------------------------------------- | ------------------------------------------------ |
| `data`                                          | 커맨드 접두 바이트(값 자리를 0x00으로 두고 채움) |
| `ack`                                           | `number[]` 또는 `StateSchema` — 응답 판정        |
| `value_index`                                   | 값이 들어갈 바이트 위치 (0부터)                  |
| `value_encode`                                  | 위 `DecodeEncodeType`                            |
| `length`, `signed`, `endian`, `multiply_factor` | 값 인코딩 보조                                   |
| `low_priority`, `script`                        | 전송 스케줄/스크립트 참조                        |

`command_*`는 세 가지 형태를 받는다: `CommandSchema` 객체, CEL 문자열, `{ script: <scriptId>, args: {...} }`. 스크립트 형태는 복합 TX 패킷 생성에 쓰이며, 참조하는 script가 초안 `scripts`에 함께 있어야 한다. `validate`는 이 참조를 검사하지 않으므로, 빠뜨리면 적용 후 커맨드가 조용히 동작하지 않을 수 있다.

## 초안 봉투 (draft envelope)

`POST /entities/validate`·`/entities/apply`, MCP `validate_entity_draft`·`apply_entity_draft`, `h2m.mjs analyze/validate/apply`가 받는 JSON은 다음 네 필드만 본다.

| 초안 필드        | 설정 파일 키      | 내용                                                                                                                      |
| ---------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `entities`       | 타입별 키         | `{ climate: [...], light: [...], sensor: [...] }` (필수)                                                                  |
| `automations`    | `automation`      | `AutomationConfig[]`. **API 본문은 복수형만** 받고, 설정 파일 키는 단수형이다(`h2m.mjs`는 로컬 초안의 단수형 별칭도 변환) |
| `scripts`        | `scripts`         | `ScriptConfig[]`                                                                                                          |
| `packetDefaults` | `packet_defaults` | 포트 기본값 오버라이드(선택)                                                                                              |

`validate` 응답의 `counts`는 `{ entities, automations, scripts }`다. 적용 후 재시작 전까지는 라이브 등록이 안 된다.

## AutomationConfig / ScriptConfig

| 타입               | 필드                                                                                                                                                      |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AutomationConfig` | `id`(필수, 유일), `trigger[]`(필수), `then[]`(필수), `guard?`, `else?`, `mode?`(`parallel\|single\|restart\|queued`), `enabled?`, `name?`, `description?` |
| `ScriptConfig`     | `id`(필수, 유일), `actions[]`(필수), `args?`, `description?`                                                                                              |

- `then`이 정본이고 `actions`는 deprecated 별칭이다. **둘을 동시에 정의할 수 없다.**
- `trigger`는 배열이다. 타입: `state`(`entity_id`, `property?`, `match?`, `debounce_ms?`), `packet`(`match`), `schedule`(`every` 또는 `cron`), `startup`.
- 액션 타입: `command`(`target`, `input?`, `low_priority?`), `publish`, `log`, `delay`, `script`, `update_state`(`target_id`, `state`), `send_packet`(`data`, `checksum?`, `header?`, `footer?`, `ack?`), `if`, `repeat`, `wait_until`, `choose`, `stop`.
- `ScriptConfig`에는 `mode`가 없다. 갤러리 스니펫의 script `mode`는 버린다.
- 구형 `entity`/`to` 상태 트리거와 `actions` 전용 트리거는 현재 런타임이 읽지 않는다. `entity_id`/`property`/`match` + `then`으로 고쳐 쓴다.

패턴·런타임 의미론·함정은 `automation-scripts.md`를 본다.

## 타입별 주요 필드

### light / switch

`state`(시그니처), `state_on`/`state_off`(index+data), `command_on`/`command_off`.

### climate

- 모드: `state_off`, `state_heat`, `state_cool`, `state_fan_only`, `state_dry`, `state_auto`
- 온도/습도: `state_temperature_current`, `state_temperature_target`, `state_humidity_current`, `state_humidity_target`
- 동작: `state_action_off` / `_idle` / `_heating` / `_cooling` / `_drying` / `_fan`
- 스윙/팬속도/preset: `state_swing_*`, `state_fan_*`, `state_preset_*`
- 커맨드: `command_off|heat|cool|fan_only|dry|auto`, `command_temperature`, `command_humidity`, `command_swing_*`, `command_fan_*`, `command_preset_*`
- `temperature_unit`, `visual: { min_temperature, max_temperature, temperature_step }`

### sensor

`state`(시그니처) + `state_number`(값 파싱; `index`, `length`, `precision`, `decode`, `mapping`).

## gallery 프리셋 표기($repeat) — 실config에는 없음

`gallery-show`로 받은 스니펫은 템플릿이라 `$repeat`(count/as/start), `{{i}}`, `discovery.match`(`data`+`mask`), `dimensions`를 쓴다. API 초안(`h2m.mjs analyze/validate`에 넣는 JSON)에는 **사용 불가** — `/gallery/expand`(`gallery-expand`)로 펼친 뒤 explicit 엔티티로 쓴다. 예:

```yaml
# gallery-show commax/lights_new.yaml (템플릿)
- $repeat: { count: '{{light_count}}', as: i, start: 1 }
  id: 'light_{{i}}'
  state: { data: [0xB0, 0x00, '{{i}}'], mask: [0xF0, 0x00, 0xFF] }
  state_on: { index: 1, data: [0x01] }
  state_off: { index: 1, data: [0x00] }
```

→ 초안 JSON에서는 `light_1`..`light_N` 각각에 대해 `data`의 `{{i}}` 자리를 실제 숫자로 대체.

## YAML → 초안 JSON 변환

- `0x82` → `130` (10진수)
- `$repeat`/`{{var}}` → 펼쳐서 기록
- 타입 키는 `entities: { climate: [...], light: [...], sensor: [...] }`

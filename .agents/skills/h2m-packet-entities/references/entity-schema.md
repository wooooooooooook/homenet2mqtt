# 엔티티 초안 필드 레퍼런스

소스 정의(변경 시 확인 위치):

- `packages/core/src/protocol/types.ts` — `StateSchema`(~206), `StateNumSchema`(~247), `PacketDefaults`(~102), `ChecksumType`(~32), `DecodeEncodeType`(~88)
- `packages/core/src/domain/entities/base.entity.ts` — `EntityConfig`, `CommandSchema`
- `packages/core/src/domain/entities/{light,climate,sensor,fan,switch}.entity.ts` — 타입별 필드
- `packages/core/src/utils/packet-matching.ts:13` — `matchesPacket()` (시그니처 매칭 로직)
- JSON 스키마: `packages/core/static/schema/homenet-bridge.schema.json`
- 벤더 프리셋(필드 사용 예): `gallery/<vendor>/*.yaml`

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

`gallery/<vendor>/*.yaml`는 템플릿이라 `$repeat`(count/as/start), `{{i}}`, `discovery.match`(`data`+`mask`), `dimensions`를 쓴다. API 초안(`h2m.mjs analyze/validate`에 넣는 JSON)에는 **사용 불가** — 펼쳐서 explicit 엔티티로 쓴다. 예:

```yaml
# gallery/commax/lights_new.yaml (템플릿)
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

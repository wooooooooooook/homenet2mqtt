# Switch 스키마 작성법

On/Off 토글 장치는 `switch` 엔티티를 사용합니다. `type`은 `switch`이며 공통 필드(`id`, `name`, `packet_parameters`, `device_class`, `icon`)를 함께 지정합니다.

## 필수 필드
- `state`: 이 스위치가 포함된 패킷을 구분하는 서명.
- 전원 상태 판단용 `state_on`, `state_off` 중 하나 이상 — [`StateSchema`](./schemas.md#stateschema) 또는 CEL 표현식.
- 전원 제어용 `command_on`, `command_off` 중 하나 이상.

## 옵션 필드
- 동작 모드: `optimistic` (true 설정 시 즉시 상태 반영 및 가상 스위치 지원)

## MQTT 디스커버리 메시지 구성
- 토픽: `homeassistant/switch/<unique_id>/config`
- 공통 필드
  - `name`, `default_entity_id`, `unique_id`
  - `state_topic`: `${MQTT_TOPIC_PREFIX}/${id}/state`
  - `availability`: `${MQTT_TOPIC_PREFIX}/bridge/status`
  - `device`: `devices` 설정 또는 브리지 기본 정보
  - 선택: `suggested_area`, `device_class`, `unit_of_measurement`, `state_class`, `icon`
- 스위치 전용
  - `command_topic`: `${MQTT_TOPIC_PREFIX}/${id}/set`
  - `value_template`: `{{ value_json.state }}`
  - `payload_on`: `ON`, `payload_off`: `OFF`

## 예제: 도어 호출 스위치
`hyundai_door.homenet_bridge.yaml`은 호출 스위치에 온/오프 패킷을 배치하고 상태 비트로 켜짐 여부를 확인합니다.【F:packages/core/config/hyundai_door.homenet_bridge.yaml†L52-L69】

```yaml
switch:
  - id: door_call_common
    name: "Door Call Common"
    icon: mdi:phone
    state:
      data: [0x5F, 0x00, 0x00]
    state_on:
      offset: 0
      data: [0x5F]
    state_off:
      offset: 0
      data: [0x60]
    command_on:
      data: [0x5F, 0x00, 0x00]
    command_off:
      data: [0x60, 0x00, 0x00]
```

## 작성 체크리스트
1. 상태 패킷과 명령 패킷의 헤더/체크섬 규칙이 다르면 엔티티별 `packet_parameters`를 사용해 상위 기본값을 덮어씁니다.
2. 전원 비트 외에 추가 상태가 있을 경우 `state`에 `mask`를 걸어 노이즈를 제거합니다.
3. 토글 시 다른 엔티티 상태를 함께 맞춰야 한다면 `command_on/off`를 CEL 표현식으로 작성해 여러 패킷을 동시에 반환합니다.

# 패킷 스펙과 정규화 상태 매핑 가이드 (State Mapping Guide)

이 문서는 월패드 패킷 통신을 위한 엔티티 설정의 **패킷 정의 스펙(`state_*` 스키마)**이 홈어시스턴트(Home Assistant) 및 브릿지 내부에서 사용되는 **정규화 상태 스펙(Normalized State)**으로 어떻게 변환되고 매핑되는지 설명합니다.

---

## 1. 개요 (Overview)

`homenet2mqtt`는 패킷에서 값을 파싱하고 상태를 관리할 때 두 단계의 명칭 체계를 사용합니다.

1. **패킷 정의 스펙 (`state_xxx`)**
   * YAML 기기 설정 및 패킷 해석기(`parseData`)에서 원본 패킷 데이터 필드를 정의하기 위해 사용하는 이름입니다.
   * 예: `state_brightness` (밝기), `state_temperature_target` (설정 온도)
2. **정규화 상태 스펙 (`xxx`)**
   * 패킷 파싱 후 정규화 엔진(`state-normalizer`)을 거쳐 브릿지 내부 상태 관리자(`StateManager`) 및 MQTT를 통해 홈어시스턴트로 최종 노출되는 규격화된 상태 필드명입니다.
   * 예: `brightness` (밝기), `target_temperature` (설정 온도)

> [!NOTE]
> 자동화(`update_state` 액션)나 상태 조작 API를 사용할 때는 이 두 스펙의 명칭 중 어느 쪽을 사용해도 매핑 엔진이 감지하여 적절히 처리할 수 있습니다.

---

## 2. 디바이스 타입별 매핑 규칙

각 엔티티 타입별로 원본 패킷 스키마 키가 어떤 최종 정규화 키로 매핑되는지 정리한 표입니다.

### 2.1. 조명 (Light)

| 패킷 정의 스키마 (`state_*`) | 최종 정규화 상태 키 | 값의 형태 및 범위 |
| :--- | :--- | :--- |
| `state_on` | `state` | `'ON'` (데이터 일치 시) |
| `state_off` | `state` | `'OFF'` (데이터 일치 시) |
| `state_brightness` | `brightness` | `0` ~ `255` |
| `state_color_temp_kelvin` | `color_temp_kelvin` | 캘빈(Kelvin) 온도 값 (예: `3000` ~ `6500`) |
| `state_color_temp` | `color_temp_kelvin` | mireds 값 수신 시 자동으로 캘빈 온도로 역산 (`1000000 / mireds`) |
| `state_red` | `red` | `0` ~ `255` |
| `state_green` | `green` | `0` ~ `255` |
| `state_blue` | `blue` | `0` ~ `255` |
| `state_white` | `white` | `0` ~ `255` |

---

### 2.2. 온도조절기 (Climate)

온도조절기는 패킷의 각 스키마 일치 여부에 따라 `'mode'`, `'action'`, `'fan_mode'`, `'preset_mode'` 등의 다중 상태로 정규화되어 조합됩니다.

| 패킷 정의 스키마 (`state_*`) | 최종 정규화 상태 키 | 매핑되는 값 (정규화 상태) |
| :--- | :--- | :--- |
| `state_temperature_target` | `target_temperature` | 숫자 |
| `state_temperature_current` | `current_temperature` | 숫자 |
| `state_humidity_target` | `target_humidity` | 숫자 |
| `state_humidity_current` | `current_humidity` | 숫자 |
| `state_off` | `mode` | `'off'` |
| `state_heat` | `mode` | `'heat'` |
| `state_cool` | `mode` | `'cool'` |
| `state_dry` | `mode` | `'dry'` |
| `state_fan_only` | `mode` | `'fan_only'` |
| `state_auto` | `mode` | `'auto'` |
| `state_action_heating` | `action` | `'heating'` |
| `state_action_cooling` | `action` | `'cooling'` |
| `state_action_drying` | `action` | `'drying'` |
| `state_action_fan` | `action` | `'fan'` |
| `state_action_idle` | `action` | `'idle'` |
| `state_fan_on` | `fan_mode` | `'on'` |
| `state_fan_off` | `fan_mode` | `'off'` |
| `state_fan_auto` | `fan_mode` | `'auto'` |
| `state_fan_low` | `fan_mode` | `'low'` |
| `state_fan_medium` | `fan_mode` | `'medium'` |
| `state_fan_high` | `fan_mode` | `'high'` |
| `state_fan_middle` | `fan_mode` | `'middle'` |
| `state_preset_none` | `preset_mode` | `'none'` |
| `state_preset_home` | `preset_mode` | `'home'` |
| `state_preset_away` | `preset_mode` | `'away'` |
| `state_preset_boost` | `preset_mode` | `'boost'` |
| `state_preset_comfort` | `preset_mode` | `'comfort'` |
| `state_preset_eco` | `preset_mode` | `'eco'` |
| `state_preset_sleep` | `preset_mode` | `'sleep'` |

---

### 2.3. 환기 / 팬 (Fan)

| 패킷 정의 스키마 (`state_*`) | 최종 정규화 상태 키 | 값의 형태 및 범위 |
| :--- | :--- | :--- |
| `state_on` | `state` | `'ON'` (데이터 일치 시) |
| `state_off` | `state` | `'OFF'` (데이터 일치 시) |
| `state_speed` | `speed` | 문자열 또는 숫자 (기기 매핑에 따름) |
| `state_percentage` | `percentage` | `0` ~ `100` |
| `state_oscillating` | `oscillating` | 불리언 (`true` / `false`) |
| `state_direction` | `direction` | `'forward'` (패킷 데이터 0일 때) / `'reverse'` (0 이외) |

---

### 2.4. 스위치 (Switch) / 바이너리 센서 (Binary Sensor)

| 패킷 정의 스키마 (`state_*`) | 최종 정규화 상태 키 | 값의 형태 |
| :--- | :--- | :--- |
| `state_on` | `state` | `'ON'` (데이터 일치 시) |
| `state_off` | `state` | `'OFF'` (데이터 일치 시) |

---

### 2.5. 밸브 (Valve)

| 패킷 정의 스키마 (`state_*`) | 최종 정규화 상태 키 | 매핑되는 값 (정규화 상태) |
| :--- | :--- | :--- |
| `state_open` | `state` | `'OPEN'` |
| `state_closed` | `state` | `'CLOSED'` |
| `state_opening` | `state` | `'OPENING'` |
| `state_closing` | `state` | `'CLOSING'` |
| `state_position` | `position` | `0` ~ `100` |

---

### 2.6. 잠금장치 (Lock)

| 패킷 정의 스키마 (`state_*`) | 최종 정규화 상태 키 | 매핑되는 값 (정규화 상태) |
| :--- | :--- | :--- |
| `state_locked` | `state` | `'LOCKED'` |
| `state_unlocked` | `state` | `'UNLOCKED'` |
| `state_locking` | `state` | `'LOCKING'` |
| `state_unlocking` | `state` | `'UNLOCKING'` |
| `state_jammed` | `state` | `'JAMMED'` |

---

### 2.7. 수치 제어 (Number) / 센서 (Sensor)

| 패킷 정의 스키마 (`state_*`) | 최종 정규화 상태 키 | 값의 형태 |
| :--- | :--- | :--- |
| `state_number` | `value` | 숫자 또는 문자열 |
| `state_increment` | `action` | `'increment'` (내부 자동화 판단용 임시 필드, HA로 전달 안 됨) |
| `state_decrement` | `action` | `'decrement'` (내부 자동화 판단용 임시 필드, HA로 전달 안 됨) |
| `state_to_min` | `value` | `min_value` (해당 엔티티의 최솟값으로 강제 매핑) |
| `state_to_max` | `value` | `max_value` (해당 엔티티의 최댓값으로 강제 매핑) |

---

### 2.8. 선택 목록 (Select)

| 패킷 정의 스키마 (`state_*`) | 최종 정규화 상태 키 | 값의 형태 |
| :--- | :--- | :--- |
| `state_select` | `option` | `select` 스키마 `map`에 매핑된 선택 문자열 |

---

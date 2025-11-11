# `devices.yaml` 설정 파일 작성 가이드

이 문서는 `RS485-HomeNet-to-MQTT-bridge` 프로젝트의 핵심 설정 파일인 `devices.yaml`의 구조와 작성 방법을 설명합니다. 이 파일을 통해 다양한 RS485 장치의 프로토콜을 정의하고 MQTT와 연동할 수 있습니다.

## 최상위 구조

```yaml
serial:
  # ... 시리얼 통신 설정 ...

devices:
  - name: "장치 이름"
    packets:
      # ... 패킷 정의 목록 ...
```

### `serial`

`node-serialport` 라이브러리에 전달될 전역 시리얼 통신 파라미터를 설정합니다. `path`를 제외한 나머지 값들은 `SERIAL_PORT` 환경변수와 함께 사용됩니다.

*   `baud_rate` (필수): 통신 속도 (예: `9600`). TCP 소켓 연결 시에는 무시됩니다.
*   `data_bits`: 데이터 비트 (기본값: `8`).
*   `parity`: 패리티 비트 (`none`, `even`, `odd`, `mark`, `space`). (기본값: `none`).
*   `stop_bits`: 정지 비트 (기본값: `1`).

> **중요:** 시리얼 포트 경로 (`/dev/ttyUSB0`) 또는 TCP 소켓 주소 (`192.168.0.83:8888`)는 반드시 `SERIAL_PORT` 환경 변수를 통해 지정해야 합니다.

### `devices`

통신할 물리적 장치 목록을 정의하는 배열입니다. 각 장치는 이름과 패킷 정의를 가집니다.

*   `name`: 장치의 이름 (예: "Commax Wallpad").
*   `packets`: 해당 장치가 송수신하는 패킷의 종류를 정의하는 배열.

## `packets` - 패킷 정의

`packets` 배열의 각 항목은 특정 종류의 RS485 데이터 프레임을 어떻게 해석하고 생성할지를 정의합니다. 수신된 데이터가 여기에 정의된 `header`와 `length` 조건과 일치하면, 해당 `items` 목록에 따라 데이터를 해석합니다.

```yaml
packets:
  - header: [0xAA, 0x55]  # 패킷 시작을 식별하는 16진수 바이트 배열
    length: 8             # 패킷의 전체 길이 (바이트)
    items:
      # ... 이 패킷에 포함된 기능(item) 목록 ...
```

*   `header`: 패킷을 식별하는 고유한 시작 바이트 배열.
*   `length`: 패킷의 고정 길이. (가변 길이 패킷은 향후 지원 예정)
*   `items`: 이 패킷 구조에 포함된 개별 기능(조명, 센서 등)의 목록.

## `items` - 기능(엔티티) 정의

`items` 배열은 MQTT 및 홈어시스턴트의 개별 엔티티에 해당합니다.

```yaml
items:
  - type: light
    id: "living_room_light"
    name: "거실 조명"
    state: { ... }
    command: { ... }
```

*   `type` (필수): 기능의 종류. `light`, `climate`, `fan`, `switch`, `sensor`, `button`, `valve` 등을 사용할 수 있습니다. 이는 MQTT 토픽 구조 및 Home Assistant 컴포넌트 타입에 영향을 줍니다.
*   `id` (필수): MQTT 토픽에 사용될 고유한 ID (슬러그 형태 권장).
*   `name`: UI에 표시될 사람 친화적인 이름.
*   `state`: RS485 패킷을 수신했을 때, 이 기능의 상태를 어떻게 읽을지 정의합니다.
*   `command`: MQTT 메시지를 수신했을 때, RS485 패킷을 어떻게 생성하여 전송할지 정의합니다.

### `state` - 상태 읽기

```yaml
state:
  offset: 3      # 패킷에서 상태 값이 위치한 0-based 인덱스
  mask: 0x01     # 해당 바이트에서 특정 비트만 추출하기 위한 마스크 (생략 시 전체 바이트 사용)
  transform: "bcd_decode" # 값을 변환하는 방법 (생략 가능)
```

*   `offset`: 패킷의 몇 번째 바이트를 읽을지 지정합니다.
*   `mask`: `offset`으로 지정된 바이트에서 특정 비트의 상태만 보려면 비트마스크를 사용합니다. 예를 들어, `0x01`은 첫 번째 비트, `0x02`는 두 번째 비트를 의미합니다.
*   `transform`: 추출한 값을 특정 형식으로 변환합니다.
    *   `bcd_decode`: BCD(Binary-Coded Decimal) 값을 일반 십진수로 변환합니다. (예: `0x23` -> `23`)

`climate` 타입처럼 여러 상태(현재 온도, 목표 온도)를 가지는 경우, 각 상태의 이름을 키로 사용하여 정의할 수 있습니다.

```yaml
# climate 타입의 state 예시
state:
  power: { offset: 4, mask: 0x01 }
  current_temp: { offset: 5, transform: "bcd_decode" }
  target_temp: { offset: 6, transform: "bcd_decode" }
```

### `command` - 명령 보내기

```yaml
command:
  topic_suffix: "set" # 기본 MQTT 토픽 뒤에 붙는 접미사
  on: # 명령의 종류 (예: on, off, set_temperature)
    data: [0xAA, 0x55, 0x01, 0x01, 0x01, 0x01, 0x00, 0xB3] # 전송할 데이터 패킷
    ack:  [0xAA, 0x55, 0x01, 0x01, 0x01, 0x01, 0x01, 0xB4] # 예상되는 응답 (없으면 생략)
```

*   `topic_suffix`: 명령을 수신할 MQTT 토픽의 접미사를 지정합니다. (예: `.../living_room_light/set`)
*   **명령 종류 (키):** `on`, `off` (light, switch), `set_temperature` (climate), `set_speed` (fan), `press` (button) 등 `type`에 맞는 명령을 키로 사용합니다.
*   `data`: 전송할 전체 RS485 패킷 템플릿. 체크섬은 마지막 바이트에 `0x00`으로 지정하면 어플리케이션이 자동으로 계산하여 채웁니다.
*   `ack`: 명령 전송 후, 장치로부터 수신될 것으로 예상되는 응답 패킷. 이 응답이 와야 명령이 성공한 것으로 간주합니다. (선택 사항)
*   `value`: MQTT로 받은 값을 패킷에 넣어 보내야 할 경우 사용합니다.

```yaml
# set_temperature 명령의 value 사용 예시
set_temperature:
  topic_suffix: "set_temp"
  data: [0xAA, 0x55, 0x02, 0x01, 0x01, 0x03, 0x00, 0x00]
  value:
    offset: 6 # MQTT로 받은 값을 6번 인덱스에 넣음
    transform: "bcd_encode" # 값을 BCD로 변환하여 넣음
```

*   `value.offset`: MQTT 페이로드로 받은 값을 `data` 패킷의 어느 위치에 넣을지 지정합니다.
*   `value.transform`: MQTT 페이로드 값을 RS485 장치가 이해할 수 있는 형식으로 변환합니다.
    *   `bcd_encode`: 십진수 숫자를 BCD 값으로 변환합니다. (예: `23` -> `0x23`)

# RS485-HomeNet-to-MQTT-bridge를 위한 새로운 설정 스키마

이 문서는 `uartex` 컴포넌트 구조에서 영감을 받아 장치 정의 및 통신 매개변수를 표준화하기 위해 제안된 새로운 설정 스키마를 설명합니다.

## 최상위 설정

설정은 전역 통신 설정과 `devices` 목록을 포함하는 최상위 `homenet_bridge` 키를 가진 YAML 파일이 될 것입니다.

```yaml
homenet_bridge:
  # 전역 직렬 포트 설정
  serial:
    baud_rate: 9600
    data_bits: 8
    parity: none
    stop_bits: 1
  
  # 전역 패킷 매개변수 (장치/엔티티별로 재정의 가능)
  packet_defaults:
    rx_timeout: 10ms
    tx_delay: 50ms
    tx_timeout: 500ms
    tx_retry_cnt: 3
    rx_header: [0x02, 0x01] # 예시, Commax/Kocom에 따라 달라짐
    rx_footer: [0x0D, 0x0A] # 예시
    tx_header: [0x02, 0x01] # 예시
    tx_footer: [0x0D, 0x0A] # 예시
    rx_checksum: add
    tx_checksum: add

  # RS485 장치 목록
  devices:
    - name: "Commax Wallpad" # 또는 "Kocom Wallpad"
      # 선택 사항: 이 장치에 대한 전역 패킷 매개변수 재정의
      packet_parameters:
        # ... 특정 재정의 ...
      
      # 이 장치와 관련된 엔티티 목록
      entities:
        # ... 엔티티 정의 ...
```

### `homenet_bridge.serial`

직렬 포트 통신 매개변수를 정의합니다.

-   `baud_rate` (필수, int): 직렬 통신을 위한 보드율 (예: 9600).
-   `data_bits` (필수, int): 데이터 비트 수 (예: 8).
-   `parity` (필수, enum): 패리티 설정 (`none`, `even`, `odd`).
-   `stop_bits` (필수, int): 정지 비트 수 (예: 1).

### `homenet_bridge.packet_defaults`

기본 패킷 처리 매개변수를 정의합니다. 이들은 `device` 또는 `entity` 수준에서 재정의될 수 있습니다.

-   `rx_timeout` (선택 사항, Time): 데이터 수신 시간 초과. 기본값은 10ms.
-   `tx_delay` (선택 사항, Time): 데이터 전송 지연. 기본값은 50ms.
-   `tx_timeout` (선택 사항, Time): ACK 수신 시간 초과. 기본값은 500ms.
-   `tx_retry_cnt` (선택 사항, int): ACK 실패 시 재시도 횟수. 기본값은 3.
-   `rx_header` (선택 사항, array): 수신할 데이터의 헤더 바이트.
-   `rx_footer` (선택 사항, array): 수신할 데이터의 푸터 바이트.
-   `tx_header` (선택 사항, array): 전송할 데이터의 헤더 바이트.
-   `tx_footer` (선택 사항, array): 전송할 데이터의 푸터 바이트.
-   `rx_checksum` (선택 사항, enum 또는 object): 수신된 데이터에 대한 체크섬 방식 (`add`, `xor`, `add_no_header`, `xor_no_header`). 사용자 정의 체크섬 로직이 필요한 경우, `type: custom`과 함께 `algorithm` 필드를 사용하여 세부 사항을 정의할 수 있습니다.
-   `tx_checksum` (선택 사항, enum 또는 object): 전송된 데이터에 대한 체크섬 방식 (`add`, `xor`, `add_no_header`, `xor_no_header`). 사용자 정의 체크섬 로직이 필요한 경우, `type: custom`과 함께 `algorithm` 필드를 사용하여 세부 사항을 정의할 수 있습니다.

### `homenet_bridge.devices`

물리적 RS485 장치 목록입니다.

-   `name` (필수, string): 장치의 사용자 친화적인 이름.
-   `packet_parameters` (선택 사항): `packet_defaults`에 대한 장치별 재정의.
-   `entities` (필수, list): 이 장치에 의해 노출되는 Home Assistant 엔티티 목록.

## 엔티티 설정

장치 내의 각 엔티티는 `type`, `id`, `name`을 가지며, 해당 유형에 따라 특정 `state` 및 `command` 정의를 가집니다.

### 공통 엔티티 필드

-   `type` (필수, enum): Home Assistant 엔티티의 유형 (예: `light`, `climate`, `button`).
-   `id` (필수, string): 장치 내에서 엔티티의 고유 식별자.
-   `name` (필수, string): 엔티티의 사용자 친화적인 이름.
-   `packet_parameters` (선택 사항): `packet_defaults` 및 장치 수준 `packet_parameters`에 대한 엔티티별 재정의.

### `state` 및 `command` 스키마

`state` 및 `command` 정의는 `uartex_README.md` 구조를 밀접하게 따릅니다.

#### `state` (기본 스키마)

들어오는 RS485 패킷에서 상태 정보를 추출하는 방법을 정의하는 데 사용됩니다.

-   `data` (필수, array 또는 string): 들어오는 패킷에서 일치시킬 바이트 패턴 (헤더/푸터/체크섬 제외).
-   `mask` (선택 사항, array 또는 string): 일치를 위해 `data`에 적용할 마스크.
-   `offset` (선택 사항, int): `data` 및 `mask`를 적용할 패킷 데이터 내의 시작 오프셋 (헤더 다음/푸터/체크섬 이전).
-   `inverted` (선택 사항, bool): 상태 값을 반전해야 하는지 여부.

#### `state_num` (숫자 상태를 위한 스키마)

들어오는 패킷에서 숫자 값을 추출하는 데 사용됩니다.

-   `offset` (필수, int): 패킷 데이터 내의 시작 오프셋.
-   `length` (선택 사항, int): 읽을 바이트 수. 기본값은 1.
-   `precision` (선택 사항, int): 소수점 이하 자릿수. 기본값은 0.
-   `signed` (선택 사항, bool): 숫자가 부호 있는 숫자인지 여부. 기본값은 True.
-   `endian` (선택 사항, enum): 바이트 순서 (`big`, `little`). 기본값은 `big`.
-   `decode` (선택 사항, enum): 디코딩 방식 (`none`, `bcd`, `ascii`, `signed_byte_half_degree` 등). 기본값은 `none`.

#### `command` (기본 스키마)

명령을 위한 나가는 RS485 패킷을 구성하는 방법을 정의하는 데 사용됩니다.

-   `cmd` (필수, array 또는 string): 명령을 위한 바이트 패턴 (헤더/푸터/체크섬 제외).
-   `ack` (선택 사항, array 또는 string): 예상되는 ACK 패킷 데이터.
-   `mask` (선택 사항, array 또는 string): `cmd`에 적용할 마스크.

### 특정 엔티티 유형

#### `light`

```yaml
      - type: light
        id: "light_1"
        name: "조명 1"
        state:
          data: [0x01] # 예시: 오프셋 2의 바이트
          offset: 2
        state_on:
          offset: 2
          data: [0x01]
        state_off:
          offset: 2
          data: [0x00]
        command_on:
          cmd: [0x31, 0x01, 0x01] # 예시: ON 명령을 위한 데이터 바이트
          ack: [0xB1, 0x01, 0x01] # 예시: 예상되는 ACK
        command_off:
          cmd: [0x31, 0x01, 0x00] # 예시: OFF 명령을 위한 데이터 바이트
          ack: [0xB1, 0x00, 0x01] # 예시: 예상되는 ACK
```

-   `state` (선택 사항, `state` 스키마): 조명에 대한 기본 상태 패킷.
-   `state_on` (필수, `state` 스키마): 조명이 켜져 있음을 나타내는 패킷 데이터를 정의합니다.
-   `state_off` (필수, `state` 스키마): 조명이 꺼져 있음을 나타내는 패킷 데이터를 정의합니다.
-   `command_on` (필수, `command` 스키마): 조명을 켜는 명령 패킷을 정의합니다.
-   `command_off` (필수, `command` 스키마): 조명을 끄는 명령 패킷을 정의합니다.
-   `state_brightness` (선택 사항, `state_num` 스키마): 밝기 제어 기능이 있는 조명용.
-   `command_brightness` (선택 사항, `command` 스키마): 밝기 제어 기능이 있는 조명용.
-   `command_update` (선택 사항, `command` 스키마): 상태 업데이트를 요청하는 명령.

#### `climate`

```yaml
      - type: climate
        id: "heater_1"
        name: "난방 1"
        state:
          data: [0x01] # 예시: 오프셋 2의 바이트
          offset: 2
        state_temperature_current:
          offset: 4
          length: 1
          decode: bcd # 예시: BCD 디코딩
        state_temperature_target:
          offset: 3
          length: 1
          decode: bcd
        state_off:
          offset: 2
          data: [0x00]
        state_heat:
          offset: 2
          data: [0x01]
        command_off:
          cmd: [0x04, 0x01, 0x04, 0x00]
          ack: [0x84, 0x80, 0x01]
        command_heat:
          cmd: [0x04, 0x01, 0x04, 0x81]
          ack: [0x84, 0x81, 0x01]
        command_temperature:
          cmd: [0x04, 0x01, 0x03] # 온도 설정을 위한 기본 명령
          value_offset: 3 # 온도 값이 삽입될 cmd 배열 내의 오프셋
          value_encode: bcd # 온도 값에 대한 인코딩
```

-   `state` (선택 사항, `state` 스키마): 기후 장치에 대한 기본 상태 패킷.
-   `state_temperature_current` (선택 사항, `state_num` 스키마): 현재 온도.
-   `state_temperature_target` (선택 사항, `state_num` 스키마): 목표 온도.
-   `state_off` (필수, `state` 스키마): 기후 장치가 꺼져 있음을 나타냅니다.
-   `state_heat` (선택 사항, `state` 스키마): 난방 모드를 나타냅니다.
-   `state_cool` (선택 사항, `state` 스키마): 냉방 모드를 나타냅니다.
-   `command_off` (선택 사항, `command` 스키마): 끄는 명령.
-   `command_heat` (선택 사항, `command` 스키마): 난방 모드를 설정하는 명령.
-   `command_cool` (선택 사항, `command` 스키마): 냉방 모드를 설정하는 명령.
-   `command_temperature` (선택 사항, `command` 스키마): 목표 온도를 설정하는 명령.
    -   `value_offset` (필수, int): 온도 값이 삽입될 `cmd` 배열 내의 오프셋.
    -   `value_encode` (선택 사항, enum): 값에 대한 인코딩 방식 (`none`, `bcd`, `ascii`, `signed_byte_half_degree` 등). 기본값은 `none`.
-   `command_update` (선택 사항, `command` 스키마): 상태 업데이트를 요청하는 명령.
-   `visual` (선택 사항): UI에 대한 시각적 속성을 정의합니다.
    -   `min_temperature` (선택 사항, float): 설정 가능한 최소 온도.
    -   `max_temperature` (선택 사항, float): 설정 가능한 최대 온도.
    -   `temperature_step` (선택 사항, float): 온도 조절 단계.

#### `valve`

```yaml
      - type: valve
        id: "gas_valve"
        name: "가스 밸브"
        state:
          data: [0x80] # 예시: 오프셋 1의 바이트
          offset: 1
          mask: 0x80
        state_open:
          offset: 1
          data: [0x80]
          mask: 0x80
        state_closed:
          offset: 1
          data: [0x40]
          mask: 0x40
        command_open:
          cmd: [0x11, 0x01, 0x80] # 예시: OPEN 명령을 위한 데이터 바이트
          ack: [0x91, 0x88, 0x88] # 예시: 예상되는 ACK
        command_close:
          cmd: [0x11, 0x01, 0x40] # 예시: CLOSE 명령을 위한 데이터 바이트
          ack: [0x91, 0x88, 0x88] # 예시: 예상되는 ACK
```

-   `state` (선택 사항, `state` 스키마): 밸브에 대한 기본 상태 패킷.
-   `state_open` (필수, `state` 스키마): 밸브가 열려 있음을 나타냅니다.
-   `state_closed` (필수, `state` 스키마): 밸브가 닫혀 있음을 나타냅니다.
-   `command_open` (선택 사항, `command` 스키마): 밸브를 여는 명령.
-   `command_close` (선택 사항, `command` 스키마): 밸브를 닫는 명령.
-   `command_update` (선택 사항, `command` 스키마): 상태 업데이트를 요청하는 명령.

#### `button`

```yaml
      - type: button
        id: "elevator_call"
        name: "엘리베이터 호출"
        command_press:
          cmd: [0xA0, 0x01, 0x01, 0x00, 0x08, 0x15, 0x00, 0x00]
          ack: [0x23]
```

-   `command_press` (필수, `command` 스키마): 버튼을 "누르는" 명령 패킷을 정의합니다.

#### `sensor`

```yaml
      - type: sensor
        id: "elevator_floor"
        name: "엘리베이터 층수"
        state_number:
          offset: 2
          length: 1
          precision: 0
```

-   `state` (선택 사항, `state` 스키마): 센서에 대한 기본 상태 패킷.
-   `state_number` (선택 사항, `state_num` 스키마): 숫자 센서 값용.
-   `command_update` (선택 사항, `command` 스키마): 상태 업데이트를 요청하는 명령.

#### `fan`

```yaml
      - type: fan
        id: "fan_1"
        name: "환풍기 1"
        state:
          data: [0x01]
          offset: 4
          mask: 0x01
        state_on:
          offset: 4
          data: [0x01]
          mask: 0x01
        state_off:
          offset: 4
          data: [0x00]
          mask: 0x01
        command_on:
          cmd: [0x01, 0x01]
          ack: [0x01, 0x01]
        command_off:
          cmd: [0x01, 0x00]
          ack: [0x01, 0x00]
        command_speed:
          # 속도 값에 따라 다른 명령을 보내야 하는 경우, mapping을 사용합니다.
          mapping:
            1: { cmd: [0x01, 0x01, 0x01], ack: [0x01, 0x01, 0x01] } # 저속
            2: { cmd: [0x01, 0x01, 0x02], ack: [0x01, 0x01, 0x02] } # 중속
            3: { cmd: [0x01, 0x01, 0x03], ack: [0x01, 0x01, 0x03] } # 고속
        state_speed:
          # 수신된 패킷에서 속도 값을 추출하는 방법을 정의합니다.
          offset: 5
          length: 1
          mapping:
            0x01: 1 # 저속
            0x02: 2 # 중속
            0x03: 3 # 고속
```

-   `state` (선택 사항, `state` 스키마): 팬에 대한 기본 상태 패킷.
-   `state_on` (필수, `state` 스키마): 팬이 켜져 있음을 나타내는 패킷 데이터를 정의합니다.
-   `state_off` (필수, `state` 스키마): 팬이 꺼져 있음을 나타내는 패킷 데이터를 정의합니다.
-   `command_on` (필수, `command` 스키마): 팬을 켜는 명령 패킷을 정의합니다.
-   `command_off` (필수, `command` 스키마): 팬을 끄는 명령 패킷을 정의합니다.
-   `command_speed` (선택 사항, `command` 스키마 또는 `mapping` 객체): 팬 속도를 설정하는 명령.
    -   `mapping` (객체): 숫자 속도 값(키)과 해당 `command` 스키마(값)의 매핑.
-   `state_speed` (선택 사항, `state_num` 스키마 또는 `mapping` 객체): 팬 속도 상태를 추출.
    -   `mapping` (객체): 수신된 바이트 값(키)과 해당 숫자 속도(값)의 매핑.
-   `command_update` (선택 사항, `command` 스키마): 상태 업데이트를 요청하는 명령.

---

이 문서는 더 많은 엔티티 유형이 정의되거나 개선됨에 따라 업데이트될 것입니다.

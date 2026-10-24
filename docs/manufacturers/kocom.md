# Kocom (코콤 / 디아트 / 씽크스)

## 코콤

## references

- [zooil님 kocomRS485 deepwiki](https://deepwiki.com/zooil/kocomRS485)
- [lunDreame님 kocom-wallpad deepwiki](https://deepwiki.com/lunDreame/kocom-wallpad)

---

코콤(Kocom) 홈네트워크 시스템의 RS485 패킷 구조 및 Homenet2MQTT 연동 가이드입니다.  
일반 코콤 월패드와 함께 **코콤 디아트(Theart)**, **코콤 씽크스(Thinks)**, **현관문 도어벨 세트**를 다룹니다.

## 1. 통신 기본 규격

- **통신 방식**: RS485 반이중(Half-Duplex)
- **Baud Rate**: 9600 bps
- **Data Bits**: 8
- **Parity**: None
- **Stop Bits**: 1
- **프레임 헤더 (Prefix)**: `AA 55`  
  - 대부분의 패킷은 `0xAA, 0x55`로 시작합니다.
  - Homenet2MQTT의 `packet_defaults.rx_header: [0xAA, 0x55]` 설정을 통해 헤더를 떼어내고 `0x30`부터 파싱하도록 구성할 수 있습니다.

---

## 2. 기본 패킷 구조

코콤 표준 패킷은 `AA 55` 접두어 뒤에 고정된 16~18바이트 구조를 이룹니다.

| 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 ~ 15 | 16 ~ 17 |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| Protocol | Cmd Type | Fixed | Device Type | Room ID | Sub ID | Fixed | Sub Cmd | Payload (8B) | Checksum |
| `0x30` | `0xBC`/`0xDC` | `0x00` | 기기 식별 | 방 번호 | 서브 ID | `0x00` | 명령 세부 | 제어/상태 값 | CS |

### 2.1 주요 식별 코드

- **Cmd Type (명령/상태 구분)**:
  - `0xBC`, `0xBD`: 제어 명령 및 상태 조회 요청 (Command / Query)
  - `0xDC`, `0xDD`: 제어 명령에 대한 응답 (Command ACK)
  - `0xD0`: 주기적 상태 브로드캐스트 보고 (State Broadcast)

- **Device Type (기기 식별자)**:
  - `0x0E`: 조명 (Lighting)
  - `0x36`: 난방 (Thermostat)
  - `0x48`: 환기시스템 / 전열교환기 (Ventilator)
  - `0x2C`, `0x3C`: 가스밸브 (Gas Valve)
  - `0x44`: 엘리베이터 (Elevator)

- **Room ID (방 번호)**:
  - `0x00`: 0번 방 (주로 거실)
  - `0x01` ~ `0x0F`: 침실 1, 2, 3...

---

## 3. 기기별 상세 패킷 분석

### 3.1 조명 (Light)

코콤 조명은 기본적으로 `0xFF`(ON), `0x00`(OFF) 값을 사용합니다.

- **상태 패킷 (`0x30 0xD0 0x00 0x0E [RoomID]`)**:
  - `Index 10`: 1번 조명 상태 (`0xFF`: ON, `0x00`: OFF)
  - `Index 11`: 2번 조명 상태
  - `Index 12`: 3번 조명 상태
  - `Index 13`: 4번 조명 상태
- **제어 명령 패킷**:
  - `[0x30, 0xBC, 0x00, 0x0E, RoomID, 0x01, 0x00, 0x00, L1, L2, L3, L4, 0x00, 0x00, 0x00, 0x00]`
  - `ACK`: `[0x30, 0xDC, 0x00, 0x0E, RoomID]`
- **상태 조회 요청 패킷**:
  - `[0x30, 0xBC, 0x00, 0x0E, RoomID, 0x01, 0x00, 0x3A, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]`

> ⚠️ **Kocom Theart 모델 주의사항 (상태 유지형 제어)**:  
> 코콤 Theart 모델의 거실 조명 등 일부 환경에서는 1번 조명을 켤 때 **현재 켜져 있는 2번/3번 조명의 상태를 함께 실어서 전송**해야 꺼지지 않습니다.  
> 갤러리의 `gallery/kocom_theart/lights_livingroom.yaml`에서는 `get_from_states` 함수를 통해 다른 조명의 현재 상태를 조합하여 패킷을 만듭니다:
> ```cel
> command_on: >-
>   [[0x30, 0xbc, 0x00, 0x0e, 0x00, 0x01, 0x00, 0x00, 0xff, 
>     get_from_states('livingroom_light_2', 'state') == 'ON' ? 0xff : 0x00, 
>     get_from_states('livingroom_light_3', 'state') == 'ON' ? 0xff : 0x00, 
>     0x00, 0x00, 0x00, 0x00, 0x00], [0x30, 0xdc, 0x00, 0x0e, 0x00]]
> ```

---

### 3.2 난방 (Climate)

- **상태 패킷 (`0x30 0xD0 0x00 0x36 [RoomID]`)**:
  - `Index 10`: 운전 상태 (`0x10`: 난방 가동, `0x00`: 꺼짐)
  - `Index 11`: 외출 모드 (`0x01`: 외출 중, `0x00`: 일반)
  - `Index 12`: 설정 목표 온도 (°C)
  - `Index 14`: 현재 실내 온도 (°C)
- **제어 명령 패킷**:
  - `[0x30, 0xBC, 0x00, 0x36, RoomID, 0x01, 0x00, 0x00, Mode, Away, TargetTemp, 0x00, 0x00, 0x00, 0x00, 0x00]`
  - `Mode`: 난방 ON = `0x11`, 난방 OFF = `0x01`
  - `Away`: 외출 ON = `0x01`, 외출 OFF = `0x00`
  - `ACK`: `[0x30, 0xDC]`

---

### 3.3 환풍기 / 전열교환기 (Fan)

코콤 일반 및 코콤 씽크스(나비엔 환기) 시스템을 지원합니다.

- **상태 패킷 (`0x30 0xDC / 0xD0 0x00 0x48 0x00`)**:
  - `Index 10`: 전원 (`0x11`: ON, `0x00`: OFF)
  - `Index 12` (또는 Index 10): 풍량 단계
    - `0x40`: 1단 (약 / 33%)
    - `0x80`: 2단 (중 / 66%)
    - `0xC0`: 3단 (강 / 100%)
- **제어 명령 패킷 (일반 코콤)**:
  - `[0x30, 0xBC, 0x00, 0x48, 0x00, 0x01, 0x00, 0x00, PowerMode, Sub, SpeedHex, 0x00, 0x00, 0x00, 0x00, 0x00]`

---

### 3.4 엘리베이터 (Elevator)

- **엘리베이터 스위치 및 버튼**:
  - 호출 명령 패킷 전송 후 월패드 응답 수신
  - 구형(`elevator_old.yaml`)과 신형(`elevator.yaml`), 스위치 방식(`elevator_switch.yaml`) 지원

---

### 3.5 현관문 세트 (Doorbell)

코콤 현관문 세트는 일반 RS485 조명/난방 라인과 다른 특수 프레임을 사용합니다.

- **프레임 구조**:
  - 시작 접두어: `AA 55`
  - 종료 접두어: `0x0D 0x0D`
  - 패킷 헤더: `0x70 0x90` 또는 `0x7A 0x9E`
- **구분**:
  - **개인 현관벨 울림 감지**: `[0x70, 0x90, 0x02, 0x02]`, `Index 15`가 `0x01`(ON / 벨 울림), `0x02`(OFF / 해제)
  - **공동 현관벨 울림 감지**: `[0x70, 0x90, 0x02, 0x08]`, `Index 15`가 `0x01`(ON), `0x02`(OFF)
- **통화 및 문열기 제어**:
  - 공동현관 통화: `[0x79, 0xBC, 0x08, 0x02, 0x00, 0xFF, 0xFF, 0xFF, 0xFF, 0x61, 0xFF, 0xFF, 0xFF, 0x03, 0x00]`
  - 공동현관 문열기: `[0x79, 0xBC, 0x08, 0x02, 0x00, 0xFF, 0xFF, 0xFF, 0xFF, 0x61, 0xFF, 0xFF, 0xFF, 0x02, 0x00]`

---

## 4. 갤러리 프리셋 파일 안내

- 코콤 표준:
  - 조명: [`gallery/kocom/lights_new.yaml`](https://github.com/wooooooooooook/homenet2mqtt/blob/main/gallery/kocom/lights_new.yaml)
  - 난방: [`gallery/kocom/heaters_new.yaml`](https://github.com/wooooooooooook/homenet2mqtt/blob/main/gallery/kocom/heaters_new.yaml)
  - 환기팬: [`gallery/kocom/fan.yaml`](https://github.com/wooooooooooook/homenet2mqtt/blob/main/gallery/kocom/fan.yaml), [`gallery/kocom/fan_modes.yaml`](https://github.com/wooooooooooook/homenet2mqtt/blob/main/gallery/kocom/fan_modes.yaml)
  - 가스밸브: [`gallery/kocom/gas_valve.yaml`](https://github.com/wooooooooooook/homenet2mqtt/blob/main/gallery/kocom/gas_valve.yaml)
  - 엘리베이터: [`gallery/kocom/elevator.yaml`](https://github.com/wooooooooooook/homenet2mqtt/blob/main/gallery/kocom/elevator.yaml)
- 코콤 디아트 (Theart):
  - 조명: [`gallery/kocom_theart/lights_livingroom.yaml`](https://github.com/wooooooooooook/homenet2mqtt/blob/main/gallery/kocom_theart/lights_livingroom.yaml)
  - 난방: [`gallery/kocom_theart/heaters_new.yaml`](https://github.com/wooooooooooook/homenet2mqtt/blob/main/gallery/kocom_theart/heaters_new.yaml)
  - 가스: [`gallery/kocom_theart/gas_burner_lock.yaml`](https://github.com/wooooooooooook/homenet2mqtt/blob/main/gallery/kocom_theart/gas_burner_lock.yaml)
- 코콤 씽크스 (Thinks):
  - 나비엔 환기팬: [`gallery/kocom_thinks/navien_ventilator.yaml`](https://github.com/wooooooooooook/homenet2mqtt/blob/main/gallery/kocom_thinks/navien_ventilator.yaml)
  - 조명/난방/가스: [`gallery/kocom_thinks/`](https://github.com/wooooooooooook/homenet2mqtt/tree/main/gallery/kocom_thinks)
- 현관 도어벨:
  - [`gallery/kokom_doorbell/doorbell.yaml`](https://github.com/wooooooooooook/homenet2mqtt/blob/main/gallery/kokom_doorbell/doorbell.yaml)

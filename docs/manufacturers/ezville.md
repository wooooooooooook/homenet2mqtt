# Ezville (이지빌 / 자이)

## 자이

## references

- [Ezville 관련 자료 및 사용자 분석](https://github.com/wooooooooooook/homenet2mqtt/issues)

---

GS건설 자이(Xi) 등 이지빌(Ezville) 홈네트워크 시스템의 RS485 패킷 구조 및 Homenet2MQTT 연동 가이드입니다.

## 1. 통신 기본 규격

- **통신 방식**: RS485 반이중(Half-Duplex)
- **Baud Rate**: 9600 bps
- **Data Bits**: 8
- **Parity**: None
- **Stop Bits**: 1
- **패킷 접두어(Prefix)**: 다수 현장에서 `0xF7`을 시작 바이트로 사용합니다. (Homenet2MQTT의 `packet_defaults.rx_header: [0xF7]` 설정 활용)

---

## 2. 기본 패킷 구조

이지빌 프로토콜은 기기 구분 코드, 대상 ID, 명령/상태 구분 코드, 데이터 길이, 페이로드 순으로 구성됩니다.

| Index | 0 | 1 | 2 | 3 | 4 ~ (4+Length-1) | Checksum |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **필드** | Device Type | Unit/Room ID | Command Type | Data Length | Payload Data | Checksum |
| **설명** | 장치 종류 코드 | 방 번호 / 전체 브로드캐스트 | 제어 / 상태 / ACK 구분 | 페이로드 바이트 수 | 기기 상태 및 제어 파라미터 | 체크섬 |

### 2.1 주요 식별 코드

- **Device Type (기기 구분)**:
  - `0x0E`: 조명 (Lighting)
  - `0x12`: 가스밸브 상태
  - `0x32`: 전열교환기 (환기팬)
  - `0x33`: 일괄 제어 스위치 / 엘리베이터 호출 / 가스 차단
  - `0x36`: 난방 온도조절기 (Thermostat)
  - `0x50`: 스마트 콘센트 (대기전력차단 콘센트, F7 50 계열)

- **Unit / Room ID**:
  - `0x11`: 1번 방 / 1번 장치
  - `0x12`: 2번 방 / 2번 장치 (`0x10 + Room ID`)
  - `0x1F`: 세대 전체 (Broadcast)
  - `0x01`: 단일 제어 대상

- **Command Type (명령 및 패킷 종류)**:
  - `0x81`: 상태 응답 및 브로드캐스트 (State Report)
  - `0x41`, `0x42`, `0x43`: 제어 명령 요청 (Control Request)
  - `0xC1`, `0xC2`, `0xC3`: 제어 명령 확인 응답 (ACK Response)

---

## 3. 기기별 상세 패킷 분석

### 3.1 조명 (Light)

방 단위로 패킷이 수신되며, 방 내부의 개별 조명 제어와 일괄 제어를 모두 지원합니다.

- **상태 패킷 (`0x0E [0x10+RoomID] 0x81 ...`)**:
  - `Index 5`: 1번 조명 상태 (`0x01`: ON, `0x00`: OFF)
  - `Index 6`: 2번 조명 상태 (또는 방 전체 조명 상태)
  - `Index (4 + N)`: N번 조명 상태
- **제어 명령 패킷**:
  - **개별 조명 제어**: `[0x0E, 0x10 + RoomID, 0x41, 0x03, LightNum, 0x01/0x00, 0x00]`
  - **방 일괄 조명 제어**: `[0x0E, 0x10 + RoomID, 0x41, 0x03, 0x0F, 0x01/0x00, 0x00]`
  - `ACK`: `[0x0E, 0x10 + RoomID, 0xC1]`

```yaml
# 1번 방의 2번 조명 켜기 예시
command_on:
  data: [0x0E, 0x11, 0x41, 0x03, 0x02, 0x01, 0x00]
  ack: [0x0E, 0x11, 0xC1]
```

---

### 3.2 난방 (Climate)

이지빌 난방은 **0.5°C 단위** 제어와 **외출(Away) 모드**를 지원하며, 전체 방의 상태가 `0x36 0x1F 0x81` 패킷 하나에 집약되어 주기적으로 수신됩니다.

- **전체 상태 패킷 (`0x36 0x1F 0x81`) 바이트 레이아웃**:
  - `Index 6`: 각 방 난방 ON/OFF 상태 비트마스크 (`bitShiftLeft(1, room_idx - 1)`)
  - `Index 7`: 각 방 외출 모드 상태 비트마스크 (`bitShiftLeft(1, room_idx - 1)`)
  - `Index (8 + room_idx * 2)`: 목표 온도
    - 하위 7비트(`data & 0x7F`): 정수 온도 (°C)
    - 최상위 비트(`data & 0x80`): `0.5°C` 유무 플래그
  - `Index (9 + room_idx * 2)`: 현재 온도
    - 하위 7비트: 정수 온도
    - 최상위 비트: `0.5°C` 유무 플래그

```cel
// CEL 표현식 예: 0.5도 단위 계산
double(bitAnd(data[8 + i * 2], 0x7F)) + (bitAnd(data[8 + i * 2], 0x80) != 0 ? 0.5 : 0.0)
```

- **제어 명령 패킷 (방별 개별 전송)**:
  - 난방 OFF: `[0x36, 0x10 + room_idx, 0x43, 0x01, 0x00]`
  - 난방 ON: `[0x36, 0x10 + room_idx, 0x43, 0x01, 0x01]`
  - 외출 모드: `[0x36, 0x10 + room_idx, 0x43, 0x01, 0x04]`
  - 온도 설정: `[0x36, 0x10 + room_idx, 0x44, 0x01, int(temp) | (is_half ? 0x80 : 0)]`
  - `ACK`: `[0x36, 0x10 + room_idx, 0xC3]` 또는 `0xC4`

---

### 3.3 전열교환기 / 환기팬 (Fan)

- **상태 패킷 (`0x32 0x01 0x81`)**:
  - `Index 7`: 전원 및 풍량 단계 (`0x00`: 정지, `0x01`: 약, `0x02`: 중, `0x03`: 강)
- **제어 명령 패킷**:
  - 전원 켜기(약풍 기본): `[0x32, 0x01, 0x42, 0x01, 0x01]`
  - 전원 끄기: `[0x32, 0x01, 0x41, 0x01, 0x00]`
  - 풍량 제어: `[0x32, 0x01, 0x42, 0x01, speed_val]` (`0x01`: 약, `0x02`: 중, `0x03`: 강)
  - 상태 수동 조회(Update Request): `[0x32, 0x01, 0x01, 0x00]`

---

### 3.4 스마트 콘센트 (Smart Outlets - F7 50)

- **상태 패킷 (`0x50 [0x10+RoomID] 0x81`)**:
  - 각 콘센트당 6바이트 블록으로 구성됩니다.
  - 전원 상태: `Index (7 + (outlet_idx - 1) * 6)`의 최하위 비트(`0x01`)
  - 실시간 소비전력(W): 2바이트 정수 또는 소수점 결합
- **제어 명령 패킷**:
  - 전원 ON: `[0x50, 0x10 + RoomID, 0x41, 0x03, OutletNum, 0x01, 0x00]`
  - 전원 OFF: `[0x50, 0x10 + RoomID, 0x41, 0x03, OutletNum, 0x00, 0x00]`
  - `ACK`: `[0x50, 0x10 + RoomID, 0xC1]`

---

### 3.5 가스밸브 및 엘리베이터 (Valve & Elevator)

이지빌 시스템은 일괄 제어 프로토콜(`0x33`)을 통해 현관 일괄소등 스위치, 엘리베이터 호출, 가스 밸브 차단을 처리합니다.

- **가스밸브 상태 (`0x12 0x01 0x81`)**:
  - `Index 6`: `0x01` (열림), `0x02` (닫힘)
- **가스밸브 닫기 명령**:
  - `[0x33, 0x01, 0x81, 0x03, 0x00, 0x05, 0x00]`
- **엘리베이터 호출 명령**:
  - `[0x33, 0x01, 0x81, 0x03, 0x00, 0x24, 0x00]`

---

## 4. 갤러리 프리셋 파일 안내

Homenet2MQTT의 `gallery/ezville/` 디렉터리 프리셋 목록:

- 조명: [`gallery/ezville/lights_new.yaml`](https://github.com/wooooooooooook/homenet2mqtt/blob/main/gallery/ezville/lights_new.yaml), [`gallery/ezville/lights dimming.yaml`](https://github.com/wooooooooooook/homenet2mqtt/blob/main/gallery/ezville/lights%20dimming.yaml)
- 난방: [`gallery/ezville/heaters_new.yaml`](https://github.com/wooooooooooook/homenet2mqtt/blob/main/gallery/ezville/heaters_new.yaml) (0.5도 조절 및 외출 모드)
- 전열교환기: [`gallery/ezville/fan.yaml`](https://github.com/wooooooooooook/homenet2mqtt/blob/main/gallery/ezville/fan.yaml)
- 스마트 콘센트: [`gallery/ezville/smart_outlets_f750_new.yaml`](https://github.com/wooooooooooook/homenet2mqtt/blob/main/gallery/ezville/smart_outlets_f750_new.yaml)
- 가스밸브: [`gallery/ezville/gas_valve.yaml`](https://github.com/wooooooooooook/homenet2mqtt/blob/main/gallery/ezville/gas_valve.yaml)
- 엘리베이터: [`gallery/ezville/elevator.yaml`](https://github.com/wooooooooooook/homenet2mqtt/blob/main/gallery/ezville/elevator.yaml)
- 공기질/에너지 센서: [`gallery/ezville/air_quality_sensors.yaml`](https://github.com/wooooooooooook/homenet2mqtt/blob/main/gallery/ezville/air_quality_sensors.yaml), [`gallery/ezville/energy_sensors.yaml`](https://github.com/wooooooooooook/homenet2mqtt/blob/main/gallery/ezville/energy_sensors.yaml)

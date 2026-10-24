# CVnet (씨브이넷)

CVnet 홈네트워크 시스템의 RS485 패킷 구조 및 Homenet2MQTT 연동 가이드입니다.  
주로 대림 e편한세상, 아크로(ACRO) 등 여러 아파트 단지에 널리 구축되어 있습니다.

## References

- [CVnet 관련 자료 정리 및 사용자 기여](https://github.com/wooooooooooook/homenet2mqtt/issues)

---

## 1. 통신 기본 규격

- **통신 방식**: RS485 반이중(Half-Duplex)
- **Baud Rate**: 9600 bps
- **Data Bits**: 8
- **Parity**: None
- **Stop Bits**: 1
- **패킷 특징**: 
  - 상태 패킷은 `0x20 0x01`로 시작하는 공통 접두어를 가집니다.
  - 제어 명령 시 `0x20` 뒤에 대상 장치 ID가 지정되며, 성공 시 ACK 응답(`0x20 0x01 [TargetID] 0x91` 또는 `0x9F`)이 수신됩니다.

---

## 2. 기본 패킷 구조

### 상태 보고 패킷 (월패드/디바이스 수신)

| Index | 0 | 1 | 2 | 3 | 4 | 5 | ... | N | Checksum |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **필드** | Header | SubHeader | Device/Room ID | Data 0 | Data 1 | Data 2 | ... | Data N | Checksum |
| **값** | `0x20` | `0x01` | 기기 식별자 | ... | ... | ... | ... | ... | Sum/XOR |

- **기기 식별자 (Index 2)**:
  - `0x21` 이상: 조명 (방 0: `0x21`, 방 1: `0x22`, ...)
  - `0x4A`, `0x4B`: 난방 (방 1~4: `0x4A`, 방 5~8: `0x4B`)
  - `0x11`: 가스밸브
  - `0x71`: 환기팬 (전열교환기)
  - `0x22`: 엘리베이터 상태

### 제어 명령 패킷 (브릿지/월패드 송신)

| Index | 0 | 1 | 2 | 3 | 4 | 5 | 6 ~ 11 | Checksum |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **필드** | Header | Target ID | 0x01 | Sub Command | Control Data | Param | Reserved (`0x00`) | Checksum |
| **값** | `0x20` | 장치 ID | `0x01` | `0x11` 등 | 동작 값 | 부가 값 | `0x00 ...` | - |

- 제어 후 수신되는 ACK 패킷: `[0x20, 0x01, Target ID, 0x91]` 또는 `[0x20, 0x01, Target ID, 0x9F]`

---

## 3. 기기별 상세 패킷 분석

### 3.1 조명 (Light)

방 단위로 여러 개의 조명이 묶여 상태 보고가 이루어집니다.

- **상태 패킷 (`0x20 0x01 [RoomID]`)**:
  - `RoomID`: `0x20 + room_id + 1` (방 0 = `0x21`, 방 1 = `0x22`, ...)
  - `Index 4 ~ 7`: 각 조명 1~4의 ON/OFF 상태 (`0x01`: ON, `0x00`: OFF)

| Index | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| 필드 | Header | Sub | RoomID | Reserved | 조명 1 | 조명 2 | 조명 3 | 조명 4 |
| 값 | `0x20` | `0x01` | `0x21` ~ | - | `0x01`/`0x00` | `0x01`/`0x00` | `0x01`/`0x00` | `0x01`/`0x00` |

- **제어 명령 패킷**:
  - `Index 1`: RoomID (`0x20 + room_id + 1`)
  - `Index 3`: 제어할 조명 번호 (`0x11`: 1번 조명, `0x12`: 2번 조명, ...)
  - `Index 4`: 명령 (`0x01`: ON, `0x00`: OFF)
  - `ACK`: `[0x20, 0x01, RoomID, 0x9F]`

```yaml
# 제어 패킷 예시 (방 0의 1번 조명 켜기)
data: [0x20, 0x21, 0x01, 0x11, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]
ack: [0x20, 0x01, 0x21, 0x9F]
```

---

### 3.2 난방 (Climate)

난방 온도조절기는 여러 방의 온도가 하나의 패킷에 연속 배열되어 전달됩니다.

- **상태 패킷 (`0x20 0x01 0x4A / 0x4B`)**:
  - 방 1~4: `0x4A`, 방 5~8: `0x4B`
  - 각 방마다 2바이트씩 할당:
    - **목표 온도**: `bitAnd(data[index], 0x7F)`
    - **난방 운전 상태**: `bitAnd(data[index], 0x80)` (`0x80`: 가동, `0x00`: 정지)
    - **현재 온도**: `data[index + 1]`

| Index | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| 필드 | Header | Sub | Group | ... | 방1 설정+운전 | 방1 현재 | 방2 설정+운전 | 방2 현재 | 방3 설정+운전 | 방3 현재 | ... |
| 값 | `0x20` | `0x01` | `0x4A` | ... | `Temp \| 0x80` | `Temp` | `Temp \| 0x80` | `Temp` | ... | ... | ... |

- **제어 명령 패킷**:
  - `Index 1`: Room ID (`0x40 + room_number`, 예: 1번 방 = `0x41`)
  - `Index 4`: 명령/목표온도
    - OFF: `0x00`
    - ON: `0x80`
    - 온도 설정: `int(x) + 0x80` (최상위 비트에 1 세팅)
  - CVnet 난방은 명령 후 확인 패킷(`[0x20, 0x01, 0x40 + room, 0x91]`)을 연달아 전송하는 이중 패킷 시퀀스를 권장합니다.

```yaml
# 제어 패킷 예시 (1번 방 난방 23도 설정)
command_temperature: >-
  [[0x20, 0x41, 0x01, 0x11, 23 + 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
   [0x20, 0x01, 0x41, 0x91]]
```

---

### 3.3 환기팬 (Fan)

- **상태 패킷 (`0x20 0x01 0x71`)**:
  - `Index 5`: 전원 상태 (`0x01`: ON, `0x00`: OFF)
  - `Index 7`: 팬 속도 (단계 값)
- **제어 명령 패킷**:
  - 전원 제어: `[0x20, 0x71, 0x01, 0x11, PWR, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00]`
  - 속도 제어: `[[0x20, 0x71, 0x01, 0x02, speed, 0x00, 0x00], [0x60, 0x71, 0x01, 0x02, speed]]`

---

### 3.4 가스밸브 (Gas Valve)

- **상태 패킷 (`0x20 0x01 0x11`)**:
  - `Index 5`: 밸브 상태 (`0x01`: 열림, `0x00`: 닫힘)
- **제어 명령 패킷 (닫기 전용)**:
  - 패킷: `[0x20, 0x11, 0x01, 0x11, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]`
  - ACK: `[0x20, 0x01, 0x11, 0x91]`

---

### 3.5 엘리베이터 (Elevator)

- **상태 패킷 (`0x20 0x01 0x22 0x81`)**:
  - `Index 5`: 현재 층수 (Floor 숫자 값)
- **호출 명령 패킷**:
  - `[0x20, 0x01, 0x81, 0x81, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]`

---

## 4. 갤러리 프리셋 파일 안내

Homenet2MQTT의 `gallery/cvnet/` 디렉터리에 사전 정의된 YAML 스니펫을 사용할 수 있습니다:

- 조명: [`gallery/cvnet/lights_new.yaml`](https://github.com/wooooooooooook/homenet2mqtt/blob/main/gallery/cvnet/lights_new.yaml) (방 및 방별 조명 수 자동 탐지/설정)
- 난방: [`gallery/cvnet/heaters_new.yaml`](https://github.com/wooooooooooook/homenet2mqtt/blob/main/gallery/cvnet/heaters_new.yaml) (방 개수 동적 반복)
- 가스밸브: [`gallery/cvnet/gas_valve.yaml`](https://github.com/wooooooooooook/homenet2mqtt/blob/main/gallery/cvnet/gas_valve.yaml)
- 환기팬: [`gallery/cvnet/fan.yaml`](https://github.com/wooooooooooook/homenet2mqtt/blob/main/gallery/cvnet/fan.yaml)
- 엘리베이터: [`gallery/cvnet/elevator.yaml`](https://github.com/wooooooooooook/homenet2mqtt/blob/main/gallery/cvnet/elevator.yaml), [`gallery/cvnet/elevator_daerim.yaml`](https://github.com/wooooooooooook/homenet2mqtt/blob/main/gallery/cvnet/elevator_daerim.yaml)

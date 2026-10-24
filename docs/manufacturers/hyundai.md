# Hyundai (현대통신 이마주 / 힐스테이트)

## 현대통신 - 힐스테이트

## references

- [요겨님 정리](https://yogyui.tistory.com/category/%ED%99%88%EB%84%A4%ED%8A%B8%EC%9B%8C%ED%81%AC%28IoT%29/%ED%9E%90%EC%8A%A4%ED%85%8C%EC%9D%B4%ED%8A%B8%20%EA%B4%91%EA%B5%90%EC%82%B0)
- [요겨님 현대통신 월패드 RS485 엘리베이터 호출 정리](https://yogyui.tistory.com/entry/%ED%98%84%EB%8C%80%ED%86%B5%EC%8B%A0-%EC%9B%94%ED%8C%A8%EB%93%9C-RS-485-%ED%86%B5%EC%8B%A0-%ED%94%84%EB%A1%9C%ED%86%A0%EC%BD%9C-%EC%97%98%EB%A6%AC%EB%B2%A0%EC%9D%B4%ED%84%B0-%ED%98%B8%EC%B6%9C)

---

현대통신(현대이지웰 / HT / IMazu) 홈네트워크 시스템의 RS485 패킷 구조 및 Homenet2MQTT 연동 가이드입니다.  
현대건설 힐스테이트, 현대엔지니어링 힐스테이트, 현대통신 월패드가 적용된 다수의 아파트 단지에서 사용됩니다.

## 1. 통신 기본 규격

- **통신 방식**: RS485 반이중(Half-Duplex)
- **Baud Rate**: 9600 bps
- **Data Bits**: 8
- **Parity**: None
- **Stop Bits**: 1
- **프레임 구분자**:
  - **시작 바이트 (Header)**: `0xF7`
  - **종료 바이트 (Footer)**: `0xEE`
  - Homenet2MQTT 설정 시 `packet_defaults`에서 `rx_header: [0xF7]` 및 `rx_footer: [0xEE]`를 지정합니다.

---

## 2. 기본 패킷 구조

현대통신 프로토콜은 고정된 프레임 규격을 따르며, 헤더와 푸터 사이에 길이, 디바이스 타입, 명령 종류, 타겟 주소 등이 위치합니다.

| Index | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 ~ N | N+1 | N+2 |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **필드** | Header | Length | Fixed | Device ID | Cmd Type | Sub Cmd | Target ID | Data Payload | Checksum | Footer |
| **값** | `0xF7` | `0x0B`/`0x0D` | `0x01` | 기기 식별 | `0x01`/`0x02`/`0x04` | 서브 코드 | `(Room<<4)\|ID` | 상태/파라미터 | XOR/Sum CS | `0xEE` |

### 2.1 주요 식별 코드

- **Device ID (기기 종류)**:
  - `0x18`: 난방 (온도조절기)
  - `0x19`: 조명 (Lighting)
  - `0x1F`: 가스밸브 / 일괄 소등
  - `0x2B`: 환기시스템 (Ventilation Fan)
  - `0x34`: 엘리베이터 (Elevator)
  - `0x39`: 스마트 플러그 / 대기전력 차단

- **Command Type (명령 구분)**:
  - `0x01`: 상태 조회 질의 (Query / Request)
  - `0x02`: 제어 명령 송신 (Command)
  - `0x04`: 상태 응답 및 정기 보고 (State Response)

- **Target ID (대상 장치 주소)**:
  - 1바이트 크기이며, 상위 4비트는 **방 번호(Room ID)**, 하위 4비트는 **기기 번호(Device Index)**입니다.
  - 예: 1번 방 1번 조명 = `(1 << 4) | 1 = 0x11`
  - 예: 2번 방 3번 조명 = `(2 << 4) | 3 = 0x23`
  - 예: 1번 방 전체 = `(1 << 4) | 0 = 0x10`

---

## 3. 기기별 상세 패킷 분석

### 3.1 조명 (Light)

현대통신 조명은 ON(`0x01`), OFF(`0x02`) 값을 사용합니다. (OFF가 `0x00`이 아닌 `0x02`임에 주의)

- **제어 명령 패킷 (`0x0B 0x01 0x19 0x02 0x40 ...`)**:
  - `Index 5`: Target ID (`(room_id << 4) | light_num`)
  - `Index 6`: 제어 값 (`0x01`: ON, `0x02`: OFF)
  - `Index 7`: 부가 값 (`0x00`)
  - `ACK`: `[0x0B, 0x01, 0x19, 0x04, 0x40, TargetID, 0x01/0x02, 0x01/0x02]`

```yaml
# 1번 방 1번 조명 켜기 예시
command_on:
  data: [0x0B, 0x01, 0x19, 0x02, 0x40, 0x11, 0x01, 0x00]
  ack: [0x0B, 0x01, 0x19, 0x04, 0x40, 0x11, 0x01, 0x01]
```

- **상태 수신 및 상태 프록시 (State Proxy)**:
  - 조명 개별 응답: `[0x00, 0x01, 0x19, 0x04, 0x40, TargetID]`, `Index 8`이 상태 (`0x01`: ON, `0x02`: OFF)
  - **주기 폴링 시 방 전체 응답**: 월패드가 주기적으로 `[0x0B, 0x01, 0x19, 0x01, 0x40, (room_id << 4), ...]` 조회를 전송하면, 방 전체 조명 상태 패킷이 회신됩니다.
  - Homenet2MQTT 갤러리에서는 `state_proxy` 기능을 지원하여 방 전체 조회 패킷에서도 각 조명의 상태를 완벽하게 동기화합니다.

---

### 3.2 난방 (Climate)

- **상태 패킷 (`0x0D 0x01 0x18 0x04 0x45 [TargetID]`)**:
  - TargetID: `0x10 + room_idx - 1` (0번 인덱스부터 시작하거나 1번부터 시작)
  - `Index 8`: 운전 모드 (`0x01`: 난방 가동, `0x04`: 정지/꺼짐, `0x07`: 외출 모드)
  - `Index 9`: 현재 온도 (1도 단위 정수)
  - `Index 10`: 설정 목표 온도 (1도 단위 정수)

- **제어 명령 패킷**:
  - **전원/모드 제어 (`0x46`)**:
    - 난방 켜기: `[0x0B, 0x01, 0x18, 0x02, 0x46, TargetID, 0x01, 0x00]`
    - 난방 끄기: `[0x0B, 0x01, 0x18, 0x02, 0x46, TargetID, 0x04, 0x00]`
    - 외출 모드: `[0x0B, 0x01, 0x18, 0x02, 0x46, TargetID, 0x07, 0x00]`
  - **온도 제어 (`0x45`)**:
    - 온도 변경: `[0x0B, 0x01, 0x18, 0x02, 0x45, TargetID, Temp, 0x00]`
    - ACK 패킷: `[0x0D, 0x01, 0x18, 0x04, 0x45, TargetID, Temp, 0x01]`

> 💡 일부 단지에서는 상태 패킷이 `F7 4A` 등으로 시작하는 변종이 있으며, 갤러리의 `heaters_new_f74a.yaml`을 적용할 수 있습니다.

---

### 3.3 환기시스템 (Ventilation Fan)

- **상태 패킷 (`0x00 0x01 0x2B 0x04 0x40 0x11`)**:
  - `Index 8`: 전원 상태 (`0x01`: ON, `0x02`: OFF)
  - `Index 9`: 풍량 단계 (`0x01`: 1단/약, `0x03`: 2단/중, `0x07`: 3단/강)  
    *(풍량이 단순 정수 1, 2, 3이 아닌 누적 비트 플래그 형태를 띱니다)*

- **제어 명령 패킷**:
  - 전원 ON: `[0x0B, 0x01, 0x2B, 0x02, 0x40, 0x11, 0x01, 0x00]`
  - 전원 OFF: `[0x0B, 0x01, 0x2B, 0x02, 0x40, 0x11, 0x02, 0x00]`
  - 풍량 제어: `[0x0B, 0x01, 0x2B, 0x02, 0x42, 0x11, 0x01/0x03/0x07, 0x00]`

---

### 3.4 엘리베이터 (Elevator)

- **상태 패킷 (`0x0D 0x01 0x34 0x01 0x41 0x10 ...`)**:
  - `Index 8`: 엘리베이터 동작 상태
    - 상위 4비트: `0xA` (상승 중 / Up), `0xB` (하강 중 / Down), 대기 (Idle)
  - `Index 9`: 현재 층수
    - 지상층: BCD 형식 숫자 (예: `0x15` -> 15층)
    - 지하층: `0xB0` 이상 (예: `0xB1` -> B1층, `0xB2` -> B2층)

- **호출 명령 패킷**:
  - 하행 호출: `[0x0B, 0x01, 0x34, 0x04, 0x41, 0x10, 0x00, 0x06]` (또는 `0x02 0x41 0x10 0x06 0x00`)
  - 상행 호출: `[0x0B, 0x01, 0x34, 0x02, 0x41, 0x10, 0x05, 0x00]`

---

### 3.5 스마트 콘센트 (Plugs)

- **상태 패킷 (`0x01 0x39 0x04`)**:
  - `Index 8`: 콘센트 ON/OFF (`0x01`: ON, `0x02`: OFF)
  - 대기전력 차단 모드 설정 플래그 지원
- **제어 명령 패킷**:
  - ON: `[0x0B, 0x01, 0x39, 0x02, 0x40, TargetID, 0x01, 0x00]`
  - OFF: `[0x0B, 0x01, 0x39, 0x02, 0x40, TargetID, 0x02, 0x00]`

---

## 4. 갤러리 프리셋 파일 안내

Homenet2MQTT의 `gallery/hyundai_imazu/` 및 `gallery/hyundai_imazu_doorbell/` 프리셋:

- 조명: [`gallery/hyundai_imazu/lights_new.yaml`](https://github.com/wooooooooooook/homenet2mqtt/blob/main/gallery/hyundai_imazu/lights_new.yaml), [`gallery/hyundai_imazu/lights_all_off.yaml`](https://github.com/wooooooooooook/homenet2mqtt/blob/main/gallery/hyundai_imazu/lights_all_off.yaml)
- 난방: [`gallery/hyundai_imazu/heaters_new.yaml`](https://github.com/wooooooooooook/homenet2mqtt/blob/main/gallery/hyundai_imazu/heaters_new.yaml), [`gallery/hyundai_imazu/heaters_new_f74a.yaml`](https://github.com/wooooooooooook/homenet2mqtt/blob/main/gallery/hyundai_imazu/heaters_new_f74a.yaml)
- 환기팬: [`gallery/hyundai_imazu/fan.yaml`](https://github.com/wooooooooooook/homenet2mqtt/blob/main/gallery/hyundai_imazu/fan.yaml), [`gallery/hyundai_imazu/fan_modes.yaml`](https://github.com/wooooooooooook/homenet2mqtt/blob/main/gallery/hyundai_imazu/fan_modes.yaml)
- 스마트 콘센트: [`gallery/hyundai_imazu/plugs_new.yaml`](https://github.com/wooooooooooook/homenet2mqtt/blob/main/gallery/hyundai_imazu/plugs_new.yaml), [`gallery/hyundai_imazu/plugs_standby_mode.yaml`](https://github.com/wooooooooooook/homenet2mqtt/blob/main/gallery/hyundai_imazu/plugs_standby_mode.yaml)
- 엘리베이터: [`gallery/hyundai_imazu/elevator.yaml`](https://github.com/wooooooooooook/homenet2mqtt/blob/main/gallery/hyundai_imazu/elevator.yaml), [`gallery/hyundai_imazu/elevator2.yaml`](https://github.com/wooooooooooook/homenet2mqtt/blob/main/gallery/hyundai_imazu/elevator2.yaml)
- 현관벨: [`gallery/hyundai_imazu_doorbell/doorbell.yaml`](https://github.com/wooooooooooook/homenet2mqtt/blob/main/gallery/hyundai_imazu_doorbell/doorbell.yaml)
- 정기 상태 갱신: [`gallery/hyundai_imazu/periodic_update.yaml`](https://github.com/wooooooooooook/homenet2mqtt/blob/main/gallery/hyundai_imazu/periodic_update.yaml)

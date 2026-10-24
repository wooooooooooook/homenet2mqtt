# Bestin (현대산업개발 아이파크 베스틴)

## 현대아이파크

## references:

- [요거님 정리자료](https://yogyui.tistory.com/category/%ED%99%88%EB%84%A4%ED%8A%B8%EC%9B%8C%ED%81%AC%28IoT%29/%EA%B4%91%EA%B5%90%EC%95%84%EC%9D%B4%ED%8C%8C%ED%81%AC)
- [halwin님 컴포넌트 deepwiki](https://deepwiki.com/lunDreame/ha-bestin)

gen1 aio gen2 등 다양한 버전이 있는걸로보임

---

HDC현대산업개발 아이파크(IPARK) 단지에 주로 적용되는 **Bestin(베스틴)** 홈네트워크 시스템의 RS485 패킷 구조 및 Homenet2MQTT 연동 가이드입니다.  
Bestin 1.0 (Gen1, Gen2, AIO) 및 Bestin 2.0 시스템을 모두 다룹니다.

## 1. 통신 기본 규격

- **통신 방식**: RS485 반이중(Half-Duplex)
- **Baud Rate**: 9600 bps
- **Data Bits**: 8
- **Parity**: None
- **Stop Bits**: 1
- **프레임 헤더 (Prefix)**: `0x02` (STX)
- **체크섬 (Checksum)**: 패킷 전체의 합산 및 체크섬 바이트

---

## 2. 패킷 구조의 핵심 특징

베스틴 프로토콜은 다른 제조사와 구별되는 두 가지 두드러진 특징을 가지고 있습니다.

### 2.1 시퀀스 번호 (Sequence Number) 메커니즘
- 모든 상태 보고와 제어 명령에는 **0~255 순환 시퀀스 번호**가 포함됩니다.
- 제어 명령을 보낼 때 버스 상에서 수신된 최근 시퀀스 번호를 그대로 반영하여 송신해야 월패드 및 기기에서 명령을 유효하게 처리합니다.
- Homenet2MQTT 갤러리 프리셋은 `number.sequence_number` 엔티티와 패킷 생성 스크립트를 통해 이를 전자동으로 관리합니다:
  ```cel
  // 패킷 길이에 따른 시퀀스 번호 수집
  len(data) == 10 ? data[3] : data[4]
  ```

### 2.2 패킷 길이의 이원화 (고정 vs 가변)

1. **가변 길이 패킷** (길이 바이트 포함):
   - 대상: 난방(`0x28`), 에너지(`0xD1`), 방별 통합기기 (`0x3x` Gen1/2, `0x5x` AIO)
   - 포맷: `[0x02] [Header] [Length] [Req/Res] [Sequence] [Data...] [Checksum]`

| 0 | 1 | 2 | 3 | 4 | 5 | ... | length |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| prefix | header(기기별) | length | request/response | sequence_number | data.. | ... | checksum |
| `0x02` | `0x28`: THERMOSTAT (난방)<br>`0xD1`: ENERGY (에너지)<br>`0x5x`: AIO 방별 장치<br>`0x3x`: Gen1,2 방별 장치<br>`0xC1`: ELEVATOR | 길이 | `0x11`/`0x12`: 요청<br>`0x81`/`0x91`: 응답 | 시퀀스 번호 | ... | ... | 체크섬 |

2. **10바이트 고정 길이 패킷** (길이 바이트 없음):
   - 대상: 가스밸브(`0x31`), 도어락(`0x41`), 환기장치(`0x61`)

| 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| prefix | header(기기별) | request/response | sequence_number | data.. | ... | ... | ... | ... | checksum |
| `0x02` | `0x31`: Gas 밸브<br>`0x41`: 도어락<br>`0x61`: Fan (환기) | 요청/응답 | 시퀀스 번호 | 데이터 | ... | ... | ... | ... | 체크섬 |

---

## 3. 기기별 상세 패킷 분석

### 3.1 난방 (Climate)

Bestin 1.0과 2.0에 공통 적용되는 16바이트 전후 가변 길이 패킷입니다.

- **상태 패킷 (`0x02 0x28 0x10 0x91 [Seq] [RoomID] ...`)**:
  - `RoomID`: 방 번호 (1부터 시작)
  - `Index 6`: 난방 상태 (`0x11` 또는 `0x01`: ON/가동, `0x02`: OFF/정지)
  - `Index 7`: 설정 목표 온도
    - 정수부: `bitAnd(data[7], 0x3F)`
    - 0.5°C 플래그: `bitAnd(data[7], 0x40) > 0 ? 0.5 : 0.0`
  - `Index 8 ~ 9`: 현재 실내 온도 (2바이트 결합 후 10으로 나눔)
    ```cel
    double(bitOr(bitShiftLeft(data[8], 8), data[9])) / 10.0
    ```

- **제어 명령 스크립트 패킷**:
  - `[0x28, 0x0E, 0x12, SeqNum, RoomID, Power, TempByte, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]`
  - `Power`: `1`(ON), `2`(OFF)
  - `TempByte`: `int(temp) + (is_half ? 0x40 : 0)`
  - `ACK`: `[0x02, 0x28, 0x81]`

---

### 3.2 가스밸브 (Gas Valve)

10바이트 고정 길이 패킷을 사용합니다.

- **상태 패킷 (`0x02 0x31 0x81 [Seq] ...`)**:
  - `Index 4` 또는 `5`: 밸브 상태 (`0x01`: 열림, `0x02`: 닫힘)
- **닫기 명령 패킷**:
  - `[0x31, 0x01, SeqNum, 0x02, 0x00, 0x00, 0x00]`
  - `ACK`: `[0x02, 0x31, 0x81]`

---

### 3.3 도어락 (Doorlock)

10바이트 고정 길이 패킷을 사용합니다.

- **상태 패킷 (`0x02 0x41 0x81 [Seq] ...`)**:
  - 잠금 상태 확인
- **문열기 명령 패킷**:
  - `[0x41, 0x11, SeqNum, 0x01, 0x00, 0x00, 0x00]`

---

### 3.4 환기팬 (Fan)

10바이트 고정 길이 패킷을 사용합니다.

- **상태 패킷 (`0x02 0x61 0x81 [Seq] ...`)**:
  - 전원 및 풍량 단계
- **제어 명령 패킷**:
  - 전원 및 풍량 제어 패킷 전송 후 시퀀스 번호 갱신

---

### 3.5 Bestin 2.0 디밍 조명 및 아웃렛

Bestin 2.0은 방 단위 패킷(`0x30 | Room ID`)을 통해 디밍 조명(밝기 1~100%, 색온도)과 콘센트 대기전력 제어를 처리합니다.

- **상태 패킷 (`0x30 | RoomID, 0x00, 0x91 ...`)**:
  - 조명 개별 상태, 밝기 단계, 색온도 값
  - 콘센트 전원 상태 및 대기전력 차단 모드
- **제어 스크립트**:
  - 밝기/색온도 변경 시 `make_light_packet` 스크립트를 통해 계산된 바이트열을 송신

---

## 4. 갤러리 프리셋 파일 안내

- Bestin 1.0:
  - 난방: [`gallery/bestin/climate_new.yaml`](https://github.com/wooooooooooook/homenet2mqtt/blob/main/gallery/bestin/climate_new.yaml) (시퀀스 번호 관리 스크립트 내장)
  - 가스밸브: [`gallery/bestin/valve.yaml`](https://github.com/wooooooooooook/homenet2mqtt/blob/main/gallery/bestin/valve.yaml)
  - 도어락: [`gallery/bestin/doorlock.yaml`](https://github.com/wooooooooooook/homenet2mqtt/blob/main/gallery/bestin/doorlock.yaml)
  - 환기팬: [`gallery/bestin/fan.yaml`](https://github.com/wooooooooooook/homenet2mqtt/blob/main/gallery/bestin/fan.yaml)
  - 에너지 센서: [`gallery/bestin/energy485_general_new.yaml`](https://github.com/wooooooooooook/homenet2mqtt/blob/main/gallery/bestin/energy485_general_new.yaml), [`gallery/bestin/energy485_AIO_new.yaml`](https://github.com/wooooooooooook/homenet2mqtt/blob/main/gallery/bestin/energy485_AIO_new.yaml)
- Bestin 2.0:
  - 디밍 조명 및 아웃렛: [`gallery/bestin2.0/dimming_and_outlets_new.yaml`](https://github.com/wooooooooooook/homenet2mqtt/blob/main/gallery/bestin2.0/dimming_and_outlets_new.yaml)

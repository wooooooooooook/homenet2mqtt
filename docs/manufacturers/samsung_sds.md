## 래미안, ezon

## references

- [저장장치님 애드온 deepwiki](https://deepwiki.com/n-andflash/ha_addons)
- [저장장치님 정리자료](https://github.com/n-andflash/ha_addons/blob/master/sds_wallpad/DOCS_PACKETS.md)

# 삼성 SDS 홈넷 설정 안내

삼성 SDS(이지온 / EZON / 래미안 등) 홈네트워크 시스템의 RS485 브릿지 연결, 패킷 구조 분석 및 Homenet2MQTT 연동 가이드입니다.

---

## ⚠️ 중요: 시리얼 포트 설정

**삼성 SDS는 다른 제조사와 달리 Parity가 `EVEN`입니다.**

대부분의 홈넷 제조사(코콤, CVNet 등)는 parity를 `NONE`으로 사용하지만, 삼성 SDS는 **반드시 `EVEN` parity**를 설정해야 정상적으로 통신할 수 있습니다.

```yaml
homenet_bridge:
  serial:
    path: /dev/ttyUSB0 # 또는 EW11 주소 (예: 192.168.0.100:8899)
    baud_rate: 9600
    data_bits: 8
    parity: EVEN # ⚡ 필수: 반드시 EVEN으로 설정
    stop_bits: 1
```

> 💡 **parity 설정 오류 시 증상**: 패킷이 깨지거나, 전혀 수신되지 않거나, checksum 오류가 계속 발생합니다.

---

## 패킷 기본 설정

삼성 SDS 구형 규격(`samsung_rx`, `samsung_tx`)은 하위 호환성을 위해 유지되나 **더 이상 권장되지 않습니다(Deprecated)**. 새로운 설정 시에는 패킷 전체 XOR 방식인 **`samsung_xor`** 사용을 권장합니다.

**`rx_valid_headers`**를 설정하면 체크섬 충돌(checksum collision)로 인한 잘못된 패킷 인식을 방지할 수 있습니다. 삼성 SDS 패킷의 유효한 헤더 바이트(첫 번째 바이트)만 나열합니다.

```yaml
packet_defaults:
  rx_timeout: 10ms
  tx_delay: 50ms
  tx_timeout: 500ms
  tx_retry_cnt: 3
  rx_checksum: samsung_xor
  tx_checksum: samsung_xor
  rx_valid_headers: [0xB0, 0xAB, 0xAC, 0xAD, 0xAE, 0xC2, 0xCC, 0xA4]
```

> 💡 **rx_valid_headers**: 체크섬이 유효해도 첫 바이트가 이 목록에 없으면 패킷으로 인식하지 않습니다. 패킷이 연속으로 수신될 때 우연히 체크섬이 맞는 잘못된 조합을 걸러냅니다.

---

## 📋 패킷 구조 및 기기별 특징

삼성 SDS 프로토콜은 상태 보고 패킷이 주로 `0xB0`로 시작하고, 제어 명령 패킷은 `0xAC`, `0xAE`, `0xC2`, `0xC6` 등의 헤더를 사용합니다.

### 기기별 헤더 및 패킷 요약

| 기기 구분 | 상태 수신 (State) | 제어 명령 (Command) | 제어 응답 (ACK) | 데이터 바이트 특징 |
| :--- | :---: | :---: | :---: | :--- |
| **조명 (Light)** | `0xB0 0x79` | `0xAC 0x7A` | `0xB0 0x79` | `0x01`: ON, `0x00`: OFF |
| **난방 (Climate)** | `0xB0 0x7C` | `0xAE 0x7D` | `0xB0 0x7D` | `Index 3`: 전원, `Index 4`: 목표온도, `Index 5`: 현재온도 |
| **환기팬 (Fan)** | `0xB0 0x4E` | `0xC2 0x4F` | `0xB0 0x4F` | 풍량: `0x03`(1단), `0x02`(2단), `0x01`(3단) |
| **콘센트 (Outlet)** | `0xB0 0x4A` | `0xC6 0x6E` | `0xB0 0x6E` | 전원 제어 및 실시간 전력량(W) 모니터링 |
| **가스밸브 (Valve)** | `0xB0 0x2C` | `0xAB` | `0xB0 0x2C` | 닫기 제어 지원 |
| **현관스위치 (구형)** | `0xB0 0x41` | `0xAD` | `0xB0` | 장치 스캔(`0xAD 0x5A`), 엘리베이터 쿼리(`0xAD 0x41`) |
| **현관스위치 (신형)** | `0xB0` | `0xCC` | `0xB0` | 신형 현관스위치 규격 |

### 1. 조명 (Light)
- **상태 패킷 (`0xB0 0x79 [SubID] [StateMask] ...`)**:
  - `SubID`: 방/스위치 식별자 (`0x21`, `0x13`, `0x14` 등)
  - `StateMask`: 비트마스크로 조명 ON/OFF 표현 (`0x01`, `0x02`, `0x04` 등)
- **제어 명령 패킷 (`0xAC 0x7A [LightNum] [Power]`)**:
  - `Power`: `0x01`(ON), `0x00`(OFF)
  - `ACK`: `[0xB0, 0x79, LightNum, Power]`

### 2. 난방 (Climate)
- **상태 패킷 (`0xB0 0x7C [RoomID] [Power] [TarTemp] [CurTemp]`)**:
  - `RoomID`: 방 번호 (`0x01` ~ `0x08`)
  - `Power`: `0x01`(ON / 난방 가동), `0x00`(OFF / 정지)
  - `TarTemp`: 설정 목표 온도 (°C)
  - `CurTemp`: 현재 실내 온도 (°C)
- **제어 명령 패킷 (`0xAE 0x7D [RoomID] [Power] [TarTemp] 0x00 0x00`)**:
  - `ACK`: `[0xB0, 0x7D, RoomID, Power]`

### 3. 환기팬 (Fan)
- **상태 패킷 (`0xB0 0x4E ...`)**:
  - `Index 4`: 전원 상태 (`0x00`: ON, `0x01`: OFF)
  - `Index 2`: 풍량 상태 (`0x03`: 1단, `0x02`: 2단, `0x01`: 3단)
- **제어 명령 패킷**:
  - 전원 ON: `[0xC2, 0x4F, 0x05, 0x00, 0x00]`
  - 전원 OFF: `[0xC2, 0x4F, 0x06, 0x00, 0x00]`
  - 풍량 제어: `[0xC2, 0x4F, 0x04 - speed, 0x00, 0x00]`
  - `ACK`: `[0xB0, 0x4F, CommandCode]`

### 4. 대기전력차단 콘센트 (Outlet)
- **상태 패킷 (`0xB0 0x4A [OutletID] [State] ...`)**:
  - `State`: `Index 3`의 하위 니블이 전원 상태 (`0x01`: ON, `0x00`: OFF)
  - 실시간 소비 전력량(W) 모니터링 센서 포함
- **제어 명령 패킷**:
  - ON: `[0xC6, 0x6E, OutletID, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00]`
  - OFF: `[0xC6, 0x6E, OutletID, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]`
  - `ACK`: `[0xB0, 0x6E, OutletID]`

---

## 엘리베이터·현관문 연동 시 주의사항

### 🔌 권장: RS485-USB 시리얼 장치 사용

엘리베이터 호출, 현관문 개폐 등 **현관스위치 기능을 연동**하려면 다음 방법을 권장합니다:

1. **현관스위치를 물리적으로 탈거**하고, 연결되어 있던 **RS485 신호선을 뽑아둡니다**.
   - 목적은 현관스위치를 RS485 라인에서 **완전히 제거(무력화)**하는 것입니다.
   - 현관스위치를 제거하지 않으면, 브릿지와 현관스위치가 동시에 응답하여 충돌이 발생합니다.
2. **RS485-USB 시리얼 변환기**(USB to RS485 동글 등)를 메인 RS485 라인에 연결합니다.
   - 현관스위치가 있던 자리에 연결할 필요는 **없습니다**.
   - 기존에 사용하던 RS485 연결 위치(월패드 등)에 그대로 연결하면 됩니다.

```
┌─────────────┐                       ┌─────────────────┐
│  월패드     │ ←── RS485 (A, B) ──→ │  RS485-USB 변환기│ ←──→ PC/서버
│  (엘리베이터)│                       │  (예: CH340기반) │
└─────────────┘                       └─────────────────┘
        ✕ 현관스위치 (탈거하여 무력화)
```

**이유:**

- 현관스위치 연동은 **요청-응답 타이밍이 매우 중요**합니다.
- 월패드가 현관스위치에 주기적으로 상태를 질의하며, 일정 시간 내에 응답하지 않으면 통신 실패로 처리합니다.
- 직접 연결된 RS485-USB 장치는 지연 시간이 최소화되어 **안정적인 응답**이 가능합니다.

> ⚠️ **주의:** 현관스위치를 무력화하면 **현관스위치의 조명 일괄 차단(외출 모드) 기능이 동작하지 않습니다**.  
> 해당 기능이 필요한 경우, Home Assistant 등에서 자동화를 구성하여 대체해야 합니다.

### ⚠️ EW11 (WiFi-RS485 변환기) 사용 시

EW11 등 WiFi 기반 RS485 변환기로도 시도해 볼 수 있으나, **권장하지 않습니다**.

**문제점:**

- WiFi 네트워크의 지연 시간(latency)이 일정하지 않습니다.
- 요청-응답 간 **타이밍을 정확히 맞추기 어렵습니다**.
- 간헐적으로 응답 시간이 초과되어 통신 실패가 발생합니다.

> 조명, 난방 등 상태 모니터링 용도로는 EW11도 사용 가능하지만,  
> **엘리베이터·현관문처럼 요청-즉시응답이 필요한 기능**은 EW11로는 어렵습니다.

### 📋 현관스위치 종류 확인 (구형 vs 신형)

엘리베이터·현관문 연동 시 **현관스위치의 종류에 따라 다른 설정 파일**을 적용해야 합니다.

| 구분 | 패킷 헤더 | 갤러리 설정 파일 |
| :--- | :---: | :--- |
| **구형** 현관스위치 | `0xAD` | `elevator_old_full.yaml` 또는 `elevator_old_minimal.yaml` |
| **신형** 현관스위치 | `0xCC` | `elevator_new.yaml` |

**확인 방법:**

1. 브릿지를 RS485 라인에 연결합니다.
2. UI의 **Raw Packet Log**에서 수신되는 패킷을 확인합니다.
3. 현관스위치 관련 패킷의 첫 번째 바이트(헤더)를 확인합니다:
   - `AD XX XX XX` → **구형** 스위치
   - `CC XX XX XX` → **신형** 스위치

**갤러리 설정 적용:**

- 구형 (AD): [`gallery/samsung_sds/elevator_old_full.yaml`](https://github.com/wooooooooooook/homenet2mqtt/blob/main/gallery/samsung_sds/elevator_old_full.yaml)
- 신형 (CC): [`gallery/samsung_sds/elevator_new.yaml`](https://github.com/wooooooooooook/homenet2mqtt/blob/main/gallery/samsung_sds/elevator_new.yaml)

> ⚠️ **주의:** 잘못된 설정 파일을 적용하면 패킷 매칭이 되지 않아 엘리베이터 호출이 동작하지 않습니다.

---

### 엘리베이터 (Automation 활용)

현관스위치를 탈거하고 사용하는 경우, automation을 통해 월패드의 요청에 응답합니다:

```yaml
entities:
  switch:
    - id: 'elevator_call'
      name: 'Elevator Call'
      icon: 'mdi:elevator'
      optimistic: true

automation:
  # 장치스캔 응답
  - id: 'status_response_comm'
    trigger:
      - type: packet
        match:
          data: [0xAD, 0x5A, 0x00, 0x77]
          index: 0
    then:
      - action: send_packet
        data: [0xB0, 0x5A, 0x00, 0x6A]
        checksum: false

  # 엘리베이터 상태 응답 (호출 중이면 호출됨, 아니면 대기)
  - id: 'status_response_elevator'
    mode: restart
    trigger:
      - type: packet
        match:
          data: [0xAD, 0x41, 0x00, 0x6C]
          index: 0
    then:
      - action: send_packet
        data: "get_from_states('elevator_call', 'state') == 'on' ? [0xB0, 0x2F, 0x01, 0x1E] : [0xB0, 0x41, 0x00, 0x71]"
        checksum: false
      - action: delay
        milliseconds: 20s
      - action: command
        target: id(elevator_call).command_off()

  # 엘리베이터 완료 응답
  - id: 'elevator_call_ack'
    trigger:
      - type: packet
        match:
          data: [0xAD, 0x2F, 0x00, 0x02]
          index: 0
    then:
      - action: send_packet
        data: [0xB0, 0x41, 0x00, 0x71]
        checksum: false
      - action: command
        target: id(elevator_call).command_off()
```

---

### 현관벨 자동 문열기 (Doorbell)

현관벨이 울릴 때 자동으로 통화 및 문열기를 수행하는 고급 자동화입니다:

```yaml
entities:
  binary_sensor:
    # 개인현관벨 상태 감지
    - id: 'doorbell_private'
      name: '개인현관벨'
      icon: 'mdi:bell-ring'
      state:
        data: [0x30]
        mask: [0xF0]
      state_on:
        data: [0x31, 0x00]
      state_off:
        data: [0x3E, 0x01]
        mask: [0xFF, 0x01]

  switch:
    # 자동열기 ON/OFF 제어 스위치
    - id: 'doorbell_auto_open_private'
      name: '개인현관벨 자동열기'
      icon: 'mdi:door-open'
      optimistic: true

  text:
    # 상태 머신을 위한 내부 텍스트 엔티티
    - id: 'door_state'
      name: '현관문 상태'
      internal: true # HA Discovery 및 대시보드에서 숨김
      optimistic: true # 패킷 없이 상태 관리
      initial_value: 'D_IDLE'

automation:
  # 벨이 울리면 자동열기 시퀀스 시작
  - id: 'doorbell_private_ring'
    mode: restart
    trigger:
      - type: state
        entity_id: doorbell_private
        property: state
        match: 'on'
    then:
      - action: command
        target: id(door_state).command_set('D_BELL')
      - action: if
        condition: "get_from_states('doorbell_auto_open_private', 'state') == 'on'"
        then:
          - action: delay
            milliseconds: 2s
          - action: command
            target: id(door_state).command_set('D_CALL')
          - action: delay
            milliseconds: 3s
          - action: command
            target: id(door_state).command_set('D_OPEN')

  # 월패드 쿼리(A4 41)에 상태에 따라 응답
  - id: 'response_query'
    trigger:
      - type: packet
        match:
          data: [0xA4, 0x41]
          mask: [0xFF, 0xFF]
          index: 0
    then:
      - action: if
        condition: "get_from_states('door_state', 'state') == 'D_CALL'"
        then:
          - action: send_packet
            data: [0xB0, 0x36, 0x01] # 개인현관 통화
            checksum: true
        else:
          - action: if
            condition: "get_from_states('door_state', 'state') == 'D_OPEN'"
            then:
              - action: send_packet
                data: [0xB0, 0x3B, 0x00] # 개인현관 문열기
                checksum: true
            else:
              - action: send_packet
                data: [0xB0, 0x41, 0x00] # 대기 상태
                checksum: true
```

**사용 방법:**

1. `doorbell_auto_open_private` 스위치를 ON으로 설정
2. 개인현관벨이 울리면 자동으로:
   - 2초 후 통화 (`0xB0 0x36 0x01`)
   - 3초 후 문열기 (`0xB0 0x3B 0x00`)

---

## ❄️ 삼성 시스템에어컨 (Samsung HVAC: NonNASA & NASA)

삼성 SDS 월패드 라인과 별도로, 삼성 에어컨 실내외기 직결 F1/F2 RS485 버스를 제어하는 프로토콜입니다.

### 1. 삼성 NonNASA 프로토콜 (14바이트 고정)
구형 삼성 시스템에어컨에서 사용됩니다.

- **기본 구조**: `[0x32] [SRC] [DST] [CMD] [D4 ~ D11] [CRC] [0x34]`
- **실내기 상태 보고 (Cmd 20)**:
  - `Index 4`: 목표 온도 (디코딩: `byte - 55`)
  - `Index 5`: 실내 현재 온도 (디코딩: `byte - 55`)
  - `Index 7`: 풍향 및 팬 속도
  - `Index 8`: 전원 및 운전 모드
- **제어 명령 (Cmd B0)**:
  - `[0x32, 0xD0, DST, 0xB0, Swing, RoomTemp, TargetTemp|Fan, Mode, Power, 0x21, 0x00, CRC, 0x34]`

### 2. 삼성 NASA 프로토콜 (가변 길이)
신형 삼성 시스템에어컨(무풍 에어컨, 360 카세트 등)에서 사용되는 패킷 구조입니다.

- **기본 구조**: `[0x32] [LEN_HI] [LEN_LO] [SA_3B] [DA_3B] [CMD_3B] [MSG_COUNT] [MSG_DATA...] [CRC_2B] [0x34]`
- **주요 메시지 번호**:
  - `0x4000`: 전원 Enum (`0`: OFF, `1`: ON)
  - `0x4001`: 운전 모드 Enum (`0`: Auto, `1`: Cool, `2`: Dry, `3`: Fan, `4`: Heat)
  - `0x4006`: 팬 속도 Enum (`0`: Auto, `1`: Low, `2`: Mid, `3`: High, `4`: Turbo)
  - `0x4201`: 목표 온도 Variable (값 * 10, 예: 240 = 24.0°C)
  - `0x4203`: 현재 실내 온도 Variable (값 * 10, 예: 220 = 22.0°C)

---

## 4. 갤러리 프리셋 파일 안내

- 삼성 SDS:
  - 조명: [`gallery/samsung_sds/lights.yaml`](https://github.com/wooooooooooook/homenet2mqtt/blob/main/gallery/samsung_sds/lights.yaml)
  - 난방: [`gallery/samsung_sds/heaters_new.yaml`](https://github.com/wooooooooooook/homenet2mqtt/blob/main/gallery/samsung_sds/heaters_new.yaml)
  - 환기팬: [`gallery/samsung_sds/fan.yaml`](https://github.com/wooooooooooook/homenet2mqtt/blob/main/gallery/samsung_sds/fan.yaml)
  - 스마트 콘센트: [`gallery/samsung_sds/outlet_new.yaml`](https://github.com/wooooooooooook/homenet2mqtt/blob/main/gallery/samsung_sds/outlet_new.yaml)
  - 가스밸브: [`gallery/samsung_sds/gas_valve_close.yaml`](https://github.com/wooooooooooook/homenet2mqtt/blob/main/gallery/samsung_sds/gas_valve_close.yaml)
  - 엘리베이터: [`gallery/samsung_sds/elevator_new.yaml`](https://github.com/wooooooooooook/homenet2mqtt/blob/main/gallery/samsung_sds/elevator_new.yaml), [`gallery/samsung_sds/elevator_old_full.yaml`](https://github.com/wooooooooooook/homenet2mqtt/blob/main/gallery/samsung_sds/elevator_old_full.yaml)
  - 현관벨 자동문열기: [`gallery/samsung_sds/doorbell.yaml`](https://github.com/wooooooooooook/homenet2mqtt/blob/main/gallery/samsung_sds/doorbell.yaml)
- 삼성 시스템에어컨 (HVAC):
  - NonNASA: [`gallery/samsung_hvac/climate.yaml`](https://github.com/wooooooooooook/homenet2mqtt/blob/main/gallery/samsung_hvac/climate.yaml)
  - NASA: [`gallery/samsung_hvac_nasa/climate.yaml`](https://github.com/wooooooooooook/homenet2mqtt/blob/main/gallery/samsung_hvac_nasa/climate.yaml)

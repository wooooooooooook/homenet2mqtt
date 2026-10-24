# Commax (코맥스)

## 빠른 요약

- 지원 기능: 조명, 스위치, 난방 등 대부분 기기

---

## 코맥스

## reference

---

## 1. 통신 기본 규격

- **통신 방식**: RS485 반이중(Half-Duplex)
- **Baud Rate**: 9600 bps
- **Data Bits**: 8
- **Parity**: None
- **Stop Bits**: 1
- **패킷 길이**: **8바이트 고정 길이** (모든 장치 공통)
- **체크섬 (Checksum)**: **단순 합산 8비트 체크섬 (`Sum & 0xFF`)**  
  - 0번부터 6번 인덱스까지의 모든 바이트를 더한 값의 하위 8비트가 7번 인덱스에 위치합니다.
  - Homenet2MQTT 설정 시 `tx_checksum: add` 및 `rx_checksum: add` 사용.

---

## 2. 기본 패킷 구조 및 헤더 패턴

코맥스 프로토콜은 8바이트 고정 길이로 구성되며, 첫 번째 바이트(헤더)에 기기 종류와 패킷의 성격(조회, 제어, 상태 보고, 제어 응답)이 정의됩니다.

### 2.1 패킷 포맷 (8바이트 고정)

| Index | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **필드** | Header | Field 1 | Field 2 | Field 3 | Field 4 | Field 5 | Field 6 | Checksum |
| **설명** | 기기/명령 구분 | 장치ID / 전원 | 명령 / ID | 데이터 1 | 데이터 2 | 데이터 3 | 예비 (`0x00`) | `Sum(0..6) & 0xFF` |

### 2.2 기기별 헤더 일람표

| 기기 구분 | 상태 조회 (Query) | 제어 명령 (Command) | 상태 보고 (State) | 제어 응답 (ACK) | 데이터 인코딩 특징 |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **조명 (Light)** | `0x30` | `0x31` | `0xB0` | `0xB1` | `0x01`: ON, `0x00`: OFF |
| **일괄 소등 스위치** | `0x20` | `0x22` | `0xA0` | - | - |
| **난방 (Climate)** | `0x04` | `0x04` | `0x82` | `0x84` | **BCD** (현재온도, 설정온도) |
| **환기팬 (Fan)** | `0x04` | `0x04` | `0xF6` | `0xF7` | 풍량 코드 (`0x01`~`0x06`) |
| **가스밸브 (Valve)** | - | `0x11` | `0x90` | `0x91` | 닫기 전용 (`0x80`, `0x40`) |
| **스마트 콘센트** | - | `0x7A` | `0xF9` | - | **BCD** (실시간 전력량 W) |
| **엘리베이터** | - | `0xA0` | `0x23` / `0x26` | - | **BCD** (현재 층수) |

---

## 3. 기기별 상세 패킷 표 (Reference)

### 3.1 Light (조명)

**Command 패킷**

| Index      | 0      | 1        | 2                     | 3     | 4     | 5     | 6     | 7        |
| ---------- | ------ | -------- | --------------------- | ----- | ----- | ----- | ----- | -------- |
| **Name**   | Header | deviceId | power                 | empty | empty | empty | empty | checksum |
| **Values** | "31"   | "FF"     | "01" (on), "00" (off) | -     | -     | -     | -     | -        |
| **Memo**   | -      | -        | -                     | -     | -     | -     | -     | -        |

**State Request 패킷**

| Index      | 0      | 1        | 2     | 3     | 4     | 5     | 6     | 7        |
| ---------- | ------ | -------- | ----- | ----- | ----- | ----- | ----- | -------- |
| **Name**   | Header | deviceId | empty | empty | empty | empty | empty | checksum |
| **Values** | "30"   | "FF"     | -     | -     | -     | -     | -     | -        |
| **Memo**   | -      | -        | -     | -     | -     | -     | -     | -        |

**State 패킷**

| Index      | 0      | 1                     | 2        | 3     | 4     | 5     | 6     | 7        |
| ---------- | ------ | --------------------- | -------- | ----- | ----- | ----- | ----- | -------- |
| **Name**   | Header | power                 | deviceId | empty | empty | empty | empty | checksum |
| **Values** | "B0"   | "01" (on), "00" (off) | "FF"     | -     | -     | -     | -     | -        |
| **Memo**   | -      | -                     | -        | -     | -     | -     | -     | -        |

---

### 3.2 LightBreaker (일괄 소등 스위치)

**Command 패킷**

| Index      | 0      | 1        | 2            | 3                     | 4     | 5     | 6     | 7        |
| ---------- | ------ | -------- | ------------ | --------------------- | ----- | ----- | ----- | -------- |
| **Name**   | Header | deviceId | commandType  | power                 | empty | empty | empty | checksum |
| **Values** | "22"   | "FF"     | "01" (power) | "01" (on), "00" (off) | -     | -     | -     | -        |
| **Memo**   | -      | -        | 추정입니다   | 추정입니다            | -     | -     | -     | -        |

**State Request 패킷**

| Index      | 0      | 1        | 2     | 3     | 4     | 5     | 6     | 7        |
| ---------- | ------ | -------- | ----- | ----- | ----- | ----- | ----- | -------- |
| **Name**   | Header | deviceId | empty | empty | empty | empty | empty | checksum |
| **Values** | "20"   | "FF"     | -     | -     | -     | -     | -     | -        |
| **Memo**   | -      | -        | -     | -     | -     | -     | -     | -        |

**State 패킷**

| Index      | 0      | 1                     | 2        | 3     | 4     | 5       | 6     | 7        |
| ---------- | ------ | --------------------- | -------- | ----- | ----- | ------- | ----- | -------- |
| **Name**   | Header | power                 | deviceId | empty | empty | unknown | empty | checksum |
| **Values** | "A0"   | "01" (on), "00" (off) | "FF"     | -     | -     | "15"    | -     | -        |
| **Memo**   | -      | -                     | -        | -     | -     | 추정    | -     | -        |

---

### 3.3 Thermo (난방 온도조절기)

온도는 BCD 형식(예: `0x23` -> 23°C)입니다.

**Command 패킷**

| Index      | 0      | 1        | 2                                              | 3                     | 4     | 5     | 6     | 7        |
| ---------- | ------ | -------- | ---------------------------------------------- | --------------------- | ----- | ----- | ----- | -------- |
| **Name**   | Header | deviceId | commandType                                    | value                 | empty | empty | empty | checksum |
| **Values** | "04"   | "FF"     | "03" (setTemp), "04" (power), "05" (awayMode?) | "01" (on), "00" (off) | -     | -     | -     | -        |
| **Memo**   | -      | -        | -                                              | -                     | -     | -     | -     | -        |

**State Request 패킷**

| Index      | 0      | 1        | 2     | 3     | 4     | 5     | 6     | 7        |
| ---------- | ------ | -------- | ----- | ----- | ----- | ----- | ----- | -------- |
| **Name**   | Header | deviceId | empty | empty | empty | empty | empty | checksum |
| **Values** | "02"   | "FF"     | -     | -     | -     | -     | -     | -        |
| **Memo**   | -      | -        | -     | -     | -     | -     | -     | -        |

**State 패킷**

| Index      | 0      | 1                                     | 2        | 3        | 4          | 5     | 6     | 7        |
| ---------- | ------ | ------------------------------------- | -------- | -------- | ---------- | ----- | ----- | -------- |
| **Name**   | Header | power                                 | deviceId | curTemp  | setTemp    | empty | empty | checksum |
| **Values** | "82"   | "81" (on), "80" (off), "83" (heating) | "FF"     | "18"(18) | "24" (24)  | -     | -     | -        |
| **Memo**   | -      | -                                     | -        | BCD 형식 | BCD 형식   | -     | -     | -        |

---

### 3.4 Gas (가스밸브)

안전상 닫기 전용입니다.

**Command 패킷**

| Index      | 0      | 1        | 2          | 3     | 4     | 5     | 6     | 7        |
| ---------- | ------ | -------- | ---------- | ----- | ----- | ----- | ----- | -------- |
| **Name**   | Header | deviceId | power      | empty | empty | empty | empty | checksum |
| **Values** | "11"   | "01"     | "80" (off) | -     | -     | -     | -     | -        |
| **Memo**   | -      | -        | -          | -     | -     | -     | -     | -        |

**State Request 패킷**

| Index      | 0      | 1        | 2     | 3     | 4     | 5     | 6     | 7        |
| ---------- | ------ | -------- | ----- | ----- | ----- | ----- | ----- | -------- |
| **Name**   | Header | deviceId | empty | empty | empty | empty | empty | checksum |
| **Values** | "10"   | "FF"     | -     | -     | -     | -     | -     | -        |
| **Memo**   | -      | -        | -     | -     | -     | -     | -     | -        |

**State 패킷**

| Index      | 0      | 1                                           | 2                                           | 3     | 4     | 5     | 6     | 7        |
| ---------- | ------ | ------------------------------------------- | ------------------------------------------- | ----- | ----- | ----- | ----- | -------- |
| **Name**   | Header | power1                                      | power2                                      | empty | empty | empty | empty | checksum |
| **Values** | "90"   | "80" (on), "40" (off), "88" (off/ack)       | "80" (on), "40" (off), "88" (off/ack)       | -     | -     | -     | -     | -        |
| **Memo**   | -      | -                                           | -                                           | -     | -     | -     | -     | -        |

---

### 3.5 Outlet (스마트 콘센트)

**Command 패킷**

| Index      | 0      | 1        | 2            | 3                     | 4     | 5     | 6     | 7        |
| ---------- | ------ | -------- | ------------ | --------------------- | ----- | ----- | ----- | -------- |
| **Name**   | Header | deviceId | commandType  | power                 | empty | empty | empty | checksum |
| **Values** | "7A"   | "FF"     | "01" (power) | "01" (on), "00" (off) | -     | -     | -     | -        |
| **Memo**   | -      | -        | -            | -                     | -     | -     | -     | -        |

**State Request 패킷**

| Index      | 0      | 1        | 2     | 3     | 4     | 5     | 6     | 7        |
| ---------- | ------ | -------- | ----- | ----- | ----- | ----- | ----- | -------- |
| **Name**   | Header | deviceId | empty | empty | empty | empty | empty | checksum |
| **Values** | "79"   | "FF"     | -     | -     | -     | -     | -     | -        |
| **Memo**   | -      | -        | -     | -     | -     | -     | -     | -        |

**State 패킷**

| Index      | 0      | 1                     | 2        | 3                       | 4               | 5               | 6               | 7        |
| ---------- | ------ | --------------------- | -------- | ----------------------- | --------------- | --------------- | --------------- | -------- |
| **Name**   | Header | power                 | deviceId | type                    | wattage1        | wattage2        | wattage3        | checksum |
| **Values** | "F9"   | "01" (on), "00" (off) | "FF"     | "11" (Wattage), "21" (Eco) | "00"~"99" (BCD) | "00"~"99" (BCD) | "00"~"99" (BCD) | -        |
| **Memo**   | -      | "11"(On+Auto), "10"(Off+Auto) | - | -                       | BCD 형식 실시간 전력량 | -           | -               | -        |

---

### 3.6 Fan (환기팬)

**Command 패킷**

| Index      | 0      | 1        | 2                             | 3                                                             | 4     | 5     | 6     | 7        |
| ---------- | ------ | -------- | ----------------------------- | ------------------------------------------------------------- | ----- | ----- | ----- | -------- |
| **Name**   | Header | deviceId | commandType                   | value                                                         | empty | empty | empty | checksum |
| **Values** | "04" (또는 "78") | "FF" | "01" (power), "02" (setSpeed) | "00" (off), "01" (low), "02" (medium), "03" (high), "04" (on) | -     | -     | -     | -        |
| **Memo**   | -      | -        | -                             | -                                                             | -     | -     | -     | -        |

**State Request 패킷**

| Index      | 0      | 1        | 2     | 3     | 4     | 5     | 6     | 7        |
| ---------- | ------ | -------- | ----- | ----- | ----- | ----- | ----- | -------- |
| **Name**   | Header | deviceId | empty | empty | empty | empty | empty | checksum |
| **Values** | "76"   | "FF"     | -     | -     | -     | -     | -     | -        |
| **Memo**   | -      | -        | -     | -     | -     | -     | -     | -        |

**State 패킷**

| Index      | 0      | 1                                       | 2        | 3                                      | 4     | 5     | 6     | 7        |
| ---------- | ------ | --------------------------------------- | -------- | -------------------------------------- | ----- | ----- | ----- | -------- |
| **Name**   | Header | power                                   | deviceId | speed                                  | empty | empty | empty | checksum |
| **Values** | "F6"   | "01" (on), "00" (off) (또는 "04")       | "FF"     | "01" (low), "02" (medium), "03" (high), "04" (auto), "06" (night) | - | - | - | checksum |
| **Memo**   | -      | 명령에 없는 night, auto가 존재한다고함. | -        | -                                      | -     | -     | -     | -        |

---

### 3.7 EV (엘리베이터 호출)

**Command 패킷**

| Index      | 0                                                                           | 1                                                                                                        | 2         | 3            | 4            | 5            | 6     | 7        |
| ---------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------- | ------------ | ------------ | ------------ | ----- | -------- |
| **Name**   | Header                                                                      | deviceId                                                                                                 | power     | unknown1     | unknown2     | unknown3     | empty | checksum |
| **Values** | "A0"                                                                        | "01"                                                                                                     | "01" (on) | "00" (fixed) | "08" (fixed) | "15" (fixed) | -     | checksum |
| **Memo**   | 사실 A0이지만 일괄조명차단기 상태헤더와 중복이라 main.py에 하드코딩되어있음 | 기기 번호로 추정됨.. EV의 헤더는 A0이지만 일괄조명차단기 상태헤더와 중복이라 main.py에 하드코딩되어있음. | 추정됨..  | -            | -            | -            | -     | -        |

**State 패킷**

| Index      | 0      | 1                | 2                    | 3               | 4     | 5     | 6     | 7        |
| ---------- | ------ | ---------------- | -------------------- | --------------- | ----- | ----- | ----- | -------- |
| **Name**   | Header | power            | deviceId             | floor           | empty | empty | empty | checksum |
| **Values** | "23" (또는 "26") | "01" (on) | "FF" | "FF" (BCD 층수) | - | - | - | checksum |
| **Memo**   | -      | power로 추정됨.. | 기기 번호로 추정됨.. | 층으로 추정됨.. (BCD) | - | - | - | -        |

---

## 4. 갤러리 프리셋 파일 안내

Homenet2MQTT의 `gallery/commax/` 디렉터리 프리셋 목록:

- 조명: [`gallery/commax/lights_new.yaml`](https://github.com/wooooooooooook/homenet2mqtt/blob/main/gallery/commax/lights_new.yaml), [`gallery/commax/light_breaker.yaml`](https://github.com/wooooooooooook/homenet2mqtt/blob/main/gallery/commax/light_breaker.yaml), [`gallery/commax/virtual_lights.yaml`](https://github.com/wooooooooooook/homenet2mqtt/blob/main/gallery/commax/virtual_lights.yaml)
- 난방: [`gallery/commax/heaters_new.yaml`](https://github.com/wooooooooooook/homenet2mqtt/blob/main/gallery/commax/heaters_new.yaml), [`gallery/commax/heaters_request.yaml`](https://github.com/wooooooooooook/homenet2mqtt/blob/main/gallery/commax/heaters_request.yaml)
- 환기팬: [`gallery/commax/fan_new.yaml`](https://github.com/wooooooooooook/homenet2mqtt/blob/main/gallery/commax/fan_new.yaml), [`gallery/commax/haatz_air_quality_sensors.yaml`](https://github.com/wooooooooooook/homenet2mqtt/blob/main/gallery/commax/haatz_air_quality_sensors.yaml)
- 스마트 콘센트: [`gallery/commax/smart_plugs_new.yaml`](https://github.com/wooooooooooook/homenet2mqtt/blob/main/gallery/commax/smart_plugs_new.yaml)
- 가스밸브: [`gallery/commax/gas_valve.yaml`](https://github.com/wooooooooooook/homenet2mqtt/blob/main/gallery/commax/gas_valve.yaml)
- 엘리베이터: [`gallery/commax/elevator.yaml`](https://github.com/wooooooooooook/homenet2mqtt/blob/main/gallery/commax/elevator.yaml), [`gallery/commax/elevator_26.yaml`](https://github.com/wooooooooooook/homenet2mqtt/blob/main/gallery/commax/elevator_26.yaml)

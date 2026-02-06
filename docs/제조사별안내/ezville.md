## 자이 (Ezville)

### 1. Light (조명)

**Command 패킷**

| Index | 0 | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|---|
| **Name** | Header | RoomID | Command | Sub | LightID | Value | Padding |
| **Values** | 0x0E | 0x11~ | 0x41 | 0x03 | 0x01~ (0x0F: All) | 0x01 (On), 0x00 (Off) | 0x00 |
| **Memo** | - | 0x11: Room1 | - | - | - | - | - |

**State 패킷**

| Index | 0 | 1 | 2 | ... | 6 | ... |
|---|---|---|---|---|---|---|
| **Name** | Header | RoomID | Type | ... | Status | ... |
| **Values** | 0x0E | 0x11~ | 0x81 | ... | 0x01 (On), 0x00 (Off) | ... |
| **Memo** | - | - | - | ... | LightID에 따라 Offset 다름 (Room1 Light1: Offset 6, Light2: Offset 7...) | - |

### 2. Gas (가스 밸브)

**Command 패킷 (Close)**

| Index | 0 | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|---|
| **Name** | Header | ID | Type | Sub | Padding | Cmd | Padding |
| **Values** | 0x33 | 0x01 | 0x81 | 0x03 | 0x00 | 0x05 | 0x00 |
| **Memo** | 잠금 명령만 지원 | - | - | - | - | - | - |

**State 패킷**

| Index | 0 | 1 | 2 | ... | 6 | ... |
|---|---|---|---|---|---|---|
| **Name** | Header | ID | Type | ... | Status | ... |
| **Values** | 0x12 | 0x01 | 0x81 | ... | 0x01 (Open), 0x02 (Closed) | ... |
| **Memo** | - | - | - | ... | - | - |

### 3. Thermostat (난방)

**Command 패킷**

| Index | 0 | 1 | 2 | 3 | 4 |
|---|---|---|---|---|---|
| **Name** | Header | RoomID | Command | Sub | Value |
| **Values** | 0x36 | 0x11~ | 0x43 (Pwr), 0x44 (Temp), 0x45 (Preset) | 0x01 | Pwr: 0x01(On)/0x00(Off), Temp: Value, Preset: 0x01(Away)/0x00(None) |
| **Memo** | - | - | - | - | - |

**State 패킷 (Broadcast)**

| Index | 0 | 1 | 2 | ... | 6 | ... | 9 | 10 | ... |
|---|---|---|---|---|---|---|---|---|---|
| **Name** | Header | ID | Type | ... | PowerState | ... | TargetTemp | CurTemp | ... |
| **Values** | 0x36 | 0x1F | 0x81 | ... | Bitmask | ... | 7bit + 0.5flag | 7bit + 0.5flag | ... |
| **Memo** | - | - | - | ... | Bit0: Room1, Bit1: Room2 ... | ... | Room1 Target | Room1 Current | ... |

*   **Temperature Decoding:** `Double(Val & 0x7F) + ((Val & 0x80) ? 0.5 : 0.0)`

### 4. Fan (전열교환기)

**Command 패킷**

| Index | 0 | 1 | 2 | 3 | 4 |
|---|---|---|---|---|---|
| **Name** | Header | ID | Command | Sub | Value |
| **Values** | 0x32 | 0x01 | 0x41 (Power), 0x42 (Speed) | 0x01 | Pwr: 0x00(Off), Speed: 0x01(Low), 0x02(Med), 0x03(High) |
| **Memo** | - | - | - | - | - |

**State 패킷**

| Index | 0 | 1 | 2 | ... | 7 |
|---|---|---|---|---|---|
| **Name** | Header | ID | Type | ... | Status |
| **Values** | 0x32 | 0x01 | 0x81 | ... | 0x00(Off), 0x01(Low), 0x02(Med), 0x03(High) |

### 5. Outlet (스마트 콘센트)

**Command 패킷**

| Index | 0 | 1 | 2 | 3 | 4 |
|---|---|---|---|---|---|
| **Name** | Header | DevID | Command | Sub | Value |
| **Values** | 0x39 | 0x11~ | 0x41 | 0x01 | 0x11 (On), 0x10 (Off) |
| **Memo** | - | Room1-1: 0x11, Room1-2: 0x12 | - | - | - |

**State 패킷**

| Index | 0 | 1 | 2 | ... | 6 | ... | 9 | ... |
|---|---|---|---|---|---|---|---|---|---|
| **Name** | Header | RoomID | Type | ... | Socket1 Info | ... | Socket2 Info | ... |
| **Values** | 0x39 | 0x1F~ | 0x81 | ... | 3 Bytes (BCD) | ... | 3 Bytes (BCD) | ... |
| **Memo** | - | 0x1F: Room1 | - | ... | Byte 0: State(0x10=On), Bytes 0-2: Power | ... | - | ... |

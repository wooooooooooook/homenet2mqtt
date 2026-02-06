## CVNet (씨브이네트)

### 공통 패킷 구조
*   **State Header:** `0x20 0x01`
*   **Command Header:** `0x20`

---

### 1. Light (조명)

**Command 패킷**

| Index | 0 | 1 | 2 | 3 | 4 | 5 | ... |
|---|---|---|---|---|---|---|---|
| **Name** | Header | RoomID | Const | LightID | Value | Padding | ... |
| **Values** | 0x20 | 0x21+Room | 0x01 | 0x10+Num | 0x01(On), 0x00(Off) | 0x00 | ... |

**State 패킷**

| Index | 0 | 1 | 2 | ... | 3+N | ... |
|---|---|---|---|---|---|---|
| **Name** | Header | Header2 | RoomID | ... | Status | ... |
| **Values** | 0x20 | 0x01 | 0x21+Room | ... | 0x01(On), 0x00(Off) | ... |

---

### 2. Heater (난방)

**Command 패킷**

| Index | 0 | 1 | 2 | 3 | 4 | 5 | ... |
|---|---|---|---|---|---|---|---|
| **Name** | Header | ID | Const | Const | Value | Padding | ... |
| **Values** | 0x20 | 0x40+Index | 0x01 | 0x11 | Val | 0x00 | ... |

*   **Heat On:** `Val = TargetTemp + 0x80`
*   **Off:** `Val = 0x00`

**State 패킷**

| Index | 0 | 1 | 2 | ... | 3+(2*N) | 4+(2*N) |
|---|---|---|---|---|---|---|
| **Name** | Header | Header2 | Type | ... | Status/Target | Current |
| **Values** | 0x20 | 0x01 | 0x4A/4B | ... | Mask 0x80(Heat), 0x7F(Target) | Integer |

*   **Status Byte:** MSB(Bit 7) indicates On/Off state. Lower 7 bits are Target Temperature.

---

### 3. Fan (환기)

**Command 패킷**

| Index | 0 | 1 | 2 | 3 | 4 | ... |
|---|---|---|---|---|---|---|
| **Name** | Header | ID | Const | Const | Value | ... |
| **Values** | 0x20 | 0x71 | 0x01 | 0x11(Pwr)/0x02(Spd) | Val | ... |

*   **Power Value:** `0x01` (On), `0x00` (Off)
*   **Speed Value:** `0x03` (Low), `0x02` (Med), `0x01` (High) - *Note: Based on some configs, may vary.* (Standard CVNet often uses 1=Low, 2=Med, 3=High, but Samsung/Others might invert).
*   *Correction from YAML:* `command_speed` uses `0x02` cmd, values mapped from 1-3. `state_speed` is offset 7.

**State 패킷**

| Index | 0 | 1 | 2 | ... | 5 | ... | 7 |
|---|---|---|---|---|---|---|---|
| **Name** | Header | Header2 | ID | ... | Power | ... | Speed |
| **Values** | 0x20 | 0x01 | 0x71 | ... | 0x01(On), 0x00(Off) | ... | Integer |

---

### 4. Gas (가스)

**Command 패킷**

| Index | 0 | 1 | 2 | 3 | 4 | ... |
|---|---|---|---|---|---|---|
| **Name** | Header | ID | Const | Const | Value | ... |
| **Values** | 0x20 | 0x11 | 0x01 | 0x11 | 0x00(Close) | ... |

**State 패킷**

| Index | 0 | 1 | 2 | ... | 5 |
|---|---|---|---|---|---|
| **Name** | Header | Header2 | ID | ... | Status |
| **Values** | 0x20 | 0x01 | 0x11 | ... | 0x01(Open), 0x00(Closed) |

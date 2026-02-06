## Hyundai Imazu (현대통신 이마주)

### 공통 패킷 구조

| Index | 0 | 1 | 2 | 3 | 4 | 5 | 6~ |
|---|---|---|---|---|---|---|---|
| **Name** | PktType | SysID | DevType | Length | CmdType | DevID | Data |
| **Values** | 0x0B(Cmd), 0x00/0x0D(Ack/State) | 0x01 | 0x19(Light), 0x18(Heat)... | - | - | - | - |

---

### 1. Light (조명) - 0x19

**Command 패킷**

| Index | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|---|
| **Name** | Header | SysID | DevType | Len | Cmd | DevID | Value | Padding |
| **Values** | 0x0B | 0x01 | 0x19 | 0x02 | 0x40 | RoomID<<4 \| LightID | 0x01(On), 0x02(Off) | 0x00 |

**State 패킷**

| Index | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|---|
| **Name** | Header | SysID | DevType | Len | Cmd | DevID | ... | ... | Status |
| **Values** | 0x00 | 0x01 | 0x19 | 0x04 | 0x40 | RoomID<<4 \| LightID | ... | ... | 0x01(On), 0x02(Off) |

---

### 2. Heater (난방) - 0x18

**Command 패킷**

| Index | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|---|
| **Name** | Header | SysID | DevType | Len | Cmd | DevID | Value | Padding |
| **Values** | 0x0B | 0x01 | 0x18 | 0x02 | 0x46(Pwr), 0x45(Temp) | 0x10 + Index | - | 0x00 |

*   **Power Value:** `0x01` (Heat), `0x04` (Off), `0x07` (Away).
*   **Temp Value:** Target Temperature (Integer).

**State 패킷**

| Index | 0 | 1 | 2 | 3 | 4 | 5 | ... | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| **Name** | Header | SysID | DevType | Len | Cmd | DevID | ... | Status | CurTemp | TarTemp |
| **Values** | 0x00/0x0D | 0x01 | 0x18 | 0x04 | 0x45/0x46 | 0x10 + Index | ... | 0x01(On), 0x04(Off) | Current | Target |

---

### 3. Smart Plug (콘센트) - 0x1F

**Command 패킷**

| Index | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|---|
| **Name** | Header | SysID | DevType | Len | Cmd | DevID | Value | Padding |
| **Values** | 0x0B | 0x01 | 0x1F | 0x02 | 0x40 | RoomID<<4 \| PlugID | 0x01(On), 0x02(Off) | 0x00 |

**State 패킷**

| Index | 0 | 1 | 2 | 3 | 4 | 5 | ... | 8 |
|---|---|---|---|---|---|---|---|---|
| **Name** | Header | SysID | DevType | Len | Cmd | DevID | ... | Status |
| **Values** | 0x00 | 0x01 | 0x1F | 0x04 | 0x40 | RoomID<<4 \| PlugID | ... | 0x01(On), 0x02(Off) |

**Power Report 패킷**
*   **Header:** `0x12`
*   **Power Value:** Offset 9 (2 bytes).

---

### 4. Fan (환기) - 0x2B

**Command 패킷**

| Index | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|---|
| **Name** | Header | SysID | DevType | Len | Cmd | DevID | Value | Padding |
| **Values** | 0x0B | 0x01 | 0x2B | 0x02 | 0x40(Pwr), 0x42(Spd) | 0x11 | - | 0x00 |

*   **Power Value:** `0x01` (On), `0x02` (Off).
*   **Speed Value:** `0x01` (Low), `0x03` (Med), `0x07` (High).

**State 패킷**

| Index | 0 | 1 | 2 | 3 | 4 | 5 | ... | 8 | 9 |
|---|---|---|---|---|---|---|---|---|---|
| **Name** | Header | SysID | DevType | Len | Cmd | DevID | ... | Status | Speed |
| **Values** | 0x00 | 0x01 | 0x2B | 0x04 | 0x40 | 0x11 | ... | 0x01(On), 0x02(Off) | 0x01/0x03/0x07 |

---

### 5. Elevator (엘리베이터) - 0x34

**Command 패킷 (Call)**

| Index | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|---|
| **Name** | Header | SysID | DevType | Len | Cmd | DevID | Value | Padding |
| **Values** | 0x0B | 0x01 | 0x34 | 0x02 | 0x41 | 0x10 | 0x05(Up), 0x06(Down) | 0x00 |

**State 패킷**

| Index | 0 | 1 | 2 | 3 | 4 | ... | 8 | 9 |
|---|---|---|---|---|---|---|---|---|
| **Name** | Header | SysID | DevType | Len | Cmd | ... | State | Floor |
| **Values** | 0x0D | 0x01 | 0x34 | 0x01 | 0x41 | ... | 0xAx(Up), 0xBx(Down) | BCD Floor |

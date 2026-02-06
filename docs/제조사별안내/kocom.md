## Kocom (코콤)

### 공통 패킷 구조

| Index | 0 | 1 | 2 | 3 | 4 | 5 | 6~ |
|---|---|---|---|---|---|---|---|
| **Name** | Header | Type | Seq | DevType | RoomID | ... | Data |
| **Values** | 0x30 | 0xBC(Cmd), 0xD0/0xDC(State) | 0x00 | 0x0E(Light), 0x36(Heat)... | - | - | - |

---

### 1. Light (조명) - 0x0E

**Command 패킷**

| Index | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | ... |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Name** | Header | Type | Seq | DevType | RoomID | Const | Const | Const | L1 | L2 | L3 | L4 | ... |
| **Values** | 0x30 | 0xBC | 0x00 | 0x0E | RoomID | 0x01 | 0x00 | 0x00 | 0xFF/00 | 0xFF/00 | 0xFF/00 | 0xFF/00 | ... |

*   **Note:** 조명 제어 시 해당 방의 **모든 조명 상태**를 함께 전송해야 합니다. (변경할 조명은 새 값, 나머지는 현재 상태값 유지)

**State 패킷**

| Index | 0 | 1 | 2 | 3 | 4 | ... | 10 | 11 | 12 | 13 |
|---|---|---|---|---|---|---|---|---|---|---|
| **Name** | Header | Type | Seq | DevType | RoomID | ... | L1 | L2 | L3 | L4 |
| **Values** | 0x30 | 0xD0 | 0x00 | 0x0E | RoomID | ... | 0xFF/00 | 0xFF/00 | 0xFF/00 | 0xFF/00 |

*   **Status Values:** `0xFF` (On), `0x00` (Off).

---

### 2. Heater (난방) - 0x36

**Command 패킷**

| Index | 0 | 1 | 2 | 3 | 4 | ... | 8 | ... | 10 |
|---|---|---|---|---|---|---|---|---|---|
| **Name** | Header | Type | Seq | DevType | RoomID | ... | Mode | ... | TargetTemp |
| **Values** | 0x30 | 0xBC | 0x00 | 0x36 | RoomID | ... | 0x11(Heat), 0x01(Off) | ... | Integer |

**State 패킷**

| Index | 0 | 1 | 2 | 3 | 4 | ... | 10 | ... | 12 | ... | 14 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **Name** | Header | Type | Seq | DevType | RoomID | ... | Mode | ... | Target | ... | Current |
| **Values** | 0x30 | 0xD0 | 0x00 | 0x36 | RoomID | ... | 0x10(Heat), 0x00(Off) | ... | Int | ... | Int |

---

### 3. Gas (가스) - 0x2C

**Command 패킷 (Close Only)**

| Index | 0 | 1 | 2 | 3 | 4 | 5 | ... |
|---|---|---|---|---|---|---|---|
| **Name** | Header | Type | Seq | DevType | RoomID | Cmd | ... |
| **Values** | 0x30 | 0xBC | 0x00 | 0x2C | 0x00 | 0x02(Close) | ... |

**State 패킷**

| Index | 0 | 1 | 2 | 3 | 4 | ... | 9 |
|---|---|---|---|---|---|---|---|
| **Name** | Header | Type | Seq | DevType | RoomID | ... | Status |
| **Values** | 0x30 | 0xD0 | 0x00 | 0x2C | 0x00 | ... | 0x01(Open), 0x02(Closed) |

---

### 4. Fan (환기) - 0x48

**Command 패킷**

| Index | 0 | 1 | 2 | 3 | 4 | ... | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|
| **Name** | Header | Type | Seq | DevType | RoomID | ... | Power | Unk | Speed |
| **Values** | 0x30 | 0xBC | 0x00 | 0x48 | 0x00 | ... | 0x11(On), 0x00(Off) | 0x01 | 0x40/0x80/0xC0 |

**State 패킷**

| Index | 0 | 1 | 2 | 3 | 4 | ... | 10 | 11 | 12 |
|---|---|---|---|---|---|---|---|---|---|
| **Name** | Header | Type | Seq | DevType | RoomID | ... | Power | Unk | Speed |
| **Values** | 0x30 | 0xDC | 0x00 | 0x48 | 0x00 | ... | 0x11(On), 0x00(Off) | - | 0x40/0x80/0xC0 |

*   **Speed Values:** `0x40` (Low), `0x80` (Med), `0xC0` (High).

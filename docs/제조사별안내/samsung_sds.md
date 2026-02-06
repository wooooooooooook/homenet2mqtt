## Samsung SDS (삼성 SDS)

### 1. Light (조명)

**Command 패킷**

| Index | 0 | 1 | 2 | 3 |
|---|---|---|---|---|
| **Name** | Header | Type | LightID | Value |
| **Values** | 0xAC | 0x7A | 0x01~ | 0x01(On), 0x00(Off) |

**State 패킷**

| Index | 0 | 1 | 2 | 3 |
|---|---|---|---|---|
| **Name** | Header | Type | ID | Status |
| **Values** | 0xB0 | 0x79 | 0x21/13... | 0x01(On), 0x00(Off) |

---

### 2. Heater (난방)

**Command 패킷**

| Index | 0 | 1 | 2 | 3 | 4 | ... |
|---|---|---|---|---|---|---|
| **Name** | Header | Type | ID | Value | Padding | ... |
| **Values** | 0xAE | 0x7D(Pwr), 0x7F(Temp) | Index | Val | 0x00 | ... |

*   **Power Value:** `0x01` (Heat), `0x00` (Off)
*   **Temp Value:** Target Temperature

**State 패킷**

| Index | 0 | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|
| **Name** | Header | Type | ID | Status | Target | Current |
| **Values** | 0xB0 | 0x7C | Index | 0x01(Heat), 0x00(Off) | Temp | Temp |

---

### 3. Fan (환기)

**Command 패킷**

| Index | 0 | 1 | 2 | 3 | 4 |
|---|---|---|---|---|---|
| **Name** | Header | Type | Value | Padding | Padding |
| **Values** | 0xC2 | 0x4F | Val | 0x00 | 0x00 |

*   **Values:** `0x05`(On), `0x06`(Off), `0x03`(Low), `0x02`(Med), `0x01`(High)

**State 패킷**

| Index | 0 | 1 | 2 | 3 | 4 |
|---|---|---|---|---|---|
| **Name** | Header | Type | Speed | Padding | Status |
| **Values** | 0xB0 | 0x4E | 0x03(L), 0x02(M), 0x01(H) | - | 0x00(On), 0x01(Off) |

*   **Note:** Status 0x00 is ON, 0x01 is OFF (Inverted).

---

### 4. Gas (가스)

**Command 패킷 (Close)**

| Index | 0 | 1 | 2 |
|---|---|---|---|
| **Name** | Header | Type | Value |
| **Values** | 0xAB | 0x78 | 0x00 |

**State 패킷**

| Index | 0 | 1 | 2 |
|---|---|---|---|
| **Name** | Header | Type | Status |
| **Values** | 0xB0 | 0x41 | 0x00(Open), 0x01(Closed) |

---

### 5. Smart Outlet (대기전력 콘센트)

**Command 패킷**

| Index | 0 | 1 | 2 | 3 | ... |
|---|---|---|---|---|---|
| **Name** | Header | Type | Index | Value | ... |
| **Values** | 0xC6 | 0x6E(Pwr), 0x4B(Cutoff) | Index | 0x01(On), 0x00(Off) | ... |

**State 패킷**

| Index | 0 | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|
| **Name** | Header | Type | Index | Status | Power(H) | Power(L) |
| **Values** | 0xB0 | 0x4A | Index | Bitmask | Byte | Byte |

*   **Status Byte:** Lower 4 bits (Power On/Off), Upper 4 bits (Cutoff On/Off).

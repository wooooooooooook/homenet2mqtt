## Bestin (베스틴)

### 1. Heating (난방)
**Command 패킷**

| Index | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|---|
| **Name** | Header | Len | Cmd | Seq | RoomID | Power | Temp | ... |
| **Values** | 0x28 | 0x0E | 0x12 | Seq | 0x01~ | 0x01(On), 0x02(Off) | Val + 0x40(if 0.5) | ... |

**State 패킷**

| Index | 0 | 1 | 2 | 3 | 4 | ... | 6 | 7 | 8 | 9 |
|---|---|---|---|---|---|---|---|---|---|---|
| **Name** | Header | Len | Type | Seq | RoomID | ... | Status | Target | Cur(H) | Cur(L) |
| **Values** | 0x28 | 0x10 | 0x91 | ... | ... | ... | 0x11(Heat), 0x02(Off) | Val&0x3F (+0.5 if 0x40) | Current Temp / 10.0 | ... |

### 2. Ventilation (환기)
**Command 패킷**

| Index | 0 | 1 | 2 | 3 | 4 | 5 | ... |
|---|---|---|---|---|---|---|---|
| **Name** | Header | CmdType | Seq | Padding | Val1 | Val2 | ... |
| **Values** | 0x61 | 0x01(Pwr), 0x03(Spd) | Seq | 0x00 | Spd/Pwr | Pwr | ... |

*   **Power Cmd:** `CmdType=0x01`, `Val2` (0x01=On, 0x00=Off)
*   **Speed Cmd:** `CmdType=0x03`, `Val1` (0x01=Low, 0x02=Med, 0x03=High)
*   **Natural Cmd:** `CmdType=0x07`, `Val2` (0x10=On, 0x00=Off)

**State 패킷**

| Index | 0 | 1 | ... | 5 | 6 |
|---|---|---|---|---|---|
| **Name** | Header | Type | ... | Power/Natural | Speed |
| **Values** | 0x61 | 0x80 | ... | Bit0=Pwr, Bit4=Natural | 0x01~0x03 |

### 3. Gas (가스)
**Command 패킷 (Close Only)**

| Index | 0 | 1 | 2 | ... |
|---|---|---|---|---|
| **Name** | Header | Cmd | Seq | ... |
| **Values** | 0x31 | 0x02 | Seq | ... |

**State 패킷**

| Index | 0 | 1 | 2 | ... | 5 |
|---|---|---|---|---|---|
| **Name** | Header | Header2 | Type | ... | Status |
| **Values** | 0x02 | 0x31 | 0x02 | ... | 0x01(Open), 0x00(Closed) |

### 4. Lights & Outlets (Bestin 2.0)
**Packet Structure**
*   **Header:** `0x30 | RoomID` (e.g., Room1=0x31, Room2=0x32)

**Light Command 패킷**

| Index | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | ... |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **Name** | Header | Len | Cmd | Seq | Const | Const | Pos | OnOff | Bri | Color | ... |
| **Values** | 0x3N | 0x0E | 0x21 | Seq | 0x01 | 0x00 | 0x01~ | 0x01(On), 0x02(Off) | 0-100 (0xFF=Skip) | 0-100 (0xFF=Skip) | ... |

**Outlet Command 패킷**

| Index | 0 | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|---|
| **Name** | Header | Len | Cmd | Seq | Const | Pos | Mode |
| **Values** | 0x3N | 0x09 | 0x22 | Seq | 0x01 | 0x01~ | 0x01(On), 0x02(Off), 0x10(SB On), 0x11(SB Off) |

**State 패킷 (Integrated)**
*   Header: `0x3N`
*   Type: `0x91`
*   Structure: Variable length. Contains count and data for all lights and outlets in the room.
    *   `Data[10]`: Light Count
    *   Light Data Start: Offset 18. Length 13 bytes per light.
    *   Outlet Data Start: After lights. Length 14 bytes per outlet.

## 2025-12-14 - [PacketParser Allocations]
**Learning:** `PacketParser.parse` runs for every byte. Intermediate `Buffer.from()` calls for checksum validation created significant overhead (approx 50% of parsing time) in the hot path.
**Action:** Use `number[]` or generic `ByteArray` interfaces to avoid unnecessary object creation in hot paths like serial data parsing.

## 2026-01-04 - PacketParser Strategy C Optimization
**Learning:** Packet parsing with unknown length (Strategy C) is O(N^2) by default because it re-calculates the checksum for every possible length. For standard checksums (like `xor_add`), commutative properties allow O(N) incremental updates.
**Action:** Always look for incremental calculation opportunities in sliding window or variable-length scanning algorithms.

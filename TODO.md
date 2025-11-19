# TODO for RS485-HomeNet-to-MQTT-bridge Refactoring

This document outlines the remaining refactoring tasks based on the architectural principles.

## 1. Protocol Refactoring - Parsers

-   **Objective**: Further break down the `PacketProcessor` class by extracting parsing-related logic into dedicated parser modules within `protocol/parsers`.
-   **Current Status**: `PacketProcessor` still contains `decodeValue`, `evaluateStateLambda`, `matchState`, `startsWith`, `endsWith` methods, and the main `parseIncomingPacket` logic.
-   **Tasks**:
    -   Create `protocol/parsers/packet.parser.ts` to encapsulate `decodeValue`, `evaluateStateLambda`, `matchState`, `startsWith`, `endsWith`, and the `parseIncomingPacket` method.
    -   Update `protocol/packet-processor.ts` to remove these methods and delegate parsing to an instance of `PacketParser`.

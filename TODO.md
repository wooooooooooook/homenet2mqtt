# TODO for RS485-HomeNet-to-MQTT-bridge Refactoring

This document outlines the remaining refactoring tasks based on the architectural principles.

## 1. Protocol Refactoring - Parsers

-   **Objective**: Further break down the `PacketProcessor` class by extracting parsing-related logic into dedicated parser modules within `protocol/parsers`.
-   **Current Status**: `PacketProcessor` still contains `decodeValue`, `evaluateStateLambda`, `matchState`, `startsWith`, `endsWith` methods, and the main `parseIncomingPacket` logic.
-   **Tasks**:
    -   Create `protocol/parsers/packet.parser.ts` to encapsulate `decodeValue`, `evaluateStateLambda`, `matchState`, `startsWith`, `endsWith`, and the `parseIncomingPacket` method.
    -   Update `protocol/packet-processor.ts` to remove these methods and delegate parsing to an instance of `PacketParser`.

## 2. State Refactoring - Event Emission

-   **Objective**: Enhance the `StateManager` to actively emit events upon state changes, as per the principle: "현재 기기들의 상태를 저장하고, 변경 시 이벤트를 발생시킵니다."
-   **Current Status**: `StateManager` manages `stateCache` and processes incoming data, but explicit event emission on state updates is not yet implemented.
-   **Tasks**:
    -   Introduce an event mechanism (e.g., Node.js `EventEmitter` or a custom event bus) within `StateManager`.
    -   Modify `StateManager.processIncomingData` to emit specific events (e.g., `state:changed`, `device:<id>:state:changed`) when a device's state is updated.

## 3. Further Refinement of Domain Entities

-   **Objective**: Review and potentially expand the definitions of domain entities to better reflect their responsibilities and attributes, especially if they involve more complex behaviors or validations.
-   **Current Status**: Entity files in `domain/entities/` currently contain only basic interfaces extending `EntityConfig`.
-   **Tasks**:
    -   Assess whether each entity type requires additional methods, properties, or validation logic that should reside within its respective domain entity file.
    -   If necessary, convert simple interfaces into classes or more complex types.

## 4. Review `protocol/types.ts` and `domain/entities/base.entity.ts` for Type Clarity

-   **Objective**: Ensure that all type definitions (especially `CommandLambdaConfig`, `StateLambdaConfig`, `CommandSchema`, `EntityConfig`) are robust and accurately reflect their usage across the `protocol` and `domain` layers.
-   **Current Status**: Some types were inferred and placed in `protocol/types.ts` and `domain/entities/base.entity.ts` as part of refactoring to resolve build issues.
-   **Tasks**:
    -   Thoroughly review `CommandLambdaConfig`, `StateLambdaConfig`, `CommandSchema`, `EntityConfig` and related types for completeness and correctness.
    -   Refine placeholder `any` types where more specific types can be inferred or defined.

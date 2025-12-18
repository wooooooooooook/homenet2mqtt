# Housekeeper's Journal

## 2025-05-21 - [Untyped Event Bus]
**Observation:** The global `eventBus` (EventEmitter) was untyped, leading to implicit `any` in consumers and causing bugs (e.g., `mqtt-message` having `payload` vs `message` mismatch).
**Action:** Defined explicit interfaces (`StateChangedEvent`, `MqttMessageEvent`) in `core` and typed the consumers to enforce correctness.

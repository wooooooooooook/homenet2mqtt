# Scribe's Journal

## 2024-05-24 - Initial Journal Creation
**Learning:** The journal file was missing.
**Action:** Created the journal to track critical documentation learnings.

## 2024-05-24 - Checksum Algorithm Documentation Gaps
**Learning:** The 'xor_add' checksum algorithm implies a simple combination of XOR and ADD checksums, but the implementation actually adds the XOR result to the arithmetic sum. Similarly, 'samsung_rx' has a conditional magic byte modification.
**Action:** Explicitly document the mathematical operations for custom/complex algorithms in config-schema docs to aid debugging and 3rd party implementation.

## 2024-05-24 - Troubleshooting Guide Necessity
**Learning:** Users often encounter environment-specific setup hurdles (Docker permissions, MQTT auth) that are not code bugs but significantly hinder adoption.
**Action:** Always include a dedicated 'Troubleshooting' section in the main README covering common environmental and configuration pitfalls.

## 2024-05-24 - Implicit Automation Priority Defaults
**Learning:** The configuration loader implicitly overrides `low_priority` to `true` for any automation containing a `schedule` trigger, which is not obvious from the schema alone.
**Action:** When documenting configuration schemas, always verify if the loader logic modifies default values based on other properties (conditional defaults).

## 2024-05-25 - CEL List Operations Gap
**Learning:** Users cannot implement basic custom checksums (like simple Sum or XOR of all bytes) for variable-length packets using CEL because loops are prohibited and no aggregate helper functions (e.g., `sum(list)`, `xor_sum(list)`) exist.
**Action:** Consider implementing high-performance aggregate helper functions in `CelExecutor` to enable variable-length packet processing without violating the "no loops" sandbox principle.

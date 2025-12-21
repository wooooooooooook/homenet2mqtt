# Scribe's Journal

## 2024-05-24 - Initial Journal Creation
**Learning:** The journal file was missing.
**Action:** Created the journal to track critical documentation learnings.

## 2025-12-21 - Automation Guard Context Mismatch
**Learning:** Documented behavior of CEL Guard variables (`state`, `data`) in `docs/AUTOMATION.md` contradicted the implementation in `AutomationManager.ts`. The code passes context nested in a `trigger` property, but `CelExecutor` expects them at the root, making them inaccessible.
**Action:** Updated documentation to reflect reality (use `states`). Future refactoring should align `AutomationManager` context building with `CelExecutor` expectations if these variables are intended to be supported.

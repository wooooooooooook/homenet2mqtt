## 2025-02-18 - RCE via YAML !lambda tags
**Vulnerability:** The application uses `js-yaml` with a custom `!lambda` type that executes code via Node.js `vm` module. The `/api/config/update` endpoint allows unauthenticated users to update the configuration with arbitrary YAML, leading to Remote Code Execution (RCE).
**Learning:** `vm.createContext` is not a security boundary. Allowing arbitrary code execution in configuration files that can be updated via API is inherently risky.
**Prevention:** Do not allow code execution from configuration files updated via API. Use `isolated-vm` for sandboxing if necessary, or restrict the `update` endpoint to authenticated users only.

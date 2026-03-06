Always respond in Korean.

Monorepo (pnpm).

core: RS485 → MQTT
service: API + serves built UI
simulator: debugging-only RS485 endpoint
ui: Svelte (built and served by service)

TypeScript (ESM, 2-space).
No hardcoded config.
Inject typed options.
Test with Vitest.
After modifying code, run `pnpm format` to format all packages.

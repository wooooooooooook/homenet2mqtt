# Repository Guidelines

Always respond with 한국어

## Project Structure & Module Organization
Monorepo lives under `packages/` with four workspaces: `core` (RS485⇢MQTT bridge logic), `service` (Express API and UI proxy), `simulator` (virtual RS485 PTY), and `ui` (Svelte SPA). Shared configs (`tsconfig.base.json`, `vitest.config.ts`, `pnpm-workspace.yaml`) sit at the root, while Docker assets live in `deploy/docker/`. Source and colocated tests stay inside each package (`src/`, `test/`, or `src/__tests__/`). Keep env artifacts like `.env` or `options.json` out of version control.

## Build, Test, and Development Commands
Use `pnpm` from the repo root. `pnpm core:dev`, `pnpm service:dev`, and `pnpm ui:dev` start package-specific watch modes. `pnpm build` compiles all workspaces (TypeScript → `dist/`, Vite bundle for UI). `pnpm lint` runs `tsc --noEmit` plus `svelte-check`. Run `pnpm test` for the Vitest suite or filter packages via `pnpm --filter @rs485-homenet/core test`.

## Coding Style & Naming Conventions
Code uses ES modules, TypeScript, and 2-space indentation. Prefer `const`, arrow callbacks, and single quotes; mirror the style in `packages/core/src/index.ts`. Name files after their primary export (`homeNetBridge.test.ts`, `server.ts`), Svelte components use PascalCase `.svelte`, helpers use camelCase. Export factories/classes instead of singletons to simplify testing. Keep configuration in code via typed options, never hardcode MQTT topics or credentials.

## Testing Guidelines
Vitest is the default harness. Follow `packages/core/test/homeNetBridge.test.ts` by mocking serial/MQTT layers and asserting MQTT payloads. Place tests under `test/` or `src/__tests__/`. Simulator tests should emit fake RS485 frames; UI tests can adopt `@testing-library/svelte` once behavior stabilizes. Run `pnpm test` before PRs, ensure new logic has deterministic coverage, and annotate skipped tests with TODOs referencing an issue.

## Commit & Pull Request Guidelines
Write imperative, sentence-style commits (“Add RS485 PTY simulator package”). Scope changes narrowly and keep workspaces synchronized. PRs must describe purpose, key changes, and reproduction steps (commands plus env vars). Include screenshots for UI adjustments, link related issues or Home Assistant tickets, note schema/env changes, and flag simulator-only shortcuts.

## Security & Configuration Tips
Load runtime settings from `.env` keys such as `SERIAL_PORT`, `BAUD_RATE`, and `MQTT_*`. Thread options through constructors and document defaults in README updates. Guard serial features against blocking I/O: use timeouts, validate RS485 payload lengths, and avoid publishing malformed frames to `homeassistant/*` topics.

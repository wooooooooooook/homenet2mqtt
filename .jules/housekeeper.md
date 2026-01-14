## 2025-05-23 - Missing Linter for Unused Imports
**Observation:** The `pnpm lint` command runs `tsc --noEmit`, which doesn't flag unused imports because `noUnusedLocals` is disabled in `tsconfig.json`. There is no ESLint configuration.
**Action:** Relied on manual inspection. Future upkeep should verify if `noUnusedLocals` can be safely enabled or if ESLint should be introduced.

## 2025-05-23 - Broken Build in Simulator
**Observation:** `packages/simulator` failed to build because `src/packets_from_userdata.ts` was in `.gitignore` but imported by `src/index.ts`. This meant fresh clones could not build the project.
**Action:** Removed the file from `.gitignore` and added it with an empty export to ensure the project builds out of the box.

## 2025-05-23 - Broken Test Script in Simulator
**Observation:** `packages/simulator/package.json` contains a test script pointing to `packages/simulator/test/simulator.test.ts`, which does not exist.
**Action:** None taken. Future upkeep should add tests or update the script.

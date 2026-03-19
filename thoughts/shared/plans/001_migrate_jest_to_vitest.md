# Migrate Jest to Vitest — Implementation Plan

## Overview
Replace Jest with Vitest as the test runner. The project's ESM-first setup creates friction with Jest (requiring `--experimental-vm-modules`, `jest.unstable_mockModule`, `ts-jest`). Vitest has native ESM and TypeScript support, eliminating these workarounds.

## Current State Analysis
- **Jest 30.3.0** with **ts-jest 29.4.6** for TypeScript transformation
- ESM mode via `--experimental-vm-modules` flag
- 3 test files in `src/test/`: `backport.test.ts`, `git.test.ts`, `utils.test.ts`
- `git.test.ts` uses `jest.unstable_mockModule` + dynamic `await import()` for ESM-compatible mocking
- `backport.test.ts` and `utils.test.ts` use no mocking (pure function tests)
- `tsconfig.test.json` references jest types and jest config
- `jest.config.ts` has ESM workarounds: `extensionsToTreatAsEsm`, `moduleNameMapper` for `.js` extensions
- CI runs `npm run test-verbose`

## Desired End State
- Vitest replaces Jest entirely — all tests pass with `npm test`
- No `--experimental-vm-modules`, no `ts-jest`, no `.js` extension mapping
- `git.test.ts` uses `vi.mock()` (stable, ESM-native) instead of `jest.unstable_mockModule`
- CI unchanged except it now runs Vitest under the hood
- All existing test behavior preserved

## What We're NOT Doing
- Adding new tests or improving coverage
- Changing test structure or assertions beyond what's needed for the migration
- Adding coverage thresholds or reporting
- Changing CI workflow structure

## Implementation Approach
Single phase — the migration is small enough to do atomically. Replace config, update imports/mocking, verify tests pass.

## Phase 1: Migrate to Vitest

### Overview
Remove Jest dependencies and config, install Vitest, update test files to use Vitest APIs, verify everything passes.

### Changes Required:

#### 1. Install Vitest, remove Jest packages
**Action**: Update `package.json` devDependencies

Remove:
- `jest` (30.3.0)
- `ts-jest` (29.4.6)
- `@types/jest` (30.0.0)

Add:
- `vitest` (latest)
- `@types/node` (latest) — was a transitive dependency of `@types/jest`/`ts-jest`, now needs to be explicit

#### 2. Replace Jest config with Vitest config
**File**: Delete `jest.config.ts`
**File**: Create `vitest.config.ts`

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    root: "src",
    clearMocks: true,
  },
});
```

Notes:
- No `extensionsToTreatAsEsm` needed — Vitest handles ESM natively
- No `moduleNameMapper` for `.js` extensions — Vitest resolves `.ts` from `.js` imports
- No `transform` config — Vitest uses esbuild for TypeScript out of the box
- `root: "src"` mirrors Jest's `roots: ["<rootDir>/src"]`

#### 3. Update `tsconfig.test.json`
**File**: `tsconfig.test.json`

Remove `"jest"` from `compilerOptions.types` (keep `"node"`).
Remove `"jest.config.ts"` from `include`.

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "./lib/jest",
    "types": ["node"]
  },
  "include": ["src/**/*.test.ts", "src/**/*.d.ts"]
}
```

#### 4. Update `tsconfig.json`
**File**: `tsconfig.json`

Add `"vitest.config.ts"` to `exclude` (replace `"jest.config.ts"`).

#### 5. Update npm scripts
**File**: `package.json`

```json
"test": "vitest run --reporter=dot --silent",
"test-verbose": "vitest run",
```

Notes:
- No `NODE_OPTIONS='--experimental-vm-modules'` needed
- `vitest run` runs once (not watch mode), matching current behavior
- `--reporter=dot` gives minimal test result output, but unlike Jest's `--silent` it does not suppress console output from tests — `--silent` is needed to match Jest's behavior of suppressing stdout/stderr

#### 6. Update `src/test/backport.test.ts`
**File**: `src/test/backport.test.ts`

Minimal change — this file uses no Jest-specific imports (relies on globals). Vitest's globals are compatible. No changes needed unless explicit Jest imports exist.

Current file has no explicit jest imports — uses global `describe`, `it`, `expect`. **Vitest provides these as globals too, but we need to either enable globals in config or add explicit imports.**

Decision: Add explicit imports from `vitest` (matches the pattern in `git.test.ts` which explicitly imports from `@jest/globals`). This avoids needing `globals: true` config.

```typescript
import { describe, it, expect } from "vitest";
```

Add as first line (file currently has no vitest/jest import).

#### 7. Update `src/test/git.test.ts`
**File**: `src/test/git.test.ts`

This is the main migration effort — converts ESM mocking from Jest to Vitest.

**Before:**
```typescript
import { jest, describe, it, expect } from "@jest/globals";

let response = { exitCode: 0, stdout: "" };
let responseCommit = { exitCode: 0, stdout: "" };

jest.unstable_mockModule("@actions/exec", () => ({
  getExecOutput: jest.fn(
    (command: string, args?: readonly string[] | undefined) => {
      if (command === "git" && args) {
        const subCommand = args[0];
        if (subCommand === "commit") {
          return responseCommit;
        }
      }
      return response;
    },
  ),
}));

const { Git, GitRefNotFoundError } = await import("../git.js");
```

**After:**
```typescript
import { describe, it, expect, vi } from "vitest";

let response = { exitCode: 0, stdout: "" };
let responseCommit = { exitCode: 0, stdout: "" };

vi.mock("@actions/exec", () => ({
  getExecOutput: vi.fn(
    (command: string, args?: readonly string[] | undefined) => {
      if (command === "git" && args) {
        const subCommand = args[0];
        if (subCommand === "commit") {
          return responseCommit;
        }
      }
      return response;
    },
  ),
}));

const { Git, GitRefNotFoundError } = await import("../git.js");
```

Key changes:
- `@jest/globals` → `vitest`
- `jest.unstable_mockModule` → `vi.mock` (Vitest's `vi.mock` is hoisted and works natively with ESM)
- `jest.fn` → `vi.fn`
- The dynamic `await import()` pattern is kept — it works with Vitest and ensures the mock is applied before the module loads

#### 8. Update `src/test/utils.test.ts`
**File**: `src/test/utils.test.ts`

Add explicit import (file currently uses globals):

```typescript
import { describe, it, expect } from "vitest";
```

No other changes — no mocking used.

### Success Criteria:

#### Automated Verification:
- [ ] `npm test` passes (all 3 test files, same test count)
- [ ] `npm run test-verbose` passes
- [ ] `npm run build` passes (TypeScript compilation)
- [ ] `npm run format-check` passes
- [ ] `npm run package` passes
- [ ] No jest-related packages in `node_modules` after clean install

#### Manual Verification:
- [ ] `npm run test-verbose` shows same test names and counts as before
- [ ] No `--experimental-vm-modules` warnings in output

## Testing Strategy
This is a test infrastructure migration — the tests themselves ARE the verification. If all existing tests pass with the same assertions, the migration is correct.

## Risk Assessment
- **Low risk**: `backport.test.ts` and `utils.test.ts` are pure function tests with no mocking — just import changes
- **Medium risk**: `git.test.ts` mocking pattern — `vi.mock` hoisting behaves differently than `jest.unstable_mockModule`. The mutable `response`/`responseCommit` pattern with module-level references should still work because `vi.mock` factory runs at module scope, and the mock function captures the mutable references. If hoisting causes issues, the fallback is `vi.hoisted()` to declare the response objects before the mock.

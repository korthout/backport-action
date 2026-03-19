---
date: 2026-03-19T00:00:00Z
researcher: Claude
topic: "Testing Infrastructure, Coverage, and Gaps"
tags: [research, codebase, testing, jest, coverage]
status: complete
---

# Research: Testing Infrastructure, Coverage, and Gaps

## Research Question
Investigate the way the codebase is tested, including coverage and gaps, the test framework used, and how it's set up and configured.

## Summary
The project uses **Jest 30.3.0** with **ts-jest** for TypeScript transformation, running in ESM mode via `--experimental-vm-modules`. There are **3 unit test files** covering 3 of 5 source modules. The biggest gaps are: the `Backport.run()` orchestration method (530+ lines, zero tests), the entire `Github` class (17 public methods), and `main.ts` (input validation). No coverage thresholds are enforced, no integration/e2e tests exist, and CI runs tests in a single sequential job without coverage reporting.

## Detailed Findings

### Test Framework & Configuration

| Aspect | Value |
|---|---|
| Test runner | Jest 30.3.0 |
| TypeScript integration | ts-jest 29.4.6 |
| TypeScript version | 5.9.3 |
| Module system | ESM (`"type": "module"` in package.json) |
| Node.js version | >=24.0.0 <25 |
| Test environment | `node` |
| Coverage thresholds | None configured |
| Linting | None (Prettier only for formatting) |

**Key config files:**
- `jest.config.ts` — Jest configuration (ESM, ts-jest, moduleNameMapper for `.js` extensions, coverage directory set but unused)
- `tsconfig.test.json` — Extends main tsconfig, adds `jest` and `node` types, includes test files
- `package.json` — Test scripts with `--experimental-vm-modules`

**NPM scripts:**
- `test`: `NODE_OPTIONS='--experimental-vm-modules' jest --silent`
- `test-verbose`: `NODE_OPTIONS='--experimental-vm-modules' jest` (used in CI)

**ESM mocking:** Uses `jest.unstable_mockModule` (ESM-compatible) + dynamic `await import()` pattern since standard `jest.mock` doesn't work with ESM imports.

### Test Files Overview

All tests are in `src/test/` — unit tests only, no integration or e2e tests.

#### 1. `src/test/backport.test.ts` — Tests `findTargetBranches()`
- **No mocking** — pure function tests
- 13 test cases across 2 describe blocks
- Covers: empty labels, no regex match, no capture group, headref exclusion, deduplication, target_branches config
- Does NOT test `Backport` class or its `run()` method

#### 2. `src/test/git.test.ts` — Tests `Git` class and `GitRefNotFoundError`
- **Mocks `@actions/exec`** via `jest.unstable_mockModule`
- Uses mutable module-level `response`/`responseCommit` objects (no beforeEach reset)
- Tests: `git.fetch()` (error cases), `git.cherryPick()` (both conflict resolution modes), `git.findMergeCommits()`
- Does NOT test: `push()`, `checkout()`, `remoteAdd()`, `findCommitsInRange()`, `fetch()` success path

#### 3. `src/test/utils.test.ts` — Tests `getMentionedIssueRefs()` and `replacePlaceholders()`
- **No mocking** — pure function tests
- ~37 test cases — most thorough test file
- Covers issue ref extraction (local, cross-repo, URL formats) and template placeholder replacement
- Minor gaps: `${pull_description}` placeholder and null body edge case

### Test Patterns
- Two-level `describe` nesting: function name → expected outcome category → individual conditions
- No `beforeEach`/`afterEach` hooks used anywhere
- No shared test fixtures, factories, or custom matchers
- Each test file is self-contained
- `utils.test.ts` has a local `text()` helper for building multi-line test strings

### CI Pipeline (`ci.yml`)
- **Trigger:** PRs only (opened, synchronize, reopened)
- **Single job:** build → format-check → build → package → test-verbose
- **No coverage reporting, no parallel jobs, no matrix builds**
- Push to main triggers `publish.yml` (artifact publishing) but NOT re-running tests
- `release.yml` does NOT run tests — relies on CI having passed

### Coverage Gaps (Severity-Ranked)

#### Critical — Core logic entirely untested
1. **`Backport.run()`** (`backport.ts:94`) — The main orchestration method, 530+ lines. Covers: PR merge status, commit SHA resolution per merge strategy, merge commit handling, label copying, downstream repo support, the full backport loop (fetch/checkout/cherry-pick/push/create-PR), error handling and recovery, PR-already-exists detection, post-creation operations (milestone, assignees, reviewers, labels, auto-merge), and success/failure comment posting.
2. **`Github` class** (`github.ts`) — All 17 public methods untested, including: `mergeStrategy()` with complex branching, `getCommits()` with pagination, `enableAutoMerge()` with GraphQL mutation, and merge detection methods (`isMergeCommit`, `isRebased`, `isSquashed`).

#### Moderate — Individual functions untested
3. **`Git.remoteAdd()`** (`git.ts:72`)
4. **`Git.findCommitsInRange()`** (`git.ts:90`)
5. **`Git.push()`** (`git.ts:132`)
6. **`Git.checkout()`** (`git.ts:141`)
7. **`Backport.getAutoMergeErrorMessage()`** — 8 conditional branches
8. **All `Backport.composeMessage*()` methods** — 8+ message formatting methods
9. **`Backport.createOutput()`** — output generation

#### Minor
10. **`main.ts`** — Input validation and config assembly (untested but straightforward)
11. **`replacePlaceholders()` with `${pull_description}`** — missing placeholder test
12. **`git.fetch()` success path** — only error paths tested
13. **`git.cherryPick()` multi-commit partial failure** — while loop with intermediate success not tested

### Source Files vs Test Coverage

| Source File | Test File | Coverage |
|---|---|---|
| `src/main.ts` | None | **No tests** |
| `src/backport.ts` | `backport.test.ts` | **Minimal** — only `findTargetBranches()` tested, `Backport` class untested |
| `src/git.ts` | `git.test.ts` | **Partial** — 3 of 7 methods tested |
| `src/github.ts` | None | **No tests** |
| `src/utils.ts` | `utils.test.ts` | **Good** — both exports well-tested |

## Architecture Insights

1. **ESM-first approach** creates friction with Jest — requires `--experimental-vm-modules`, `jest.unstable_mockModule`, and `.js` extension mapping. This is a known pain point in the ecosystem.
2. **Testing strategy favors pure functions** — the well-tested code (`findTargetBranches`, `getMentionedIssueRefs`, `replacePlaceholders`) is all stateless. The harder-to-test orchestration and API interaction code has no coverage.
3. **`GithubApi` interface** in `github.ts` suggests the `Backport` class was designed to be testable via dependency injection, but no tests use this.
4. **No coverage enforcement** — `coverageDirectory` is configured but `collectCoverage` is not enabled and no thresholds are set. Coverage is never collected in CI.
5. **Single CI job** means a formatting issue blocks test results — could be parallelized for faster feedback.

## Open Questions
1. Has coverage ever been measured? (No coverage reports in git history to check)
2. Is the lack of `Backport.run()` tests a conscious decision due to complexity, or a gap to be addressed?
3. Should `github.ts` be tested with mocked Octokit, or is it intentionally left as an integration boundary?
4. Is the `jest.unstable_mockModule` API stable enough in Jest 30.3.0 to rely on, or should the mock pattern be reconsidered?

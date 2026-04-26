# CLAUDE.md

GitHub Action that backports merged PRs to other branches.

## Product values

Preserve when making changes:
- **Fast** — the action runs quickly for end users
- **No inputs required** — sensible defaults; drop-in usable
- **Flexible & configurable** — handles different trigger events and contexts; configurable to fit different use cases
- **Clear** — the action communicates what it did (and what it tried)

## Don't break user space

Any behavioral change a user didn't explicitly configure is forbidden. This includes action `inputs`/`outputs`, the workflow events the action runs on, and assumptions about the environment (e.g. the checked-out git repository).

## Maintainability

This action has many users; maintainer burden compounds. When facing tradeoffs, prefer obvious code over clever abstractions, fewer dependencies over more, and changes that don't complicate the release flow. Existing style isn't sacred — when touching code, diverge from the surrounding pattern when it improves maintainability.

## Code

- Modern, idiomatic TypeScript
- Two external boundaries: `GithubApi` (`src/github.ts`) and `GitApi` (`src/git.ts`) — see TESTING.md
- `package-lock.json` is authoritative. Don't run `npm install` to "fix" things — investigate the root cause

## Working in this repo

- Run `npm run all` before declaring a change done (format + build + package + test)
- Tests: `npm test` (or `npm run test-verbose` for individual names)
- **Never commit `dist/` in a PR** — the Publish workflow rebuilds it post-merge; including it breaks backporting (see CI.md)
- Merging goes through the Mergify queue (`@mergifyio queue`) — don't merge or push to `main` directly

## Pointers

- [CONTRIBUTING.md](CONTRIBUTING.md) — build, package, release flow
- [TESTING.md](TESTING.md) — test architecture, where to add tests, E2E
- [CI.md](CI.md) — CI workflows, the `dist/` rule, Publish concurrency

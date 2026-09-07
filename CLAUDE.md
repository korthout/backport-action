# CLAUDE.md

GitHub Action that backports merged PRs to other branches.

## Product values

Preserve when making changes:
- **Fast** — the action runs quickly for end users
- **No inputs required** — sensible defaults; drop-in usable
- **Flexible & configurable** — handles different trigger events and contexts; configurable to fit different use cases
- **Clear** — the action communicates what it did (and what it tried)

## Don't break user space

Action `inputs`/`outputs`, the workflow events the action runs on, and assumptions about the environment (e.g. the checked-out git repository) break only in a major version.

Behavior may also break in a minor or patch, but only when the old behavior was **unusable** (the run failed or the operation did not complete), **unstable** (nondeterministic), or **unobservable**. Otherwise it is breaking however wrong the old behavior was — "nobody could legitimately depend on that" is not the test; a user who worked around the bug is a real dependent.

Majors are allowed (v0–v4) and are the normal way to ship a breaking change. Prefer one over a config option, which costs two code paths and docs forever; add an option only when both behaviors have a real constituency (e.g. `cherry_picking_merge_mode`).

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
- Input docs live in two places: `README.md` (under `## Inputs`) and `action.yml` (`description:` field). Keep them in sync — any change to one must be mirrored in the other.

## Pointers

- [CONTRIBUTING.md](CONTRIBUTING.md) — build, package, release flow
- [TESTING.md](TESTING.md) — test architecture, where to add tests, E2E
- [CI.md](CI.md) — CI workflows, the `dist/` rule, Publish concurrency

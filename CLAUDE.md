# CLAUDE.md

GitHub Action that backports merged PRs to other branches.

## Product values

Preserve when making changes:
- **Fast** — the action runs quickly for end users, also on very large repositories: fetch only what's needed, and weigh every extra GitHub API call
- **No inputs required** — sensible defaults; drop-in usable without any inputs. Inputs add flexibility: a new input defaults to the existing behavior, and a major release may change its default, so defaults converge on what fits most users
- **Flexible & configurable** — handles different trigger events and contexts; configurable to fit different use cases
- **Clear** — the action communicates what it did (and what it tried)

## Don't break user space

Any behavioral change a user didn't explicitly configure is forbidden. This includes action `inputs`/`outputs`, the workflow events the action runs on, and assumptions about the environment (e.g. the checked-out git repository).

## Do one thing well

The action backports merged pull requests. A request fits when it's part of that job run and can't reasonably be done by other means. See [ADR-0003](docs/adr/0003-scope-and-safety.md).

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
- Inputs are sorted alphanumerically in both places. README examples show the default value. Docs say "pull request", not "PR".
- An input's name states exactly what it does and aligns with its siblings (e.g. `copy_requested_reviewers`, `add_labels`, `auto_merge_enabled`)

## Reviewing contributions

- Agree on the design in the issue before a pull request is written
- The maintainer may take over a contribution to ship it sooner, instead of running another review round. Always credit the contributor in the release notes.
- Pre-existing bugs found in review get their own issue; don't fold them into an unrelated pull request

## Pointers

- [CONTRIBUTING.md](CONTRIBUTING.md) — build, package, release flow
- [TESTING.md](TESTING.md) — test architecture, where to add tests, E2E
- [CONTEXT.md](CONTEXT.md) — domain language; use its terms and respect its _Avoid_ lists
- [docs/adr/](docs/adr/README.md) — product decisions: compatibility and releases, when to add an input, scope and safety, reporting and failure
- [CI.md](CI.md) — CI workflows, the `dist/` rule, Publish concurrency

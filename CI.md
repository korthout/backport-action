# CI Design

## Workflows

- **CI** (`ci.yml`) validates PRs and merge queue entries (format-check, build, package, test).
- **Publish** (`publish.yml`) commits built `dist/` artifacts after merges to `main` and `release-*` branches.
- **Release** (`release.yml`) stamps versions and creates tags (manual trigger). Does not build `dist/` itself -- Publish handles that when Release pushes to `main` or `release-*`.
- **Backport** (`backport.yml`) cherry-picks merged PRs to release branches via the backport-action itself.

## Why dist/ is committed post-merge, not in PRs

Backporting cherry-picks PR commits to release branches.
Since `dist/` differs across branches, including `dist/` in PRs causes merge conflicts during backporting.
The Publish workflow builds and commits `dist/` separately after each merge, avoiding this.

It is fine to temporarily include `dist/` in a PR branch for E2E testing (via [backport-action-test](https://github.com/korthout/backport-action-test)) or manual testing, but `dist/` changes should be removed before merging to support backporting the PR.

## Publish concurrency

When multiple PRs merge via the merge queue in quick succession, overlapping Publish runs can race.
The `cancel-in-progress` concurrency group ensures only the latest run completes.
If a stale run's push fails (non-fast-forward because `main` moved), it is harmless -- the latest run handles it.

## Merge queue and Publish interaction

Each Publish commit to `main` can invalidate the next queued PR's merge group, causing a re-test.
With merge queue batching (`max_entries_to_merge > 1`), multiple PRs merge in one ref update, triggering only one Publish run and avoiding this invalidation cascade.

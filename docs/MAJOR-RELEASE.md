# Major releases

Many workflows pin this action by its major tag, so only a major release may break the contract. Some changes can't avoid that: fixing a bug that users may depend on, changing a default to what fits most users, or moving to a newer Node runtime. See [ADR-0001](adr/0001-compatibility-and-releases.md) for details when to cut a major release.

Those breaking pull requests are held until the next major, where they can conflict with each other while they wait. Meanwhile, users of the current major still need fixes. Releasing a major is about coordinating both: let the breaking changes merge together on `main`, while the current major keeps getting fixes.

## Branches

While the next major is in development, two branches each develop one major:

```
main          → vN+1 (next major: breaking changes merge here)
release-vN    → vN   (current major: fixes reach it by backport)
```

The repository uses its own action to keep them in sync. A pull request merged to `main` with the label `backport release-vN` is backported to `release-vN`. See [CONTRIBUTING.md](../CONTRIBUTING.md#branches-and-backports).

## Starting the next major

**Start once you know what the next major will contain.** Until then, breaking pull requests stay open.

**Consider a last vN release first.** Releases are done manually, so `main` may hold unreleased changes that vN users would want. A patch can also be released from `release-vN` later.

**Then split the branches:**
1. Cut `release-vN` from `main`. The `release-branches` ruleset requires a passing `build` check that a freshly cut branch doesn't have, so a maintainer pushes it with a temporary bypass.
2. Create the label `backport release-vN`.
3. Bump `main` to `N+1.0.0-SNAPSHOT`, only after `release-vN` exists. Otherwise the branch would be cut from a commit that already claims the next major.
4. Add a notice to the top of the README on `main`. Most users read the default branch, and from now on it describes behavior they don't have yet. The notice links to the `release-vN` README, and doesn't get backported.

**Now the held breaking pull requests can merge.** Merge them one at a time, and write each one's migration note right away. That's easier than reconstructing them at release time.

## Releasing the next major

**Point the docs at the new major.** Remove the README notice, and update the `@vN` references in the README examples to `@vN+1`, as the v4 release did.

**Release from `main`,** with the Release workflow at `N+1.0.0`. It creates the `vN+1` tag, and `vN` stays on its latest release, so users move over when they choose.

**Lead the release notes with what users need to change.** Collect the migration notes from the breaking pull requests.

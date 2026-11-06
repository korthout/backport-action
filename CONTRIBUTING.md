# Contributing to backport action

I welcome contributions for feature requests and bug reports, as well as for docs and code changes.

## Feature requests and bug reports

If you would want to see something added or changed, or encountered a bug.
Please open an [issue on GitHub](https://github.com/korthout/backport-action/issues).

## Docs changes

Saw a typo or want to make other changes to the [README](https://korthout.github.io/backport-action/blob/main/README.md)?
Feel free to open a pull request with your changes.

## Code changes

I welcome code changes.
If you're thinking of opening a large pull request, please consider opening an issue on GitHub first to discuss it.

### Build from source

Install the dependencies.

```
npm install
```

Apply the automatic formatting to the source code.

```
npm run format
```

Build and package the action for distribution.

```
npm run build && npm run package
```

### Testing

Run all tests.

```
npm test
```

Run all tests with verbose reporter output (individual test names).

```
npm run test-verbose
```

For guidance on writing tests — where to add them, which helpers to use, and testing conventions — see [TESTING.md](docs/TESTING.md).

Shorthand for format, build, package and test.

```
npm run all
```

This action can also be tested end-to-end using [korthout/backport-action-test](https://github.com/korthout/backport-action-test).

### CI Design

For details on why `dist/` is not committed in PRs and how the CI workflows interact, see [CI.md](docs/CI.md).

### Merging

This repository uses [Mergify](https://mergify.com) to manage a merge queue.
PRs are merged through the queue to ensure they are tested against the latest `main` branch before merging.

To add a PR to the merge queue, comment `@mergifyio queue` on the PR.
Renovate patch updates are automatically queued when CI passes.

PRs should not include changes to `dist/` — it is rebuilt automatically after merge by the Publish workflow.
It's fine to temporarily commit `dist/` for testing purposes, but those changes should be removed before merging.
See [CI.md](docs/CI.md) for details.

### Branches and backports

Once `release-vN` has been cut, `main` develops the next major (today `main` develops v5, and `release-v4` is the current major).

- A change that should also ship in the current major (fixes, non-breaking additions, dependency and security updates) gets the `backport release-vN` label, e.g. `backport release-v4`. When the pull request is merged to `main`, this action backports it to `release-vN`.
- A breaking change gets the `breaking` label and merges to `main` without a `backport` label, so it ships with the next major. See [ADR-0001](docs/adr/0001-compatibility-and-releases.md).

### Releases

The distribution is hosted in this repository under `dist`.
Simply build and package the distribution and commit the changes to publish a new snapshot version.

To release a version, run the [Release](https://github.com/korthout/backport-action/actions/workflows/release.yml) workflow from the branch that should be released. Releases of the current major run from `release-vN`, releases of the next major from `main`.
This sets the release version and tags the release commit.
It also creates/moves the major and minor tags (e.g. `v1` and `v1.2`) to the latest corresponding release as [officially recommended](https://github.com/actions/toolkit/blob/master/docs/action-versioning.md).

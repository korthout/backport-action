# Backport action

> This project is still in an early development stage

This is a GitHub action to backport merged pull requests (PR) onto branches.
For example, to patch an older version with changes that you're merging into your main branch, without the manual labor of cherry-picking the individual commits.

A backport consists of creating a new branch, cherry-picking the changes of the original PR and creating a new PR to merge them.

This backport action is able to deal with so called `octopus` merges (i.e. merges of multiple branches with a single commit).
Therefore, this action is compatible with [Bors](https://bors.tech/) and similar tools.

## Usage

Simply mark a PR with backport labels: `backport <branchname>`.

For example, a PR with labels

```
backport stable/0.24
backport release-0.23
```

will be backported to branches `stable/0.24` and `release-0.23` when merged.

If something goes wrong, the bot will comment on your PR.
It will also comment after successfully backporting.
Links are created between the original and the new PRs.

It's also possible to configure the bot to trigger a backport using a comment on a PR.

## Installation

Add the following workflow configuration to your repository's `.github/workflows` folder.

```yaml
name: Backport labeled merged pull requests
on:
  pull_request:
    types: [closed]
jobs:
  build:
    name: Create backport PRs
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
        with:
          # required to find all branches
          fetch-depth: 0
      - name: Create backport PRs
        uses: zeebe-io/backport-action@master
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          github_workspace: ${{ github.workspace }}
          version: master
```

> `version:` must refer to the same version as the `uses`.
> We recommend using `master` or the latest tag.

### Trigger using a comment
The backport action can also be triggered by writing a comment containing `/backport` on a merged pull request.
To enable this, add the following workflow configuration to your repository's `.github/workflows` folder.

```yaml
name: Backport labeled merged pull requests
on:
  pull_request:
    types: [ closed ]
  issue_comment:
    types: [ created ]
jobs:
  build:
    name: Create backport PRs
    if: ${{ github.event_name == 'pull_request' || (github.event_name == 'issue_comment' && github.event.issue.pull_request && contains(github.event.comment.body, '/backport')) }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
        with:
          # required to find all branches
          fetch-depth: 0
      - name: Create backport PRs
        uses: zeebe-io/backport-action@master
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          github_workspace: ${{ github.workspace }}
          version: master
```

> `version:` must refer to the same version as the `uses`.
> We recommend using `master` or the latest tag.

## Local compilation

Install the dependencies  
```bash
npm install
```

Build the typescript and package it for distribution
```bash
npm run format && npm run build && npm run package
```

## Testing

Tests are located in both src (unit tests) and in [test](test) (integration-style tests).

Run all tests
```bash
npm test
```

Run all tests with additional console output
```bash
npm run test-verbose
```

## Releases

The distribution is hosted in this repository under `dist`.
Simply build and package the distribution and commit the changes to release a new version.

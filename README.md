# Backport action

> This project is still in a very early development stage

This is a GitHub action to backport a pull request (PR) after merging it onto branches that are specified using labels.

For example, a PR with labels

```
backport stable/0.24
backport release-0.23
```

will be backported on branches `stable/0.24` and `release-0.23`.

A backport consists of creating a branch with the changes of the original PR and creating a new PR to merge them.

If something goes wrong, the bot will comment on your PR.
It will also comment after successfully backporting.
Links are created between the original and the new PRs.

## Usage

Add the following workflow configuration to your repository's `.github/workflows` folder.

```yaml
name: Backport labeled PRs after merge
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

> `version:` must refer to the same version as the `uses`

## Code in Main

Install the dependencies  
```bash
npm install
```

Build the typescript and package it for distribution
```bash
npm run format && npm run build && npm run package
```

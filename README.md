# Backport action

This is a GitHub action to backport merged pull requests (PR) to branches.
For example, to patch an older version with changes that you're merging into your main branch, without the manual labor of cherry-picking the individual commits.

A backport consists of creating a new branch, cherry-picking the changes of the original PR and creating a new PR to merge them.

This backport action is able to deal with so called `octopus` merges (i.e. merges of multiple branches with a single commit).
Therefore, this action is compatible with [Bors](https://bors.tech/) and similar tools.

> **Note**
> Version `1.0.0` (i.e. `v1`) will be released soon.
> You can already try it out using the latest pre-release `v1-rc1`.
> After the `v1` release, [SemVer](https://semver.org/) will be respected.
> The repo will also move from [zeebe-io/backport-action](https://github.com/zeebe-io/backport-action) to [korthout/backport-action](https://github.com/korthout/backport-action).
> You can read more about it [here](https://github.com/zeebe-io/backport-action/issues/289).

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
    permissions:
      contents: write # so it can comment
      pull-requests: write # so it can create pull requests
    # Don't run on closed unmerged pull requests
    if: github.event.pull_request.merged
    steps:
      - uses: actions/checkout@v3
      - name: Create backport PRs
        uses: zeebe-io/backport-action@v1-rc1
        with:
          # Optional
          # Token to authenticate requests to GitHub
          # github_token: ${{ secrets.GITHUB_TOKEN }}

          # Optional
          # Working directory for the backport action
          # github_workspace: ${{ github.workspace }}

          # Optional
          # Regex pattern to match github labels
          # Must contain a capture group for the target branch
          # label_pattern: ^backport ([^ ]+)$

          # Optional
          # Template used as description in the pull requests created by this action.
          # Placeholders can be used to define variable values.
          # These are indicated by a dollar sign and curly braces (`${placeholder}`).
          # Please refer to this action's README for all available placeholders.
          # pull_description: |-
          #   # Description
          #   Backport of #${pull_number} to `${target_branch}`.

          # Optional
          # Template used as the title in the pull requests created by this action.
          # Placeholders can be used to define variable values.
          # These are indicated by a dollar sign and curly braces (`${placeholder}`).
          # Please refer to this action's README for all available placeholders.
          # pull_title: "[Backport ${target_branch}] ${pull_title}"
```

### Trigger using a comment

You can also trigger the backport action by writing a comment containing `/backport` on a merged pull request.
To enable this, add the following workflow configuration to your repository's `.github/workflows` folder.

<details><summary>Trigger backport action using a comment</summary>
 <p>

```yaml
name: Backport labeled merged pull requests
on:
  pull_request:
    types: [closed]
  issue_comment:
    types: [created]
jobs:
  build:
    name: Create backport PRs
    runs-on: ubuntu-latest
    permissions:
      contents: write # so it can comment
      pull-requests: write # so it can create pull requests
    # Only run when pull request is merged
    # or when a comment containing `/backport` is created by someone other than the 
    # https://github.com/backport-action bot user (user id: 97796249). Note that if you use your
    # own PAT as `github_token`, that you should replace this id with yours.
    if: >
      (
        github.event_name == 'pull_request' &&
        github.event.pull_request.merged
      ) || (
        github.event_name == 'issue_comment' &&
        github.event.issue.pull_request &&
        github.event.comment.user.id != 97796249 &&
        contains(github.event.comment.body, '/backport')
      )
    steps:
      - uses: actions/checkout@v3
      - name: Create backport PRs
        uses: zeebe-io/backport-action@v1-rc1
        with:
          # Optional
          # Token to authenticate requests to GitHub
          # github_token: ${{ secrets.GITHUB_TOKEN }}

          # Optional
          # Working directory for the backport action
          # github_workspace: ${{ github.workspace }}

          # Optional
          # Regex pattern to match github labels
          # Must contain a capture group for the target branch
          # label_pattern: ^backport ([^ ]+)$

          # Optional
          # Template used as description in the pull requests created by this action.
          # Placeholders can be used to define variable values.
          # These are indicated by a dollar sign and curly braces (`${placeholder}`).
          # Please refer to this action's README for all available placeholders.
          # pull_description: |-
          #   # Description
          #   Backport of #${pull_number} to `${target_branch}`.

          # Optional
          # Template used as the title in the pull requests created by this action.
          # Placeholders can be used to define variable values.
          # These are indicated by a dollar sign and curly braces (`${placeholder}`).
          # Please refer to this action's README for all available placeholders.
          # pull_title: "[Backport ${target_branch}] ${pull_title}"
```

</p>
</details>

### Placeholders
In the `pull_description` and `pull_title` inputs placeholders can be used to define variable values.
These are indicated by a dollar sign and curly braces (`${placeholder}`).
The following placeholders are available and are replaced with:

Placeholder | Replaced with
------------|------------
`issue_refs` | GitHub issue references to all issues mentioned in the original pull request description seperated by a space, e.g. `#123 #456 zeebe-io/backport-action#789`
`pull_author` | The username of the original pull request's author, e.g. `korthout`
`pull_number` | The number of the original pull request that is backported, e.g. `123`
`pull_title` | The title of the original pull request that is backported, e.g. `fix: some error`
`target_branch`| The branchname to which the pull request is backported, e.g. `release-0.23`

## Local compilation

Install the dependencies

```
npm install
```

Build the typescript and package it for distribution

```
npm run format && npm run build && npm run package
```

## Testing

Run all tests

```
npm test
```

Run all tests with additional console output

```
npm run test-verbose
```

Shorthand for format, build, package and test

```
npm run all
```

## Releases

The distribution is hosted in this repository under `dist`.
Simply build and package the distribution and commit the changes to release a new version.
Release commits should also be tagged (e.g. `v1.2.3`) and the major release tag (e.g. `v1`) should be moved as [officially recommended](https://github.com/actions/toolkit/blob/master/docs/action-versioning.md).

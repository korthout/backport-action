# Backport action

A GitHub action to backport merged pull requests to selected branches.

This can be useful when you're supporting multiple versions of your product.
After fixing a bug, you may want to apply that patch to the other versions.
The manual labor of cherry-picking the individual commits can be automated using this action.

The backport action will look for backport labels (e.g. `backport release-3.4`) on your merged pull request.
For each of those labels:
1. fetch and checkout a new branch from the target branch (e.g. `release-3.4`)
2. cherry-pick the merged pull request's commits
3. create a pull request to merge the new branch into the target branch
4. comment on the original pull request about its success

This backport action is able to deal with so called `octopus` merges (i.e. merges of multiple branches with a single commit).
Therefore, this action is compatible with [Bors](https://bors.tech/), [GitHub Merge Queue](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue) and similar tools.

> **Note**
> Version `1.0.0` (i.e. `v1`) will be released soon.
> You can already try it out using the latest pre-release `v1-rc1`.
> After the `v1` release, [SemVer](https://semver.org/) will be respected.
> The repo will also move from [zeebe-io/backport-action](https://github.com/zeebe-io/backport-action) to [korthout/backport-action](https://github.com/korthout/backport-action).
> You can read more about it [here](https://github.com/zeebe-io/backport-action/issues/289).

## Usage

Add the following workflow configuration to your repository's `.github/workflows` folder.

```yaml
name: Backport merged pull request
on:
  pull_request:
    types: [closed]
permissions:
  contents: write # so it can comment
  pull-requests: write # so it can create pull requests
jobs:
  backport:
    name: Backport pull request
    runs-on: ubuntu-latest
    # Don't run on closed unmerged pull requests
    if: github.event.pull_request.merged
    steps:
      - uses: actions/checkout@v3
      - name: Create backport pull requests
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
name: Backport merged pull request
on:
  pull_request:
    types: [closed]
  issue_comment:
    types: [created]
permissions:
  contents: write # so it can comment
  pull-requests: write # so it can create pull requests
jobs:
  backport:
    name: Backport pull request
    runs-on: ubuntu-latest

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
      - name: Create backport pull requests
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

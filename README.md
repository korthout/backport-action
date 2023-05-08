# Backport action

Fast and flexible GitHub action to backport merged pull requests to selected branches.

This can be useful when you're supporting multiple versions of your product.
After fixing a bug, you may want to apply that patch to the other versions.
The manual labor of cherry-picking the individual commits can be automated using this action.

## Features

- Works out of the box - No configuration required / Defaults for everything
- Fast - Only fetches the bare minimum / Supports shallow clones
- Flexible - Supports all [merge methods](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/about-merge-methods-on-github) including [merge queue](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue) and [Bors](https://bors.tech/)
- Configurable - Use inputs and outputs to fit it to your project
- Transparent - Informs about its success / Cherry-picks with [`-x`](https://git-scm.com/docs/git-cherry-pick#Documentation/git-cherry-pick.txt--x)

## How it works

You can select the branches to backport merged pull requests in two ways:
- using labels on the merged pull request.
  The action looks for labels on your merged pull request matching the [`label_pattern`](#label_pattern) input
- using the [`target_branches`](#target_branches) input

For each selected branch, the backport action takes the following steps:
1. fetch and checkout a new branch from the target branch
2. cherry-pick the merged pull request's commits
3. create a pull request to merge the new branch into the target branch
4. comment on the original pull request about its success

## Usage

Add the following workflow configuration to your repository's `.github/workflows` folder.

```yaml
name: Backport merged pull request
on:
  pull_request_target:
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
        uses: korthout/backport-action@v1
```

> **Note**
> This workflow runs on [`pull_request_target`](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#pull_request_target) so that `GITHUB_TOKEN` has write access to the repo when the merged pull request comes from a forked repository.
> This write access is necessary for the action to push the commits it cherry-picked.

### Trigger using a comment

You can also trigger the backport action by writing a comment containing `/backport` on a merged pull request.
To enable this, add the following workflow configuration to your repository's `.github/workflows` folder.

<details><summary>Trigger backport action using a comment</summary>
 <p>

```yaml
name: Backport merged pull request
on:
  pull_request_target:
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
        uses: korthout/backport-action@v1
```

</p>
</details>

## Inputs

The action can be configured with the following optional [inputs](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions#jobsjob_idstepswith):

### `copy_labels_pattern`

Default: `''` (disabled)

Regex pattern to match github labels which will be copied from the original pull request to the backport pull request.
Note that labels matching `label_pattern` are excluded.
By default, no labels are copied.

### `github_token`

Default: `${{ github.token }}`

Token to authenticate requests to GitHub.
Used to create and label pull requests and to comment.

Either `GITHUB_TOKEN` or a repo-scoped [Personal Access Token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token) (PAT).

### `github_workspace`

Default: `${{ github.workspace }}`

Working directory for the backport action.

### `label_pattern`

Default: `^backport ([^ ]+)$` (e.g. matches `backport release-3.4`)

Regex pattern to match the backport labels on the merged pull request.
Must contain a capture group for the target branch.
Label matching can be disabled entirely using an empty string `''` as pattern.

The action will backport the pull request to each matched target branch.
See [How it works](#how-it-works).

### `pull_description`

Default:
```
# Description
Backport of #${pull_number} to `${target_branch}`.
```

Template used as description (i.e. body) in the pull requests created by this action.

Placeholders can be used to define variable values.
These are indicated by a dollar sign and curly braces (`${placeholder}`).
Please refer to this action's README for all available [placeholders](#placeholders).

### `pull_title`

Default: `[Backport ${target_branch}] ${pull_title}`

Template used as the title in the pull requests created by this action.

Placeholders can be used to define variable values.
These are indicated by a dollar sign and curly braces (`${placeholder}`).
Please refer to this action's README for all available [placeholders](#placeholders).

### `target_branches`

Default: `''` (disabled)

The action will backport the pull request to each specified target branch (comma-separated).
See [How it works](#how-it-works).

Can be used in addition to backport labels.
By default, only backport labels are used to specify the target branches.

## Placeholders
In the `pull_description` and `pull_title` inputs, placeholders can be used to define variable values.
These are indicated by a dollar sign and curly braces (`${placeholder}`).
The following placeholders are available and are replaced with:

Placeholder | Replaced with
------------|------------
`issue_refs` | GitHub issue references to all issues mentioned in the original pull request description seperated by a space, e.g. `#123 #456 korthout/backport-action#789`
`pull_author` | The username of the original pull request's author, e.g. `korthout`
`pull_number` | The number of the original pull request that is backported, e.g. `123`
`pull_title` | The title of the original pull request that is backported, e.g. `fix: some error`
`target_branch`| The branchname to which the pull request is backported, e.g. `release-0.23`

## Outputs

The action provides the following [outputs](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions#jobsjob_idoutputs):

Output | Description
-------|------------
`was_successful` | Whether or not the changes could be backported successfully to all targets. Either `true` or `false`.
`was_successful_by_target` | Whether or not the changes could be backported successfully to all targets - broken down by target. Follows the pattern `{{label}}=true\|false`.

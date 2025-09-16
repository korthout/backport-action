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
2. cherry-pick commits containing the merged pull request's changes, using the [`cherry_picking`](#cherry_picking) input
3. create a pull request to merge the new branch into the target branch
4. comment on the original pull request about its success

The commits are cherry-picked with the [`-x`](https://git-scm.com/docs/git-cherry-pick#Documentation/git-cherry-pick.txt--x) flag.

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
      - uses: actions/checkout@v4
      - name: Create backport pull requests
        uses: korthout/backport-action@v3
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
    # or when a comment starting with `/backport` is created by someone other than the
    # https://github.com/backport-action bot user (user id: 97796249). Note that if you use your
    # own PAT as `github_token`, that you should replace this id with yours.
    if: >
      (
        github.event_name == 'pull_request_target' &&
        github.event.pull_request.merged
      ) || (
        github.event_name == 'issue_comment' &&
        github.event.issue.pull_request &&
        github.event.comment.user.id != 97796249 &&
        startsWith(github.event.comment.body, '/backport')
      )
    steps:
      - uses: actions/checkout@v4
      - name: Create backport pull requests
        uses: korthout/backport-action@v3
```

</p>
</details>

### Signing cherry-picked commits

By default, the committer of the cherry‑picked commits is the user `github-actions[bot]`.
The original author remains the *author* of the commit; only the *committer* changes.
By default, the cherry-picked commits are not signed.

If you need the cherry‑picked commits to be signed (e.g. to satisfy a protected branch rule requiring signed commits) you can configure a signing identity.

Below is a GPG example (pin the third‑party action by commit for supply‑chain security):

```yaml
...
- name: Import GPG key
  id: import-gpg
  uses: crazy-max/ghaction-import-gpg@v6.3.0 # Or any other action to set up GPG
  with:
    gpg_private_key: ${{ secrets.GPG_PRIVATE_KEY }}
    passphrase: ${{ secrets.GPG_PASSPHRASE }}
    git_config_global: true
    git_user_signingkey: true
    git_commit_gpgsign: true
- name: Create backport pull requests
  uses: korthout/backport-action@v3
  with:
    git_committer_name: ${{ steps.import-gpg.outputs.name }}
    git_committer_email: ${{ steps.import-gpg.outputs.email }}
```

> **Note**
> The cherry-picked commits will still be shown as "Partially verified" (instead of "Unverified") in the GitHub UI.
> This is a limitation of GitHub and does not indicate a problem with the action itself.
> Despite the cherry-picked commit being signed by the specified committer, there is no way to preserve the original (author's) signature.
> However, the commit is cherry-picked with the [`-x`](https://git-scm.com/docs/git-cherry-pick#Documentation/git-cherry-pick.txt--x) flag ensuring that it references the original commit as an audit trail.

## Inputs

The action can be configured with the following optional [inputs](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions#jobsjob_idstepswith):

### `add_author_as_assignee`

Default: `false` (disabled)

Controls whether to set the author of the original pull request as an assignee on the backport pull request.
By default, the original author is not made an assignee.

### `add_labels`

Default: `''` (disabled)

The action will add these labels (comma-delimited) to the backport pull request.
By default, no labels are added.

### `branch_name`

Default: `backport-${pull_number}-to-${target_branch}`

Template used as the name for branches created by this action. 

Placeholders can be used to define variable values.
These are indicated by a dollar sign and curly braces (`${placeholder}`).
Please refer to this action's README for all available [placeholders](#placeholders).

### `cherry_picking`

Default: `auto`

Determines which commits are cherry-picked.

When set to `auto`, the action cherry-picks the commits based on the method used to merge the pull request.
- For "Squash and merge", the action cherry-picks the squashed commit.
- For "Rebase and merge", the action cherry-picks the rebased commits.
- For "Merged as a merge commit", the action cherry-picks the commits from the pull request.

When set to `pull_request_head`, the action cherry-picks the commits from the pull request.
Specifically, those reachable from the pull request's head and not reachable from the pull request's base.

By default, the action cherry-picks the commits based on the method used to merge the pull request.

### `copy_assignees`

Default: `false` (disabled)

Controls whether to copy the assignees from the original pull request to the backport pull request.
By default, the assignees are not copied.

### `copy_labels_pattern`

Default: `''` (disabled)

Regex pattern to match github labels which will be copied from the original pull request to the backport pull request.
Note that labels matching `label_pattern` are excluded.
By default, no labels are copied.

### `copy_milestone`

Default: `false` (disabled)

Controls whether to copy the milestone from the original pull request to the backport pull request.
By default, the milestone is not copied.

### `copy_requested_reviewers`

Default: `false` (disabled)

Controls whether to copy the requested reviewers from the original pull request to the backport pull request.
Note that this does not request reviews from those users who already reviewed the original pull request.
By default, the requested reviewers are not copied.

### `enable_auto_merge`

Default: `false` (disabled)

Controls the default auto-merge behavior for created backport pull requests.
When enabled, backport pull requests will automatically merge when all required checks pass and approvals are received.
Can be set to a simple boolean (`true`/`false`) or controlled dynamically via workflow expressions. Examples:

**Simple boolean** (always enable or disable):
```yaml
with:
  enable_auto_merge: true
```

**Opt-in with label** (enable auto-merge only when label is present):
```yaml
with:
  enable_auto_merge: ${{ contains(github.event.pull_request.labels.*.name, 'backport-auto-merge') }}
```

**Opt-out with label** (enable auto-merge by default, disable when label is present):
```yaml
with:
  enable_auto_merge: ${{ !contains(github.event.pull_request.labels.*.name, 'backport-no-auto-merge') }}
```
By default, auto-merge is not enabled.


### `auto_merge_method`

Default: `merge`

The merge method to use when auto-merge is enabled on backport PRs.
Valid options are:
- `merge` - Create a merge commit (combines all commits with a merge commit)
- `squash` - Squash and merge (combines all commits into a single commit)  
- `rebase` - Rebase and merge (replays commits individually without a merge commit)

**Important**: The specified method must be enabled in your repository's merge settings, otherwise auto-merge will fail.
The merge commit method is GitHub's default merge method.

### `experimental`

Default:

```json
{
  "detect_merge_method": false
}
```

Configure experimental features by passing a JSON object.
The following properties can be specified:

#### `conflict_resolution`

Default: `fail`

Specifies how the action will handle a conflict occuring during the cherry-pick. 
In all cases, the action will stop the cherry-pick at the first conflict encountered.

Behavior is defined by the option selected.
- When set to `fail` the backport fails when the cherry-pick encounters a conflict.
- When set to `draft_commit_conflicts` the backport will always create a draft pull request with the first conflict encountered committed.

Instructions are provided on the original pull request on how to resolve the conflict and continue the cherry-pick.

#### `downstream_repo`

Define if you want to backport to a repository other than where the workflow runs.

By default, the action always backports to the repository in which the workflow runs.

#### `downstream_owner`

Define if you want to backport to another owner than the owner of the repository the workflow runs on.
Only takes effect if the `downstream_repo` property is also defined.

By default, uses the owner of the repository in which the workflow runs.

### `github_token`

Default: `${{ github.token }}`

Token to authenticate requests to GitHub.
Used to create and label pull requests and to comment.

Either `GITHUB_TOKEN` or a repo-scoped [Personal Access Token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token) (PAT).

### `github_workspace`

Default: `${{ github.workspace }}`

Working directory for the backport action.

### `git_committer_name`

Default: `github-actions[bot]`

Name of the committer for the cherry-picked commit.

### `git_committer_email`

Default: `github-actions[bot]@users.noreply.github.com`

Email of the committer for the cherry-picked commit.

### `label_pattern`

Default: `^backport ([^ ]+)$` (e.g. matches `backport release-3.4`)

Regex pattern to match the backport labels on the merged pull request.
Must contain a capture group for the target branch.
Label matching can be disabled entirely using an empty string `''` as pattern.

The action will backport the pull request to each matched target branch.
Note that the pull request's headref is excluded automatically.
See [How it works](#how-it-works).

### `merge_commits`

Default: `fail`

Specifies how the action should deal with merge commits on the merged pull request.

- When set to `fail` the backport fails when the action detects one or more merge commits.
- When set to `skip` the action only cherry-picks non-merge commits, i.e. it ignores merge commits.
  This can be useful when you [keep your pull requests in sync with the base branch using merge commits](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/keeping-your-pull-request-in-sync-with-the-base-branch).

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

### `source_pr_number`

Default: `''` (not set)

Specifies the pull request (by its number) to backport, i.e. the source pull request.
When set, the action will backport the specified pull request to each target branch.
When not set, the action determines the source pull request from the event payload.

### `target_branches`

Default: `''` (disabled)

The action will backport the pull request to each specified target branch (space-delimited).
Note that the pull request's headref is excluded automatically.
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
`pull_description`| The description (i.e. body) of the original pull request that is backported, e.g. `Summary: This patch was created to..`
`pull_number` | The number of the original pull request that is backported, e.g. `123`
`pull_title` | The title of the original pull request that is backported, e.g. `fix: some error`
`target_branch`| The branchname to which the pull request is backported, e.g. `release-0.23`

## Outputs

The action provides the following [outputs](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions#jobsjob_idoutputs):

Output | Description
-------|------------
`created_pull_numbers` | Space-separated list containing the identifying number of each created pull request. Or empty when the action created no pull requests. For example, `123` or `123 124 125`.
`was_successful` | Whether or not the changes could be backported successfully to all targets. Either `true` or `false`.
`was_successful_by_target` | Whether or not the changes could be backported successfully to all targets - broken down by target. Follows the pattern `{{label}}=true\|false`.

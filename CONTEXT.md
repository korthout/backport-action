# Backport action

A GitHub Action that backports merged pull requests to other branches by cherry-picking their commits onto target branches and opening pull requests with the result.

## Language

**Original pull request**:
The pull request being backported. Identified from the workflow event payload, or from the `source_pr_number` input when set. Must be merged.
_Avoid_: source PR, merged PR (use only when merge-state is the actual point)

**Backport pull request**:
The pull request the action creates on a target branch, containing the cherry-picked commits.

**Target branch**:
A branch to which the original pull request is backported. Selected by backport labels and/or the `target_branches` input. Lives in the target repository.

**Target repository**:
The repository where the backport pull request is created. Defaults to the workflow's repository; can be overridden via the experimental `downstream_repo`/`downstream_owner` (likely renamed when promoted out of experimental).
_Avoid_: downstream repo (the existing input name is a frozen historical artifact)

**Backport label**:
A label on the original pull request matching the `label_pattern` input, whose capture group names a target branch. Other labels used in workflow logic (e.g. `backport-auto-merge`) are not backport labels — they're not recognised by the action as a category.

**Commits to backport**:
The set of commits selected from the original pull request's history and passed to `git cherry-pick`. Governed by the `cherry_picking` input and, when set to `auto`, by the original pull request's merge method.

**Cherry-picked commits**:
The new commits created on the target branch by `git cherry-pick`. The commit author is preserved from the input commits; the commit committer is overwritten by `git_committer_name` / `git_committer_email` (defaulting to `github-actions[bot]`). Each carries an `-x` trailer referencing the input commit as audit trail.

**Merge method**:
How a pull request is merged on GitHub. One of: squash-and-merge, rebase-and-merge, or merge commit. The action *observes* the original pull request's merge method (consumed by `cherry_picking: auto`) and *configures* the backport pull request's merge method (via `auto_merge_method`). Always disambiguate which pull request's merge method is meant.

**Cherry-pick merge mode**:
The action's abstraction over git's strategy options for `git cherry-pick`. Controlled via the `cherry_picking_merge_mode` input. Values are `default` (standard cherry-pick behavior) and `whitespace_tolerant` (trailing whitespace differences are ignored when cherry-picking). Not to be confused with the pull request's **merge method**.
_Avoid_: "merge strategy option" (a git-internal term; this action redefines the concept for its own abstraction)

**PR author**:
The GitHub user who opened a pull request. The action can copy the original PR author to the backport PR as assignee or reviewer (`add_author_as_assignee`, `add_author_as_reviewer`, `pull_author` placeholder).
_Avoid_: just "author" (collides with commit author)

**Commit author** / **commit committer**:
Git commit metadata. Cherry-picking preserves the commit author and overwrites the commit committer. Always pair "commit" with the word.

## Relationships

- An **original pull request** produces zero or more **backport pull requests**, one per attempted **target branch**.
- A **backport pull request** lives on a **target branch** inside the **target repository**.
- A **backport label** on the **original pull request** selects one **target branch**.
- The **commits to backport** (input to cherry-pick) become **cherry-picked commits** (output, on the target branch) after `git cherry-pick`.
- The **original pull request's** **merge method** determines which **commits to backport** are selected when `cherry_picking: auto`.

## Example dialogue

> **Dev:** "If the **original pull request** was merged via squash-and-merge, what are the **commits to backport**?"
> **Maintainer:** "Just the squashed commit on the base branch. The **cherry-picked commit** on the **target branch** keeps the squash author but gets `github-actions[bot]` as the **commit committer** unless overridden."
> **Dev:** "And the **PR author** — that's a different person from the **commit author**?"
> **Maintainer:** "Usually the same, but conceptually separate. **PR author** is the GitHub user who opened the PR; **commit author** is git metadata on each commit."

## Flagged ambiguities

- "Source PR" vs "original PR" vs "merged PR" — resolved to **original pull request**. `source_pr_number` keeps its name (frozen API) but its description refers to the original pull request.
- "Downstream repo" — resolved to **target repository** in prose. Input names `downstream_repo`/`downstream_owner` are experimental and likely renamed on promotion.
- "Merge commit" was overloaded across: a merge method, an intermediate commit in PR history (`merge_commits` input), and the result of auto-merge. Resolved by always pairing with context; no coined term for the intermediate case.
- "Author" was used for three concepts: PR author, commit author, commit committer. Resolved by always qualifying ("PR author" / "commit author" / "commit committer").
- "Successful" / "failed" / "skipped" / "attempted" — intentionally *not* glossarised. The output `was_successful` is documented precisely in `README.md`; surrounding adjectives are plain English.

---
date: 2026-03-19T00:00:00Z
researcher: Claude
topic: "Main code flow in production usage"
tags: [research, codebase, architecture, flow]
status: complete
---

# Research: Main Code Flow in Production Usage

## Research Question
What is the main code flow when the backport-action runs in production (as a GitHub Action)?

## Summary

The action is triggered when a PR is merged (or manually via `source_pr_number`). It reads inputs from `action.yml`, determines target branches from labels and/or config, detects the merge strategy to pick the right commits, then for each target branch: creates a branch, cherry-picks commits, pushes, creates a backport PR, and optionally copies metadata (labels, assignees, reviewers, milestone) and enables auto-merge. Results are posted as comments on the original PR.

## Detailed Findings

### Entry Point: `src/main.ts`

The action entry is `dist/index.js` (bundled via esbuild from `src/main.ts`). The `run()` function:

1. **Reads all inputs** (lines 18-39) from the GitHub Actions context via `core.getInput()`.
2. **Validates inputs** (lines 41-99): cherry_picking, merge_commits, auto_merge_method, copy_requested_reviewers/add_author_as_reviewer conflict, and experimental options.
3. **Constructs dependencies**: `Github` (API wrapper), `Git` (CLI wrapper), and `Config` object (lines 102-123).
4. **Delegates to `Backport.run()`** (line 126).

### Core Orchestration: `src/backport.ts` - `Backport.run()`

This is the heart of the action (lines 94-628). The flow:

#### Phase 1: Source PR Resolution (lines 96-127)
- Gets the webhook payload and determines owner/repo (supports downstream repos via experimental config).
- Resolves the source PR number (from event payload or `source_pr_number` input).
- Fetches the PR data via GitHub API.
- **Guard**: If the PR is not merged, posts a comment and exits.

#### Phase 2: Target Branch Discovery (lines 129-135)
- `findTargetBranches()` (line 854) combines:
  - **Label-based targets**: Matches PR labels against `label_pattern` regex (default `^backport ([^ ]+)$`), extracts the capture group as the branch name.
  - **Config-based targets**: Splits `target_branches` input by spaces.
  - Deduplicates and excludes the PR's own head ref.
- If no target branches found, exits silently.

#### Phase 3: Commit Selection (lines 137-202)
- Fetches PR commits from the remote.
- If `cherry_picking: "auto"` (default), detects the merge strategy:

| Strategy | Detection Method | Commits to Cherry-Pick |
|---|---|---|
| **Squashed** | Single parent on merge commit + (1 commit or SHA not associated with PR) | The squash merge commit SHA |
| **Rebased** | Single parent + all commits associated with PR | Range of rebased commits on base branch |
| **Merge Commit** | Multiple parents on merge commit | Original PR commit SHAs |
| **Unknown** | Fallback | Original PR commit SHAs |

- If `cherry_picking: "pull_request_head"`, always uses original PR commits.

#### Phase 4: Merge Commit Handling (lines 205-241)
- Checks for merge commits among the selected SHAs.
- `merge_commits: "fail"` (default): posts error comment and returns.
- `merge_commits: "skip"`: filters out merge commit SHAs.

#### Phase 5: Label Copying Preparation (lines 243-257)
- If `copy_labels_pattern` is set, filters PR labels matching the pattern (excluding backport labels themselves).

#### Phase 6: Per-Target-Branch Loop (lines 265-614)

For each target branch, the action performs these steps sequentially:

##### 6a. Fetch target branch (lines 268-285)
- `git fetch --depth=1 <remote> <target>`
- If ref not found, posts comment and continues to next target.

##### 6b. Create backport branch (lines 287-316)
- Branch name from template (default: `backport-${pull_number}-to-${target_branch}`).
- `git switch -c <branchname> <remote>/<target>`
- If checkout fails (e.g., branch already exists locally), posts comment and continues.

##### 6c. Cherry-pick commits (lines 318-341)
- `git cherry-pick -x <shas...>` (the `-x` flag adds traceability).
- **Conflict resolution**:
  - `"fail"` (default): Aborts cherry-pick and posts failure comment.
  - `"draft_commit_conflicts"` (experimental): Cherry-picks one-by-one; on first conflict, commits the conflicted state with marker `BACKPORT-CONFLICT`, returns remaining SHAs. The resulting PR will be created as a draft.

##### 6d. Push branch (lines 343-381)
- `git push --set-upstream <remote> <branchname>`
- If push fails (e.g., branch already exists on remote), attempts to fetch the existing branch to recover a previous run.

##### 6e. Create backport PR (lines 383-420)
- Title/body from templates with placeholder substitution.
- Created as **draft** if there were cherry-pick conflicts.
- If a PR already exists for the branch (422 error), skips silently.

##### 6f. Copy metadata (lines 422-554)
- **Milestone** (`copy_milestone`): Sets via Issues API.
- **Assignees** (`copy_assignees`): Copies from original PR.
- **Reviewers** (`copy_requested_reviewers`): Copies requested reviewers.
- **Labels**: Union of `copy_labels_pattern` matches + `add_labels` static list.
- **Author as assignee** (`add_author_as_assignee`): Adds original PR author.
- **Author as reviewer** (`add_author_as_reviewer`): Requests review from author.
- **Auto-merge** (`auto_merge_enabled`): Enables via GraphQL mutation.

Each metadata operation is wrapped in try/catch so failures don't block the overall flow.

##### 6g. Post success comment (lines 556-599)
- Comments on the original PR with a link to the new backport PR.
- If conflicts were committed, includes resolution instructions.
- Also comments on the new PR with conflict resolution steps.

#### Phase 7: Set Outputs (line 616)
- `was_successful`: `true` only if no target failed.
- `was_successful_by_target`: Per-target success/failure breakdown.
- `created_pull_numbers`: Space-separated list of created PR numbers.

### Supporting Modules

#### `src/github.ts` - GitHub API Wrapper
- Wraps Octokit (REST) and GraphQL client.
- **Key interface**: `GithubApi` (line 13) defines the contract for testability.
- REST for: PR data, comments, labels, assignees, milestones, reviewers, merge detection.
- GraphQL only for: `enableAutoMerge` (query node ID + mutation).
- Merge strategy detection (`mergeStrategy`, line 338): Analyzes parent commits and SHA-to-PR associations.

#### `src/git.ts` - Git CLI Wrapper
- Wraps `@actions/exec` to run git commands.
- Injects committer name/email via environment variables per invocation.
- `ignoreReturnCode: true` on all commands for manual exit code handling.
- `cherryPick()` is the most complex method: supports both "fail" and "draft_commit_conflicts" strategies with one-at-a-time application.
- `push()` is the only method that returns exit codes instead of throwing.

#### `src/utils.ts` - Template Utilities
- `replacePlaceholders()`: Substitutes `${pull_number}`, `${pull_title}`, `${pull_author}`, `${pull_description}`, `${target_branch}`, `${issue_refs}` in PR title/body/branch templates.
- `getMentionedIssueRefs()`: Extracts GitHub issue references (URLs and `#123` syntax) from PR body for the `${issue_refs}` placeholder.

## Code References
- `src/main.ts:17-130` - Entry point, input parsing, validation, dependency construction
- `src/backport.ts:68-84` - Backport class constructor
- `src/backport.ts:94-628` - Main `run()` orchestration
- `src/backport.ts:854-914` - Target branch resolution from labels and config
- `src/github.ts:338-395` - Merge strategy detection algorithm
- `src/github.ts:171-223` - Auto-merge via GraphQL
- `src/git.ts:150-222` - Cherry-pick with conflict resolution strategies
- `src/utils.ts:9-22` - Template placeholder replacement

## Architecture Insights

1. **Clean separation of concerns**: `main.ts` handles I/O (reading inputs), `backport.ts` orchestrates the workflow, `github.ts` handles API calls, `git.ts` handles CLI operations, `utils.ts` handles string manipulation.

2. **Testability by design**: The `GithubApi` interface allows mocking the entire GitHub layer. `Git` operations are isolated behind a class. `Backport` accepts all dependencies via constructor injection.

3. **Resilient per-target processing**: Each target branch is processed independently in a loop. Failures for one target (fetch, checkout, cherry-pick, push, PR creation) are caught, reported via comment, and the loop continues to the next target. Metadata operations (labels, assignees, etc.) fail gracefully without blocking the overall success.

4. **Downstream repo support**: The experimental `downstream_repo`/`downstream_owner` options allow cherry-picking to a different repository, switching the git remote from "origin" to "downstream".

5. **Recovery from previous runs**: If `git push` fails because the branch already exists, the action tries to fetch the existing branch and proceed with PR creation -- allowing retries of partially-completed runs.

## Open Questions

1. **Shallow clone handling**: The action accounts for shallow clones by fetching with `depth = commits + 1`, but edge cases with very large PRs or complex histories could potentially cause issues.
2. **Single-commit ambiguity**: The merge strategy detection explicitly notes that a single-commit rebase is indistinguishable from a squash merge -- it defaults to squash in this case (`src/github.ts:358`).
3. **Branch name collisions**: If a backport branch name already exists locally, checkout fails. The action reports this but doesn't attempt cleanup or alternative naming.

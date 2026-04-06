# Testing

## Running tests

```
npm test
```

For verbose output:

```
npm run test-verbose
```

## Architecture

Tests are split into three tiers:

```
Unit tests (fast, isolated)
├── backport.test.ts
├── utils.test.ts
└── git.test.ts

Integration tests (still fast, specific focus)
├── backport.integration.test.ts  — orchestration tests using FakeGithub + MockGit
└── git.integration.test.ts       — real-git tests using FakeGithub + Real Git

E2E tests (separate repository)
└── korthout/backport-action-test  — real GitHub Actions + real GitHub API
```

The tests in this repo are written like this:
- Easy to understand what the test does
- Easy to extend for new features (mostly just copy-paste and adjust)
- Test behavior not implementation by verifying results rather than checking that a function was called
- They need to run fast, keeping the total duration of all tests under 5 seconds

That means that most tests will either be unit tests or fast running integration tests.

The codebase has two external boundaries: `GithubApi` and `GitApi`. The integration tests mock/fake one or more of these boundaries. For example, `git.integration.test.ts` mocks GitHubAPI so it can test against a real Git repo. This gives fast orchestration tests AND realistic git tests without needing a real GitHub API.

E2E tests in [korthout/backport-action-test](https://github.com/korthout/backport-action-test) complete the strategy by exercising the action on real GitHub PRs against the real GitHub API and workflow triggers.

## Where to add your test

Most changes (like introducing a new input or output) need an **integration test**. These are fast and cover the majority of scenarios. 

Unit tests only need to be written for newly introduced algorithms or code that can produce many different results.
For example, `findTargetBranch` in `backport.test.ts` or `getMentionedIssueRefs` in `utils.test.ts`.

E2E tests are rarely expanded — see [E2E tests](#e2e-tests) below.

Use the table below to pick the right file:

| Your change involves... | Add test to... |
|---|---|
| Config toggle → GitHub API call (copy_milestone, add_labels, etc.) | orchestration tests (`backport.integration.test.ts`) |
| Error handling (API failures, push recovery) | orchestration tests (`backport.integration.test.ts`) |
| Output values (was_successful, created_pull_numbers) | orchestration tests (`backport.integration.test.ts`) |
| PR title/body/branch name templates | orchestration tests (`backport.integration.test.ts`) |
| Cherry-pick behavior (conflicts, multiple commits) | real-git tests (`git.integration.test.ts`) |
| Branch operations with real git state | real-git tests (`git.integration.test.ts`) |
| Merge commit detection | real-git tests (`git.integration.test.ts`) |
| A pure function (no side effects) | The corresponding unit test file |

Each integration test file also has a header comment with additional guidance.

## E2E tests

E2E tests live in a separate repository: [korthout/backport-action-test](https://github.com/korthout/backport-action-test). They cover different trigger events, merge strategies (merge/squash/rebase), and fork vs local PRs.

These run the action on real GitHub PRs and are slow and manual — run them via workflow dispatch in that repository. Run before releasing, or when changing how the action interacts with GitHub (merge strategy detection, commit discovery, `main.ts` entry point, workflow trigger handling).

Only add new E2E cases when a scenario genuinely cannot be covered by integration tests — i.e. it requires the real GitHub API or real workflow triggers to be meaningful.

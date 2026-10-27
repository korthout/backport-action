# Scope and safety

The action does one thing well: it backports merged pull requests. A feature request fits when it is part of that job run, and when it can't already be done by other means or doing so would be overly complex.

**In scope:** everything about the backport pull request that can be set when it is created, while the action runs. That covers labels, reviewers, assignees, milestone and auto-merge. Auto-merge ([#498](https://github.com/korthout/backport-action/pull/498)) is in scope because it is set at creation time.

**Out of scope:** anything after creation, which belongs in separate workflows:
- labelling the original pull request once backports merge ([#73](https://github.com/korthout/backport-action/issues/73#issuecomment-868319689)),
- deleting backport branches ([#324](https://github.com/korthout/backport-action/issues/324#issuecomment-1412057124)),
- dashboards of open backports ([#531](https://github.com/korthout/backport-action/pull/531#issuecomment-4280539236)),
- reminders about stale backports ([#546](https://github.com/korthout/backport-action/issues/546#issuecomment-4280549906)).

**Only merged pull requests are backported, and the action never runs code from them.** The README recommends `pull_request_target`, which runs with the repository's secrets, so every feature must be safe by default for public repositories.
- Backporting unmerged pull requests was declined ([#411](https://github.com/korthout/backport-action/pull/411#issuecomment-2863376140)).
- Running a command to resolve conflicts was declined. A pull request could change what that command does and then force a conflict ([#463](https://github.com/korthout/backport-action/issues/463#issuecomment-2862942613)).
- These would only be reconsidered for a use case that truly needs them, with proof that existing users stay safe.
- Prefer alternatives that are safe by construction: rules declared in the workflow file, which lives on the trusted base branch.

**Backport what was merged, and only that.** The commits to backport follow the original pull request's merge method (`cherry_picking: auto`, the default since v3). Changes the original pull request picked up from its base branch are never carried along (`merge_commits: skip`, [#372](https://github.com/korthout/backport-action/pull/372#issuecomment-1670711281)). Backporting only a subset of files ([#579](https://github.com/korthout/backport-action/issues/579), [#463](https://github.com/korthout/backport-action/issues/463)) is undecided.

**The environment belongs to the workflow.** The workflow sets up:
- the checkout and the git credentials `actions/checkout` persists,
- the token passed in,
- the workflow event.

Problems there are answered with documentation ([#247](https://github.com/korthout/backport-action/issues/247#issuecomment-1163019178), [#654](https://github.com/korthout/backport-action/issues/654#issuecomment-4763217528)). The action may take over a part when that pays off clearly. One example is cloning the repository itself, only when needed and only what's needed, for performance that the workflow's checkout can't provide.

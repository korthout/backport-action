# Compatibility and releases

Many workflows pin this action by its major tag, so they pick up every minor and patch release without anyone reviewing it. The **contract** (see [CONTEXT.md](../../CONTEXT.md)) therefore only changes in a major release. A change is judged by the change itself, not by guessing who depends on it, so the same question isn't debated again for every change.

**The contract is everything observable** through inputs, outputs, the job's status, the events the action runs on, environment assumptions, and what the action writes to git and GitHub: pushed branches, cherry-picked commits, and backport pull requests with their title, description, branches, draft state, labels, assignees, reviewers, milestone and auto-merge. Whether the docs describe a behavior doesn't matter. The docs can keep a behavior out of the contract only by calling it unspecified when it's introduced. Comments and logs are **prose**: they're written for people, while outputs are for computers. Prose may change in any release.

**A breaking change alters or removes something in the contract,** however wrong the old behavior was. A user who worked around a bug depends on the bug.

| Release | May contain |
|---|---|
| Major | Breaking changes, including changed defaults (also the default templates; v3 changed the default commits to backport, [#420](https://github.com/korthout/backport-action/pull/420)), moving the Node runtime once GitHub Actions deprecates the old one ([#485](https://github.com/korthout/backport-action/pull/485#issuecomment-3188933013), [#501](https://github.com/korthout/backport-action/issues/501#issuecomment-3531207357)), and calling an existing behavior unspecified |
| Minor | Additions to the contract, like an output or an input that defaults to today's behavior. Fixes for unusable or unstable behavior that produce new outcomes (#705 created backport pull requests where runs used to fail) |
| Patch | Fixes that only remove unusable or unstable outcomes (#344 stopped cherry-picking onto the original pull request's own head branch, which always failed), unobservable changes such as refactors, and prose |

- **Fixes for unusable, unstable or unobservable behavior aren't breaking.** Unusable means the run failed or the operation didn't complete. Unstable means nondeterministic. They need no input to keep the old behavior ([#705](https://github.com/korthout/backport-action/pull/705#discussion_r4069234836): *"there's nothing worth preserving there… Inputs aren't free"*).
- **A breaking change ships in a patch only** to fix a regression that itself broke user space (restoring the old behavior), or as a last resort for a security vulnerability or critical bug that can't be fixed any other way. The release notes then call out the break and how to adapt.
- **Breaking pull requests wait for the next major.** They get the `breaking` label and stay open until the next major has a scope. Then `release-vN` is cut from `main`, the held pull requests merge, and fixes for vN are backported to `release-vN` with this action, as #311 was to `release-v1`.
- **New behavior is opt-in, and defaults converge in majors.** A new input defaults to today's behavior (e.g. `copy_labels_pattern` defaults to empty, `cherry_picking_merge_mode` to `default`), and a later major may change the default to what fits most users. That's what "No inputs required" means: start with no inputs, and use inputs to fit the action to your use case.
- **Experimental features ship early,** without full test coverage, to get feedback ([#399](https://github.com/korthout/backport-action/pull/399#issuecomment-1837256039), [#417](https://github.com/korthout/backport-action/pull/417#pullrequestreview-1970324740)). Their behavior may change in any release, but they're only dropped or promoted in a major. Promotion is one major step, possibly with a redesign (v3 replaced `detect_merge_method` with `cherry_picking`), or two steps. First, a minor adds the regular inputs, while the experimental keys keep working and log a deprecation warning that names the new input. Setting both is a misconfiguration. Then the major stops reading the keys but still warns about them.

## Considered Options

- **"Changing behavior nobody could rely on is a bug fix" as the test:** rejected. It asks for a guess about users, so every case gets debated again. #692 showed this: it fixed wrong text in backport pull requests from runs that completed, and the guess could go either way.
- **The docs as the contract:** rejected. The docs are too vague to decide cases. For example, they never said whether a repeated placeholder is replaced once or everywhere.
- **Shipping breaking fixes early behind an `experimental` key:** rejected. It means two code paths until the major, and it stretches "experimental feature" to cover bug fixes.
- **An input that preserves the old behavior for every behavior-changing fix:** rejected. Each input is permanent maintenance burden, which is a poor trade for preserving behavior that never produced anything useful.
- **Every behavior-changing fix in a major release:** rejected. Fixes for runs that failed would wait months, even though nobody can depend on a failed run.

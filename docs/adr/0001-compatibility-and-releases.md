# Compatibility and releases

Many workflows pin this action by its major tag, so they pick up every minor and patch release without anyone reviewing it. Behavior a user didn't configure therefore only changes in a major release. The rules below decide which release a change goes into, and when a bug fix is allowed to change behavior.

- **New behavior is opt-in.** A new input defaults to the behavior users have today (e.g. `copy_labels_pattern` defaults to empty, and `cherry_picking_merge_mode` defaults to `default`). A later major release may change that default to what fits most users. This is how inputs converge on reasonable defaults, which is what "No inputs required" means: you can start with no inputs at all, and use inputs to fit the action to your exact use case.
- **Changing a default needs a major release,** even when no workflow change is required. v3 changed the default commits to backport ([#420](https://github.com/korthout/backport-action/pull/420)).
- **The Node runtime moves in a major release,** and only after GitHub Actions deprecates the old one ([#485](https://github.com/korthout/backport-action/pull/485#issuecomment-3188933013), [#501](https://github.com/korthout/backport-action/issues/501#issuecomment-3531207357)).
- **Changing behavior nobody could rely on is a bug fix,** and needs no new input to keep the old behavior ([#705](https://github.com/korthout/backport-action/pull/705#discussion_r4069234836): *"there's nothing worth preserving there… Inputs aren't free"*). It ships in:
  - **a patch release** when the fix only removes an outcome nobody could rely on. Example: #344 stopped backporting the original pull request to the branch it was merged into.
  - **a minor release** when the fix also produces outcomes users haven't seen before. Example: #705 created backport pull requests where runs used to fail, and reported skipped commits.
- **A breaking change may ship in a patch release in only these cases:**
  - It fixes a regression that itself broke user space. The patch restores the behavior users had before.
  - As a last resort, it fixes a security vulnerability or a critical bug that can't be fixed without breaking user space. The release notes call out the break and how to adapt.
- **Experimental features ship early,** without full test coverage, to get feedback ([#399](https://github.com/korthout/backport-action/pull/399#issuecomment-1837256039), [#417](https://github.com/korthout/backport-action/pull/417#pullrequestreview-1970324740)). Their behavior may change in any release. They are only dropped or promoted in a major release.
- **Promotion** is either one major step, possibly with a redesign (v3 replaced `detect_merge_method` with `cherry_picking`), or two steps:
  - **The minor release** adds the regular inputs. The experimental keys keep working and log a deprecation warning that names the new input. Setting both is a misconfiguration.
  - **The major release** stops reading the keys but still warns about them.

## Considered Options

- **An input that preserves the old behavior for every behavior-changing fix:** rejected. Each input is permanent maintenance burden, which is a poor trade for preserving behavior that never produced anything useful.
- **Every behavior-changing fix in a major release:** rejected. Fixes would wait months, and most users would never notice the difference.

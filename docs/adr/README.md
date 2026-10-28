# Architecture decision records

Product decisions for backport-action, recorded so that new proposals can be judged against past precedent. Read an ADR when its "Read when" applies. Terms follow [CONTEXT.md](../../CONTEXT.md).

| ADR | Decides | Read when |
|---|---|---|
| [0001 Compatibility and releases](0001-compatibility-and-releases.md) | What the contract is, which changes break it, and what may change in a patch, minor or major release: opt-in defaults, the Node runtime, holding breaking pull requests for the next major and grouping them by contract element in its milestone, and how experimental features change and get promoted | Choosing a release for a change, or changing anything users can observe |
| [0002 When to add an input](0002-when-to-add-an-input.md) | When a new input earns its place instead of a documented workflow expression, building on demonstrated need, templates, and defaults | Someone proposes a new input or option |
| [0003 Scope and safety](0003-scope-and-safety.md) | What the action does and doesn't do (it sets up the backport pull request, then stops), merged pull requests only, no code run from them, and what belongs to the workflow's environment | Judging whether a feature request fits the action, or whether it is safe under `pull_request_target` |
| [0004 Reporting and failure](0004-reporting-and-failure.md) | Transparency over quiet, when the job fails (misconfiguration) or not (failed backport), and the summary comment as the v5 default | Changing comments, outputs or the job's status |

New ADRs follow [ADR-FORMAT.md](../../.claude/skills/grill-me-with-docs/ADR-FORMAT.md), and each one adds a row here.

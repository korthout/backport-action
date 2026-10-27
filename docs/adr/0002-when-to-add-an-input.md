# When to add an input

Inputs give users the flexibility to fit the action to their exact use case. A new input never costs "No inputs required": it defaults to the existing behavior, and a major release may later change that default (ADR-0001). It does cost maintenance, though. Every input is permanent, documented in two places, tested, and kept compatible. GitHub Actions workflows can already compute input values with expressions, filter jobs with `if:`, and act on the action's outputs. So a new input has to earn its place.

**Add a dedicated input only when:**
- the behavior needs something only the action knows, such as the original pull request across workflow events, or
- no existing input can express it, or
- composing it in the workflow is so complex that a dedicated input simplifies usage a lot.

**Otherwise, the README documents the expression.** In [#498](https://github.com/korthout/backport-action/pull/498#pullrequestreview-3223341616), label-triggered auto-merge inputs were rejected in favor of `auto_merge_enabled: ${{ contains(github.event.pull_request.labels.*.name, 'auto-merge') }}`. A dedicated `add_author_as_assignee` was accepted ([#445](https://github.com/korthout/backport-action/pull/445#pullrequestreview-2635726117)) because no other input could assign the original pull request's PR author. The workflow can't name them reliably either: `github.event.pull_request` is empty on `issue_comment` and when `source_pr_number` is set.

**Build features on demonstrated need.** Ask for the concrete workflow behind a request, and wait for a second user when the need is unclear ([#579](https://github.com/korthout/backport-action/issues/579#issuecomment-4174748231)). Don't ship speculative options: the `default_mainline` PR was closed *"so I don't have to support an unused feature indefinitely"* ([#372](https://github.com/korthout/backport-action/pull/372#issuecomment-1670711281)).

**Customize text with templates.** Anything the action writes (title, description, branch name) is a template input with `${placeholders}`, not a footer or a one-off flag ([#51](https://github.com/korthout/backport-action/issues/51#issuecomment-853754065)). `pull_*` placeholders refer to the original pull request.

**Defaults follow GitHub's defaults** unless there's a reason not to. For example, `auto_merge_method` defaults to `merge`, as GitHub does ([#498](https://github.com/korthout/backport-action/pull/498#discussion_r2348209513)).

## Considered Options

- **"Flexibility first, ease of use second"** ([#87](https://github.com/korthout/backport-action/issues/87#issuecomment-1123948966), 2022): still holds when choosing the *shape* of an input, e.g. a regex pattern over a boolean. It doesn't justify adding an input that composition already covers.

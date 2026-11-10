# Reading issue references

`${issue_refs}` lists the issues and pull requests that the original pull request's description refers to. To know what's a reference, the action must know what's code, a comment or a link, and Markdown defines that.

**The action reads the description with its own scanner, following CommonMark with GitHub's extensions as far as that decides where a reference counts.** It needs no dependency, no permission and no API call, and it runs in linear time. Its failures are harmless: a missed or extra reference, never a failed run. Bugs on edge cases of the spec are expected, and each fix is small: a fixture case and one step of the scanner.

**Markdown is the spec, not GitHub's rendering.** References are listed as written. Whether an issue exists, a repository was renamed, or the casing is canonical isn't checked. A change that follows Markdown more closely is a fix and may ship in a patch (ADR-0001).

**An edge case is fixed when it reaches users, not when a review finds it.** A fix is small, but each one grows the scanner. So a difference from the spec is fixed only when a user reports it, or when we expect one of our users to encounter it. A review, by a person or a tool, is likely to find cases that our users are unlikely to encounter, so weigh how likely each one is. An unlikely one is left alone, without a record. Only one that may be worth a fix, but is too complex to support for now, is recorded as a gap: a fixture case that runs as an expected failure.

**A reference counts in the visible text and in a link's destination.** In visible text, any form counts: `#123`, `GH-123`, `owner/repo#123`, or a url to an issue. In a link's destination, only a url to an issue or pull request counts. That covers inline links, reference links and an html `a` element's `href`. A link's text doesn't count: in `[see #6](https://github.com/camunda/camunda/issues/7)` the description links to issue 7, and listing `#6` would mention an issue it never linked to. This lists more than GitHub itself marks as references in the rendered description, which leaves out links with a name. That's a product choice, because `${issue_refs}` is for the issues the original pull request refers to.

**The scanner stays replaceable.** The Markdown part hands the rest of the action the visible text and the link destinations, in order of occurrence. Any parser that follows Markdown (our scanner, a library, even regexes) can produce that, so another one can take the scanner's place later.

## Considered options

- **GitHub's rendered `body_html`** (#788): the least code, and it checks existence. But it depends on undocumented markup, so `${issue_refs}` would turn silently empty when that changes, and private repositories would need `issues: read`. And it lists references as GitHub renders them, which is costly to leave: a replacement would have to reproduce that form, and that needs the API.
- **An API call** to check existence or canonical names: latency and another failure point, for benefits users don't need.
- **Regexes** (#790): they can't express code nested in list items and block quotes. And whether a regex backtracks so much that a crafted description takes seconds can only be found by reading it closely, so each change to them needs that scrutiny.
- **The `marked` library** (#791): the least parsing code of our own, but a dependency with frequent major releases. It throws on deeply nested input (after the backport branch is pushed) and takes seconds on adversarial emphasis.

**Revisit** if `${issue_refs}` keeps generating bug reports after release: reconsider `marked`. Check whether its deep-nesting crash and slow emphasis are fixed. If they aren't, weigh what they would mean for users, or contribute a fix upstream.

---
name: decision-brief
description: Prepares product-decision briefs for backport-action issues and pull requests, so the maintainer only has to make the call ("do we want this, and how does it fit the product?"). Also mines past maintainer decisions from closed issues/PRs into draft ADRs, and records a decision once made (ADR, labels, drafted reply). Use whenever the user wants to triage, decide on, or prepare a decision for an issue, feature request, or contribution; asks "should we do #N", "is this a fit", "prep this for me"; wants to work through the decision backlog; or wants to bootstrap or extend the ADRs from history.
---

# Decision brief

The bottleneck in this repo is not code or CI — it is product decisions: *do we want this, and how should it fit the product?* This skill does the prework so the maintainer can decide in minutes, then records the decision so the next one is faster.

The agent prepares and recommends. The maintainer decides. Never post, label, close, or comment on GitHub without explicit approval — those actions speak for the project.

## Modes

Pick from the request:

- **brief** — one or a few issues/PRs (`#211`, `PR 692`). Default.
- **backlog** — all open issues still waiting on a product decision.
- **bootstrap** — mine closed issues, PRs and review comments for decisions already made, and draft ADRs from them.
- **record** — the maintainer has decided; write the ADR and draft the follow-up.

## Ground truth to load first

Every mode judges against the same sources. Read them before writing anything:

- `CLAUDE.md` — product values (Fast, No inputs required, Flexible & configurable, Clear), "Don't break user space", maintainability stance
- `CONTEXT.md` — domain language; use its terms and respect its _Avoid_ lists
- `docs/adr/` — past decisions (may not exist yet; see bootstrap)

Verify claims about behavior against `origin/main` (`git fetch` first; the local checkout is often behind). Cite `file:line`. A brief built on stale code is worse than none — earlier research has gone partly stale within months.

For GitHub reads, paginate fully (`gh api --paginate`) and state counts.

## Mode: brief

For each issue/PR, gather: the body and all comments, reactions, linked/duplicate issues (search closed ones too), related PRs, and the code it touches. For a PR, also the diff.

Write the brief to `thoughts/decisions/<number>-<slug>.md` using this structure:

```md
# #<number> <title>
<link> · <issue|PR> · opened <date> by <author> · <reactions> reactions, <comments> comments

## Need
Who is asking and what they are actually trying to achieve (the job, not the proposed solution).
How widespread: reactions, duplicates, linked repos.

## Today
Current behavior, verified against origin/main with file:line.
Workarounds that already exist (existing inputs, workflow-level `if:`, other actions).
For bugs: severity — silent wrong output > confusing failure > cosmetic — and a repro if cheap.

## Fit
Against each product value and "Don't break user space": helps / hurts / neutral, one line each.
Matching or conflicting ADRs and precedent (link them).
Which existing CONTEXT.md concept it extends — or the new concept it would introduce.

## Options
| Option | What changes for users | Cost | Release |
|---|---|---|---|
| Decline | ... | none | — |
| Document existing workaround | ... | docs | v4.x |
| <smallest change> | ... | inputs added, code touched, ongoing burden | v4.x / v5 |
| <fuller change> | ... | ... | ... |

## Recommendation
The option, and why, in 2–4 sentences.

## Questions only you can answer
1–3 questions. Each must change the recommendation depending on the answer. If none would, say so — the decision is ready.
```

Why these rules matter:

- **Decline, docs-only and "already possible" are always options.** Agents drift toward "add an input". An input doesn't cost "No inputs required", because it defaults to the existing behavior. It is permanent maintainer burden, though, so it has to pass ADR-0002. A good brief is often "decline, here's the workaround".
- **Behavior changes users didn't configure need v5,** except the bug fixes and patch-release exceptions in ADR-0001. Mark them explicitly; an additive v4.x path is often hiding next to the breaking one (e.g. add a new input and deprecate the experimental key, flip the default later).
- **Security is a fit question.** Anything that runs user-supplied code or uses PR-head content under `pull_request_target` is a likely decline; say so plainly.
- **Questions must be decisive.** Don't ask what the code or history can answer — answer it in the brief.

For a PR, add a `## Contribution` section: does the diff match the recommended option, does it follow the ADRs and CONTEXT.md language, are README/`action.yml` input docs in sync, is `dist/` excluded.

## Mode: backlog

1. List all open issues (paginate; report the total). Skip ones already decided (labelled `accepted`/`declined`, or with a brief in `thoughts/decisions/` newer than their last comment) and the Renovate dashboard.
2. Split: **bugs** (rank by user impact — silent wrong output first) and **decisions** (feature requests, and bugs that are really feature requests).
3. Brief each decision issue. When fanning out to subagents (Opus — this is synthesis under ambiguous scope), give every agent the same ground-truth files and the list of sibling issues, so standards stay consistent and overlapping issues get cross-referenced.
4. Write `thoughts/decisions/README.md`: one row per issue — number, title, recommendation, open questions — so the maintainer can decide the batch in one sitting.

## Mode: bootstrap

Goal: turn decisions the maintainer already made into written precedent, so briefs stop judging against the three values alone.

1. Collect closed issues and PRs where the maintainer (`korthout`) explained a yes/no or a design choice: closed-as-not-planned issues, declined PRs, long design threads, review comments that changed a contribution's direction. Include git history for shape-changing commits (e.g. inputs renamed or promoted out of `experimental`).
2. Cluster into principles (e.g. "experimental features are promoted in a major version"). Each principle cites 1+ source links with the maintainer's own words quoted briefly.
3. Write candidates to `thoughts/decisions/bootstrap.md` — one per principle, each tagged *strong* (stated explicitly, repeatedly) or *inferred* (implied by one action). Do not write `docs/adr/` yet.
4. The maintainer reviews the list; accepted principles go through **record**.

## Mode: record

Once the maintainer decides:

1. Write or extend an ADR in `docs/adr/` following `.claude/skills/grill-me-with-docs/ADR-FORMAT.md` — only when the decision is reusable precedent, not for one-off yes/no calls. Add or update its row in `docs/adr/README.md`. Update `CONTEXT.md` if a term was sharpened.
2. Draft the issue reply in the maintainer's voice: decision, the reason in user terms, the workaround if declined, and for accepted issues what a contribution should look like (link the ADR). Keep it short and friendly.
3. Propose labels (`accepted`, `declined`, `needs-design`).
4. Show the draft reply and labels, and wait for approval before touching GitHub.

If the maintainer overrules the recommendation, ask for the reason in a sentence and capture it — as an ADR or a CONTEXT.md/CLAUDE.md note. Disagreements are how future briefs get calibrated; losing them means the same wrong recommendation next time.

## When the decision needs real design

If the brief ends in "needs design", hand off to the `grill-me-with-docs` skill with the brief as the starting plan, rather than designing inline.

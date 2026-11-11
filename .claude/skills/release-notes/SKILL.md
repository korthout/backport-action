---
name: release-notes
description: Use when drafting the release notes for a backport-action release ("draft the release notes for v4.8.0"), after the Release workflow has pushed the tag.
---

# Release notes

Draft the notes for a release that the Release workflow has tagged, and put them in a draft GitHub release for the maintainer to edit and publish. The skill never publishes.

GitHub's generated notes are the starting point, but they credit the wrong pull requests: on `release-vN`, every change arrives through a backport pull request authored by the bot, so the original pull request and its author disappear. The skill restores them.

Asking for the notes is the approval to create or update the draft release. Every other GitHub write, such as adding a label, needs the maintainer's explicit approval first. Never publish the release.

Use the domain terms in [CONTEXT.md](../../../CONTEXT.md): **original pull request**, **backport pull request**, **PR author**.

## 1. Find the range

The input is the new tag, e.g. `v4.8.0`. List the release tags on `origin`. Only full `vX.Y.Z` tags count, not `v4`, `v4.7`, `v4.next-preview` or `backup/…`:

```
git ls-remote --tags --refs origin 'v*' | sed 's|.*refs/tags/||' \
  | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | sort -V
```

Don't rely on `git fetch --tags`: it rejects the moved `vN.next-preview` tags and exits non-zero. If the new tag isn't listed, stop: the Release workflow hasn't run yet.

The previous tag is the highest release tag lower than the new one, by semver.

This gives the previous patch for a patch (`v4.7.0` → `v4.7.1`), the latest patch of the previous minor for a minor (`v4.7.1` → `v4.8.0`), and the latest release of the previous major for a major (`v4.8.x` → `v5.0.0`). Don't use ancestry or dates: `release-vN` and `main` diverge, so the nearest ancestor tag can be a release older than the one users have.

## 2. Start from GitHub's generated notes

```
gh api repos/korthout/backport-action/releases/generate-notes \
  -f tag_name=<new tag> -f previous_tag_name=<previous tag> -q .body
```

Each entry reads `* <title> by @<login> in <pull request url>`. Keep their order; every section below lists its entries in this order, except What's Changed (see step 7). Discard GitHub's New Contributors section and rebuild it in step 6.

## 3. Resolve each entry to its original pull request

```
gh pr view <n> --json number,title,url,author,baseRefName,body,labels,commits,files
```

- **Base `main`** (or any branch other than `release-vN`): the entry is an original pull request. Keep it as it is. Releases from `main`, and pull requests merged before `release-vN` was cut, look like this.
- **Base `release-vN`**: the entry is a backport pull request. Its description starts with `Backport of #<original> to \`release-vN\`.` Look up the original pull request with the same `gh pr view`. If the description doesn't name one, keep the entry as it is and list it in the report. Don't guess.

A backport pull request was **backported with changes** when either is true:

- It was drafted with conflicts. Its timeline has a `ready_for_review` event:
  `gh api --paginate repos/korthout/backport-action/issues/<backport>/timeline -q '.[].event'`
- It has a commit whose message lacks the `(cherry picked from commit …)` trailer. The action cherry-picks with `-x`, so such a commit was added by hand. The conflict commit (`BACKPORT-CONFLICT`) is one of them.

Skipped commits don't count: the target branch already had those changes, so users get the same behavior. Don't compare commit counts either; a squash-merged original breaks that.

Write the entry from the original pull request:

```
* <original title> by @<original author> in <original url>, backported in <backport url>
* <original title> by @<original author> in <original url>, backported with changes in <backport url>
```

Credit the original pull request's author, even when the maintainer finished it (see [take-over-contribution](../take-over-contribution/SKILL.md)). For a bot author, write the login as GitHub's generated notes do, e.g. `@renovate[bot]`.

## 4. Leave out what didn't ship

- **A dependency bump that a later pull request in the range undoes.** For example, #750 bumped `@types/node` to v26, and #786 pinned Node.js back to the action's runtime. Read the diffs; the undoing pull request rarely says "revert". Leave out the bump. Leave out a pure revert too, but keep an undoing pull request that does more, as #786 did under Maintenance changes.
- **In a major release, changes the previous major already shipped.** The range then spans `main` and `release-vN`, which diverged, so an original on `main` shows up even when its backport was released in vN. Leave it out when one of its backport pull requests (search for `Backport of #<original>` in merged pull requests to `release-vN`) has its merge commit in the previous tag: `git merge-base --is-ancestor <merge commit> <previous tag>`.

List everything left out, with the reason, in the report.

## 5. Sort entries into sections

Sort by the original pull request. The first matching row wins: #744 is labeled `maintenance` but only removes a dependency, so it goes under Updated dependencies.

| Original pull request | Section |
|---|---|
| Authored by Renovate, or only changes dependencies (e.g. #744 removed an unused one) | Updated dependencies |
| Labeled `maintenance` | Maintenance changes |
| Labeled `bug`, `enhancement` or `documentation` | What's Changed |

Use the original's labels, not the backport's: a backport pull request doesn't reliably carry them. When the original has no type label, decide by the same split, which is whether a user of the action would notice the change. Then propose the label its issue template would give (see AGENTS.md); add it only after the maintainer approves.

## 6. Credit new contributors

List an author under New Contributors when the original pull request in this release is their first merged pull request in the repository. Skip bots.

```
gh pr list --author <login> --state merged --limit 1000 --json number,mergedAt
```

Their first merged pull request is the one with the earliest `mergedAt`. When it isn't in this release, they were credited in an earlier one, or will be in the release that ships it. An author whose first pull request waits on `main` for the next major is listed in that major, not in a minor that ships a later backported pull request of theirs.

```
* @<login> made their first contribution in <original url>
```

## 7. Draft the intro

For each entry under What's Changed, draft prose from the original pull request's description, the issue it closes, and the README. Put each change's entry right after its prose, so readers find the reference where they read about the change. Order the changes by how much they matter to users: bug fixes and enhancements before documentation. Describe what the pull request changed: a documentation pull request explains something users could already do, so don't present it as new behavior. Follow [v4.7.0](https://github.com/korthout/backport-action/releases/tag/v4.7.0) and [v4.7.1](https://github.com/korthout/backport-action/releases/tag/v4.7.1):

1. Thank the contributor, when the author isn't the maintainer: "Thanks to a contribution by @<login>, …".
2. What went wrong before, as the user saw it.
3. What happens now.
4. Where the comment on the original pull request changed, an example as it appears with `comment_style: summary`, quoted, with made-up branches like `stable/8.7`. Take the row format from `formatStatusCell` in `src/comments.ts`; don't invent it.
5. What users need to do, if anything ("No configuration needed").
6. Why it ships in this version, when that isn't obvious, e.g. "a bug fix released in a new minor version to avoid surprising users with new behavior".

Say "pull request", not "PR".

For a major release, lead with what users must change before upgrading, as [MAJOR-RELEASE.md](../../../docs/MAJOR-RELEASE.md) asks: collect the migration notes from the breaking pull requests. Where a breaking pull request has none, draft one and say so in the report.

## 8. Assemble the notes

Leave out a section that has no entries. Without user-facing changes there is no intro and no What's Changed heading.

```md
## What's Changed

<prose for a change>

<its entry>

<prose for the next change>

<its entry>

## New Contributors
<entries>

## Updated dependencies
<entries>

## Maintenance changes
<entries>

**Full Changelog**: https://github.com/korthout/backport-action/compare/<previous tag>...<new tag>
```

## 9. Create or update the draft release

Write the notes to a file in the scratchpad. Find an existing release for the tag; drafts aren't returned by tag lookups, so list them:

```
gh api --paginate repos/korthout/backport-action/releases \
  -q '.[] | select(.tag_name == "<new tag>") | {id, draft, html_url}'
```

- **Published release:** stop. Show the notes instead of overwriting.
- **Draft:** update it, so a re-run doesn't create a second one:
  `gh api -X PATCH repos/korthout/backport-action/releases/<id> -f name="Backport-action <new tag>" -F body=@<file>`
- **None:** create it:
  `gh release create <new tag> --draft --verify-tag --title "Backport-action <new tag>" --notes-file <file>`

When a release of a higher major exists, add `--latest=false`, so a v4 patch released after v5.0.0 doesn't become the latest release. Remind the maintainer to keep "Set as the latest release" unticked when publishing.

## 10. Report

Give the draft release's URL, then list:

- entries left out, and why
- backport pull requests whose original wasn't found
- entries sorted without a type label, with the label to add; wait for approval before adding any
- for a major release, migration notes the skill drafted
- contributors to thank on their pull request once the release is published (take-over-contribution, step 5)

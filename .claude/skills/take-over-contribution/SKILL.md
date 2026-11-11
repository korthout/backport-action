---
name: take-over-contribution
description: Use when the maintainer takes over a contributor's pull request ("take over #N").
---

# Take over a contribution

The maintainer finishes the contributor's pull request on their branch. The contributor keeps their pull request and their authorship, and sees exactly what changed and why. [#793](https://github.com/korthout/backport-action/pull/793) is the worked example for every step below.

Never push, retitle, edit, label, comment, approve, or queue without the maintainer's explicit approval. Draft each GitHub write first.

## 1. Check that we can push

```
gh pr view <n> --json maintainerCanModify,headRepositoryOwner,headRefName,headRefOid
```

If `maintainerCanModify` is false, stop. Draft a comment asking the contributor to enable "Allow edits by maintainers". Don't open a replacement pull request: it loses the contributor's pull request, its review history, and GitHub's automatic credit in the release notes.

Record `headRefOid` as `<original head sha>`.

## 2. Keep the contributor's commits

`gh pr checkout <n>`. The contributor's commits keep their author, title, and diff, even when the title doesn't follow this repo's conventions (e.g. a `fix:` prefix). Don't amend their changes, squash them, or rebase onto `main` unless a conflict requires it. Mention a rebase in the takeover comment.

The one exception is `dist/`, which must not be in the pull request (see [docs/CI.md](../../../docs/CI.md)). Drop it from each commit that touches it: `git checkout <commit>^ -- dist/` and `git commit --amend`, which keeps the author (for several commits, `git rebase --exec`). Drop a commit that only touched `dist/`. Append to each amended commit's body:

```
The maintainer dropped the dist/ changes from the original
commit <original commit sha>. The Publish workflow rebuilds dist/ after merge.
Including dist/ in a pull request makes backporting conflict, because
dist/ differs across branches (see docs/CI.md).
```

## 3. Address each concern in its own commit

One commit per concern, with a body that explains why, so the contributor can follow each adjustment. Follow AGENTS.md for titles, docs, and tests (see [docs/TESTING.md](../../../docs/TESTING.md)). Run `npm run all`.

A pre-existing bug found along the way gets its own issue (AGENTS.md, "Reviewing contributions"); don't fix it here.

## 4. Publish the takeover

After approval:

1. Push: `git push <contributor-remote> HEAD:<branch> --force-with-lease=<branch>:<original head sha>`.
2. Retitle the pull request in this repo's style.
3. Rewrite the description like #793's: lead with what users can now do (example and output), then Impact, How it works, Alternatives, How we know.
4. Label it (`backport release-vN` or `breaking`, see CONTRIBUTING.md).
5. Comment: thank them, say we're happy to receive it, and list one bullet per adjustment commit with why. Mention any issue filed for a pre-existing bug.
6. Approve, thanking them for something specific to their contribution.
7. Queue with `@mergifyio queue`.

## 5. Credit them

In the release notes, lead the entry with the credit, like [v4.7.1](https://github.com/korthout/backport-action/releases/tag/v4.7.1): "Thanks to a contribution by @<contributor>, …". After the release, comment on the pull request: "Released in [vX.Y.Z](…). Thanks again @<contributor>!"

# Reporting and failure

The action can backport to several target branches in one run, and some may succeed while others fail. Users need to know what it did without the job status misleading them.

**Report what the action did and tried, including skips and no-ops, even when that's noisy.** Users who find a report noisy should filter the job with `if:` in the workflow. The action doesn't go quiet.

- [#631](https://github.com/korthout/backport-action/pull/631#issuecomment-4385694739): *"transparency is more important than reducing noise."*
- [#705](https://github.com/korthout/backport-action/pull/705#pullrequestreview-5275079009): skipped commits are named in the summary comment and in a backport pull request comment.
- #636 added the recommended filter to the README examples.

**A misconfiguration fails the job before backporting starts.** No backport could succeed, so failing fast is the only useful outcome. Missing permissions count as a misconfiguration too. Today they only surface partway through, as a failed backport. Detecting them up front isn't a breaking change (ADR-0001): the old behavior is unusable, because missing permissions never produce a successful backport.

**A failed backport doesn't fail the job by default.** It is reported per target branch ([#343](https://github.com/korthout/backport-action/issues/343#issuecomment-1570782481)). An opt-in to fail the job on failed backports is acceptable ([#647](https://github.com/korthout/backport-action/issues/647)) under two conditions:

- Its documentation states that a failed job may still have created some backport pull requests.
- It is an input rather than left to the action's outputs, because only the action can stop at the first failed backport. That matters most if workflow authors can also choose the order of target branches, which is not yet supported.

**In a future major release, the summary comment replaces the `legacy` comment style (one comment per target branch).** The aim is to remove `legacy` entirely, to reduce code complexity. It returns as an option only if users show they need it (ADR-0002).
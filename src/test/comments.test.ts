import { describe, it, expect } from "vitest";

import {
  CommentContext,
  formatInitialComment,
  formatNoTargetsComment,
  formatRunComment,
  formatSingleTargetComment,
} from "../comments.js";
import {
  CheckoutError,
  CherryPickError,
  CreatePRError,
  GitPushError,
  TargetResult,
} from "../errors.js";
import { GitRefNotFoundError } from "../git.js";

const context: CommentContext = {
  runId: "12345",
  runUrl: "https://github.com/owner/repo/actions/runs/12345",
};

function failed(
  targetBranch: string,
  error: Error,
): Extract<TargetResult, { status: "failed" }> {
  return { status: "failed", targetBranch, error };
}

describe("formatSingleTargetComment", () => {
  it("CheckoutError: includes backport branch and commit SHAs", () => {
    const out = formatSingleTargetComment(
      failed(
        "main",
        new CheckoutError("checkout failed", "backport-42-to-main", [
          "sha1",
          "sha2",
        ]),
      ),
      context,
    );

    expect(out).toContain("unable to create backport branch");
    expect(out).toContain("backport-42-to-main");
    expect(out).toContain("sha1 sha2");
    expect(out).toContain("main");
  });

  it("CherryPickError: includes failed commit SHAs and branch", () => {
    const out = formatSingleTargetComment(
      failed(
        "stable/8.0",
        new CherryPickError("cherry-pick failed", "backport-42-to-8.0", [
          "abc",
          "def",
        ]),
      ),
      context,
    );

    expect(out).toContain("unable to cherry-pick");
    expect(out).toContain("stable/8.0");
    expect(out).toContain("backport-42-to-8.0");
    expect(out).toContain("abc def");
  });

  it("GitPushError: includes branch, remote, and exit code with PAT recovery", () => {
    const out = formatSingleTargetComment(
      failed(
        "stable/7.8",
        new GitPushError("push failed", "backport-42-to-7.8", "origin", 128),
      ),
      context,
    );

    expect(out).toContain("push failed");
    expect(out).toContain("backport-42-to-7.8");
    expect(out).toContain("origin");
    expect(out).toContain("128");
    expect(out).toContain("Personal Access Token");
  });

  it("CreatePRError: includes status and response message when available", () => {
    const out = formatSingleTargetComment(
      failed(
        "main",
        new CreatePRError("validation failed", 422, '{"message":"bad"}'),
      ),
      context,
    );

    expect(out).toContain("failed to create pull request");
    expect(out).toContain("422");
    expect(out).toContain('{"message":"bad"}');
  });

  it("GitRefNotFoundError: includes ref name", () => {
    const out = formatSingleTargetComment(
      failed(
        "nonexistent",
        new GitRefNotFoundError("not found", "nonexistent"),
      ),
      context,
    );

    expect(out).toContain("target branch not found");
    expect(out).toContain("nonexistent");
  });

  it("plain Error: directs to workflow run logs", () => {
    const out = formatSingleTargetComment(
      failed("main", new Error("something broke")),
      context,
    );

    expect(out).toContain("unexpected failure");
    expect(out).toContain("workflow run logs");
    expect(out).toContain("github.com/korthout/backport-action/issues");
  });
});

describe("formatRunComment", () => {
  it("single success: table renders with PR link in status cell", () => {
    const results: TargetResult[] = [
      {
        status: "success",
        targetBranch: "main",
        newPrNumber: 123,
        branchname: "backport-42-to-main",
      },
    ];
    const out = formatRunComment(results, [], context);

    expect(out).toContain("backported this pull request");
    expect(out).toContain("workflow run 12345");
    expect(out).toContain("| Target | Status |");
    expect(out).toContain(":white_check_mark: Created #123");
    expect(out).not.toContain("<details>");
  });

  it("multiple failed targets: one details block per failure, in table order", () => {
    const results: TargetResult[] = [
      failed(
        "stable/8.0",
        new CherryPickError("cp", "backport-42-to-8.0", ["abc"]),
      ),
      failed(
        "stable/7.8",
        new GitPushError("push", "backport-42-to-7.8", "origin", 128),
      ),
    ];
    const out = formatRunComment(results, [], context);

    const detailsBlocks = out.match(/<details>[\s\S]*?<\/details>/g);
    expect(detailsBlocks).toHaveLength(2);
    expect(detailsBlocks![0]).toContain("stable/8.0");
    expect(detailsBlocks![0]).toContain("unable to cherry-pick");
    expect(detailsBlocks![1]).toContain("stable/7.8");
    expect(detailsBlocks![1]).toContain("push failed");
  });

  it("all targets failed: intro is 'failed to backport'", () => {
    const results: TargetResult[] = [
      failed(
        "stable/8.0",
        new CherryPickError("cp", "backport-42-to-8.0", ["abc"]),
      ),
      failed(
        "stable/7.8",
        new GitPushError("push", "backport-42-to-7.8", "origin", 128),
      ),
    ];
    const out = formatRunComment(results, [], context);

    expect(out).toContain("failed to backport this pull request");
    expect(out).not.toContain("completed backporting");
    expect(out).not.toContain("is backporting");
  });

  it("mixed success and failure: intro reports completion with failures", () => {
    const results: TargetResult[] = [
      {
        status: "success",
        targetBranch: "main",
        newPrNumber: 100,
        branchname: "b1",
      },
      failed(
        "stable/8.0",
        new CherryPickError("cp", "backport-42-to-8.0", ["abc"]),
      ),
    ];
    const out = formatRunComment(results, [], context);

    expect(out).toContain(
      "completed backporting this pull request with failures",
    );
    expect(out).not.toContain("failed to backport");
  });

  it("failure mixed with skip: intro reports completion with failures", () => {
    const results: TargetResult[] = [
      failed(
        "stable/8.0",
        new CherryPickError("cp", "backport-42-to-8.0", ["abc"]),
      ),
      {
        status: "skipped",
        targetBranch: "stable/7.9",
        reason: "PR already exists",
      },
    ];
    const out = formatRunComment(results, [], context);

    expect(out).toContain(
      "completed backporting this pull request with failures",
    );
    expect(out).not.toContain("failed to backport");
  });

  it("success_with_conflicts is not a failure for intro wording", () => {
    const results: TargetResult[] = [
      {
        status: "success_with_conflicts",
        targetBranch: "main",
        newPrNumber: 200,
        branchname: "b1",
        uncommittedShas: ["abc"],
      },
    ];
    const out = formatRunComment(results, [], context);

    expect(out).toContain("backported this pull request");
    expect(out).not.toContain("with failures");
    expect(out).not.toContain("failed to backport");
  });

  it("mix of statuses: only failures get details blocks", () => {
    const results: TargetResult[] = [
      {
        status: "success",
        targetBranch: "main",
        newPrNumber: 100,
        branchname: "b1",
      },
      failed(
        "stable/8.0",
        new CherryPickError("cp", "backport-42-to-8.0", ["abc"]),
      ),
      {
        status: "skipped",
        targetBranch: "stable/7.9",
        reason: "PR already exists",
      },
    ];
    const out = formatRunComment(results, ["stable/7.7"], context);

    expect(out).toContain(":white_check_mark: Created #100");
    expect(out).toContain(":x: Failed");
    expect(out).toContain(":heavy_minus_sign: Skipped (PR already exists)");
    expect(out).toContain(":hourglass: Pending");
    // exactly one details block (the failed one)
    expect(out.match(/<details>/g)).toHaveLength(1);
  });

  it("all targets completed (successes only): backported intro, no pending", () => {
    const results: TargetResult[] = [
      {
        status: "success",
        targetBranch: "main",
        newPrNumber: 100,
        branchname: "b1",
      },
      {
        status: "success",
        targetBranch: "stable/8.2",
        newPrNumber: 101,
        branchname: "b2",
      },
    ];
    const out = formatRunComment(results, [], context);

    expect(out).toContain("backported this pull request");
    expect(out).not.toContain(":hourglass:");
  });

  it("all targets completed (all skipped): no details blocks", () => {
    const results: TargetResult[] = [
      { status: "skipped", targetBranch: "main", reason: "PR already exists" },
      {
        status: "skipped",
        targetBranch: "stable/8.2",
        reason: "PR already exists",
      },
    ];
    const out = formatRunComment(results, [], context);

    expect(out).toContain("backported this pull request");
    expect(out).toContain(":heavy_minus_sign: Skipped");
    expect(out).not.toContain("<details>");
  });

  it("all targets pending: progressive intro and all rows pending", () => {
    const out = formatRunComment([], ["main", "stable/8.2"], context);

    expect(out).toContain("is backporting this pull request");
    expect(out).toContain(":hourglass: Pending");
    expect(out.match(/:hourglass: Pending/g)).toHaveLength(2);
  });

  it("error with empty pendingTargets: intro + error message, no table", () => {
    const out = formatRunComment(
      [],
      [],
      context,
      "Only merged pull requests can be backported.",
    );

    expect(out).toContain("failed to backport this pull request");
    expect(out).toContain("Only merged pull requests");
    expect(out).not.toContain("| Target |");
  });

  it("error with non-empty pendingTargets: intro + error + pending table", () => {
    const out = formatRunComment(
      [],
      ["main", "stable/8.2"],
      context,
      "Could not resolve commits to cherry-pick.",
    );

    expect(out).toContain("failed to backport this pull request");
    expect(out).toContain("Could not resolve commits");
    expect(out).toContain(":hourglass: Pending");
  });

  it("table uses two columns: PR link merged into status cell", () => {
    const results: TargetResult[] = [
      {
        status: "success",
        targetBranch: "main",
        newPrNumber: 123,
        branchname: "b1",
      },
    ];
    const out = formatRunComment(results, [], context);

    expect(out).toContain("| Target | Status |");
    expect(out).not.toContain("| PR |");
  });

  it("success_with_conflicts: warning emoji, PR link, no details block", () => {
    const results: TargetResult[] = [
      {
        status: "success_with_conflicts",
        targetBranch: "main",
        newPrNumber: 200,
        branchname: "b1",
        uncommittedShas: ["abc"],
      },
    ];
    const out = formatRunComment(results, [], context);

    expect(out).toContain(":warning: Drafted with conflicts #200");
    expect(out).not.toContain("<details>");
  });
});

describe("formatNoTargetsComment", () => {
  it("does not claim the PR was backported or that backport failed", () => {
    const out = formatNoTargetsComment(context);

    expect(out).not.toContain("backported this pull request");
    expect(out).not.toContain("failed to backport");
    expect(out).not.toContain("is backporting");
  });

  it("intro states no target branches were found and links the run", () => {
    const out = formatNoTargetsComment(context);

    expect(out).toContain(
      `[Backport-action](https://github.com/korthout/backport-action) found no target branches to backport this pull request to in [workflow run ${context.runId}](${context.runUrl}).`,
    );
  });

  it("explains the two reasons no targets were found", () => {
    const out = formatNoTargetsComment(context);

    expect(out).toContain(
      "This can happen when the pull request has no labels matching `label_pattern`, or when no `target_branches` were configured.",
    );
  });

  it("hints at workflow-level filtering to avoid unnecessary runs", () => {
    const out = formatNoTargetsComment(context);

    expect(out).toContain(
      "To avoid unnecessary action runs, update your workflow so this action only runs for PRs that should be backported, such as PRs with a matching backport label or runs with explicit `target_branches`.",
    );
  });

  it("renders no result table", () => {
    const out = formatNoTargetsComment(context);

    expect(out).not.toContain("| Target |");
    expect(out).not.toContain(":hourglass: Pending");
  });
});

describe("formatInitialComment", () => {
  it("renders the early-run placeholder", () => {
    const out = formatInitialComment(context);

    expect(out).toContain("is backporting this pull request");
    expect(out).toContain("workflow run 12345");
    expect(out).not.toContain("| Target |");
  });
});

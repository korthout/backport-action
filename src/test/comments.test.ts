import { describe, expect, it } from "vitest";
import { formatRunComment, type CommentContext } from "../comments.js";
import { GitRefNotFoundError } from "../git.js";
import {
  CheckoutError,
  CherryPickError,
  CreatePRError,
  GitPushError,
  type TargetResult,
} from "../errors.js";

const context: CommentContext = {
  runId: "12345",
  runUrl: "https://github.com/owner/repo/actions/runs/12345",
};

describe("formatRunComment", () => {
  describe("introduction text", () => {
    it("shows 'is backporting' when no results and no pending targets", () => {
      const result = formatRunComment([], [], context);
      expect(result).toContain("is backporting this pull request");
    });

    it("shows 'is backporting' when targets are pending", () => {
      const result = formatRunComment([], ["stable/8.2"], context);
      expect(result).toContain("is backporting this pull request");
    });

    it("shows 'backported' when all targets are resolved", () => {
      const results: TargetResult[] = [
        { status: "success", targetBranch: "stable/8.2", newPrNumber: 123 },
      ];
      const result = formatRunComment(results, [], context);
      expect(result).toContain(") backported this pull request");
    });

    it("shows 'failed to backport' when error is set", () => {
      const result = formatRunComment(
        [],
        [],
        context,
        "Only merged pull requests can be backported.",
      );
      expect(result).toContain("failed to backport this pull request");
    });

    it("always links to workflow run", () => {
      const result = formatRunComment([], [], context);
      expect(result).toContain(
        "[workflow run 12345](https://github.com/owner/repo/actions/runs/12345)",
      );
    });

    it("always links to the action repo", () => {
      const result = formatRunComment([], [], context);
      expect(result).toContain(
        "[Backport-action](https://github.com/korthout/backport-action)",
      );
    });
  });

  describe("table rendering", () => {
    it("renders no table when no results and no pending targets", () => {
      const result = formatRunComment([], [], context);
      expect(result).not.toContain("| Target |");
    });

    it("renders all pending targets with hourglass", () => {
      const result = formatRunComment(
        [],
        ["stable/8.2", "stable/8.1"],
        context,
      );
      expect(result).toContain("| `stable/8.2` | :hourglass: Pending |");
      expect(result).toContain("| `stable/8.1` | :hourglass: Pending |");
    });

    it("renders success with PR link in status cell", () => {
      const results: TargetResult[] = [
        { status: "success", targetBranch: "stable/8.2", newPrNumber: 123 },
      ];
      const result = formatRunComment(results, [], context);
      expect(result).toContain(
        "| `stable/8.2` | :white_check_mark: Created #123 |",
      );
    });

    it("renders success_with_conflicts with PR link", () => {
      const results: TargetResult[] = [
        {
          status: "success_with_conflicts",
          targetBranch: "stable/8.1",
          newPrNumber: 124,
          uncommittedShas: ["abc123"],
        },
      ];
      const result = formatRunComment(results, [], context);
      expect(result).toContain(
        "| `stable/8.1` | :warning: Drafted with conflicts #124 |",
      );
    });

    it("renders skipped with reason inline", () => {
      const results: TargetResult[] = [
        {
          status: "skipped",
          targetBranch: "stable/7.9",
          reason: "PR already exists",
        },
      ];
      const result = formatRunComment(results, [], context);
      expect(result).toContain(
        "| `stable/7.9` | :heavy_minus_sign: Skipped (PR already exists) |",
      );
    });

    it("renders failed with x mark", () => {
      const results: TargetResult[] = [
        {
          status: "failed",
          targetBranch: "stable/8.0",
          error: new CherryPickError("cherry-pick failed", ["abc"]),
        },
      ];
      const result = formatRunComment(results, [], context);
      expect(result).toContain("| `stable/8.0` | :x: Failed |");
    });

    it("uses two columns: Target and Status", () => {
      const result = formatRunComment([], ["stable/8.2"], context);
      expect(result).toContain("| Target | Status |");
      expect(result).toContain("|--------|--------|");
    });
  });

  describe("details sections for failures", () => {
    it("renders details for CheckoutError", () => {
      const results: TargetResult[] = [
        {
          status: "failed",
          targetBranch: "stable/8.0",
          error: new CheckoutError("checkout failed", "backport-42-to-stable"),
        },
      ];
      const result = formatRunComment(results, [], context);
      expect(result).toContain(
        "<details><summary>:x: stable/8.0 — unable to create branch</summary>",
      );
      expect(result).toContain(
        "backport branch `backport-42-to-stable`",
      );
    });

    it("renders details for CherryPickError", () => {
      const results: TargetResult[] = [
        {
          status: "failed",
          targetBranch: "stable/8.0",
          error: new CherryPickError("cherry-pick failed", [
            "abc123",
            "def456",
          ]),
        },
      ];
      const result = formatRunComment(results, [], context);
      expect(result).toContain(
        "<details><summary>:x: stable/8.0 — unable to cherry-pick</summary>",
      );
      expect(result).toContain("cherry-pick commits onto `stable/8.0`");
      expect(result).toContain("git cherry-pick -x abc123 def456");
    });

    it("renders details for GitPushError", () => {
      const results: TargetResult[] = [
        {
          status: "failed",
          targetBranch: "stable/8.0",
          error: new GitPushError("push failed", "backport-42", "origin", 128),
        },
      ];
      const result = formatRunComment(results, [], context);
      expect(result).toContain(
        "<details><summary>:x: stable/8.0 — push failed</summary>",
      );
      expect(result).toContain("`origin`");
      expect(result).toContain("exit code 128");
      expect(result).toContain("PAT with `repo` scope");
    });

    it("renders details for CreatePRError", () => {
      const results: TargetResult[] = [
        {
          status: "failed",
          targetBranch: "stable/8.0",
          error: new CreatePRError("PR creation failed", 422, "Validation Failed"),
        },
      ];
      const result = formatRunComment(results, [], context);
      expect(result).toContain(
        "<details><summary>:x: stable/8.0 — failed to create PR</summary>",
      );
      expect(result).toContain("HTTP 422");
      expect(result).toContain("Validation Failed");
    });

    it("renders details for GitRefNotFoundError", () => {
      const results: TargetResult[] = [
        {
          status: "failed",
          targetBranch: "stable/8.0",
          error: new GitRefNotFoundError("not found", "stable/8.0"),
        },
      ];
      const result = formatRunComment(results, [], context);
      expect(result).toContain(
        "<details><summary>:x: stable/8.0 — ref not found</summary>",
      );
      expect(result).toContain("fetch `stable/8.0`");
    });

    it("renders details for unknown Error", () => {
      const results: TargetResult[] = [
        {
          status: "failed",
          targetBranch: "stable/8.0",
          error: new Error("something unexpected"),
        },
      ];
      const result = formatRunComment(results, [], context);
      expect(result).toContain(
        "<details><summary>:x: stable/8.0 — unexpected error</summary>",
      );
      expect(result).toContain("workflow run logs");
      expect(result).toContain(
        "https://github.com/korthout/backport-action/issues",
      );
    });

    it("no details section for success", () => {
      const results: TargetResult[] = [
        { status: "success", targetBranch: "stable/8.2", newPrNumber: 123 },
      ];
      const result = formatRunComment(results, [], context);
      expect(result).not.toContain("<details>");
    });

    it("no details section for success_with_conflicts", () => {
      const results: TargetResult[] = [
        {
          status: "success_with_conflicts",
          targetBranch: "stable/8.1",
          newPrNumber: 124,
          uncommittedShas: ["abc"],
        },
      ];
      const result = formatRunComment(results, [], context);
      expect(result).not.toContain("<details>");
    });

    it("no details section for skipped", () => {
      const results: TargetResult[] = [
        {
          status: "skipped",
          targetBranch: "stable/7.9",
          reason: "PR already exists",
        },
      ];
      const result = formatRunComment(results, [], context);
      expect(result).not.toContain("<details>");
    });
  });

  describe("mixed results", () => {
    it("renders multiple failed targets with individual details", () => {
      const results: TargetResult[] = [
        {
          status: "failed",
          targetBranch: "stable/8.0",
          error: new CherryPickError("cherry-pick failed", ["abc"]),
        },
        {
          status: "failed",
          targetBranch: "stable/7.8",
          error: new GitPushError("push failed", "bp-42", "origin", 128),
        },
      ];
      const result = formatRunComment(results, [], context);
      expect(result).toContain(
        "<details><summary>:x: stable/8.0 — unable to cherry-pick</summary>",
      );
      expect(result).toContain(
        "<details><summary>:x: stable/7.8 — push failed</summary>",
      );
    });

    it("renders mix of successes, failures, and pending targets", () => {
      const results: TargetResult[] = [
        { status: "success", targetBranch: "stable/8.2", newPrNumber: 123 },
        {
          status: "failed",
          targetBranch: "stable/8.0",
          error: new CherryPickError("failed", ["abc"]),
        },
      ];
      const result = formatRunComment(
        results,
        ["stable/7.8"],
        context,
      );
      expect(result).toContain("is backporting");
      expect(result).toContain(":white_check_mark: Created #123");
      expect(result).toContain("| `stable/8.0` | :x: Failed |");
      expect(result).toContain("| `stable/7.8` | :hourglass: Pending |");
      expect(result).toContain("<details><summary>:x: stable/8.0");
    });

    it("renders all skipped as backported", () => {
      const results: TargetResult[] = [
        {
          status: "skipped",
          targetBranch: "stable/8.2",
          reason: "PR already exists",
        },
        {
          status: "skipped",
          targetBranch: "stable/8.1",
          reason: "PR already exists",
        },
      ];
      const result = formatRunComment(results, [], context);
      expect(result).toContain(") backported this pull request");
      expect(result).toContain(":heavy_minus_sign: Skipped");
      expect(result).not.toContain("<details>");
    });
  });

  describe("error parameter (pre-loop failures)", () => {
    it("shows error with no table when pendingTargets is empty", () => {
      const result = formatRunComment(
        [],
        [],
        context,
        "Only merged pull requests can be backported.",
      );
      expect(result).toContain("failed to backport");
      expect(result).toContain(
        "Only merged pull requests can be backported.",
      );
      expect(result).not.toContain("| Target |");
    });

    it("shows error with pending table when pendingTargets is non-empty", () => {
      const result = formatRunComment(
        [],
        ["stable/8.2", "stable/8.1"],
        context,
        "Could not resolve commits to cherry-pick.",
      );
      expect(result).toContain("failed to backport");
      expect(result).toContain("Could not resolve commits to cherry-pick.");
      expect(result).toContain("| Target | Status |");
      expect(result).toContain("| `stable/8.2` | :hourglass: Pending |");
      expect(result).toContain("| `stable/8.1` | :hourglass: Pending |");
    });
  });
});

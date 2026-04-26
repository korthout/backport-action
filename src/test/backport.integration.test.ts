/**
 * Orchestration integration tests for Backport.run()
 *
 * These tests use a FakeGithub (stateful test double) and a mock GitApi to
 * test the orchestration logic in Backport.run() quickly and deterministically.
 *
 * ## When to add tests HERE (orchestration tests):
 *
 * - Post-creation toggles (copy_milestone, copy_assignees, add_labels, etc.)
 *   → These test that Backport.run() calls the right GitHub API method when a
 *     config flag is set. Git behavior is irrelevant.
 *
 * - Error handling paths (API failures, PR already exists, push recovery)
 *   → These test orchestration responses to errors from either boundary.
 *
 * - Output correctness (was_successful, was_successful_by_target, created_pull_numbers)
 *   → These test that outputs are set correctly based on the run outcome.
 *
 * - Template/naming features (PR title, body, branch name placeholders)
 *   → These test string substitution in createPR calls.
 *
 * - Any new feature that follows the pattern:
 *   action.yml input → Config field → if-block in run() → GitHub API call
 *
 * ## When to add tests in git.integration.test.ts (real git tests) instead:
 *
 * - Cherry-pick behavior (conflicts, multiple commits, commit ordering)
 * - Branch operations (checkout, fetch, push to real remotes)
 * - Merge commit detection
 * - Any scenario where the TEST VALUE comes from real git behavior,
 *   not from how Backport.run() reacts to a mocked return value
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Backport } from "../backport.js";
import { GitPushError } from "../errors.js";
import { GitRefNotFoundError } from "../git.js";
import { MergeStrategy } from "../github.js";
import { FakeGithub, requestError } from "./helpers/fake-github.js";
import { createMockGit } from "./helpers/mock-git.js";
import { makeConfig } from "./helpers/config.js";

vi.mock("@actions/core", () => ({
  setFailed: vi.fn(),
  setOutput: vi.fn(),
}));

import * as core from "@actions/core";

describe("Backport.run() orchestration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("core behavior", () => {
    it("happy path: creates backport PR and posts success comment", async () => {
      const github = new FakeGithub();
      const git = createMockGit();
      const config = makeConfig();
      const backport = new Backport(github, config, git);
      await backport.run();

      expect(github.createdPRs).toHaveLength(1);
      expect(github.comments).toContainEqual(
        expect.objectContaining({
          body: expect.stringContaining("Successfully created backport PR"),
        }),
      );
      expect(core.setOutput).toHaveBeenCalledWith("was_successful", true);

      // No post-creation side-effects when all toggles are off
      expect(github.milestonesByPR.size).toBe(0);
      expect(github.assigneesByPR.size).toBe(0);
      expect(github.reviewersByPR.size).toBe(0);
      expect(github.teamReviewersByPR.size).toBe(0);
      expect(github.labelsByPR.size).toBe(0);
      expect(github.autoMergeByPR.size).toBe(0);
    });

    it("multiple targets: creates two backport PRs", async () => {
      const github = new FakeGithub({
        sourcePr: {
          labels: [{ name: "backport main" }, { name: "backport release" }],
        },
      });
      const git = createMockGit();
      const config = makeConfig();
      const backport = new Backport(github, config, git);
      await backport.run();

      expect(github.createdPRs).toHaveLength(2);
    });

    it("no matching labels: no PRs created, no comments", async () => {
      const github = new FakeGithub({
        sourcePr: { labels: [{ name: "bug" }] },
      });
      const git = createMockGit();
      const config = makeConfig();
      const backport = new Backport(github, config, git);
      await backport.run();

      expect(github.createdPRs).toHaveLength(0);
      expect(github.comments).toHaveLength(0);
    });

    it("unmerged PR: posts 'not merged' comment, no PRs", async () => {
      const github = new FakeGithub({ merged: false });
      const git = createMockGit();
      const config = makeConfig();
      const backport = new Backport(github, config, git);
      await backport.run();

      expect(github.createdPRs).toHaveLength(0);
      expect(github.comments).toContainEqual(
        expect.objectContaining({
          body: expect.stringContaining("Only merged pull requests"),
        }),
      );
    });

    it("partial failure: one PR created, one failure, was_successful = false", async () => {
      let cherryPickCallCount = 0;
      const github = new FakeGithub({
        sourcePr: {
          labels: [{ name: "backport main" }, { name: "backport release" }],
        },
      });
      const git = createMockGit({
        cherryPick: vi.fn().mockImplementation(async () => {
          cherryPickCallCount++;
          if (cherryPickCallCount === 1) return null;
          throw new Error("cherry-pick failed");
        }),
      });
      const config = makeConfig();
      const backport = new Backport(github, config, git);
      await backport.run();

      expect(github.createdPRs).toHaveLength(1);
      expect(core.setOutput).toHaveBeenCalledWith("was_successful", false);
    });

    it("RequestError in post-creation step: continues with remaining steps", async () => {
      const github = new FakeGithub({
        sourcePr: {
          milestone: { number: 1, id: 1, title: "v1" },
          assignees: [{ login: "user1", id: 1 }],
        },
      });
      github.failOn("setMilestone", requestError(403));
      const git = createMockGit();
      const config = makeConfig({
        copy_milestone: true,
        copy_assignees: true,
      });
      const backport = new Backport(github, config, git);
      await backport.run();

      expect(github.createdPRs).toHaveLength(1);
      expect(github.milestonesByPR.size).toBe(0);
      expect(github.assigneesByPR.get(100)).toEqual(["user1"]);
      expect(github.comments).toContainEqual(
        expect.objectContaining({
          body: expect.stringContaining("Successfully created backport PR"),
        }),
      );
      expect(core.setOutput).toHaveBeenCalledWith("was_successful", true);
    });

    it("non-RequestError in post-creation step: target marked as failed", async () => {
      const github = new FakeGithub({
        sourcePr: { milestone: { number: 1, id: 1, title: "v1" } },
      });
      github.failOn("setMilestone", new Error("unexpected"));
      const git = createMockGit();
      const config = makeConfig({ copy_milestone: true });
      const backport = new Backport(github, config, git);
      await backport.run();

      expect(github.createdPRs).toHaveLength(1);
      expect(github.milestonesByPR.size).toBe(0);
      // todo: this might be a small bug, we probably should still mark it as successful as the PR was created successfully
      expect(core.setOutput).toHaveBeenCalledWith("was_successful", false);
    });
  });

  describe("fetch", () => {
    it("target branch fetch fails with GitRefNotFoundError: posts failure comment, continues", async () => {
      const github = new FakeGithub({
        sourcePr: {
          labels: [{ name: "backport nonexistent" }, { name: "backport main" }],
        },
      });
      const git = createMockGit({
        fetch: vi.fn().mockImplementation(async (ref: string) => {
          if (ref === "nonexistent") {
            throw new GitRefNotFoundError("not found", "nonexistent");
          }
        }),
      });
      const config = makeConfig();
      const backport = new Backport(github, config, git);
      await backport.run();

      expect(github.comments).toContainEqual(
        expect.objectContaining({
          body: expect.stringContaining("couldn't find remote ref"),
        }),
      );
      expect(github.createdPRs).toHaveLength(1);
    });
  });

  describe("cherry-pick", () => {
    it("pull_request_head cherry-picking: uses PR commits, not merge commit", async () => {
      const github = new FakeGithub({
        sourcePr: {
          commitShas: ["sha1", "sha2"],
          mergeCommitSha: "squash-sha",
        },
        mergeStrategyResult: MergeStrategy.SQUASHED,
      });
      const git = createMockGit();
      const config = makeConfig({
        commits: {
          cherry_picking: "pull_request_head",
          merge_commits: "fail",
        },
      });
      const backport = new Backport(github, config, git);
      await backport.run();

      expect(github.createdPRs).toHaveLength(1);
      expect(git.cherryPick).toHaveBeenCalledWith(
        ["sha1", "sha2"],
        expect.anything(),
        expect.anything(),
      );
    });

    it("cherry-pick fails: posts failure comment with manual instructions", async () => {
      const github = new FakeGithub();
      const git = createMockGit({
        cherryPick: vi.fn().mockRejectedValue(new Error("cherry-pick failed")),
      });
      const config = makeConfig();
      const backport = new Backport(github, config, git);
      await backport.run();

      expect(github.createdPRs).toHaveLength(0);
      expect(github.comments).toContainEqual(
        expect.objectContaining({
          body: expect.stringContaining("unable to cherry-pick"),
        }),
      );
    });

    it("cherry-pick with conflicts (draft mode): creates draft PR, posts conflict comment", async () => {
      const github = new FakeGithub();
      const git = createMockGit({
        cherryPick: vi.fn().mockResolvedValue(["abc123"]),
      });
      const config = makeConfig({
        experimental: { conflict_resolution: "draft_commit_conflicts" },
      });
      const backport = new Backport(github, config, git);
      await backport.run();

      expect(github.createdPRs[0].draft).toBe(true);
      expect(github.comments).toContainEqual(
        expect.objectContaining({
          body: expect.stringContaining("remaining conflicts"),
        }),
      );
    });
  });

  describe("push", () => {
    it("push fails, branch exists: recovers and creates PR", async () => {
      const github = new FakeGithub();
      const git = createMockGit({
        push: vi
          .fn()
          .mockRejectedValue(
            new GitPushError("push failed", "branch", "origin", 1),
          ),
      });
      const config = makeConfig();
      const backport = new Backport(github, config, git);
      await backport.run();

      expect(github.createdPRs).toHaveLength(1);
    });

    it("push fails, branch doesn't exist: posts failure comment", async () => {
      const github = new FakeGithub();
      const git = createMockGit({
        push: vi
          .fn()
          .mockRejectedValue(
            new GitPushError("push failed", "branch", "origin", 1),
          ),
        fetch: vi
          .fn()
          .mockResolvedValue(undefined)
          .mockImplementation(async (ref: string) => {
            if (ref.startsWith("backport-")) {
              throw new GitRefNotFoundError("not found", ref);
            }
          }),
      });
      const config = makeConfig();

      const backport = new Backport(github, config, git);
      await backport.run();

      expect(github.createdPRs).toHaveLength(0);
      expect(github.comments).toContainEqual(
        expect.objectContaining({
          body: expect.stringContaining("Git push to origin failed"),
        }),
      );
    });
  });

  describe("PR creation", () => {
    it("PR already exists (422): skips silently", async () => {
      const github = new FakeGithub({
        existingPRBranches: ["backport-42-to-main"],
      });
      const git = createMockGit();
      const config = makeConfig();
      const backport = new Backport(github, config, git);
      await backport.run();

      const failureComment = github.comments.find(
        (c) => c.body.includes("failed") || c.body.includes("Failed"),
      );
      expect(failureComment).toBeUndefined();
    });

    it("custom PR title template: replaces placeholders", async () => {
      const github = new FakeGithub();
      const git = createMockGit();
      const config = makeConfig();
      const backport = new Backport(github, config, git);
      await backport.run();

      expect(github.createdPRs[0]).toEqual(
        expect.objectContaining({ title: "[Backport main] Test PR" }),
      );
    });
  });

  describe("assignees", () => {
    it("copy assignees: assigns same users to backport PR", async () => {
      const github = new FakeGithub({
        sourcePr: { assignees: [{ login: "user1", id: 1 }] },
      });
      const git = createMockGit();
      const config = makeConfig({ copy_assignees: true });
      const backport = new Backport(github, config, git);
      await backport.run();

      expect(github.assigneesByPR.get(100)).toEqual(["user1"]);
    });

    it("add author as assignee: assigns PR author to backport PR", async () => {
      const github = new FakeGithub();
      const git = createMockGit();
      const config = makeConfig({ add_author_as_assignee: true });
      const backport = new Backport(github, config, git);
      await backport.run();

      expect(github.assigneesByPR.get(100)).toEqual(["author"]);
    });
  });

  describe("reviewers", () => {
    it("copy requested reviewers: requests same reviewers on backport PR", async () => {
      const github = new FakeGithub({
        sourcePr: { requested_reviewers: [{ login: "reviewer1" }] },
      });
      const git = createMockGit();
      const config = makeConfig({ copy_requested_reviewers: true });
      const backport = new Backport(github, config, git);
      await backport.run();

      expect(github.reviewersByPR.get(100)).toEqual(["reviewer1"]);
    });

    it("copy all reviewers: requests both requested and submitted reviewers", async () => {
      const github = new FakeGithub({
        sourcePr: { requested_reviewers: [{ login: "reviewer1" }] },
        reviews: [{ user: { login: "reviewer2" } }],
      });
      const git = createMockGit();
      const config = makeConfig({ copy_all_reviewers: true });
      const backport = new Backport(github, config, git);
      await backport.run();

      expect(github.reviewersByPR.get(100)).toEqual(
        expect.arrayContaining(["reviewer1", "reviewer2"]),
      );
      expect(github.reviewersByPR.get(100)).toHaveLength(2);
    });

    it("copy all reviewers: deduplicates reviewers appearing in both requested and submitted", async () => {
      const github = new FakeGithub({
        sourcePr: { requested_reviewers: [{ login: "reviewer1" }] },
        reviews: [{ user: { login: "reviewer1" } }],
      });
      const git = createMockGit();
      const config = makeConfig({ copy_all_reviewers: true });
      const backport = new Backport(github, config, git);
      await backport.run();

      expect(github.reviewersByPR.get(100)).toEqual(["reviewer1"]);
    });

    it("copy all reviewers: copies submitted reviewers when no reviewers are requested", async () => {
      const github = new FakeGithub({
        reviews: [{ user: { login: "submitted-reviewer" } }],
      });
      const git = createMockGit();
      const config = makeConfig({ copy_all_reviewers: true });
      const backport = new Backport(github, config, git);
      await backport.run();

      expect(github.reviewersByPR.get(100)).toEqual(["submitted-reviewer"]);
    });

    it("copy all reviewers: listReviews failure falls back to requested reviewers only", async () => {
      const github = new FakeGithub({
        sourcePr: { requested_reviewers: [{ login: "reviewer1" }] },
        reviews: [{ user: { login: "reviewer2" } }],
      });
      github.failOn("listReviews", requestError(403));
      const git = createMockGit();
      const config = makeConfig({ copy_all_reviewers: true });
      const backport = new Backport(github, config, git);
      await backport.run();

      expect(github.reviewersByPR.get(100)).toEqual(["reviewer1"]);
      expect(core.setOutput).toHaveBeenCalledWith("was_successful", true);
    });

    it("copy all reviewers and copy requested reviewers: both request reviewers independently", async () => {
      const github = new FakeGithub({
        sourcePr: { requested_reviewers: [{ login: "reviewer1" }] },
      });
      const git = createMockGit();
      const config = makeConfig({
        copy_all_reviewers: true,
        copy_requested_reviewers: true,
      });
      const backport = new Backport(github, config, git);
      await backport.run();

      expect(github.reviewersByPR.get(100)).toEqual(["reviewer1", "reviewer1"]);
    });

    it("add author as reviewer: requests PR author as reviewer on backport PR", async () => {
      const github = new FakeGithub();
      const git = createMockGit();
      const config = makeConfig({ add_author_as_reviewer: true });
      const backport = new Backport(github, config, git);
      await backport.run();

      expect(github.reviewersByPR.get(100)).toEqual(["author"]);
    });

    it("add reviewers: requests configured reviewers on backport PR", async () => {
      const github = new FakeGithub();
      const git = createMockGit();
      const config = makeConfig({ add_reviewers: ["alice", "bob"] });
      const backport = new Backport(github, config, git);
      await backport.run();

      expect(github.reviewersByPR.get(100)).toEqual(["alice", "bob"]);
    });

    it("add reviewers: deduplicates reviewers", async () => {
      const github = new FakeGithub();
      const git = createMockGit();
      const config = makeConfig({ add_reviewers: ["alice", "alice"] });
      const backport = new Backport(github, config, git);
      await backport.run();

      expect(github.reviewersByPR.get(100)).toEqual(["alice"]);
    });

    it("add reviewers: RequestError is swallowed and backport succeeds", async () => {
      const github = new FakeGithub();
      github.failOn("requestReviewers", requestError(422));
      const git = createMockGit();
      const config = makeConfig({ add_reviewers: ["alice"] });
      const backport = new Backport(github, config, git);
      await backport.run();

      expect(github.createdPRs).toHaveLength(1);
      expect(github.reviewersByPR.size).toBe(0);
      expect(core.setOutput).toHaveBeenCalledWith("was_successful", true);
    });

    it("add team reviewers: requests configured team reviewers on backport PR", async () => {
      const github = new FakeGithub();
      const git = createMockGit();
      const config = makeConfig({
        add_team_reviewers: ["team-a", "team-b"],
      });
      const backport = new Backport(github, config, git);
      await backport.run();

      expect(github.teamReviewersByPR.get(100)).toEqual(["team-a", "team-b"]);
    });

    it("add team reviewers: deduplicates team reviewers", async () => {
      const github = new FakeGithub();
      const git = createMockGit();
      const config = makeConfig({
        add_team_reviewers: ["team-a", "team-a"],
      });
      const backport = new Backport(github, config, git);
      await backport.run();

      expect(github.teamReviewersByPR.get(100)).toEqual(["team-a"]);
    });

    it("add team reviewers: RequestError is swallowed and backport succeeds", async () => {
      const github = new FakeGithub();
      github.failOn("requestReviewers", requestError(422));
      const git = createMockGit();
      const config = makeConfig({ add_team_reviewers: ["team-a"] });
      const backport = new Backport(github, config, git);
      await backport.run();

      expect(github.createdPRs).toHaveLength(1);
      expect(github.teamReviewersByPR.size).toBe(0);
      expect(core.setOutput).toHaveBeenCalledWith("was_successful", true);
    });
  });

  describe("labels", () => {
    it("copy labels: copies matching labels excluding backport labels", async () => {
      const github = new FakeGithub({
        sourcePr: {
          labels: [
            { name: "backport main" },
            { name: "bug" },
            { name: "enhancement" },
          ],
        },
      });
      const git = createMockGit();
      const config = makeConfig({ copy_labels_pattern: /.*/ });
      const backport = new Backport(github, config, git);
      await backport.run();

      const labels = github.labelsByPR.get(100);
      expect(labels).toContain("bug");
      expect(labels).toContain("enhancement");
      expect(labels).not.toContain("backport main");
    });

    it("add static labels: adds configured labels to backport PR", async () => {
      const github = new FakeGithub();
      const git = createMockGit();
      const config = makeConfig({ add_labels: ["bug"] });
      const backport = new Backport(github, config, git);
      await backport.run();

      expect(github.labelsByPR.get(100)).toEqual(["bug"]);
    });
  });

  describe("milestone", () => {
    it("copy milestone: sets milestone on backport PR", async () => {
      const github = new FakeGithub({
        sourcePr: { milestone: { number: 5, id: 123, title: "v1.0" } },
      });
      const git = createMockGit();
      const config = makeConfig({ copy_milestone: true });
      const backport = new Backport(github, config, git);
      await backport.run();

      expect(github.milestonesByPR.get(100)).toBe(5);
    });
  });

  describe("auto-merge", () => {
    it("auto-merge enabled: enables auto-merge on backport PR", async () => {
      const github = new FakeGithub();
      const git = createMockGit();
      const config = makeConfig({ auto_merge_enabled: true });
      const backport = new Backport(github, config, git);
      await backport.run();

      expect(github.autoMergeByPR.get(100)).toBe("merge");
    });
  });

  describe("outputs", () => {
    it("outputs: sets was_successful, was_successful_by_target, created_pull_numbers", async () => {
      const github = new FakeGithub();
      const git = createMockGit();
      const config = makeConfig();
      const backport = new Backport(github, config, git);
      await backport.run();

      expect(core.setOutput).toHaveBeenCalledWith("was_successful", true);
      expect(core.setOutput).toHaveBeenCalledWith(
        "was_successful_by_target",
        expect.stringContaining("main=true"),
      );
      expect(core.setOutput).toHaveBeenCalledWith(
        "created_pull_numbers",
        "100",
      );
    });
  });

  describe("downstream", () => {
    it("downstream repo: calls remoteAdd, uses 'downstream' remote", async () => {
      const github = new FakeGithub();
      const git = createMockGit();
      const config = makeConfig({
        experimental: {
          conflict_resolution: "fail",
          downstream_repo: "downstream-repo",
          downstream_owner: "downstream-owner",
        },
      });
      const backport = new Backport(github, config, git);
      await backport.run();

      expect(git.remoteAdd).toHaveBeenCalledWith(
        "/tmp",
        "downstream",
        "downstream-owner",
        "downstream-repo",
      );
      expect(git.fetch).toHaveBeenCalledWith("main", "/tmp", 1, "downstream");
      expect(git.push).toHaveBeenCalledWith(
        expect.any(String),
        "downstream",
        "/tmp",
      );
    });
  });
});

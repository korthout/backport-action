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
import { GitRefNotFoundError } from "../git.js";
import type { GitApi } from "../git.js";
import { RequestError } from "../github.js";
import { FakeGithub, type FakeGithubOptions } from "./helpers/fake-github.js";
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

  function setup(
    configOverrides?: Parameters<typeof makeConfig>[0],
    githubOptions?: FakeGithubOptions,
    gitOverrides?: Partial<GitApi>,
  ) {
    const github = new FakeGithub(githubOptions);
    const git = createMockGit(gitOverrides);
    const config = makeConfig(configOverrides);
    return { github, git, config };
  }

  it("happy path: creates backport PR and posts success comment", async () => {
    const { github, git, config } = setup();
    const backport = new Backport(github, config, git);
    await backport.run();

    expect(github.createdPRs).toHaveLength(1);
    expect(github.comments).toContainEqual(
      expect.objectContaining({
        body: expect.stringContaining("Successfully created backport PR"),
      }),
    );
    expect(core.setOutput).toHaveBeenCalledWith("was_successful", true);
  });

  it("multiple targets: creates two backport PRs", async () => {
    const { github, git, config } = setup(undefined, {
      sourcePr: {
        labels: [{ name: "backport main" }, { name: "backport release" }],
      },
    });
    const backport = new Backport(github, config, git);
    await backport.run();

    expect(github.createdPRs).toHaveLength(2);
  });

  it("no matching labels: no PRs created, no comments", async () => {
    const { github, git, config } = setup(undefined, {
      sourcePr: { labels: [{ name: "bug" }] },
    });
    const backport = new Backport(github, config, git);
    await backport.run();

    expect(github.createdPRs).toHaveLength(0);
    expect(github.comments).toHaveLength(0);
  });

  it("unmerged PR: posts 'not merged' comment, no PRs", async () => {
    const { github, git, config } = setup(undefined, { merged: false });
    const backport = new Backport(github, config, git);
    await backport.run();

    expect(github.createdPRs).toHaveLength(0);
    expect(github.comments).toContainEqual(
      expect.objectContaining({
        body: expect.stringContaining("Only merged pull requests"),
      }),
    );
  });

  it("target branch fetch fails with GitRefNotFoundError: posts failure comment, continues", async () => {
    const fetchMock = vi.fn().mockImplementation(async (ref: string) => {
      if (ref === "nonexistent") {
        throw new GitRefNotFoundError("not found", "nonexistent");
      }
    });

    const { github, git, config } = setup(
      undefined,
      {
        sourcePr: {
          labels: [{ name: "backport nonexistent" }, { name: "backport main" }],
        },
      },
      { fetch: fetchMock },
    );
    const backport = new Backport(github, config, git);
    await backport.run();

    expect(github.comments).toContainEqual(
      expect.objectContaining({
        body: expect.stringContaining("couldn't find remote ref"),
      }),
    );
    expect(github.createdPRs).toHaveLength(1);
  });

  it("cherry-pick fails: posts failure comment with manual instructions", async () => {
    const { github, git, config } = setup(undefined, undefined, {
      cherryPick: vi.fn().mockRejectedValue(new Error("cherry-pick failed")),
    });
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
    const { github, git, config } = setup(
      { experimental: { conflict_resolution: "draft_commit_conflicts" } },
      undefined,
      {
        cherryPick: vi.fn().mockResolvedValue(["abc123"]),
      },
    );
    const backport = new Backport(github, config, git);
    await backport.run();

    expect(github.createdPRs[0].draft).toBe(true);
    expect(github.comments).toContainEqual(
      expect.objectContaining({
        body: expect.stringContaining("remaining conflicts"),
      }),
    );
  });

  it("push fails, branch exists: recovers and creates PR", async () => {
    const { github, git, config } = setup(undefined, undefined, {
      push: vi.fn().mockResolvedValue(1),
    });
    const backport = new Backport(github, config, git);
    await backport.run();

    expect(github.createdPRs).toHaveLength(1);
  });

  it("push fails, branch doesn't exist: posts failure comment", async () => {
    const fetchMock = vi.fn().mockResolvedValue(undefined);
    const { github, git, config } = setup(undefined, undefined, {
      push: vi.fn().mockResolvedValue(1),
      fetch: fetchMock,
    });

    fetchMock.mockImplementation(async (ref: string) => {
      if (ref.startsWith("backport-")) {
        throw new GitRefNotFoundError("not found", ref);
      }
    });

    const backport = new Backport(github, config, git);
    await backport.run();

    expect(github.createdPRs).toHaveLength(0);
    expect(github.comments).toContainEqual(
      expect.objectContaining({
        body: expect.stringContaining("Git push to origin failed"),
      }),
    );
  });

  it("PR already exists (422): skips silently", async () => {
    const requestError = new RequestError("Validation Failed", 422, {
      response: {
        url: "",
        status: 422,
        headers: {},
        data: {
          errors: [
            {
              message:
                "A pull request already exists for test-owner:backport-42-to-main",
            },
          ],
        },
      },
      request: { method: "POST", url: "", headers: {} },
    });
    const { github, git, config } = setup(undefined, {
      overrides: {
        createPR: vi.fn().mockRejectedValue(requestError),
      },
    });
    const backport = new Backport(github, config, git);
    await backport.run();

    const failureComment = github.comments.find(
      (c) => c.body.includes("failed") || c.body.includes("Failed"),
    );
    expect(failureComment).toBeUndefined();
  });

  it("copy milestone: sets milestone on backport PR", async () => {
    const { github, git, config } = setup(
      { copy_milestone: true },
      { sourcePr: { milestone: { number: 5, id: 123, title: "v1.0" } } },
    );
    const backport = new Backport(github, config, git);
    await backport.run();

    expect(github.milestonesByPR.get(100)).toBe(5);
  });

  it("copy assignees: assigns same users to backport PR", async () => {
    const { github, git, config } = setup(
      { copy_assignees: true },
      { sourcePr: { assignees: [{ login: "user1", id: 1 }] } },
    );
    const backport = new Backport(github, config, git);
    await backport.run();

    expect(github.assigneesByPR.get(100)).toEqual(["user1"]);
  });

  it("copy requested reviewers: requests same reviewers on backport PR", async () => {
    const { github, git, config } = setup(
      { copy_requested_reviewers: true },
      { sourcePr: { requested_reviewers: [{ login: "reviewer1" }] } },
    );
    const backport = new Backport(github, config, git);
    await backport.run();

    expect(github.reviewersByPR.get(100)).toEqual(["reviewer1"]);
  });

  it("add author as assignee: assigns PR author to backport PR", async () => {
    const { github, git, config } = setup({ add_author_as_assignee: true });
    const backport = new Backport(github, config, git);
    await backport.run();

    expect(github.assigneesByPR.get(100)).toEqual(["author"]);
  });

  it("add author as reviewer: requests PR author as reviewer on backport PR", async () => {
    const { github, git, config } = setup({ add_author_as_reviewer: true });
    const backport = new Backport(github, config, git);
    await backport.run();

    expect(github.reviewersByPR.get(100)).toEqual(["author"]);
  });

  it("copy labels: copies matching labels excluding backport labels", async () => {
    const { github, git, config } = setup(
      { copy_labels_pattern: /.*/ },
      {
        sourcePr: {
          labels: [
            { name: "backport main" },
            { name: "bug" },
            { name: "enhancement" },
          ],
        },
      },
    );
    const backport = new Backport(github, config, git);
    await backport.run();

    const labels = github.labelsByPR.get(100);
    expect(labels).toContain("bug");
    expect(labels).toContain("enhancement");
    expect(labels).not.toContain("backport main");
  });

  it("add static labels: adds configured labels to backport PR", async () => {
    const { github, git, config } = setup({ add_labels: ["bug"] });
    const backport = new Backport(github, config, git);
    await backport.run();

    expect(github.labelsByPR.get(100)).toEqual(["bug"]);
  });

  it("auto-merge enabled: enables auto-merge on backport PR", async () => {
    const { github, git, config } = setup({ auto_merge_enabled: true });
    const backport = new Backport(github, config, git);
    await backport.run();

    expect(github.autoMergeByPR.get(100)).toBe("merge");
  });

  it("custom PR title template: replaces placeholders", async () => {
    const { github, git, config } = setup();
    const backport = new Backport(github, config, git);
    await backport.run();

    expect(github.createdPRs[0]).toEqual(
      expect.objectContaining({ title: "[Backport main] Test PR" }),
    );
  });

  it("partial failure: one PR created, one failure, was_successful = false", async () => {
    let cherryPickCallCount = 0;
    const { github, git, config } = setup(
      undefined,
      {
        sourcePr: {
          labels: [{ name: "backport main" }, { name: "backport release" }],
        },
      },
      {
        cherryPick: vi.fn().mockImplementation(async () => {
          cherryPickCallCount++;
          if (cherryPickCallCount === 1) return null;
          throw new Error("cherry-pick failed");
        }),
      },
    );
    const backport = new Backport(github, config, git);
    await backport.run();

    expect(github.createdPRs).toHaveLength(1);
    expect(core.setOutput).toHaveBeenCalledWith("was_successful", false);
  });

  it("merge commits detected (fail mode): posts failure comment, no PR", async () => {
    const { github, git, config } = setup(undefined, undefined, {
      findMergeCommits: vi.fn().mockResolvedValue(["merge123"]),
    });
    const backport = new Backport(github, config, git);
    await backport.run();

    expect(github.createdPRs).toHaveLength(0);
    expect(github.comments).toContainEqual(
      expect.objectContaining({
        body: expect.stringContaining("merge commits"),
      }),
    );
  });

  it("merge commits detected (skip mode): cherry-picks only non-merge commits", async () => {
    const { github, git, config } = setup(
      { commits: { cherry_picking: "auto", merge_commits: "skip" } },
      undefined,
      { findMergeCommits: vi.fn().mockResolvedValue(["abc123"]) },
    );
    const backport = new Backport(github, config, git);
    await backport.run();

    expect(git.cherryPick).toHaveBeenCalledWith([], "fail", "/tmp");
  });

  it("outputs: sets was_successful, was_successful_by_target, created_pull_numbers", async () => {
    const { github, git, config } = setup();
    const backport = new Backport(github, config, git);
    await backport.run();

    expect(core.setOutput).toHaveBeenCalledWith("was_successful", true);
    expect(core.setOutput).toHaveBeenCalledWith(
      "was_successful_by_target",
      expect.stringContaining("main=true"),
    );
    expect(core.setOutput).toHaveBeenCalledWith("created_pull_numbers", "100");
  });

  it("downstream repo: calls remoteAdd, uses 'downstream' remote", async () => {
    const { github, git, config } = setup({
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

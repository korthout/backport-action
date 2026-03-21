/**
 * Orchestration integration tests for Backport.run()
 *
 * These tests mock BOTH GitApi and GithubApi to test the orchestration logic
 * in Backport.run() quickly and deterministically.
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
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { Backport } from "../backport.js";
import { GitRefNotFoundError } from "../git.js";
import type { GitApi } from "../git.js";
import type { GithubApi } from "../github.js";
import { RequestError } from "../github.js";
import { createMockGithub, makePullRequest } from "./helpers/mock-github.js";
import { createMockGit } from "./helpers/mock-git.js";
import { makeConfig } from "./helpers/config.js";

vi.mock("@actions/core", () => ({
  setFailed: vi.fn(),
  setOutput: vi.fn(),
}));

import * as core from "@actions/core";

describe("Backport.run() orchestration", () => {
  let github: GithubApi;
  let git: GitApi;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function setup(
    configOverrides?: Parameters<typeof makeConfig>[0],
    githubOverrides?: Partial<GithubApi>,
    gitOverrides?: Partial<GitApi>,
  ) {
    const pr = makePullRequest();
    github = createMockGithub({
      getPullRequest: vi.fn().mockResolvedValue(pr),
      getCommits: vi.fn().mockResolvedValue(["abc123"]),
      getMergeCommitSha: vi.fn().mockResolvedValue("abc123"),
      ...githubOverrides,
    });
    git = createMockGit(gitOverrides);
    const config = makeConfig(configOverrides);
    return { pr, config };
  }

  it("happy path: creates backport PR and posts success comment", async () => {
    const { config } = setup();
    const backport = new Backport(github, config, git);
    await backport.run();

    expect(github.createPR).toHaveBeenCalledOnce();
    expect(github.createComment).toHaveBeenCalled();
    const commentCalls = (github.createComment as Mock).mock.calls;
    const successComment = commentCalls.find((c: any[]) =>
      c[0].body.includes("Successfully created backport PR"),
    );
    expect(successComment).toBeDefined();
    expect(core.setOutput).toHaveBeenCalledWith("was_successful", true);
  });

  it("multiple targets: creates two backport PRs", async () => {
    const pr = makePullRequest({
      labels: [{ name: "backport main" }, { name: "backport release" }],
    });
    const { config } = setup(undefined, {
      getPullRequest: vi.fn().mockResolvedValue(pr),
      getCommits: vi.fn().mockResolvedValue(["abc123"]),
      getMergeCommitSha: vi.fn().mockResolvedValue("abc123"),
    });
    const backport = new Backport(github, config, git);
    await backport.run();

    expect(github.createPR).toHaveBeenCalledTimes(2);
  });

  it("no matching labels: no PRs created, no comments", async () => {
    const pr = makePullRequest({ labels: [{ name: "bug" }] });
    const { config } = setup(undefined, {
      getPullRequest: vi.fn().mockResolvedValue(pr),
    });
    const backport = new Backport(github, config, git);
    await backport.run();

    expect(github.createPR).not.toHaveBeenCalled();
    expect(github.createComment).not.toHaveBeenCalled();
  });

  it("unmerged PR: posts 'not merged' comment, no PRs", async () => {
    const { config } = setup(undefined, {
      isMerged: vi.fn().mockResolvedValue(false),
    });
    const backport = new Backport(github, config, git);
    await backport.run();

    expect(github.createPR).not.toHaveBeenCalled();
    const commentCalls = (github.createComment as Mock).mock.calls;
    expect(commentCalls[0][0].body).toContain("Only merged pull requests");
  });

  it("target branch fetch fails with GitRefNotFoundError: posts failure comment, continues", async () => {
    const pr = makePullRequest({
      labels: [{ name: "backport nonexistent" }, { name: "backport main" }],
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(undefined)
      .mockImplementationOnce(async () => {
        // first call: fetch PR commits — succeeds
      })
      .mockImplementationOnce(async () => {
        // second call: fetch merge commit sha — succeeds
      })
      .mockImplementationOnce(async () => {
        // third call: fetch target "nonexistent" — fails
        throw new GitRefNotFoundError("not found", "nonexistent");
      });

    const { config } = setup(
      undefined,
      {
        getPullRequest: vi.fn().mockResolvedValue(pr),
        getCommits: vi.fn().mockResolvedValue(["abc123"]),
        getMergeCommitSha: vi.fn().mockResolvedValue("abc123"),
      },
      { fetch: fetchMock },
    );
    const backport = new Backport(github, config, git);
    await backport.run();

    const commentCalls = (github.createComment as Mock).mock.calls;
    const failureComment = commentCalls.find((c: any[]) =>
      c[0].body.includes("couldn't find remote ref"),
    );
    expect(failureComment).toBeDefined();
    // Should still create PR for "main"
    expect(github.createPR).toHaveBeenCalledOnce();
  });

  it("cherry-pick fails: posts failure comment with manual instructions", async () => {
    const { config } = setup(undefined, undefined, {
      cherryPick: vi.fn().mockRejectedValue(new Error("cherry-pick failed")),
    });
    const backport = new Backport(github, config, git);
    await backport.run();

    expect(github.createPR).not.toHaveBeenCalled();
    const commentCalls = (github.createComment as Mock).mock.calls;
    const failureComment = commentCalls.find((c: any[]) =>
      c[0].body.includes("unable to cherry-pick"),
    );
    expect(failureComment).toBeDefined();
  });

  it("cherry-pick with conflicts (draft mode): creates draft PR, posts conflict comment", async () => {
    const { config } = setup(
      { experimental: { conflict_resolution: "draft_commit_conflicts" } },
      undefined,
      {
        cherryPick: vi.fn().mockResolvedValue(["abc123"]),
      },
    );
    const backport = new Backport(github, config, git);
    await backport.run();

    expect(github.createPR).toHaveBeenCalledWith(
      expect.objectContaining({ draft: true }),
    );
    const commentCalls = (github.createComment as Mock).mock.calls;
    const conflictComment = commentCalls.find((c: any[]) =>
      c[0].body.includes("remaining conflicts"),
    );
    expect(conflictComment).toBeDefined();
  });

  it("push fails, branch exists: recovers and creates PR", async () => {
    const { config } = setup(undefined, undefined, {
      push: vi.fn().mockResolvedValue(1),
    });
    const backport = new Backport(github, config, git);
    await backport.run();

    expect(github.createPR).toHaveBeenCalledOnce();
  });

  it("push fails, branch doesn't exist: posts failure comment", async () => {
    const fetchMock = vi.fn().mockResolvedValue(undefined);
    const { config } = setup(undefined, undefined, {
      push: vi.fn().mockResolvedValue(1),
      fetch: fetchMock,
    });

    // After push fails, the recovery fetch should also fail
    // We need to allow the initial fetches to succeed but fail the recovery fetch
    fetchMock.mockImplementation(async (ref: string) => {
      // The recovery fetch is the one for the branch name
      if (ref.startsWith("backport-")) {
        throw new GitRefNotFoundError("not found", ref);
      }
    });

    const backport = new Backport(github, config, git);
    await backport.run();

    expect(github.createPR).not.toHaveBeenCalled();
    const commentCalls = (github.createComment as Mock).mock.calls;
    const failureComment = commentCalls.find((c: any[]) =>
      c[0].body.includes("Git push to origin failed"),
    );
    expect(failureComment).toBeDefined();
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
    const { config } = setup(undefined, {
      createPR: vi.fn().mockRejectedValue(requestError),
    });
    const backport = new Backport(github, config, git);
    await backport.run();

    // Should not post any failure comment or set was_successful to false
    const commentCalls = (github.createComment as Mock).mock.calls;
    const failureComment = commentCalls.find(
      (c: any[]) =>
        c[0].body.includes("failed") || c[0].body.includes("Failed"),
    );
    expect(failureComment).toBeUndefined();
  });

  it("copy milestone: calls setMilestone when PR has milestone", async () => {
    const pr = makePullRequest({
      milestone: { number: 5, id: 123, title: "v1.0" },
    });
    const { config } = setup(
      { copy_milestone: true },
      {
        getPullRequest: vi.fn().mockResolvedValue(pr),
        getCommits: vi.fn().mockResolvedValue(["abc123"]),
        getMergeCommitSha: vi.fn().mockResolvedValue("abc123"),
      },
    );
    const backport = new Backport(github, config, git);
    await backport.run();

    expect(github.setMilestone).toHaveBeenCalledWith(100, 5);
  });

  it("copy assignees: calls addAssignees when PR has assignees", async () => {
    const pr = makePullRequest({
      assignees: [{ login: "user1", id: 1 }],
    });
    const { config } = setup(
      { copy_assignees: true },
      {
        getPullRequest: vi.fn().mockResolvedValue(pr),
        getCommits: vi.fn().mockResolvedValue(["abc123"]),
        getMergeCommitSha: vi.fn().mockResolvedValue("abc123"),
      },
    );
    const backport = new Backport(github, config, git);
    await backport.run();

    expect(github.addAssignees).toHaveBeenCalledWith(
      100,
      ["user1"],
      expect.objectContaining({ owner: "test-owner", repo: "test-repo" }),
    );
  });

  it("copy requested reviewers: calls requestReviewers", async () => {
    const pr = makePullRequest({
      requested_reviewers: [{ login: "reviewer1" }],
    });
    const { config } = setup(
      { copy_requested_reviewers: true },
      {
        getPullRequest: vi.fn().mockResolvedValue(pr),
        getCommits: vi.fn().mockResolvedValue(["abc123"]),
        getMergeCommitSha: vi.fn().mockResolvedValue("abc123"),
      },
    );
    const backport = new Backport(github, config, git);
    await backport.run();

    expect(github.requestReviewers).toHaveBeenCalledWith(
      expect.objectContaining({
        pull_number: 100,
        reviewers: ["reviewer1"],
      }),
    );
  });

  it("add author as assignee: calls addAssignees with author", async () => {
    const { config } = setup({ add_author_as_assignee: true });
    const backport = new Backport(github, config, git);
    await backport.run();

    expect(github.addAssignees).toHaveBeenCalledWith(
      100,
      ["author"],
      expect.objectContaining({ owner: "test-owner", repo: "test-repo" }),
    );
  });

  it("add author as reviewer: calls requestReviewers with author", async () => {
    const { config } = setup({ add_author_as_reviewer: true });
    const backport = new Backport(github, config, git);
    await backport.run();

    expect(github.requestReviewers).toHaveBeenCalledWith(
      expect.objectContaining({
        pull_number: 100,
        reviewers: ["author"],
      }),
    );
  });

  it("copy labels: calls labelPR with matching labels (excluding backport labels)", async () => {
    const pr = makePullRequest({
      labels: [
        { name: "backport main" },
        { name: "bug" },
        { name: "enhancement" },
      ],
    });
    const { config } = setup(
      { copy_labels_pattern: /.*/ },
      {
        getPullRequest: vi.fn().mockResolvedValue(pr),
        getCommits: vi.fn().mockResolvedValue(["abc123"]),
        getMergeCommitSha: vi.fn().mockResolvedValue("abc123"),
      },
    );
    const backport = new Backport(github, config, git);
    await backport.run();

    expect(github.labelPR).toHaveBeenCalledWith(
      100,
      expect.arrayContaining(["bug", "enhancement"]),
      expect.any(Object),
    );
    // "backport main" should be excluded since it matches source_labels_pattern
    const labels = (github.labelPR as Mock).mock.calls[0][1];
    expect(labels).not.toContain("backport main");
  });

  it("add static labels: calls labelPR", async () => {
    const { config } = setup({ add_labels: ["bug"] });
    const backport = new Backport(github, config, git);
    await backport.run();

    expect(github.labelPR).toHaveBeenCalledWith(
      100,
      ["bug"],
      expect.any(Object),
    );
  });

  it("auto-merge enabled: calls enableAutoMerge", async () => {
    const { config } = setup({ auto_merge_enabled: true });
    const backport = new Backport(github, config, git);
    await backport.run();

    expect(github.enableAutoMerge).toHaveBeenCalledWith(
      100,
      expect.objectContaining({ owner: "test-owner", repo: "test-repo" }),
      "merge",
    );
  });

  it("custom PR title template: replaces placeholders", async () => {
    const { config } = setup();
    const backport = new Backport(github, config, git);
    await backport.run();

    expect(github.createPR).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "[Backport main] Test PR",
      }),
    );
  });

  it("partial failure: one PR created, one failure, was_successful = false", async () => {
    const pr = makePullRequest({
      labels: [{ name: "backport main" }, { name: "backport release" }],
    });

    let cherryPickCallCount = 0;
    const { config } = setup(
      undefined,
      {
        getPullRequest: vi.fn().mockResolvedValue(pr),
        getCommits: vi.fn().mockResolvedValue(["abc123"]),
        getMergeCommitSha: vi.fn().mockResolvedValue("abc123"),
      },
      {
        cherryPick: vi.fn().mockImplementation(async () => {
          cherryPickCallCount++;
          if (cherryPickCallCount === 1) return null; // first target succeeds
          throw new Error("cherry-pick failed"); // second target fails
        }),
      },
    );
    const backport = new Backport(github, config, git);
    await backport.run();

    expect(github.createPR).toHaveBeenCalledOnce();
    expect(core.setOutput).toHaveBeenCalledWith("was_successful", false);
  });

  it("merge commits detected (fail mode): posts failure comment, no PR", async () => {
    const { config } = setup(undefined, undefined, {
      findMergeCommits: vi.fn().mockResolvedValue(["merge123"]),
    });
    const backport = new Backport(github, config, git);
    await backport.run();

    expect(github.createPR).not.toHaveBeenCalled();
    const commentCalls = (github.createComment as Mock).mock.calls;
    const failureComment = commentCalls.find((c: any[]) =>
      c[0].body.includes("merge commits"),
    );
    expect(failureComment).toBeDefined();
  });

  it("merge commits detected (skip mode): cherry-picks only non-merge commits", async () => {
    const { config } = setup(
      { commits: { cherry_picking: "auto", merge_commits: "skip" } },
      {
        getPullRequest: vi.fn().mockResolvedValue(makePullRequest()),
        getCommits: vi.fn().mockResolvedValue(["abc123"]),
        getMergeCommitSha: vi.fn().mockResolvedValue("abc123"),
      },
      {
        findMergeCommits: vi.fn().mockResolvedValue(["abc123"]),
      },
    );
    const backport = new Backport(github, config, git);
    await backport.run();

    // cherryPick should be called with non-merge commits only (empty in this case)
    expect(git.cherryPick).toHaveBeenCalledWith([], "fail", "/tmp");
  });

  it("outputs: sets was_successful, was_successful_by_target, created_pull_numbers", async () => {
    const { config } = setup();
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
    const { config } = setup({
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

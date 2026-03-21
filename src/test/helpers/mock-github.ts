import { vi } from "vitest";
import type { GithubApi, PullRequest } from "../../github.js";
import { MergeStrategy } from "../../github.js";

export function createMockGithub(overrides?: Partial<GithubApi>): GithubApi {
  return {
    getRepo: vi
      .fn()
      .mockReturnValue({ owner: "test-owner", repo: "test-repo" }),
    getPayload: vi.fn().mockReturnValue({ repository: { name: "test-repo" } }),
    getPullNumber: vi.fn().mockReturnValue(42),
    createComment: vi.fn().mockResolvedValue({}),
    getPullRequest: vi.fn(),
    isMerged: vi.fn().mockResolvedValue(true),
    getCommits: vi.fn(),
    createPR: vi.fn().mockResolvedValue({ status: 201, data: { number: 100 } }),
    labelPR: vi.fn().mockResolvedValue({ status: 200 }),
    requestReviewers: vi
      .fn()
      .mockResolvedValue({ status: 201, data: { number: 100 } }),
    addAssignees: vi.fn().mockResolvedValue({ status: 201 }),
    setMilestone: vi.fn().mockResolvedValue({ status: 200 }),
    enableAutoMerge: vi.fn().mockResolvedValue({ status: 200 }),
    mergeStrategy: vi.fn().mockResolvedValue(MergeStrategy.SQUASHED),
    getMergeCommitSha: vi.fn(),
    ...overrides,
  };
}

export function makePullRequest(overrides?: Partial<PullRequest>): PullRequest {
  return {
    number: 42,
    title: "Test PR",
    body: "Test body",
    merge_commit_sha: "abc123",
    head: { ref: "feature-branch", sha: "abc123" },
    base: { sha: "def456" },
    user: { login: "author" },
    labels: [{ name: "backport main" }],
    requested_reviewers: [],
    commits: 1,
    milestone: null,
    assignees: [],
    merged_by: { login: "merger" },
    ...overrides,
  };
}

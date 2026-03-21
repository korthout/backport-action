/**
 * Real-git integration tests for Backport.run()
 *
 * These tests use REAL git operations on temporary repositories with a
 * MOCKED GithubApi. They verify that cherry-picks, conflicts, and branch
 * operations produce correct results end-to-end.
 *
 * ## When to add tests HERE:
 *
 * - Cherry-pick scenarios (clean apply, conflicts, multiple commits)
 * - Conflict resolution modes (fail vs draft_commit_conflicts)
 * - Branch operations where real git state matters
 * - Merge commit detection with real commit graphs
 *
 * ## When to add tests in backport.integration.test.ts instead:
 *
 * - Feature toggles that don't depend on git behavior
 * - GitHub API error handling
 * - Output assertions
 * - Any test where mocking git at the method level is sufficient
 *
 * These tests are slower (~100-500ms each) because they create real
 * git repositories. Keep this file focused on scenarios that genuinely
 * need real git — use orchestration tests for everything else.
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from "vitest";
import { Backport } from "../backport.js";
import { Git } from "../git.js";
import { MergeStrategy } from "../github.js";
import { createMockGithub, makePullRequest } from "./helpers/mock-github.js";
import { makeConfig } from "./helpers/config.js";
import {
  createTestRepo,
  addCommit,
  createBranch,
  pushBranch,
  createPullRequestRef,
  gitCmd,
  type TestRepo,
} from "./helpers/test-repo.js";

vi.mock("@actions/core", () => ({
  setFailed: vi.fn(),
  setOutput: vi.fn(),
}));

describe("Backport.run() with real git", () => {
  let repo: TestRepo;
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    // Prevent the Git class from reading user's global git config (e.g. gpgsign)
    savedEnv.GIT_CONFIG_GLOBAL = process.env.GIT_CONFIG_GLOBAL;
    savedEnv.GIT_CONFIG_NOSYSTEM = process.env.GIT_CONFIG_NOSYSTEM;
    process.env.GIT_CONFIG_GLOBAL = "/dev/null";
    process.env.GIT_CONFIG_NOSYSTEM = "1";
  });

  afterEach(async () => {
    if (repo) await repo.cleanup();
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  function setupGit() {
    return new Git("Test", "test@test.com");
  }

  it("happy path: cherry-picks commit to target branch and creates PR", async () => {
    repo = await createTestRepo();
    const git = setupGit();

    createBranch(repo.workDir, "release", repo.initialCommitSha);

    const featureSha = await addCommit(
      repo.workDir,
      "feature.txt",
      "feature content",
      "Add feature",
    );
    pushBranch(repo.workDir);
    createPullRequestRef(repo.workDir, 42, featureSha);

    const pr = makePullRequest({
      merge_commit_sha: featureSha,
      labels: [{ name: "backport release" }],
      commits: 1,
    });

    const github = createMockGithub({
      getPullRequest: vi.fn().mockResolvedValue(pr),
      getCommits: vi.fn().mockResolvedValue([featureSha]),
      getMergeCommitSha: vi.fn().mockResolvedValue(featureSha),
      mergeStrategy: vi.fn().mockResolvedValue(MergeStrategy.SQUASHED),
    });

    const config = makeConfig({ pwd: repo.workDir });
    const backport = new Backport(github, config, git);
    await backport.run();

    expect(github.createPR).toHaveBeenCalledOnce();
    expect(github.createPR).toHaveBeenCalledWith(
      expect.objectContaining({
        base: "release",
        draft: false,
      }),
    );
  });

  it("cherry-pick conflict (fail mode): posts failure comment", async () => {
    repo = await createTestRepo();
    const git = setupGit();

    createBranch(repo.workDir, "release", repo.initialCommitSha);

    const featureSha = await addCommit(
      repo.workDir,
      "README.md",
      "conflicting content from main",
      "Change README on main",
    );
    pushBranch(repo.workDir);
    createPullRequestRef(repo.workDir, 42, featureSha);

    // Add conflicting changes on release
    gitCmd("checkout release", repo.workDir);
    await addCommit(
      repo.workDir,
      "README.md",
      "different content",
      "Change README on release",
    );
    gitCmd("push origin release", repo.workDir);
    gitCmd("checkout main", repo.workDir);

    const pr = makePullRequest({
      merge_commit_sha: featureSha,
      labels: [{ name: "backport release" }],
      commits: 1,
    });

    const github = createMockGithub({
      getPullRequest: vi.fn().mockResolvedValue(pr),
      getCommits: vi.fn().mockResolvedValue([featureSha]),
      getMergeCommitSha: vi.fn().mockResolvedValue(featureSha),
      mergeStrategy: vi.fn().mockResolvedValue(MergeStrategy.SQUASHED),
    });

    const config = makeConfig({ pwd: repo.workDir });
    const backport = new Backport(github, config, git);
    await backport.run();

    expect(github.createPR).not.toHaveBeenCalled();
    const commentCalls = (github.createComment as Mock).mock.calls;
    const failureComment = commentCalls.find((c: any[]) =>
      c[0].body.includes("unable to cherry-pick"),
    );
    expect(failureComment).toBeDefined();
  });

  it("cherry-pick conflict (draft mode): creates draft PR with conflict comment", async () => {
    repo = await createTestRepo();
    const git = setupGit();

    createBranch(repo.workDir, "release", repo.initialCommitSha);

    const featureSha = await addCommit(
      repo.workDir,
      "README.md",
      "conflicting content from main",
      "Change README on main",
    );
    pushBranch(repo.workDir);
    createPullRequestRef(repo.workDir, 42, featureSha);

    gitCmd("checkout release", repo.workDir);
    await addCommit(
      repo.workDir,
      "README.md",
      "different content",
      "Change README on release",
    );
    gitCmd("push origin release", repo.workDir);
    gitCmd("checkout main", repo.workDir);

    const pr = makePullRequest({
      merge_commit_sha: featureSha,
      labels: [{ name: "backport release" }],
      commits: 1,
    });

    const github = createMockGithub({
      getPullRequest: vi.fn().mockResolvedValue(pr),
      getCommits: vi.fn().mockResolvedValue([featureSha]),
      getMergeCommitSha: vi.fn().mockResolvedValue(featureSha),
      mergeStrategy: vi.fn().mockResolvedValue(MergeStrategy.SQUASHED),
    });

    const config = makeConfig({
      pwd: repo.workDir,
      experimental: { conflict_resolution: "draft_commit_conflicts" },
    });
    const backport = new Backport(github, config, git);
    await backport.run();

    expect(github.createPR).toHaveBeenCalledWith(
      expect.objectContaining({ draft: true }),
    );
  });

  it("multiple commits cherry-picked in order", async () => {
    repo = await createTestRepo();
    const git = setupGit();

    createBranch(repo.workDir, "release", repo.initialCommitSha);

    const sha1 = await addCommit(
      repo.workDir,
      "file1.txt",
      "content1",
      "First commit",
    );
    const sha2 = await addCommit(
      repo.workDir,
      "file2.txt",
      "content2",
      "Second commit",
    );
    const sha3 = await addCommit(
      repo.workDir,
      "file3.txt",
      "content3",
      "Third commit",
    );
    pushBranch(repo.workDir);
    createPullRequestRef(repo.workDir, 42, sha3);

    const pr = makePullRequest({
      merge_commit_sha: sha3,
      labels: [{ name: "backport release" }],
      commits: 3,
    });

    const github = createMockGithub({
      getPullRequest: vi.fn().mockResolvedValue(pr),
      getCommits: vi.fn().mockResolvedValue([sha1, sha2, sha3]),
      getMergeCommitSha: vi.fn().mockResolvedValue(sha3),
      mergeStrategy: vi.fn().mockResolvedValue(MergeStrategy.MERGECOMMIT),
    });

    const config = makeConfig({ pwd: repo.workDir });
    const backport = new Backport(github, config, git);
    await backport.run();

    expect(github.createPR).toHaveBeenCalledOnce();
    expect(github.createPR).toHaveBeenCalledWith(
      expect.objectContaining({ draft: false }),
    );
  });

  it("target branch doesn't exist: posts failure comment", async () => {
    repo = await createTestRepo();
    const git = setupGit();

    const featureSha = await addCommit(
      repo.workDir,
      "feature.txt",
      "content",
      "Add feature",
    );
    pushBranch(repo.workDir);
    createPullRequestRef(repo.workDir, 42, featureSha);

    const pr = makePullRequest({
      merge_commit_sha: featureSha,
      labels: [{ name: "backport nonexistent" }],
      commits: 1,
    });

    const github = createMockGithub({
      getPullRequest: vi.fn().mockResolvedValue(pr),
      getCommits: vi.fn().mockResolvedValue([featureSha]),
      getMergeCommitSha: vi.fn().mockResolvedValue(featureSha),
      mergeStrategy: vi.fn().mockResolvedValue(MergeStrategy.SQUASHED),
    });

    const config = makeConfig({ pwd: repo.workDir });
    const backport = new Backport(github, config, git);
    await backport.run();

    expect(github.createPR).not.toHaveBeenCalled();
    const commentCalls = (github.createComment as Mock).mock.calls;
    const failureComment = commentCalls.find((c: any[]) =>
      c[0].body.includes("couldn't find remote ref"),
    );
    expect(failureComment).toBeDefined();
  });

  it("merge commit detection: findMergeCommits identifies merge commits", async () => {
    repo = await createTestRepo();
    const git = setupGit();

    // Add a regular commit on main so all commits have parents
    const regularSha = await addCommit(
      repo.workDir,
      "regular.txt",
      "regular content",
      "Regular commit",
    );

    // Create a branch, add commit, merge back with --no-ff to create a merge commit
    gitCmd("checkout -b feature-branch", repo.workDir);
    await addCommit(repo.workDir, "feature.txt", "feature", "feature commit");
    gitCmd("checkout main", repo.workDir);
    gitCmd("merge --no-ff feature-branch -m 'Merge feature'", repo.workDir);

    const mergeSha = gitCmd("rev-parse HEAD", repo.workDir);

    // findMergeCommits expects the range of commit SHAs from the PR
    // regularSha is a non-merge commit, mergeSha is the merge commit
    const mergeCommits = await git.findMergeCommits(
      [regularSha, mergeSha],
      repo.workDir,
    );

    expect(mergeCommits).toContain(mergeSha);
    expect(mergeCommits).not.toContain(regularSha);
  });
});

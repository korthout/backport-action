/**
 * Real-git integration tests for Backport.run()
 *
 * These tests use REAL git operations on temporary repositories with a
 * FAKE GithubApi. They verify that cherry-picks, conflicts, and branch
 * operations produce correct results end-to-end.
 *
 * A template repo is built once in beforeAll and copied for each test,
 * avoiding repeated git init/clone/commit/push. Tests run concurrently.
 *
 * These tests are still the slowest in the suite because they spawn real
 * git processes. Keep this file focused on scenarios that genuinely need
 * real git — use orchestration tests for everything else.
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
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  afterEach,
} from "vitest";
import type { TestRepo } from "./helpers/test-repo.js";
import { Backport } from "../backport.js";
import { Git } from "../git.js";
import { MergeStrategy } from "../github.js";
import { FakeGithub } from "./helpers/fake-github.js";
import { makeConfig } from "./helpers/config.js";
import {
  createRepoTemplate,
  addCommit,
  addConflictingCommits,
  createBranch,
  pushBranch,
  createPullRequestRef,
  gitCmd,
  type RepoTemplate,
} from "./helpers/test-repo.js";

vi.mock("@actions/core", () => ({
  setFailed: vi.fn(),
  setOutput: vi.fn(),
}));

declare module "vitest" {
  interface TestContext {
    repo?: TestRepo;
  }
}

describe("Backport.run() with real git", () => {
  const savedEnv: Record<string, string | undefined> = {};
  let template: RepoTemplate;

  beforeAll(async () => {
    savedEnv.GIT_CONFIG_GLOBAL = process.env.GIT_CONFIG_GLOBAL;
    savedEnv.GIT_CONFIG_NOSYSTEM = process.env.GIT_CONFIG_NOSYSTEM;
    process.env.GIT_CONFIG_GLOBAL = "/dev/null";
    process.env.GIT_CONFIG_NOSYSTEM = "1";
    template = await createRepoTemplate();
  });

  afterAll(async () => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await template.cleanup();
  });

  afterEach(async (ctx) => {
    if (ctx.repo) await ctx.repo.cleanup();
  });

  function setupGit() {
    return new Git("Test", "test@test.com", process.env.GIT_SILENT === "1");
  }

  it.concurrent(
    "happy path: cherry-picks commit to target branch and creates PR",
    async (ctx) => {
      const repo = (ctx.repo = await template.createTestRepo());
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

      const github = new FakeGithub({
        sourcePr: {
          merge_commit_sha: featureSha,
          labels: [{ name: "backport release" }],
          commits: 1,
        },
        commitShas: [featureSha],
        mergeCommitSha: featureSha,
      });

      const config = makeConfig({ pwd: repo.workDir });
      const backport = new Backport(github, config, git);
      await backport.run();

      expect(github.createdPRs).toHaveLength(1);
      expect(github.createdPRs[0]).toMatchObject({
        base: "release",
        draft: false,
      });
    },
  );

  it.concurrent(
    "cherry-pick conflict (fail mode): posts failure comment",
    async (ctx) => {
      const repo = (ctx.repo = await template.createTestRepo());
      const git = setupGit();

      createBranch(repo.workDir, "release", repo.initialCommitSha);

      const featureSha = await addConflictingCommits(
        repo.workDir,
        "release",
        "README.md",
      );
      createPullRequestRef(repo.workDir, 42, featureSha);

      const github = new FakeGithub({
        sourcePr: {
          merge_commit_sha: featureSha,
          labels: [{ name: "backport release" }],
          commits: 1,
        },
        commitShas: [featureSha],
        mergeCommitSha: featureSha,
      });

      const config = makeConfig({ pwd: repo.workDir });
      const backport = new Backport(github, config, git);
      await backport.run();

      expect(github.createdPRs).toHaveLength(0);
      expect(github.comments).toContainEqual(
        expect.objectContaining({
          body: expect.stringContaining("unable to cherry-pick"),
        }),
      );
    },
  );

  it.concurrent(
    "cherry-pick conflict (draft mode): creates draft PR with conflict comment",
    async (ctx) => {
      const repo = (ctx.repo = await template.createTestRepo());
      const git = setupGit();

      createBranch(repo.workDir, "release", repo.initialCommitSha);

      const featureSha = await addConflictingCommits(
        repo.workDir,
        "release",
        "README.md",
      );
      createPullRequestRef(repo.workDir, 42, featureSha);

      const github = new FakeGithub({
        sourcePr: {
          merge_commit_sha: featureSha,
          labels: [{ name: "backport release" }],
          commits: 1,
        },
        commitShas: [featureSha],
        mergeCommitSha: featureSha,
      });

      const config = makeConfig({
        pwd: repo.workDir,
        experimental: { conflict_resolution: "draft_commit_conflicts" },
      });
      const backport = new Backport(github, config, git);
      await backport.run();

      expect(github.createdPRs[0]).toMatchObject({ draft: true });
    },
  );

  it.concurrent("multiple commits cherry-picked in order", async (ctx) => {
    const repo = (ctx.repo = await template.createTestRepo());
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

    const github = new FakeGithub({
      sourcePr: {
        merge_commit_sha: sha3,
        labels: [{ name: "backport release" }],
        commits: 3,
      },
      commitShas: [sha1, sha2, sha3],
      mergeCommitSha: sha3,
      mergeStrategyResult: MergeStrategy.MERGECOMMIT,
    });

    const config = makeConfig({ pwd: repo.workDir });
    const backport = new Backport(github, config, git);
    await backport.run();

    expect(github.createdPRs).toHaveLength(1);
    expect(github.createdPRs[0]).toMatchObject({ draft: false });
  });

  it.concurrent(
    "target branch doesn't exist: posts failure comment",
    async (ctx) => {
      const repo = (ctx.repo = await template.createTestRepo());
      const git = setupGit();

      const featureSha = await addCommit(
        repo.workDir,
        "feature.txt",
        "content",
        "Add feature",
      );
      pushBranch(repo.workDir);
      createPullRequestRef(repo.workDir, 42, featureSha);

      const github = new FakeGithub({
        sourcePr: {
          merge_commit_sha: featureSha,
          labels: [{ name: "backport nonexistent" }],
          commits: 1,
        },
        commitShas: [featureSha],
        mergeCommitSha: featureSha,
      });

      const config = makeConfig({ pwd: repo.workDir });
      const backport = new Backport(github, config, git);
      await backport.run();

      expect(github.createdPRs).toHaveLength(0);
      expect(github.comments).toContainEqual(
        expect.objectContaining({
          body: expect.stringContaining("couldn't find remote ref"),
        }),
      );
    },
  );

  it.concurrent(
    "merge commit detection: findMergeCommits identifies merge commits",
    async (ctx) => {
      const repo = (ctx.repo = await template.createTestRepo());
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
    },
  );
});

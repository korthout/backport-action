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

      // todo: the test setup has no real GitHub merge step — mergeCommitSha is always
      //  a commit that already exists on the PR branch. Consider whether we need to
      //  simulate real GitHub merge/squash/rebase to properly test those code paths.
      const github = new FakeGithub({
        sourcePr: {
          labels: [{ name: "backport release" }],
          commitShas: [featureSha],
          mergeCommitSha: featureSha,
        },
      });

      const config = makeConfig({ pwd: repo.workDir });
      const backport = new Backport(github, config, git);
      await backport.run();

      expect(github.createdPRs).toHaveLength(1);
      expect(github.createdPRs[0]).toMatchObject({
        base: "release",
        head: "backport-42-to-release",
        draft: false,
      });

      await git
        .findCommitsInRange("release..backport-42-to-release", repo.workDir)
        .then((commits) => {
          expect(commits).toHaveLength(1);
          const content = gitCmd(`show ${commits[0]}`, repo.workDir);
          expect(content).toContain("Add feature");
          expect(content).toContain(
            `(cherry picked from commit ${featureSha})`,
          );
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
          labels: [{ name: "backport release" }],
          commitShas: [featureSha],
          mergeCommitSha: featureSha,
        },
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
          labels: [{ name: "backport release" }],
          commitShas: [featureSha],
          mergeCommitSha: featureSha,
        },
        nextPrNumber: 999,
      });

      const config = makeConfig({
        pwd: repo.workDir,
        experimental: { conflict_resolution: "draft_commit_conflicts" },
      });
      const backport = new Backport(github, config, git);
      await backport.run();

      expect(github.createdPRs[0]).toMatchObject({ draft: true });
      expect(github.comments).toContainEqual(
        expect.objectContaining({
          body: expect.stringMatching(
            /- #999 with remaining conflicts!\n\nPlease cherry-pick the changes locally and resolve any conflicts\./,
          ),
        }),
      );

      await git
        .findCommitsInRange("release..backport-42-to-release", repo.workDir)
        .then((commits) => {
          expect(commits).toHaveLength(1);
          const content = gitCmd(`show ${commits[0]}`, repo.workDir);
          expect(content).toContain("BACKPORT-CONFLICT");
        });
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
        labels: [{ name: "backport release" }],
        commitShas: [sha1, sha2, sha3],
        mergeCommitSha: sha3,
      },
      mergeStrategyResult: MergeStrategy.MERGECOMMIT,
    });

    const config = makeConfig({ pwd: repo.workDir });
    const backport = new Backport(github, config, git);
    await backport.run();

    expect(github.createdPRs).toHaveLength(1);
    expect(github.createdPRs[0]).toMatchObject({ draft: false });

    // todo: move this to a helper in test-repo so it can be easily reused across tests.
    //  The move should keep the assertion readable from the callsite of the test, such
    //  that it's clear what the test is verifying without needing to jump to the helper.
    //  We might be able to reuse this helper for verifying any cherry-picked commits, even
    //  those cases with just one commit.
    await git
      .findCommitsInRange("release..backport-42-to-release", repo.workDir)
      .then((commits) => {
        expect(commits).toHaveLength(3);
        const expectedCommits = [
          { message: "First commit", cherryPickedFrom: sha1 },
          { message: "Second commit", cherryPickedFrom: sha2 },
          { message: "Third commit", cherryPickedFrom: sha3 },
        ];
        expectedCommits.forEach(({ message, cherryPickedFrom }, index) => {
          const content = gitCmd(`show ${commits[index]}`, repo.workDir);
          expect(content).toContain(message);
          expect(content).toContain(
            `(cherry picked from commit ${cherryPickedFrom})`,
          );
        });
      });
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
          labels: [{ name: "backport nonexistent" }],
          commitShas: [featureSha],
          mergeCommitSha: featureSha,
        },
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
    "merge commits (fail mode): posts failure comment, no PR",
    async (ctx) => {
      const repo = (ctx.repo = await template.createTestRepo());
      const git = setupGit();

      // Create backport target branch
      createBranch(repo.workDir, "release", repo.initialCommitSha);

      // Start feature branch from initial commit
      gitCmd("checkout -b my-feature", repo.workDir);
      const feature1Sha = await addCommit(
        repo.workDir,
        "feature1.txt",
        "first feature",
        "First feature commit",
      );

      // Add a commit on main (simulates base branch moving forward)
      gitCmd("checkout main", repo.workDir);
      await addCommit(
        repo.workDir,
        "base-change.txt",
        "base change",
        "Base branch change",
      );

      // "Update branch": merge main into feature branch (creates the merge commit)
      gitCmd("checkout my-feature", repo.workDir);
      gitCmd("merge --no-ff main -m 'Update branch from main'", repo.workDir);
      const updateMergeSha = gitCmd("rev-parse HEAD", repo.workDir);

      // Another feature commit after the update
      const feature2Sha = await addCommit(
        repo.workDir,
        "feature2.txt",
        "second feature",
        "Second feature commit",
      );

      // Push both branches so all objects are available on the remote.
      // The PR ref points to the feature branch tip (like real GitHub).
      pushBranch(repo.workDir);
      gitCmd("push origin main", repo.workDir);
      createPullRequestRef(repo.workDir, 42, feature2Sha);

      const github = new FakeGithub({
        sourcePr: {
          labels: [{ name: "backport release" }],
          commitShas: [feature1Sha, updateMergeSha, feature2Sha],
          mergeCommitSha: feature2Sha,
        },
        mergeStrategyResult: MergeStrategy.MERGECOMMIT,
      });

      const config = makeConfig({ pwd: repo.workDir });
      const backport = new Backport(github, config, git);
      await backport.run();

      expect(github.createdPRs).toHaveLength(0);
      expect(github.comments).toContainEqual(
        expect.objectContaining({
          body: expect.stringContaining("merge commits"),
        }),
      );
    },
  );

  it.concurrent(
    "merge commits (skip mode): cherry-picks only non-merge commits",
    async (ctx) => {
      const repo = (ctx.repo = await template.createTestRepo());
      const git = setupGit();

      // Create backport target branch
      createBranch(repo.workDir, "release", repo.initialCommitSha);

      // Start feature branch from initial commit
      gitCmd("checkout -b my-feature", repo.workDir);
      const feature1Sha = await addCommit(
        repo.workDir,
        "feature1.txt",
        "first feature",
        "First feature commit",
      );

      // Add a commit on main (simulates base branch moving forward)
      gitCmd("checkout main", repo.workDir);
      await addCommit(
        repo.workDir,
        "base-change.txt",
        "base change",
        "Base branch change",
      );

      // "Update branch": merge main into feature branch (creates the merge commit)
      gitCmd("checkout my-feature", repo.workDir);
      gitCmd("merge --no-ff main -m 'Update branch from main'", repo.workDir);
      const updateMergeSha = gitCmd("rev-parse HEAD", repo.workDir);

      // Another feature commit after the update
      const feature2Sha = await addCommit(
        repo.workDir,
        "feature2.txt",
        "second feature",
        "Second feature commit",
      );

      // Push both branches so all objects are available on the remote.
      // The PR ref points to the feature branch tip (like real GitHub).
      pushBranch(repo.workDir);
      gitCmd("push origin main", repo.workDir);
      createPullRequestRef(repo.workDir, 42, feature2Sha);

      const github = new FakeGithub({
        sourcePr: {
          labels: [{ name: "backport release" }],
          commitShas: [feature1Sha, updateMergeSha, feature2Sha],
          mergeCommitSha: feature2Sha,
        },
        mergeStrategyResult: MergeStrategy.MERGECOMMIT,
      });

      const config = makeConfig({
        pwd: repo.workDir,
        commits: { cherry_picking: "auto", merge_commits: "skip" },
      });
      const backport = new Backport(github, config, git);
      await backport.run();

      expect(github.createdPRs).toHaveLength(1);
      expect(github.createdPRs[0]).toMatchObject({
        base: "release",
        head: "backport-42-to-release",
      });

      // Verify only the two feature commits were cherry-picked (not the update-merge)
      await git
        .findCommitsInRange("release..backport-42-to-release", repo.workDir)
        .then((commits) => {
          expect(commits).toHaveLength(2);
          const expectedCommits = [
            { message: "First feature commit", cherryPickedFrom: feature1Sha },
            { message: "Second feature commit", cherryPickedFrom: feature2Sha },
          ];
          expectedCommits.forEach(({ message, cherryPickedFrom }, index) => {
            const content = gitCmd(`show ${commits[index]}`, repo.workDir);
            expect(content).toContain(message);
            expect(content).toContain(
              `(cherry picked from commit ${cherryPickedFrom})`,
            );
          });
        });
    },
  );
});

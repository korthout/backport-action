import { mkdtemp, rm, writeFile, cp } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { execSync } from "child_process";

export type TestRepo = {
  workDir: string;
  bareDir: string;
  initialCommitSha: string;
  cleanup: () => Promise<void>;
};

function gitEnv() {
  return {
    ...process.env,
    GIT_COMMITTER_NAME: "Test",
    GIT_COMMITTER_EMAIL: "test@test.com",
    GIT_AUTHOR_NAME: "Test",
    GIT_AUTHOR_EMAIL: "test@test.com",
    GIT_CONFIG_NOSYSTEM: "1",
    HOME: "", // prevent reading user .gitconfig
  };
}

export function gitCmd(args: string, cwd: string): string {
  return execSync(
    `git -c commit.gpgsign=false -c init.defaultBranch=main ${args}`,
    {
      cwd,
      encoding: "utf-8",
      stdio: process.env.GIT_SILENT === "1" ? "pipe" : undefined,
      env: gitEnv(),
    },
  ).trim();
}

export async function createTestRepo(): Promise<TestRepo> {
  const baseDir = await mkdtemp(join(tmpdir(), "backport-test-"));
  const bareDir = join(baseDir, "bare.git");
  const workDir = join(baseDir, "work");

  // Create bare remote
  gitCmd(`init --bare ${bareDir}`, baseDir);

  // Clone it
  gitCmd(`clone ${bareDir} ${workDir}`, baseDir);

  // Create initial commit on main
  await writeFile(join(workDir, "README.md"), "initial");
  gitCmd("add README.md", workDir);
  gitCmd('commit -m "initial commit"', workDir);
  gitCmd("push origin HEAD", workDir);

  const initialCommitSha = gitCmd("rev-parse HEAD", workDir);

  return {
    workDir,
    bareDir,
    initialCommitSha,
    cleanup: async () => {
      await rm(baseDir, { recursive: true, force: true });
    },
  };
}

export type RepoTemplate = {
  createTestRepo(): Promise<TestRepo>;
  cleanup(): Promise<void>;
};

/**
 * Builds a template repo (bare remote + clone + initial commit) once.
 * Returns a factory that creates test repos by copying the template.
 * Call this from beforeAll and call cleanup() in afterAll.
 */
export async function createRepoTemplate(): Promise<RepoTemplate> {
  const baseDir = await mkdtemp(join(tmpdir(), "backport-template-"));
  const bareDir = join(baseDir, "bare.git");
  const workDir = join(baseDir, "work");

  gitCmd(`init --bare ${bareDir}`, baseDir);
  gitCmd(`clone ${bareDir} ${workDir}`, baseDir);
  await writeFile(join(workDir, "README.md"), "initial");
  gitCmd("add README.md", workDir);
  gitCmd('commit -m "initial commit"', workDir);
  gitCmd("push origin HEAD", workDir);

  const initialCommitSha = gitCmd("rev-parse HEAD", workDir);

  return {
    async createTestRepo(): Promise<TestRepo> {
      const copyDir = await mkdtemp(join(tmpdir(), "backport-test-"));
      await cp(baseDir, copyDir, { recursive: true });

      const copyWorkDir = join(copyDir, "work");
      const copyBareDir = join(copyDir, "bare.git");

      // Fix remote URL: the copied work dir's origin still points to the
      // template's bare dir. Update it to point to the copied bare dir so
      // each test has its own isolated remote.
      gitCmd(`remote set-url origin ${copyBareDir}`, copyWorkDir);

      return {
        workDir: copyWorkDir,
        bareDir: copyBareDir,
        initialCommitSha,
        cleanup: async () => {
          await rm(copyDir, { recursive: true, force: true });
        },
      };
    },
    async cleanup(): Promise<void> {
      await rm(baseDir, { recursive: true, force: true });
    },
  };
}

export async function addCommit(
  dir: string,
  file: string,
  content: string,
  message: string,
): Promise<string> {
  await writeFile(join(dir, file), content);
  gitCmd(`add ${file}`, dir);
  gitCmd(`commit -m "${message}"`, dir);
  return gitCmd("rev-parse HEAD", dir);
}

export function createBranch(dir: string, branch: string, from: string): void {
  gitCmd(`branch ${branch} ${from}`, dir);
  gitCmd(`push origin ${branch}`, dir);
}

export function pushBranch(dir: string): void {
  gitCmd("push origin HEAD", dir);
}

/**
 * Sets up conflicting commits between main and a target branch.
 * Creates a commit changing `file` on main, then a different commit
 * changing the same `file` on the target branch.
 * Returns the SHA of the commit on main (to use as the PR merge_commit_sha).
 */
export async function addConflictingCommits(
  dir: string,
  targetBranch: string,
  file: string,
): Promise<string> {
  const featureSha = await addCommit(
    dir,
    file,
    "conflicting content from main",
    `Change ${file} on main`,
  );
  pushBranch(dir);

  gitCmd(`checkout ${targetBranch}`, dir);
  await addCommit(
    dir,
    file,
    "different content",
    `Change ${file} on ${targetBranch}`,
  );
  gitCmd(`push origin ${targetBranch}`, dir);
  gitCmd("checkout main", dir);

  return featureSha;
}

/**
 * Creates a pull request ref in the bare remote, simulating what GitHub does.
 * This allows `git fetch origin refs/pull/<number>/head` to succeed.
 */
export function createPullRequestRef(
  dir: string,
  pullNumber: number,
  sha: string,
): void {
  gitCmd(`push origin ${sha}:refs/pull/${pullNumber}/head`, dir);
}

/**
 * Simulates GitHub's "Squash and merge" by squash-merging a feature branch
 * into main. Returns the SHA of the squash commit on main.
 */
export function squashMerge(dir: string, featureBranch: string): string {
  gitCmd("checkout main", dir);
  gitCmd(`merge --squash ${featureBranch}`, dir);
  gitCmd(`commit -m "Squash merge ${featureBranch}"`, dir);
  gitCmd("push origin main", dir);
  return gitCmd("rev-parse HEAD", dir);
}

/**
 * Simulates GitHub's "Rebase and merge" by rebasing a feature branch onto
 * main and fast-forwarding main. Returns the rebased commit SHAs in order.
 */
export function rebaseMerge(dir: string, featureBranch: string): string[] {
  gitCmd("checkout main", dir);
  const oldMainSha = gitCmd("rev-parse HEAD", dir);
  gitCmd(`checkout ${featureBranch}`, dir);
  gitCmd("rebase main", dir);
  gitCmd("checkout main", dir);
  gitCmd(`merge --ff-only ${featureBranch}`, dir);
  gitCmd("push origin main", dir);
  return gitCmd(`log ${oldMainSha}..main --format=%H --reverse`, dir)
    .split("\n")
    .filter(Boolean);
}

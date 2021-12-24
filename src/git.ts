import { execa } from "execa";

/**
 * Fetches a ref from origin
 *
 * @param ref the sha, branchname, etc to fetch
 * @param pwd the root of the git repository
 */
export async function fetch(ref: string, pwd: string) {
  const { exitCode } = await git("fetch", ["origin", ref], pwd);
  if (exitCode !== 0) {
    throw new Error(
      `'git fetch origin ${ref}' failed with exit code ${exitCode}`
    );
  }
}

/**
 * Performs the backport
 *
 * @param pwd the root of the git repository
 * @param headref refers to the source branch of the merge commit, i.e. PR head
 * @param baseref refers to the target branch of the merge commit, i.e. PR merge target
 * @param target refers to the target to backport onto, e.g. stable/0.24
 * @param branchname is the name of the new branch containing the backport, e.g. backport-x-to-0.24
 * @returns a promise of the exit code:
 *   0: all good
 *   1: incorrect usage / unknown error
 *   3: unable to switch to new branch
 *   4: unable to cherry-pick commit
 *   5: headref not found
 *   6: baseref not found"
 */
export async function performBackport(
  pwd: string,
  headref: string,
  baseref: string,
  target: string,
  branchname: string
) {
  try {
    // Check that $baseref and $headref commits exist
    if (!(await isCommit(headref, pwd))) {
      return 5;
    }
    if (!(await isCommit(baseref, pwd))) {
      return 6;
    }

    const ancref = await findCommonAncestor(baseref, headref, pwd);
    const diffrefs = await findDiff(ancref, headref, pwd);

    try {
      await checkout(branchname, target, pwd);
    } catch (error) {
      return 3;
    }

    try {
      await cherryPick(diffrefs, pwd);
    } catch (error) {
      return 4;
    }

    // Success
    return 0;
  } catch (error) {
    // Unknown error
    console.error(error);
    return 1;
  }
}

export async function push(branchname: string, pwd: string) {
  const { exitCode } = await git(
    "push",
    ["--set-upstream", "origin", branchname],
    pwd
  );
  return exitCode;
}

async function git(command: string, args: string[], pwd: string) {
  const child = execa("git", [command, ...args], {
    cwd: pwd,
    env: {
      GIT_COMMITTER_NAME: "github-actions[bot]",
      GIT_COMMITTER_EMAIL: "github-actions[bot]@users.noreply.github.com",
    },
    reject: false,
  });
  child.stderr?.pipe(process.stderr);
  return child;
}

async function isCommit(ref: string, pwd: string) {
  const { exitCode, stdout } = await git("cat-file", ["-t", ref], pwd);
  if (exitCode === 0) {
    return stdout === "commit";
  }
  if (exitCode === 128) {
    // commit does not exist
    return false;
  }
  throw new Error(`'git cat-file -t ${ref}' failed with exit code ${exitCode}`);
}

async function findCommonAncestor(ref1: string, ref2: string, pwd: string) {
  const { exitCode, stdout } = await git("merge-base", [ref1, ref2], pwd);
  if (exitCode !== 0) {
    throw new Error(
      `'git merge-base ${ref1} ${ref2}' failed with exit code ${exitCode}`
    );
  }
  return stdout;
}

async function findDiff(ancref: string, headref: string, pwd: string) {
  const { exitCode, stdout } = await git(
    "log",
    [`${ancref}..${headref}`, "--reverse", '--format="%h"'],
    pwd
  );
  if (exitCode !== 0) {
    throw new Error(
      `'git log ${ancref}..${headref} --reverse --format="%h"' failed with exit code ${exitCode}`
    );
  }
  return stdout.replace(new RegExp('"', "g"), "").split("\n");
}

async function checkout(branch: string, start: string, pwd: string) {
  const { exitCode } = await git("switch", ["-c", branch, start], pwd);
  if (exitCode !== 0) {
    throw new Error(
      `'git switch -c ${branch} ${start}' failed with exit code ${exitCode}`
    );
  }
}

async function cherryPick(diffrefs: string[], pwd: string) {
  const { exitCode } = await git("cherry-pick", ["-x", ...diffrefs], pwd);
  if (exitCode !== 0) {
    throw new Error(
      `'git cherry-pick -x ${diffrefs}' failed with exit code ${exitCode}`
    );
  }
}

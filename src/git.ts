import { ExecOptions, getExecOutput } from "@actions/exec";

import { BackportError, EmptyCherryPickError, GitPushError } from "./errors.js";

export class GitRefNotFoundError extends BackportError {
  ref: string;
  constructor(message: string, ref: string) {
    super(message);
    this.name = "GitRefNotFoundError";
    this.ref = ref;
  }
}

/**
 * Outcome of cherry-picking the commits of a pull request onto a target branch.
 *
 * `empty` means every commit was already present on the target branch, so the
 * branch holds nothing to open a pull request for.
 */
export type CherryPickResult =
  | { status: "picked" }
  | { status: "conflicts"; uncommittedShas: string[] }
  | { status: "empty" };

export interface GitApi {
  fetch(
    ref: string,
    pwd: string,
    depth: number,
    remote?: string,
  ): Promise<void>;
  remoteAdd(
    pwd: string,
    shortname: string,
    owner: string | undefined,
    repo: string | undefined,
  ): Promise<void>;
  findCommitsInRange(range: string, pwd: string): Promise<string[]>;
  findMergeCommits(commitShas: string[], pwd: string): Promise<string[]>;
  push(branchname: string, remote: string, pwd: string): Promise<void>;
  checkout(branch: string, start: string, pwd: string): Promise<void>;
  cherryPick(
    commitShas: string[],
    conflictResolution: string,
    pwd: string,
    mergeMode: "default" | "whitespace_tolerant",
    emptyCommits: "fail" | "skip",
  ): Promise<CherryPickResult>;
}

export class Git implements GitApi {
  constructor(
    private gitCommitterName: string,
    private gitCommitterEmail: string,
    private silent: boolean = false,
  ) {}

  private async git(command: string, args: string[], pwd: string) {
    const options: ExecOptions = {
      silent: this.silent,
      cwd: pwd,
      env: {
        ...process.env,
        GIT_COMMITTER_NAME: this.gitCommitterName,
        GIT_COMMITTER_EMAIL: this.gitCommitterEmail,
      },
      ignoreReturnCode: true,
    };
    return getExecOutput("git", [command, ...args], options);
  }

  /**
   * Fetches a ref from origin
   *
   * @param ref the sha, branchname, etc to fetch
   * @param pwd the root of the git repository
   * @param depth the number of commits to fetch
   * @param remote the shortname of the repository from where to fetch commits
   * @throws GitRefNotFoundError when ref not found
   * @throws Error for any other non-zero exit code
   */
  public async fetch(
    ref: string,
    pwd: string,
    depth: number,
    remote: string = "origin",
  ) {
    const { exitCode } = await this.git(
      "fetch",
      [`--depth=${depth}`, remote, ref],
      pwd,
    );
    if (exitCode === 128) {
      throw new GitRefNotFoundError(
        `Expected to fetch '${ref}' from '${remote}', but couldn't find it`,
        ref,
      );
    } else if (exitCode !== 0) {
      throw new Error(
        `'git fetch ${remote} ${ref}' failed with exit code ${exitCode}`,
      );
    }
  }

  /**
   * Adds a new remote Git repository as a shortname.
   *
   * @param pwd the root of the git repository
   * @param shortname the shortname referencing the repository
   * @param owner the owner of the GitHub repository
   * @param repo the name of the repository
   */
  public async remoteAdd(
    pwd: string,
    shortname: string,
    owner: string | undefined,
    repo: string | undefined,
  ) {
    const { exitCode } = await this.git(
      "remote",
      ["add", shortname, `https://github.com/${owner}/${repo}.git`],
      pwd,
    );
    if (exitCode !== 0) {
      throw new Error(
        `'git remote add ${owner}/${repo}' failed with exit code ${exitCode}`,
      );
    }
  }

  public async findCommitsInRange(
    range: string,
    pwd: string,
  ): Promise<string[]> {
    const { exitCode, stdout } = await this.git(
      "log",
      ['--pretty=format:"%H"', "--reverse", range],
      pwd,
    );
    if (exitCode !== 0) {
      throw new Error(
        `'git log --pretty=format:"%H" ${range}' failed with exit code ${exitCode}`,
      );
    }
    const commitShas = stdout
      .split("\n")
      .map((sha) => sha.replace(/"/g, ""))
      .filter((sha) => sha.trim() !== "");
    return commitShas;
  }

  public async findMergeCommits(
    commitShas: string[],
    pwd: string,
  ): Promise<string[]> {
    const range = `${commitShas[0]}^..${commitShas[commitShas.length - 1]}`;
    const { exitCode, stdout } = await this.git(
      "rev-list",
      ["--merges", range],
      pwd,
    );
    if (exitCode !== 0) {
      throw new Error(
        `'git rev-list --merges ${range}' failed with exit code ${exitCode}`,
      );
    }
    const mergeCommitShas = stdout
      .split("\n")
      .filter((sha) => sha.trim() !== "");
    return mergeCommitShas;
  }

  public async push(branchname: string, remote: string, pwd: string) {
    const { exitCode } = await this.git(
      "push",
      ["--set-upstream", remote, branchname],
      pwd,
    );
    if (exitCode !== 0) {
      throw new GitPushError(
        `'git push --set-upstream ${remote} ${branchname}' failed with exit code ${exitCode}`,
        branchname,
        remote,
        exitCode,
      );
    }
  }

  public async checkout(branch: string, start: string, pwd: string) {
    const { exitCode } = await this.git("switch", ["-c", branch, start], pwd);
    if (exitCode !== 0) {
      throw new Error(
        `'git switch -c ${branch} ${start}' failed with exit code ${exitCode}`,
      );
    }
  }

  /**
   * Reports whether the halted cherry-pick applied nothing, i.e. the target
   * branch already contains the changes of the commit.
   *
   * Only valid on exit code 1. A cherry-pick that refuses to start exits 128
   * instead, so on exit code 1 the index holds nothing but this cherry-pick.
   */
  private async isEmptyPick(pwd: string): Promise<boolean> {
    const { exitCode } = await this.git(
      "diff",
      ["--cached", "--quiet", "HEAD"],
      pwd,
    );
    return exitCode === 0;
  }

  public async cherryPick(
    commitShas: string[],
    conflictResolution: string,
    pwd: string,
    mergeMode: "default" | "whitespace_tolerant",
    emptyCommits: "fail" | "skip",
  ): Promise<CherryPickResult> {
    const strategyArgs =
      mergeMode === "whitespace_tolerant" ? ["-Xignore-space-at-eol"] : [];

    const abortCherryPickAndThrow = async (
      commitShas: string[],
      exitCode: number,
    ) => {
      await this.git("cherry-pick", ["--abort"], pwd);
      throw new Error(
        `'git cherry-pick -x ${commitShas}' failed with exit code ${exitCode}`,
      );
    };

    const abortEmptyCherryPickAndThrow = async (commitShas: string[]) => {
      await this.git("cherry-pick", ["--abort"], pwd);
      throw new EmptyCherryPickError(
        `'git cherry-pick -x ${commitShas}' is empty, because the target branch already contains these changes`,
        commitShas,
      );
    };

    const haltedSha = async () => {
      const { stdout } = await this.git("rev-parse", ["CHERRY_PICK_HEAD"], pwd);
      return stdout.trim();
    };

    let emptyShas: string[] = [];
    const everyCommitWasEmpty = () =>
      emptyShas.length > 0 && emptyShas.length === commitShas.length;

    if (conflictResolution === `fail`) {
      let { exitCode } = await this.git(
        "cherry-pick",
        ["-x", ...strategyArgs, ...commitShas],
        pwd,
      );

      // `--skip` resumes the sequence, which halts again on the next empty
      // commit or conflict, so this drains any number of empty commits.
      while (exitCode === 1 && (await this.isEmptyPick(pwd))) {
        if (emptyCommits === `fail`) {
          await abortEmptyCherryPickAndThrow(commitShas);
        }
        const sha = await haltedSha();
        console.log(`Skipping ${sha}, the target branch already contains it`);
        emptyShas.push(sha);
        ({ exitCode } = await this.git("cherry-pick", ["--skip"], pwd));
      }

      if (exitCode !== 0) {
        await abortCherryPickAndThrow(commitShas, exitCode);
      }

      // No cherry-pick is in progress here, so this must not abort one.
      if (everyCommitWasEmpty()) {
        return { status: "empty" };
      }

      return { status: "picked" };
    } else {
      let uncommittedShas: string[] = [...commitShas];

      // Cherry-pick commit one by one.
      while (uncommittedShas.length > 0) {
        const { exitCode } = await this.git(
          "cherry-pick",
          ["-x", ...strategyArgs, uncommittedShas[0]],
          pwd,
        );

        if (exitCode !== 0) {
          if (exitCode === 1) {
            if (await this.isEmptyPick(pwd)) {
              if (emptyCommits === `fail`) {
                await abortEmptyCherryPickAndThrow([uncommittedShas[0]]);
              }

              console.log(
                `Skipping ${uncommittedShas[0]}, the target branch already contains it`,
              );
              emptyShas.push(uncommittedShas[0]);

              // Clears the sequencer state, which would block the next commit.
              const { exitCode: skipExitCode } = await this.git(
                "cherry-pick",
                ["--skip"],
                pwd,
              );

              if (skipExitCode !== 0) {
                await abortCherryPickAndThrow(
                  [uncommittedShas[0]],
                  skipExitCode,
                );
              }

              uncommittedShas.shift();
              continue;
            }

            // conflict encountered
            if (conflictResolution === `draft_commit_conflicts`) {
              // Commit the conflict, resolution of this commit is left to the user.
              // Allow creating PR for cherry-pick with only 1 commit and it results in a conflict.
              const { exitCode } = await this.git(
                "commit",
                ["--all", `-m BACKPORT-CONFLICT`],
                pwd,
              );

              if (exitCode !== 0) {
                await abortCherryPickAndThrow(commitShas, exitCode);
              }

              return { status: "conflicts", uncommittedShas };
            } else {
              throw new Error(
                `'Unsupported conflict_resolution method ${conflictResolution}`,
              );
            }
          } else {
            // other fail reasons
            await abortCherryPickAndThrow([uncommittedShas[0]], exitCode);
          }
        }

        // pop sha
        uncommittedShas.shift();
      }

      if (everyCommitWasEmpty()) {
        return { status: "empty" };
      }

      return { status: "picked" };
    }
  }
}

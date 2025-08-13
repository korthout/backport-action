export type Execa = (typeof import("execa"))["execa"];

export class GitRefNotFoundError extends Error {
  ref: string;
  constructor(message: string, ref: string) {
    super(message);
    this.ref = ref;
  }
}

export class Git {
  constructor(
    private execa: Execa,
    private gitCommitterName: string,
    private gitCommitterEmail: string,
  ) {}

  private async git(command: string, args: string[], pwd: string) {
    console.log(`git ${command} ${args.join(" ")}`);
    const child = this.execa("git", [command, ...args], {
      cwd: pwd,
      env: {
        GIT_COMMITTER_NAME: this.gitCommitterName,
        GIT_COMMITTER_EMAIL: this.gitCommitterEmail,
      },
      reject: false,
    });
    child.stderr?.pipe(process.stderr);
    return child;
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
    return exitCode;
  }

  public async checkout(branch: string, start: string, pwd: string) {
    const { exitCode } = await this.git("switch", ["-c", branch, start], pwd);
    if (exitCode !== 0) {
      throw new Error(
        `'git switch -c ${branch} ${start}' failed with exit code ${exitCode}`,
      );
    }
  }

  public async cherryPick(
    commitShas: string[],
    conflictResolution: string,
    pwd: string,
  ): Promise<string[] | null> {
    const abortCherryPickAndThrow = async (
      commitShas: string[],
      exitCode: number,
    ) => {
      await this.git("cherry-pick", ["--abort"], pwd);
      throw new Error(
        `'git cherry-pick -x ${commitShas}' failed with exit code ${exitCode}`,
      );
    };

    if (conflictResolution === `fail`) {
      const { exitCode } = await this.git(
        "cherry-pick",
        ["-x", ...commitShas],
        pwd,
      );

      if (exitCode !== 0) {
        await abortCherryPickAndThrow(commitShas, exitCode);
      }

      return null;
    } else {
      let uncommittedShas: string[] = [...commitShas];

      // Cherry-pick commit one by one.
      while (uncommittedShas.length > 0) {
        const { exitCode } = await this.git(
          "cherry-pick",
          ["-x", uncommittedShas[0]],
          pwd,
        );

        if (exitCode !== 0) {
          if (exitCode === 1) {
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

              return uncommittedShas;
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

      return null;
    }
  }
}

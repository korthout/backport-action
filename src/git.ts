export type Execa = (typeof import("execa"))["execa"];

export class GitRefNotFoundError extends Error {
  ref: string;
  constructor(message: string, ref: string) {
    super(message);
    this.ref = ref;
  }
}

export class Git {
  constructor(private execa: Execa) {}

  private async git(command: string, args: string[], pwd: string) {
    console.log(`git ${command} ${args.join(" ")}`);
    const child = this.execa("git", [command, ...args], {
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

  /**
   * Fetches a ref from origin
   *
   * @param ref the sha, branchname, etc to fetch
   * @param pwd the root of the git repository
   * @param depth the number of commits to fetch
   * @throws GitRefNotFoundError when ref not found
   * @throws Error for any other non-zero exit code
   */
  public async fetch(ref: string, pwd: string, depth: number) {
    const { exitCode } = await this.git(
      "fetch",
      [`--depth=${depth}`, "origin", ref],
      pwd,
    );
    if (exitCode === 128) {
      throw new GitRefNotFoundError(
        `Expected to fetch '${ref}', but couldn't find it`,
        ref,
      );
    } else if (exitCode !== 0) {
      throw new Error(
        `'git fetch origin ${ref}' failed with exit code ${exitCode}`,
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

  public async push(branchname: string, pwd: string) {
    const { exitCode } = await this.git(
      "push",
      ["--set-upstream", "origin", branchname],
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
    allowPartialCherryPick: boolean,
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

    if (!allowPartialCherryPick) {
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
      let uncommitedShas: string[] = [...commitShas];

      // Cherry-pick commit one by one.
      for (const sha of commitShas) {
        const { exitCode } = await this.git("cherry-pick", ["-x", sha], pwd);

        if (exitCode !== 0) {
          if (exitCode === 1) {
            // conflict encountered
            // abort conflict cherry-pick
            await this.git("cherry-pick", ["--abort"], pwd);

            return uncommitedShas;
          } else {
            // other fail reasons
            await abortCherryPickAndThrow([sha], exitCode);
          }
        }

        // pop sha
        uncommitedShas.shift();
      }

      return null;
    }
  }
}

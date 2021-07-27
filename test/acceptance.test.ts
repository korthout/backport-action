import * as child from "child_process";
import { promisify } from "util";
import { getBackportScript } from "../src/exec";

const execPromised = promisify(child.exec);
async function exec({
  command,
  args = [],
  options = { cwd: "test" },
  quiet = true,
  verbose = false,
}: Command): Promise<Output> {
  const fullCommand = `${command} ${args?.join(" ")}`;
  const execution = execPromised(fullCommand, options);
  if (!quiet) {
    execution.then((ps) => {
      console.log(fullCommand);
      if (verbose) {
        if (ps.stdout) console.log(ps.stdout);
        if (ps.stderr) console.log(ps.stderr);
      }
    });
    if (verbose) {
      execution.catch(console.error);
    }
  }
  return execution;
}

describe("given a git repository with a merged pr", () => {
  beforeAll(async () => {
    await exec({ command: "./setup.sh" });

    // check the history graph
    const { stdout } = await exec({
      command: "git log --graph --oneline --decorate",
      options: {
        cwd: "test/repo",
      },
    });
    expect(stdout).toContain(
      "(HEAD -> master, release-2) Merge branches 'feature-b' and 'feature-c'"
    );
  });

  describe("when backport is performed with unavailable headref", () => {
    test("then it returns exit code 5", async () => {
      // promisedExec's error is unhandled when exit code is non-zero, use child.exec instead
      child
        .exec(
          getBackportScript(
            "test/repo",
            "abcdef123456",
            "master^",
            "release-1",
            "backport-b-to-1"
          )
        )
        .on("exit", (code) => expect(code).toBe(5));
    });
  });

  describe("when backport.sh script is executed", () => {
    beforeAll(async () => {
      await exec({
        command: getBackportScript(
          "test/repo", // directory (repo directory)
          "feature-b", //headref (pr head)
          "master^", // baseref (pr target)
          "release-1", // target (backport onto this)
          "backport-b-to-1" // branchname (name of new backport branch)
        ),
        options: { cwd: "./" },
        quiet: false,
      });
    });

    test("then it cherry-picked all commits from the PR to backport-b-to-1", async () => {
      const prLog = await exec({
        command: 'git log feature-b --oneline | grep -v "init: add README.md"',
        options: { cwd: "test/repo" },
      });
      const backportLog = await exec({
        command: 'git log backport-b-to-1 | grep "cherry picked from"',
        options: { cwd: "test/repo" },
      });
      prLog.stdout
        .split("\n")
        .map((commit) => commit.split(" ")[0])
        .forEach((sha) => expect(backportLog.stdout).toContain(sha));
    });

    test("then it cherry-picked all commits from the PR with the right committer", async () => {
      const log = await exec({
        command:
          'git log master..backport-b-to-1 --pretty=full | grep "Commit: "',
        options: { cwd: "test/repo" },
      });
      log.stdout
        .split("\n")
        .filter((line) => line !== "")
        .map((commit) => commit.split(": ")[1])
        .forEach((committer) =>
          expect(committer).toEqual(
            "github-actions[bot] <github-actions[bot]@users.noreply.github.com>"
          )
        );
    });
  });

  afterAll(async () => {
    await exec({ command: "./cleanup.sh" });
  });
});

type Command = {
  command: string;
  args?: string[];
  options?: child.ExecOptions;
  quiet?: boolean;
  verbose?: boolean;
};
type Output = { stdout: string; stderr: string };

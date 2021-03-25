import * as child from "child_process";
import { promisify } from "util";

const execPromised = promisify(child.exec);
async function exec({
  command,
  args = [],
  options = { cwd: "test" },
}: Command): Promise<Output> {
  const fullCommand = `${command} ${args?.join(" ")}`;
  const execution = execPromised(fullCommand, options);
  execution.then((ps) => {
    console.log(fullCommand);
    if (ps.stdout) console.log(ps.stdout);
    if (ps.stderr) console.log(ps.stderr);
  });
  execution.catch(console.error);
  return execution;
}

describe("given a git repository with a merged pr", () => {
  beforeEach(async () => {
    await exec({ command: "./setup.sh" });

    // print and check the history graph
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

  describe("when backport.sh script is executed", () => {
    beforeEach(async () => {
      await exec({
        command: "./backport.sh",
        args: [
          "test/repo", // directory (repo directory)
          "feature-b", //headref (pr head)
          "master^", // baseref (pr target)
          "release-1", // target (backport onto this)
          "backport-b-to-1", // branchname (name of new backport branch)
        ],
        options: { cwd: "./" },
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
  });

  afterEach(async () => {
    await exec({ command: "./cleanup.sh" });
  });
});

type Command = {
  command: string;
  args?: string[];
  options?: child.ExecOptions;
};
type Output = { stdout: string; stderr: string };

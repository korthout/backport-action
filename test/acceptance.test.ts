import { performBackport } from "../src/git";
import execa from "execa";

describe("given a git repository with a merged pr", () => {
  beforeAll(async () => {
    await execa("./setup.sh", [], { cwd: "test" });
  });

  test("it contains history", async () => {
    const { stdout } = await execa(
      "git",
      ["log", "--graph", "--oneline", "--decorate"],
      {
        cwd: "test/repo",
      }
    );
    expect(stdout).toContain(
      "(HEAD -> master, release-2) Merge branches 'feature-b' and 'feature-c'"
    );
  });

  describe("when backport is performed with unavailable headref", () => {
    test("then it returns exit code 5", async () => {
      expect(
        await performBackport(
          "test/repo",
          "abcdef123456",
          "master^",
          "release-1",
          "backport-b-to-1"
        )
      ).toBe(5);
    });
  });

  describe("when backport.sh script is executed", () => {
    beforeAll(async () => {
      expect(
        await performBackport(
          "test/repo", // directory (repo directory)
          "feature-b", //headref (pr head)
          "master^", // baseref (pr target)
          "release-1", // target (backport onto this)
          "backport-b-to-1" // branchname (name of new backport branch)
        )
      ).toBe(0);
    });

    test("then it cherry-picked all commits from the PR to backport-b-to-1", async () => {
      const prLog = await execa(
        "git",
        ["log", "backport-b-to-1..feature-b", "--oneline"],
        {
          cwd: "test/repo",
        }
      );
      const backportLog = await execa(
        "git",
        ["log", "release-1..backport-b-to-1"],
        {
          cwd: "test/repo",
        }
      );
      const cherryPickedFrom = backportLog.stdout
        .split("\n")
        .filter((line) => line.match("cherry picked from"))
        .join();
      prLog.stdout
        .split("\n")
        .map((commit) => commit.split(" ")[0])
        .forEach((sha) => expect(cherryPickedFrom).toContain(sha));
    });

    test("then it cherry-picked all commits from the PR with the right committer", async () => {
      const { stdout } = await execa(
        "git",
        ["log", "master..backport-b-to-1", "--pretty=full"],
        { cwd: "test/repo" }
      );
      stdout
        .split("\n")
        .filter((line) => line.match("Commit: "))
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
    await execa("./cleanup.sh", [], { cwd: "test" });
  });
});

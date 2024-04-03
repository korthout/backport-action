import { Git, GitRefNotFoundError } from "../git";
import { execa } from "execa";

const git = new Git(execa);
let response = { exitCode: 0, stdout: "" };
let responseCommit = { exitCode: 0, stdout: "" };

jest.mock("execa", () => ({
  execa: jest.fn((command: string, args?: readonly string[] | undefined) => {
    if (command === "git" && args) {
      const subCommand = args[0];
      if (subCommand === "commit") {
        // Mock behavior for "git commit"
        return responseCommit;
      }
    }
    return response;
  }),
}));

describe("git.fetch", () => {
  describe("throws GitRefNotFoundError", () => {
    it("when fetching an unknown ref, i.e. exit code 128", async () => {
      response.exitCode = 128;
      expect.assertions(3);
      await git.fetch("unknown", "", 1).catch((error) => {
        expect(error).toBeInstanceOf(GitRefNotFoundError);
        expect(error).toHaveProperty(
          "message",
          "Expected to fetch 'unknown', but couldn't find it",
        );
        expect(error).toHaveProperty("ref", "unknown");
      });
    });
  });

  describe("throws Error", () => {
    it("when failing with an unexpected non-zero exit code", async () => {
      response.exitCode = 1;
      await expect(git.fetch("unknown", "", 1)).rejects.toThrowError(
        `'git fetch origin unknown' failed with exit code 1`,
      );
    });
  });
});

describe("git.cherryPick", () => {
  describe("with conflict_resolution to fail", () => {
    describe("throws Error", () => {
      it("when failing with an unexpected non-zero exit code", async () => {
        response.exitCode = 1;
        await expect(
          git.cherryPick(["unknown"], `fail`, ""),
        ).rejects.toThrowError(
          `'git cherry-pick -x unknown' failed with exit code 1`,
        );
      });
    });

    describe("returns null", () => {
      it("when success", async () => {
        response.exitCode = 0;
        await expect(
          git.cherryPick(["unknown"], `draft_commit_conflicts`, ""),
        ).resolves.toBe(null);
      });
    });
  });

  describe("with conflict_resolution to draft_commit_conflicts", () => {
    describe("throw Error", () => {
      it("when failing with an unexpected non-zero and non-one exit code", async () => {
        response.exitCode = 128;
        await expect(
          git.cherryPick(["unknown"], `draft_commit_conflicts`, ""),
        ).rejects.toThrowError(
          `'git cherry-pick -x unknown' failed with exit code 128`,
        );
      });

      it("when failing cherry-pick with exit code 1 and commit unsuccessful", async () => {
        response.exitCode = 1;
        responseCommit.exitCode = 1;
        await expect(
          git.cherryPick(["unknown"], `draft_commit_conflicts`, ""),
        ).rejects.toThrowError(
          `'git cherry-pick -x unknown' failed with exit code 1`,
        );
      });

      describe("returns uncomitted shas", () => {
        it("when failing cherry-pick with exit code 1 and commit successful", async () => {
          response.exitCode = 1;
          responseCommit.exitCode = 0;
          await expect(
            git.cherryPick(["unknown"], `draft_commit_conflicts`, ""),
          ).resolves.toEqual(["unknown"]);
        });
      });

      describe("returns null", () => {
        it("when success", async () => {
          response.exitCode = 0;
          await expect(
            git.cherryPick(["unknown"], `draft_commit_conflicts`, ""),
          ).resolves.toBe(null);
        });
      });
    });
  });
});

describe("git.findMergeCommits", () => {
  describe("throws Error", () => {
    it("when failing with an unpexected non-zero exit code", async () => {
      response.exitCode = 1;
      await expect(git.findMergeCommits(["unknown"], "")).rejects.toThrowError(
        `'git rev-list --merges unknown^..unknown' failed with exit code 1`,
      );
    });
  });

  describe("returns all merge commits", () => {
    it("when git rev-list outputs them", async () => {
      response.exitCode = 0;
      response.stdout = "two\nfour";
      expect(
        await git.findMergeCommits(["one", "two", "three", "four"], ""),
      ).toEqual(["two", "four"]);
    });
  });
});

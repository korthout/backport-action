import { describe, it, expect, vi, beforeEach } from "vitest";

let response = { exitCode: 0, stdout: "" };
let responseCommit = { exitCode: 0, stdout: "" };
// Exit code 1 means the index differs from HEAD, i.e. the cherry-pick hit a
// conflict rather than turning out empty.
let responseDiff = { exitCode: 1, stdout: "" };
let responseSkip = { exitCode: 0, stdout: "" };

const getExecOutputMock = vi.fn(
  (command: string, args?: readonly string[] | undefined) => {
    if (command === "git" && args) {
      const subCommand = args[0];
      if (subCommand === "commit") {
        // Mock behavior for "git commit"
        return responseCommit;
      }
      if (subCommand === "diff") {
        return responseDiff;
      }
      if (subCommand === "cherry-pick" && args[1] === "--skip") {
        return responseSkip;
      }
      if (subCommand === "rev-parse") {
        return { exitCode: 0, stdout: "halted-sha\n" };
      }
    }
    return response;
  },
);

vi.mock("@actions/exec", () => ({
  getExecOutput: getExecOutputMock,
}));

const { Git, GitRefNotFoundError } = await import("../git.js");
const { EmptyCherryPickError } = await import("../errors.js");

const git = new Git(
  "github-actions[bot]",
  "github-actions[bot]@users.noreply.github.com",
  process.env.GIT_SILENT === "1",
);

describe("git.fetch", () => {
  describe("throws GitRefNotFoundError", () => {
    it("when fetching an unknown ref, i.e. exit code 128", async () => {
      response.exitCode = 128;
      expect.assertions(3);
      await git.fetch("unknown", "", 1).catch((error) => {
        expect(error).toBeInstanceOf(GitRefNotFoundError);
        expect(error).toHaveProperty(
          "message",
          "Expected to fetch 'unknown' from 'origin', but couldn't find it",
        );
        expect(error).toHaveProperty("ref", "unknown");
      });
    });
  });

  describe("throws Error", () => {
    it("when failing with an unexpected non-zero exit code", async () => {
      response.exitCode = 1;
      await expect(git.fetch("unknown", "", 1)).rejects.toThrow(
        `'git fetch origin unknown' failed with exit code 1`,
      );
    });
  });
});

describe("git.cherryPick", () => {
  beforeEach(() => {
    responseDiff = { exitCode: 1, stdout: "" };
    responseSkip = { exitCode: 0, stdout: "" };
  });

  describe("with conflict_resolution to fail", () => {
    describe("throws Error", () => {
      it("when failing with an unexpected non-zero exit code", async () => {
        response.exitCode = 1;
        await expect(
          git.cherryPick(["unknown"], `fail`, "", "default", `skip`),
        ).rejects.toThrow(
          `'git cherry-pick -x unknown' failed with exit code 1`,
        );
      });
    });

    describe("returns null", () => {
      it("when success", async () => {
        response.exitCode = 0;
        await expect(
          git.cherryPick(
            ["unknown"],
            `draft_commit_conflicts`,
            "",
            "default",
            `skip`,
          ),
        ).resolves.toEqual({ status: "picked" });
      });
    });
  });

  describe("with conflict_resolution to draft_commit_conflicts", () => {
    describe("throw Error", () => {
      it("when failing with an unexpected non-zero and non-one exit code", async () => {
        response.exitCode = 128;
        await expect(
          git.cherryPick(
            ["unknown"],
            `draft_commit_conflicts`,
            "",
            "default",
            `skip`,
          ),
        ).rejects.toThrow(
          `'git cherry-pick -x unknown' failed with exit code 128`,
        );
      });

      it("when failing cherry-pick with exit code 1 and commit unsuccessful", async () => {
        response.exitCode = 1;
        responseCommit.exitCode = 1;
        await expect(
          git.cherryPick(
            ["unknown"],
            `draft_commit_conflicts`,
            "",
            "default",
            `skip`,
          ),
        ).rejects.toThrow(
          `'git cherry-pick -x unknown' failed with exit code 1`,
        );
      });

      describe("returns uncomitted shas", () => {
        it("when failing cherry-pick with exit code 1 and commit successful", async () => {
          response.exitCode = 1;
          responseCommit.exitCode = 0;
          await expect(
            git.cherryPick(
              ["unknown"],
              `draft_commit_conflicts`,
              "",
              "default",
              `skip`,
            ),
          ).resolves.toEqual({
            status: "conflicts",
            uncommittedShas: ["unknown"],
          });
        });
      });

      describe("returns null", () => {
        it("when success", async () => {
          response.exitCode = 0;
          await expect(
            git.cherryPick(
              ["unknown"],
              `draft_commit_conflicts`,
              "",
              "default",
              `skip`,
            ),
          ).resolves.toEqual({ status: "picked" });
        });
      });
    });
  });
});

describe("git.cherryPick empty commits", () => {
  beforeEach(() => {
    response.exitCode = 1;
    responseCommit.exitCode = 0;
    // An index equal to HEAD: the cherry-pick applied nothing.
    responseDiff = { exitCode: 0, stdout: "" };
    responseSkip = { exitCode: 0, stdout: "" };
    getExecOutputMock.mockClear();
  });

  describe("with empty_commits to skip", () => {
    it("returns empty when every commit is already on the target branch", async () => {
      await expect(
        git.cherryPick(["unknown"], `fail`, "", "default", `skip`),
      ).resolves.toEqual({ status: "empty" });
    });

    it("returns empty in draft mode without committing a conflict", async () => {
      await expect(
        git.cherryPick(
          ["unknown"],
          `draft_commit_conflicts`,
          "",
          "default",
          `skip`,
        ),
      ).resolves.toEqual({ status: "empty" });
      expect(
        getExecOutputMock.mock.calls.some(
          ([, args]) => Array.isArray(args) && args[0] === "commit",
        ),
      ).toBe(false);
    });
  });

  describe("with empty_commits to fail", () => {
    it("throws EmptyCherryPickError", async () => {
      await expect(
        git.cherryPick(["unknown"], `fail`, "", "default", `fail`),
      ).rejects.toBeInstanceOf(EmptyCherryPickError);
    });

    it("throws EmptyCherryPickError in draft mode", async () => {
      await expect(
        git.cherryPick(
          ["unknown"],
          `draft_commit_conflicts`,
          "",
          "default",
          `fail`,
        ),
      ).rejects.toBeInstanceOf(EmptyCherryPickError);
    });
  });
});

describe("git.cherryPick mergeMode arg contract", () => {
  beforeEach(() => {
    response.exitCode = 0;
    responseCommit.exitCode = 0;
    getExecOutputMock.mockClear();
  });

  describe("fail mode (conflict_resolution: fail)", () => {
    it("default mode passes no extra flags", async () => {
      await git.cherryPick(["abc123"], "fail", "", "default", "skip");
      const cherryPickCall = getExecOutputMock.mock.calls.find(
        ([, args]) => Array.isArray(args) && args[0] === "cherry-pick",
      );
      expect(cherryPickCall).toBeDefined();
      expect(cherryPickCall![1]).toEqual(["cherry-pick", "-x", "abc123"]);
    });

    it("whitespace_tolerant mode adds -Xignore-space-at-eol", async () => {
      await git.cherryPick(
        ["abc123"],
        "fail",
        "",
        "whitespace_tolerant",
        "skip",
      );
      const cherryPickCall = getExecOutputMock.mock.calls.find(
        ([, args]) => Array.isArray(args) && args[0] === "cherry-pick",
      );
      expect(cherryPickCall).toBeDefined();
      expect(cherryPickCall![1]).toEqual([
        "cherry-pick",
        "-x",
        "-Xignore-space-at-eol",
        "abc123",
      ]);
    });
  });

  describe("draft mode (conflict_resolution: draft_commit_conflicts)", () => {
    it("default mode passes no extra flags", async () => {
      await git.cherryPick(
        ["abc123"],
        "draft_commit_conflicts",
        "",
        "default",
        "skip",
      );
      const cherryPickCall = getExecOutputMock.mock.calls.find(
        ([, args]) => Array.isArray(args) && args[0] === "cherry-pick",
      );
      expect(cherryPickCall).toBeDefined();
      expect(cherryPickCall![1]).toEqual(["cherry-pick", "-x", "abc123"]);
    });

    it("whitespace_tolerant mode adds -Xignore-space-at-eol", async () => {
      await git.cherryPick(
        ["abc123"],
        "draft_commit_conflicts",
        "",
        "whitespace_tolerant",
        "skip",
      );
      const cherryPickCall = getExecOutputMock.mock.calls.find(
        ([, args]) => Array.isArray(args) && args[0] === "cherry-pick",
      );
      expect(cherryPickCall).toBeDefined();
      expect(cherryPickCall![1]).toEqual([
        "cherry-pick",
        "-x",
        "-Xignore-space-at-eol",
        "abc123",
      ]);
    });
  });
});

describe("git.findMergeCommits", () => {
  describe("throws Error", () => {
    it("when failing with an unpexected non-zero exit code", async () => {
      response.exitCode = 1;
      await expect(git.findMergeCommits(["unknown"], "")).rejects.toThrow(
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

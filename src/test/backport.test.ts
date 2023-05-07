import { findTargetBranches } from "../backport";

jest.mock("execa", () => ({
  execa: jest.fn(),
}));

const default_pattern = /^backport ([^ ]+)$/;

describe("find target branches", () => {
  describe("returns an empty list", () => {
    it("when labels is an empty list", () => {
      expect(
        findTargetBranches({ labels: { pattern: default_pattern } }, [])
      ).toEqual([]);
    });

    it("when none of the labels match the pattern", () => {
      expect(
        findTargetBranches({ labels: { pattern: default_pattern } }, [
          "a label",
          "another-label",
          "a/third/label",
        ])
      ).toEqual([]);
    });

    it("when a label matches the pattern but doesn't capture a target branch", () => {
      expect(
        findTargetBranches({ labels: { pattern: /^no capture group$/ } }, ["no capture group"])
      ).toEqual([]);
    });

    it("when target_branches is an empty string", () => {
      expect(
        findTargetBranches(
          { labels: { pattern: default_pattern }, target_branches: "" },
          ["a label"]
        )
      ).toEqual([]);
    });
  });

  describe("returns selected branches", () => {
    it("when a label matches the pattern and captures a target branch", () => {
      expect(
        findTargetBranches({ labels: { pattern: default_pattern } }, [
          "backport release-1",
        ])
      ).toEqual(["release-1"]);
    });

    it("when several labels match the pattern and capture a target branch", () => {
      expect(
        findTargetBranches({ labels: { pattern: default_pattern } }, [
          "backport release-1",
          "backport another/target/branch",
        ])
      ).toEqual(["release-1", "another/target/branch"]);
    });

    it("when a target branch is specified", () => {
      expect(
        findTargetBranches(
          {
            labels: { pattern: default_pattern },
            target_branches: "release-1",
          },
          []
        )
      ).toEqual(["release-1"]);
    });

    it("when several target branches are specified", () => {
      expect(
        findTargetBranches(
          {
            labels: { pattern: default_pattern },
            target_branches: "release-1,another/target/branch",
          },
          []
        )
      ).toEqual(["release-1", "another/target/branch"]);
    });

    it("without duplicates", () => {
      expect(
        findTargetBranches(
          {
            labels: { pattern: default_pattern },
            target_branches: "release-1",
          },
          ["backport release-1"]
        )
      ).toEqual(["release-1"]);
    });
  });
});

import { findTargetBranches } from "../backport";
import { replacePlaceholders } from "../utils";

const default_pattern = /^backport ([^ ]+)$/;

describe("find target branches", () => {
  describe("returns an empty list", () => {
    it("when labels is an empty list", () => {
      expect(
        findTargetBranches(
          { source_labels_pattern: default_pattern },
          [],
          "feature/one",
        ),
      ).toEqual([]);
    });

    it("when none of the labels match the pattern", () => {
      expect(
        findTargetBranches(
          { source_labels_pattern: default_pattern },
          ["a label", "another-label", "a/third/label"],
          "feature/one",
        ),
      ).toEqual([]);
    });

    it("when a label matches the pattern but doesn't capture a target branch", () => {
      expect(
        findTargetBranches(
          { source_labels_pattern: /^no capture group$/ },
          ["no capture group"],
          "feature/one",
        ),
      ).toEqual([]);
    });

    it("when the label pattern is an empty string", () => {
      expect(
        findTargetBranches(
          { source_labels_pattern: undefined },
          ["an empty string"],
          "feature/one",
        ),
      ).toEqual([]);
    });

    it("when target_branches is an empty string", () => {
      expect(
        findTargetBranches(
          { source_labels_pattern: default_pattern, target_branches: "" },
          ["a label"],
          "feature/one",
        ),
      ).toEqual([]);
    });

    it("when the label pattern only matches the headref", () => {
      expect(
        findTargetBranches(
          { source_labels_pattern: default_pattern },
          ["backport feature/one"],
          "feature/one",
        ),
      ).toEqual([]);
    });

    it("when target_branches only contains the headref", () => {
      expect(
        findTargetBranches(
          { target_branches: "feature/one" },
          [],
          "feature/one",
        ),
      ).toEqual([]);
    });
  });

  describe("returns selected branches", () => {
    it("when a label matches the pattern and captures a target branch", () => {
      expect(
        findTargetBranches(
          { source_labels_pattern: default_pattern },
          ["backport release-1"],
          "feature/one",
        ),
      ).toEqual(["release-1"]);
    });

    it("when several labels match the pattern and capture a target branch", () => {
      expect(
        findTargetBranches(
          { source_labels_pattern: default_pattern },
          ["backport release-1", "backport another/target/branch"],
          "feature/one",
        ),
      ).toEqual(["release-1", "another/target/branch"]);
    });

    it("when a target branch is specified", () => {
      expect(
        findTargetBranches(
          {
            source_labels_pattern: default_pattern,
            target_branches: "release-1",
          },
          [],
          "feature/one",
        ),
      ).toEqual(["release-1"]);
    });

    it("when several target branches are specified", () => {
      expect(
        findTargetBranches(
          {
            source_labels_pattern: default_pattern,
            target_branches: "release-1 another/target/branch",
          },
          [],
          "feature/one",
        ),
      ).toEqual(["release-1", "another/target/branch"]);
    });

    it("without duplicates", () => {
      expect(
        findTargetBranches(
          {
            source_labels_pattern: default_pattern,
            target_branches: "release-1",
          },
          ["backport release-1"],
          "feature/one",
        ),
      ).toEqual(["release-1"]);
    });

    it("when several labels match the pattern the headref is excluded", () => {
      expect(
        findTargetBranches(
          { source_labels_pattern: default_pattern },
          ["backport feature/one", "backport feature/two"],
          "feature/one",
        ),
      ).toEqual(["feature/two"]);
    });

    it("when several target branches are specified the headref is excluded", () => {
      expect(
        findTargetBranches(
          { target_branches: "feature/one feature/two" },
          [],
          "feature/one",
        ),
      ).toEqual(["feature/two"]);
    });
  });
});

describe("compose labels", () => {
  const main = {
    number: 42,
    body: "Mentions #123",
    user: { login: "octocat" },
    title: "Fix: sample",
  };

  const target = "release-1";

  const compose = (
    labelsToCopy: string[],
    addLabels: string[],
  ): string[] => [
    ...new Set([
      ...labelsToCopy,
      ...addLabels.map((label) =>
        replacePlaceholders(label, main, target),
      ),
    ]),
  ];

  it("replaces placeholders in add_labels", () => {
    const labels = compose([], [
      "backport-${target_branch}",
      "from-${pull_author}",
      "pr-${pull_number}",
    ]);

    expect(labels).toEqual([
      "backport-release-1",
      "from-octocat",
      "pr-42",
    ]);
  });

  it("deduplicates copied and added labels after replacement", () => {
    const labels = compose(
      ["existing", "backport-release-1"],
      ["backport-${target_branch}", "existing"],
    );

    expect(labels).toEqual(["existing", "backport-release-1"]);
  });
});

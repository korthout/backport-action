import { findTargetBranches, shouldEnableAutoMerge } from "../backport";

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

describe("should enable auto merge", () => {
  describe("with default disabled", () => {
    const config = {
      enable_auto_merge: false,
      auto_merge_enable_label: "backport-auto-merge",
      auto_merge_disable_label: "backport-no-auto-merge",
    };

    it("returns false when no labels present", () => {
      expect(shouldEnableAutoMerge(config, [])).toBe(false);
    });

    it("returns false when no matching labels present", () => {
      expect(
        shouldEnableAutoMerge(config, ["some-label", "another-label"]),
      ).toBe(false);
    });

    it("returns true when enable label present", () => {
      expect(shouldEnableAutoMerge(config, ["backport-auto-merge"])).toBe(true);
    });

    it("returns true when enable label present with other labels", () => {
      expect(
        shouldEnableAutoMerge(config, [
          "some-label",
          "backport-auto-merge",
          "another-label",
        ]),
      ).toBe(true);
    });

    it("returns false when disable label present (takes precedence)", () => {
      expect(shouldEnableAutoMerge(config, ["backport-no-auto-merge"])).toBe(
        false,
      );
    });

    it("returns false when both enable and disable labels present (disable wins)", () => {
      expect(
        shouldEnableAutoMerge(config, [
          "backport-auto-merge",
          "backport-no-auto-merge",
        ]),
      ).toBe(false);
    });
  });

  describe("with default enabled", () => {
    const config = {
      enable_auto_merge: true,
      auto_merge_enable_label: "backport-auto-merge",
      auto_merge_disable_label: "backport-no-auto-merge",
    };

    it("returns true when no labels present", () => {
      expect(shouldEnableAutoMerge(config, [])).toBe(true);
    });

    it("returns true when no matching labels present", () => {
      expect(
        shouldEnableAutoMerge(config, ["some-label", "another-label"]),
      ).toBe(true);
    });

    it("returns true when enable label present", () => {
      expect(shouldEnableAutoMerge(config, ["backport-auto-merge"])).toBe(true);
    });

    it("returns false when disable label present", () => {
      expect(shouldEnableAutoMerge(config, ["backport-no-auto-merge"])).toBe(
        false,
      );
    });

    it("returns false when both enable and disable labels present (disable wins)", () => {
      expect(
        shouldEnableAutoMerge(config, [
          "backport-auto-merge",
          "backport-no-auto-merge",
        ]),
      ).toBe(false);
    });
  });

  describe("with custom labels", () => {
    const config = {
      enable_auto_merge: false,
      auto_merge_enable_label: "merge-me",
      auto_merge_disable_label: "dont-merge",
    };

    it("returns true when custom enable label matches", () => {
      expect(shouldEnableAutoMerge(config, ["merge-me"])).toBe(true);
    });

    it("returns false when custom disable label matches", () => {
      expect(shouldEnableAutoMerge(config, ["dont-merge"])).toBe(false);
    });

    it("returns false when default labels present (no exact match)", () => {
      expect(
        shouldEnableAutoMerge(config, [
          "backport-auto-merge",
          "backport-no-auto-merge",
        ]),
      ).toBe(false);
    });
  });

  describe("with undefined labels", () => {
    const config = {
      enable_auto_merge: false,
      auto_merge_enable_label: undefined,
      auto_merge_disable_label: undefined,
    };

    it("returns default when no labels defined", () => {
      expect(
        shouldEnableAutoMerge(config, [
          "backport-auto-merge",
          "backport-no-auto-merge",
        ]),
      ).toBe(false);
    });
  });

  describe("with only enable label defined", () => {
    const config = {
      enable_auto_merge: false,
      auto_merge_enable_label: "backport-auto-merge",
      auto_merge_disable_label: undefined,
    };

    it("returns true when enable label matches", () => {
      expect(shouldEnableAutoMerge(config, ["backport-auto-merge"])).toBe(true);
    });

    it("returns false when no matching labels (no disable label to check)", () => {
      expect(shouldEnableAutoMerge(config, ["backport-no-auto-merge"])).toBe(
        false,
      );
    });
  });

  describe("with only disable label defined", () => {
    const config = {
      enable_auto_merge: true,
      auto_merge_enable_label: undefined,
      auto_merge_disable_label: "backport-no-auto-merge",
    };

    it("returns false when disable label matches", () => {
      expect(shouldEnableAutoMerge(config, ["backport-no-auto-merge"])).toBe(
        false,
      );
    });

    it("returns true when no matching labels (no enable label to check)", () => {
      expect(shouldEnableAutoMerge(config, ["backport-auto-merge"])).toBe(true);
    });
  });

  describe("with exact string matching", () => {
    const config = {
      enable_auto_merge: false,
      auto_merge_enable_label: "auto-merge",
      auto_merge_disable_label: "no-auto-merge",
    };

    it("returns false when partial matches", () => {
      expect(shouldEnableAutoMerge(config, ["auto-merge-feature"])).toBe(false);
      expect(shouldEnableAutoMerge(config, ["no-auto-merge-feature"])).toBe(
        false,
      );
      expect(shouldEnableAutoMerge(config, ["prefix-auto-merge"])).toBe(false);
      expect(shouldEnableAutoMerge(config, ["prefix-no-auto-merge"])).toBe(
        false,
      );
    });

    it("returns true only for exact matches", () => {
      expect(shouldEnableAutoMerge(config, ["auto-merge"])).toBe(true);
      expect(shouldEnableAutoMerge(config, ["no-auto-merge"])).toBe(false); // disable wins
    });
  });
});

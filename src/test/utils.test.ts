import dedent from "dedent";
import { getMentionedIssueRefs, replacePlaceholders } from "../utils.js";

describe("get mentioned issues", () => {
  describe("returns an empty list", () => {
    it("for an null text", () => {
      expect(getMentionedIssueRefs(null)).toHaveLength(0);
    });

    it("for an empty text", () => {
      expect(getMentionedIssueRefs("")).toHaveLength(0);
    });

    it("for a text without mentioned issues", () => {
      expect(getMentionedIssueRefs(text({}))).toHaveLength(0);
    });

    it("for a text with an issue reference as part of a word", () => {
      expect(getMentionedIssueRefs(text({ part: "#123" }))).toHaveLength(0);
    });

    it("for a text with an external issue reference as part of a word", () => {
      expect(
        getMentionedIssueRefs(text({ part: "zeebe-io/zeebe#123" })),
      ).toHaveLength(0);
    });

    it("for a text with an issue url as part of a word", () => {
      expect(
        getMentionedIssueRefs(
          text({ part: "github.com/zeebe-io/backport-action/issues/123" }),
        ),
      ).toHaveLength(0);
    });
  });

  describe("returns a single reference", () => {
    it("for a text with an issue reference at the start", () => {
      expect(getMentionedIssueRefs(text({ start: "#123" }))).toEqual(["#123"]);
    });
    it("for a text with an issue reference in the middle", () => {
      expect(getMentionedIssueRefs(text({ middle: "#123" }))).toEqual(["#123"]);
    });
    it("for a text with an issue reference at the end", () => {
      expect(getMentionedIssueRefs(text({ end: "#123" }))).toEqual(["#123"]);
    });

    it("for a text with an external issue reference at the start", () => {
      expect(
        getMentionedIssueRefs(text({ start: "zeebe-io/zeebe#123" })),
      ).toEqual(["zeebe-io/zeebe#123"]);
    });
    it("for a text with an external issue reference in the middle", () => {
      expect(
        getMentionedIssueRefs(text({ middle: "zeebe-io/zeebe#123" })),
      ).toEqual(["zeebe-io/zeebe#123"]);
    });
    it("for a text with an external issue reference at the end", () => {
      expect(
        getMentionedIssueRefs(text({ end: "zeebe-io/zeebe#123" })),
      ).toEqual(["zeebe-io/zeebe#123"]);
    });

    it("for a text with an issue url at the start", () => {
      expect(
        getMentionedIssueRefs(
          text({ start: "github.com/zeebe-io/backport-action/issues/123/" }),
        ),
      ).toEqual(["zeebe-io/backport-action#123"]);
    });
    it("for a text with an issue url in the middle", () => {
      expect(
        getMentionedIssueRefs(
          text({ middle: "github.com/zeebe-io/backport-action/issues/123" }),
        ),
      ).toEqual(["zeebe-io/backport-action#123"]);
    });
    it("for a text with an issue url at the end", () => {
      expect(
        getMentionedIssueRefs(
          text({ end: "github.com/zeebe-io/backport-action/issues/123" }),
        ),
      ).toEqual(["zeebe-io/backport-action#123"]);
    });
  });

  describe("returns all references", () => {
    it("for a text with an issue reference at the start, middle and end", () => {
      expect(
        getMentionedIssueRefs(
          text({ start: "#123", middle: "#234", end: "#345" }),
        ),
      ).toEqual(["#123", "#234", "#345"]);
    });
    it("for a text with an external issue reference at the start, middle and end", () => {
      expect(
        getMentionedIssueRefs(
          text({
            start: "zeebe-io/zeebe#123",
            middle: "zeebe-io/zeebe#234",
            end: "zeebe-io/zeebe#345",
          }),
        ),
      ).toEqual([
        "zeebe-io/zeebe#123",
        "zeebe-io/zeebe#234",
        "zeebe-io/zeebe#345",
      ]);
    });
    it("for a text with an issue url at the start, middle and end", () => {
      const base = "github.com/zeebe-io/backport-action/issues/";
      expect(
        getMentionedIssueRefs(
          text({
            start: `${base}123`,
            middle: `${base}234`,
            end: `${base}345`,
          }),
        ),
      ).toEqual([
        "zeebe-io/backport-action#123",
        "zeebe-io/backport-action#234",
        "zeebe-io/backport-action#345",
      ]);
    });
    it("for a text with an external issue url at the start, middle and end", () => {
      const base = "github.com/zeebe-io/zeebe/issues/";
      expect(
        getMentionedIssueRefs(
          text({
            start: `${base}123`,
            middle: `${base}234`,
            end: `${base}345`,
          }),
        ),
      ).toEqual([
        "zeebe-io/zeebe#123",
        "zeebe-io/zeebe#234",
        "zeebe-io/zeebe#345",
      ]);
    });
  });
});

describe("compose body/title", () => {
  const main_default = {
    number: 123,
    body: "foo-body",
    user: { login: "foo-author" },
    title: "some pr title",
  };
  const target = "foo-target";

  describe("returns same value as provided template", () => {
    it("for an empty template", () => {
      expect(replacePlaceholders("", main_default, target)).toEqual("");
    });

    it("for a template without placeholders", () => {
      const template = text({});
      expect(replacePlaceholders(template, main_default, target)).toEqual(
        template,
      );
    });

    it("for a template with unknown placeholders", () => {
      const template = text({
        start: "${abc}",
        middle: "${def}",
        end: "${ghi}",
        part: "${jkl}",
      });
      expect(replacePlaceholders(template, main_default, target)).toEqual(
        template,
      );
    });
  });

  describe("returns evaluated templated", () => {
    it("for a template with target_branch placeholder", () => {
      const template = "Backport of some-title to `${target_branch}`";
      expect(replacePlaceholders(template, main_default, target)).toEqual(
        "Backport of some-title to `foo-target`",
      );
    });

    it("for a template with pull_number placeholder", () => {
      const template = "Backport of #${pull_number} to some-target";
      expect(replacePlaceholders(template, main_default, target)).toEqual(
        "Backport of #123 to some-target",
      );
    });

    it("for a template with pull_title placeholder", () => {
      const template = "Backport of ${pull_title} to some-target";
      expect(replacePlaceholders(template, main_default, target)).toEqual(
        "Backport of some pr title to some-target",
      );
    });

    describe("for a template with issue_refs placeholder", () => {
      const template = "Backport that refers to: ${issue_refs}";

      it("and body has no referred issues", () => {
        expect(replacePlaceholders(template, main_default, target)).toEqual(
          "Backport that refers to: ",
        );
      });

      it("and body has a referred issue", () => {
        expect(
          replacePlaceholders(
            template,
            {
              ...main_default,
              body: "Body mentions #123 and that's it.",
            },
            target,
          ),
        ).toEqual("Backport that refers to: #123");
      });

      it("and body has some referred issues", () => {
        expect(
          replacePlaceholders(
            template,
            {
              ...main_default,
              body: "This body refers to #123 and foo/bar#456",
            },
            target,
          ),
        ).toEqual("Backport that refers to: #123 foo/bar#456");
      });
    });

    it("for a template with pull_author placeholder", () => {
      const template = "Backport of pull made by @${pull_author}";
      expect(replacePlaceholders(template, main_default, target)).toEqual(
        "Backport of pull made by @foo-author",
      );
    });
  });
});

function text({
  start = "",
  middle = "",
  end = "",
  part = "",
}: {
  start?: string;
  middle?: string;
  end?: string;
  part?: string;
}) {
  return dedent`${start ?? ""} foo bar
                bar bar ${middle ?? ""} bar 

                foo/${part ?? ""} foo${part ?? ""}foo ${part ?? ""}foo
                
                foo bar bar foo ${end ?? ""}`;
}

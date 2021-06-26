import dedent from "dedent";
import { getMentionedIssueRefs } from "../utils";

describe("get mentioned issues", () => {
  describe("returns an empty list", () => {
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
        getMentionedIssueRefs(text({ part: "zeebe-io/zeebe#123" }))
      ).toHaveLength(0);
    });

    it("for a text with an issue url as part of a word", () => {
      expect(
        getMentionedIssueRefs(
          text({ part: "github.com/zeebe-io/backport-action/issues/123" })
        )
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
        getMentionedIssueRefs(text({ start: "zeebe-io/zeebe#123" }))
      ).toEqual(["zeebe-io/zeebe#123"]);
    });
    it("for a text with an external issue reference in the middle", () => {
      expect(
        getMentionedIssueRefs(text({ middle: "zeebe-io/zeebe#123" }))
      ).toEqual(["zeebe-io/zeebe#123"]);
    });
    it("for a text with an external issue reference at the end", () => {
      expect(
        getMentionedIssueRefs(text({ end: "zeebe-io/zeebe#123" }))
      ).toEqual(["zeebe-io/zeebe#123"]);
    });

    it("for a text with an issue url at the start", () => {
      expect(
        getMentionedIssueRefs(
          text({ start: "github.com/zeebe-io/backport-action/issues/123/" })
        )
      ).toEqual(["zeebe-io/backport-action#123"]);
    });
    it("for a text with an issue url in the middle", () => {
      expect(
        getMentionedIssueRefs(
          text({ middle: "github.com/zeebe-io/backport-action/issues/123" })
        )
      ).toEqual(["zeebe-io/backport-action#123"]);
    });
    it("for a text with an issue url at the end", () => {
      expect(
        getMentionedIssueRefs(
          text({ end: "github.com/zeebe-io/backport-action/issues/123" })
        )
      ).toEqual(["zeebe-io/backport-action#123"]);
    });
  });

  describe("returns all references", () => {
    it("for a text with an issue reference at the start, middle and end", () => {
      expect(
        getMentionedIssueRefs(
          text({ start: "#123", middle: "#234", end: "#345" })
        )
      ).toEqual(["#123", "#234", "#345"]);
    });
    it("for a text with an external issue reference at the start, middle and end", () => {
      expect(
        getMentionedIssueRefs(
          text({
            start: "zeebe-io/zeebe#123",
            middle: "zeebe-io/zeebe#234",
            end: "zeebe-io/zeebe#345",
          })
        )
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
          text({ start: `${base}123`, middle: `${base}234`, end: `${base}345` })
        )
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
          text({ start: `${base}123`, middle: `${base}234`, end: `${base}345` })
        )
      ).toEqual([
        "zeebe-io/zeebe#123",
        "zeebe-io/zeebe#234",
        "zeebe-io/zeebe#345",
      ]);
    });
  });

  // todo deal with urls to unrelated repos
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

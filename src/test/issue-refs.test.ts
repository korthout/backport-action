import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { getMentionedIssueRefs } from "../issue-refs.js";

type Fixture = {
  repository: string;
  cases: { name: string; markdown: string; github: string[]; gap?: string }[];
};

// Rendered by GitHub, see render-issue-refs.mjs
const fixture: Fixture = JSON.parse(
  readFileSync(new URL("fixtures/issue-refs.json", import.meta.url), "utf8"),
);
const [owner, repo] = fixture.repository.split("/");

/** @returns The reference as GitHub links it: `#123` in the fixture's repository, otherwise `owner/repo#123` */
function asLinked(ref: string): string {
  const [, refRepo = fixture.repository, number] =
    /^(?:(.+)#|#|gh-)0*(\d+)$/i.exec(ref)!;
  return refRepo.toLowerCase() === fixture.repository.toLowerCase()
    ? `#${number}`
    : `${refRepo.toLowerCase()}#${number}`;
}

describe("get mentioned issues", () => {
  describe("skips what GitHub doesn't render as a reference", () => {
    for (const { name, markdown, github, gap } of fixture.cases) {
      // a case with a gap documents where the scanner differs from GitHub
      (gap ? it.fails : it)(name, () => {
        const refs = getMentionedIssueRefs(markdown, { owner, repo });
        // the scanner keeps a reference as written, so this also checks that each issue is listed once
        expect(refs.map(asLinked)).toEqual(github.map(asLinked));
      });
    }
  });

  describe("returns an empty list", () => {
    it("for a null description", () => {
      expect(getMentionedIssueRefs(null, { owner, repo })).toEqual([]);
    });

    it("for an empty description", () => {
      expect(getMentionedIssueRefs("", { owner, repo })).toEqual([]);
    });
  });

  describe("lists each issue once, as first written in full", () => {
    const other = { owner: "camunda", repo: "camunda" };

    it("with a bare reference", () => {
      expect(getMentionedIssueRefs("#1 GH-2 #01", other)).toEqual([
        "#1",
        "GH-2",
      ]);
    });

    it("with a full reference to the original pull request's repository", () => {
      expect(
        getMentionedIssueRefs(
          "Camunda/Camunda#1 #1 camunda/camunda#1 #2 GH-3 camunda/camunda#2 #4",
          other,
        ),
      ).toEqual(["Camunda/Camunda#1", "camunda/camunda#2", "GH-3", "#4"]);
    });

    it("with a full reference to another repository", () => {
      expect(
        getMentionedIssueRefs(
          "Actions/Checkout#1 actions/checkout#1 #1",
          other,
        ),
      ).toEqual(["Actions/Checkout#1", "#1"]);
    });

    it("with a www.github.com url, which GitHub doesn't link", () => {
      expect(
        getMentionedIssueRefs(
          "https://www.github.com/actions/checkout/issues/1 www.github.com/actions/checkout/pull/2",
          other,
        ),
      ).toEqual(["actions/checkout#1", "actions/checkout#2"]);
    });

    it("with a reference to an issue that doesn't exist, which GitHub doesn't link", () => {
      expect(getMentionedIssueRefs("#999999 nope/nope#1", other)).toEqual([
        "#999999",
        "nope/nope#1",
      ]);
    });

    it("with a url as a full reference", () => {
      expect(
        getMentionedIssueRefs(
          "https://github.com/Camunda/Camunda/pull/3 #3 github.com/actions/checkout/issues/4",
          other,
        ),
      ).toEqual(["Camunda/Camunda#3", "actions/checkout#4"]);
    });
  });

  describe("takes time linear in the length of the description", () => {
    // GitHub limits a description to 65536 characters, these are about 1 MB
    const size = 1_000_000;
    const repeat = (text: string) => text.repeat(size / text.length);
    const growingBacktickRuns = Array.from({ length: 1400 }, (_, i) =>
      "`".repeat(i + 1),
    ).join(" ");

    it.each([
      ["unclosed comments", "a " + repeat("<!-- #1 ")],
      ["unclosed code spans", repeat("`` ` #1 ")],
      ["backtick runs of growing length", growingBacktickRuns],
      ["unclosed html tags", repeat("<a x #1 ")],
      ["unclosed code elements", repeat("<code> #1 ")],
      ["unclosed links", repeat("[a](x ")],
      ["unclosed link titles", repeat('[a](x "')],
      ["unclosed autolinks", repeat("<a:x ")],
      ["block quote markers", repeat(">")],
      ["nested list items and blank lines", repeat("- ") + repeat("\n")],
      ["glued references", repeat("#1")],
      ["repository-like words", repeat("a.a-a") + "/b#1"],
      ["urls", repeat("https://github.com/a/b/issues/1/")],
    ])("for %s", (_, body) => {
      const start = performance.now();
      getMentionedIssueRefs(body, { owner, repo });
      // generous for slow runners: these take milliseconds, a quadratic scan takes minutes
      expect(performance.now() - start).toBeLessThan(3000);
    });
  });
});

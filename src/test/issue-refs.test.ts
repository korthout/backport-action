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

describe("get mentioned issues", () => {
  describe("returns what GitHub links", () => {
    for (const { name, markdown, github, gap } of fixture.cases) {
      // a case with a gap documents where the scanner differs from GitHub
      (gap ? it.fails : it)(name, () => {
        const refs = getMentionedIssueRefs(markdown, { owner, repo });
        // GitHub writes the repository as named, the scanner as written
        expect(refs.map((ref) => ref.toLowerCase())).toEqual(
          github.map((ref) => ref.toLowerCase()),
        );
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

  describe("refers to the repository of the original pull request", () => {
    const other = { owner: "camunda", repo: "camunda" };

    it("with a bare reference", () => {
      expect(getMentionedIssueRefs("#1 GH-2", other)).toEqual(["#1", "#2"]);
    });

    it("with a full reference to that repository", () => {
      expect(
        getMentionedIssueRefs(
          "camunda/camunda#1 Camunda/Camunda#2 https://github.com/camunda/camunda/pull/3",
          other,
        ),
      ).toEqual(["#1", "#2", "#3"]);
    });

    it("but not with a full reference to another repository", () => {
      expect(
        getMentionedIssueRefs("korthout/backport-action#1 #1", other),
      ).toEqual(["korthout/backport-action#1", "#1"]);
    });
  });

  it("writes a reference to another repository as first written", () => {
    expect(
      getMentionedIssueRefs("Actions/Checkout#1 actions/checkout#1", {
        owner,
        repo,
      }),
    ).toEqual(["Actions/Checkout#1"]);
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

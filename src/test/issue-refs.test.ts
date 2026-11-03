import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { getMentionedIssueRefs } from "../issue-refs.js";

type Fixture = {
  repository: string;
  cases: { name: string; markdown: string; expected: string[]; gap?: string }[];
};

const fixture: Fixture = JSON.parse(
  readFileSync(new URL("fixtures/issue-refs.json", import.meta.url), "utf8"),
);
const [owner, repo] = fixture.repository.split("/");

describe("get mentioned issues", () => {
  describe("lists the references as written, outside code and comments", () => {
    for (const { name, markdown, expected, gap } of fixture.cases) {
      // a case with a gap documents where the scanner differs from Markdown's rules
      (gap ? it.fails : it)(name, () => {
        expect(getMentionedIssueRefs(markdown, { owner, repo })).toEqual(
          expected,
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

  describe("takes time linear in the length of the description", () => {
    // GitHub limits a description to 65536 characters, these are about 1 MB
    const size = 1_000_000;
    const repeat = (text: string) => text.repeat(size / text.length);

    it.each([
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

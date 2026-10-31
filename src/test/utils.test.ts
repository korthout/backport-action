import { describe, it, expect } from "vitest";
import dedent from "dedent";
import {
  coerceCherryPickingMergeMode,
  getMentionedIssueRefs,
  replacePlaceholders,
} from "../utils.js";
import { rendered } from "./issue-refs.rendered.js";

describe("get mentioned issues", () => {
  const origin = "korthout/backport-action";

  describe("returns an empty list", () => {
    it("for an null text", () => {
      expect(getMentionedIssueRefs(null, origin)).toHaveLength(0);
    });

    it("for an empty text", () => {
      expect(getMentionedIssueRefs("", origin)).toHaveLength(0);
    });

    it("for a text without mentioned issues", () => {
      expect(getMentionedIssueRefs(text({}), origin)).toHaveLength(0);
    });

    it("for a text with an issue reference as part of a word", () => {
      expect(
        getMentionedIssueRefs(text({ part: "#123" }), origin),
      ).toHaveLength(0);
    });

    it("for a text with an external issue reference as part of a word", () => {
      expect(
        getMentionedIssueRefs(text({ part: "zeebe-io/zeebe#123" }), origin),
      ).toHaveLength(0);
    });

    it("for a text with an issue url as part of a word", () => {
      expect(
        getMentionedIssueRefs(
          text({ part: "github.com/zeebe-io/backport-action/issues/123" }),
          origin,
        ),
      ).toHaveLength(0);
    });
  });

  describe("returns a single reference", () => {
    it("for a text with an issue reference at the start", () => {
      expect(getMentionedIssueRefs(text({ start: "#123" }), origin)).toEqual([
        "#123",
      ]);
    });
    it("for a text with an issue reference in the middle", () => {
      expect(getMentionedIssueRefs(text({ middle: "#123" }), origin)).toEqual([
        "#123",
      ]);
    });
    it("for a text with an issue reference at the end", () => {
      expect(getMentionedIssueRefs(text({ end: "#123" }), origin)).toEqual([
        "#123",
      ]);
    });

    it("for a text with an external issue reference at the start", () => {
      expect(
        getMentionedIssueRefs(text({ start: "zeebe-io/zeebe#123" }), origin),
      ).toEqual(["zeebe-io/zeebe#123"]);
    });
    it("for a text with an external issue reference in the middle", () => {
      expect(
        getMentionedIssueRefs(text({ middle: "zeebe-io/zeebe#123" }), origin),
      ).toEqual(["zeebe-io/zeebe#123"]);
    });
    it("for a text with an external issue reference at the end", () => {
      expect(
        getMentionedIssueRefs(text({ end: "zeebe-io/zeebe#123" }), origin),
      ).toEqual(["zeebe-io/zeebe#123"]);
    });

    it("for a text with an issue url at the start", () => {
      expect(
        getMentionedIssueRefs(
          text({ start: "github.com/zeebe-io/backport-action/issues/123/" }),
          origin,
        ),
      ).toEqual(["zeebe-io/backport-action#123"]);
    });
    it("for a text with an issue url in the middle", () => {
      expect(
        getMentionedIssueRefs(
          text({ middle: "github.com/zeebe-io/backport-action/issues/123" }),
          origin,
        ),
      ).toEqual(["zeebe-io/backport-action#123"]);
    });
    it("for a text with an issue url at the end", () => {
      expect(
        getMentionedIssueRefs(
          text({ end: "github.com/zeebe-io/backport-action/issues/123" }),
          origin,
        ),
      ).toEqual(["zeebe-io/backport-action#123"]);
    });
  });

  describe("returns all references", () => {
    it("for a text with an issue reference at the start, middle and end", () => {
      expect(
        getMentionedIssueRefs(
          text({ start: "#123", middle: "#234", end: "#345" }),
          origin,
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
          origin,
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
          origin,
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
          origin,
        ),
      ).toEqual([
        "zeebe-io/zeebe#123",
        "zeebe-io/zeebe#234",
        "zeebe-io/zeebe#345",
      ]);
    });
  });

  describe("returns each reference once", () => {
    it("for a text with a repeated issue reference", () => {
      expect(
        getMentionedIssueRefs("Fixes #123 and see #123 again", origin),
      ).toEqual(["#123"]);
    });
    it("for a text with a repeated external issue reference", () => {
      expect(
        getMentionedIssueRefs(
          "zeebe-io/zeebe#123 and zeebe-io/zeebe#123",
          origin,
        ),
      ).toEqual(["zeebe-io/zeebe#123"]);
    });
    it("for a text with a repeated issue url", () => {
      expect(
        getMentionedIssueRefs(
          "github.com/zeebe-io/zeebe/issues/123 and github.com/zeebe-io/zeebe/issues/123",
          origin,
        ),
      ).toEqual(["zeebe-io/zeebe#123"]);
    });
    it("for a text with an issue url and an external issue reference to the same issue", () => {
      expect(
        getMentionedIssueRefs(
          "github.com/zeebe-io/zeebe/issues/123 and zeebe-io/zeebe#123",
          origin,
        ),
      ).toEqual(["zeebe-io/zeebe#123"]);
    });
    it("in the order in which they were first found", () => {
      expect(
        getMentionedIssueRefs("#1 and #2 and #1 and #3 and #2", origin),
      ).toEqual(["#1", "#2", "#3"]);
    });
  });

  describe("returns references in the order they appear", () => {
    it("for an issue reference followed by an issue url", () => {
      expect(
        getMentionedIssueRefs("#1 then github.com/a/b/issues/2", origin),
      ).toEqual(["#1", "a/b#2"]);
    });

    it("for an issue url followed by an issue reference", () => {
      expect(
        getMentionedIssueRefs("github.com/a/b/issues/2 and #1", origin),
      ).toEqual(["a/b#2", "#1"]);
    });

    it("for a mix of issue references and urls with duplicates", () => {
      expect(
        getMentionedIssueRefs(
          "#1 and github.com/a/b/issues/2 and a/b#2 and #1",
          origin,
        ),
      ).toEqual(["#1", "a/b#2"]);
    });

    it("for an issue url after several issue references", () => {
      expect(
        getMentionedIssueRefs(
          "#1 and a/b#3 and github.com/a/b/issues/2",
          origin,
        ),
      ).toEqual(["#1", "a/b#3", "a/b#2"]);
    });
  });

  describe("ignores references inside comments", () => {
    it("for a multi-line comment in a pull request template", () => {
      const body = dedent`
        ## Related issues

        <!--
        - This PR fully resolves the issue: closes #1234
        - One of several PRs for the issue: relates to #1234 or a bare #1234
        -->

        - [x] This PR does not need a linked issue
      `;
      expect(getMentionedIssueRefs(body, origin)).toEqual([]);
    });

    it("while keeping references outside of the comment", () => {
      expect(
        getMentionedIssueRefs(
          "relates to #28374\n<!-- closes #1234 -->\nfixes #54840",
          origin,
        ),
      ).toEqual(["#28374", "#54840"]);
    });

    it("for a comment in the middle of a line", () => {
      expect(
        getMentionedIssueRefs("see #1 <!-- not #2 --> and #3", origin),
      ).toEqual(["#1", "#3"]);
    });

    it("for an issue url", () => {
      expect(
        getMentionedIssueRefs(
          "<!-- github.com/zeebe-io/zeebe/issues/123 -->",
          origin,
        ),
      ).toEqual([]);
    });

    it("for an external issue reference", () => {
      expect(
        getMentionedIssueRefs("<!-- zeebe-io/zeebe#123 -->", origin),
      ).toEqual([]);
    });

    it("without joining the text before and after a comment into a reference", () => {
      expect(getMentionedIssueRefs("a/b<!-- x -->#7", origin)).toEqual(["#7"]);
    });

    it("without joining the text before and after a comment into a word", () => {
      expect(
        getMentionedIssueRefs("fixes #1<!-- x -->and more", origin),
      ).toEqual(["#1"]);
    });

    it("for an unclosed comment, which hides the rest of the description", () => {
      expect(
        getMentionedIssueRefs("Fixes #1\n<!-- closes #1234", origin),
      ).toEqual(["#1"]);
    });

    it("for a closed comment followed by an unclosed comment", () => {
      expect(
        getMentionedIssueRefs("#1 and <!-- #2 --> #3 and\n<!-- #4", origin),
      ).toEqual(["#1", "#3"]);
    });
  });

  describe("ignores references inside code", () => {
    it("for a fenced code block", () => {
      const body = dedent`
        \`\`\`
        #7
        \`\`\`
        fixes #1
      `;
      expect(getMentionedIssueRefs(body, origin)).toEqual(["#1"]);
    });

    it("for a fenced code block with an info string", () => {
      const body = dedent`
        \`\`\`ts
        // see #7
        \`\`\`
        fixes #1
      `;
      expect(getMentionedIssueRefs(body, origin)).toEqual(["#1"]);
    });

    it("for a fenced code block with tildes", () => {
      expect(getMentionedIssueRefs("~~~\n#7\n~~~\nfixes #1", origin)).toEqual([
        "#1",
      ]);
    });

    it("for a fenced code block indented by up to three spaces", () => {
      expect(
        getMentionedIssueRefs("   ```\n#7\n   ```\nfixes #1", origin),
      ).toEqual(["#1"]);
    });

    it("for a fenced code block closed by a longer fence", () => {
      expect(getMentionedIssueRefs("```\n#7\n````\nfixes #1", origin)).toEqual([
        "#1",
      ]);
    });

    it("for a fenced code block that a shorter fence doesn't close", () => {
      expect(getMentionedIssueRefs("````\n#7\n```\n#8", origin)).toEqual([]);
    });

    it("for an unclosed fenced code block, which hides the rest of the description", () => {
      expect(getMentionedIssueRefs("fixes #1\n```\n#7", origin)).toEqual([
        "#1",
      ]);
    });

    it("for an indented code block", () => {
      expect(
        getMentionedIssueRefs("para\n\n    #7\n\nfixes #1", origin),
      ).toEqual(["#1"]);
    });

    it("but not for an indented line that continues a paragraph", () => {
      expect(getMentionedIssueRefs("para\n    #1", origin)).toEqual(["#1"]);
    });

    it("but not for an indented line that continues a list item", () => {
      expect(getMentionedIssueRefs("- item\n\n    #1", origin)).toEqual(["#1"]);
    });

    it("but not for an indented line that continues a list item of several lines", () => {
      expect(getMentionedIssueRefs("- item\n  more\n\n    #1", origin)).toEqual(
        ["#1"],
      );
    });

    it("but not for a list item's later indented paragraphs", () => {
      expect(
        getMentionedIssueRefs("- a\n\n    more\n\n    see #1", origin),
      ).toEqual(["#1"]);
    });

    it("for a description with Windows line endings", () => {
      expect(
        getMentionedIssueRefs("para\r\n\r\n    #7\r\n\r\nfixes #1", origin),
      ).toEqual(["#1"]);
    });

    it("for inline code", () => {
      expect(getMentionedIssueRefs("see `#8` and #1", origin)).toEqual(["#1"]);
    });

    it("for inline code containing other words", () => {
      expect(getMentionedIssueRefs("and `see #8 now`", origin)).toEqual([]);
    });

    it("for inline code delimited by multiple backticks", () => {
      expect(getMentionedIssueRefs("``a ` #5`` #6", origin)).toEqual(["#6"]);
    });

    it("but not for unmatched backticks", () => {
      expect(getMentionedIssueRefs("a `` b #1", origin)).toEqual(["#1"]);
    });

    it("but not for backticks in separate paragraphs", () => {
      expect(
        getMentionedIssueRefs("a ` b\n\nfixes #1 and ` c", origin),
      ).toEqual(["#1"]);
    });

    it("but not for escaped backticks", () => {
      expect(getMentionedIssueRefs("\\`#1\\` #2", origin)).toEqual([
        "#1",
        "#2",
      ]);
    });
  });

  describe("handles code and comments in the order they open", () => {
    it("for a comment start inside inline code", () => {
      expect(
        getMentionedIssueRefs(
          "Use `<!--` to start a comment. Fixes #12",
          origin,
        ),
      ).toEqual(["#12"]);
    });

    it("for a comment start inside a fenced code block", () => {
      const body = dedent`
        \`\`\`html
        <!-- a comment
        \`\`\`
        Fixes #12
      `;
      expect(getMentionedIssueRefs(body, origin)).toEqual(["#12"]);
    });

    it("for a comment start and end in separate inline code", () => {
      expect(
        getMentionedIssueRefs(
          "Escape `<!--` in templates, fixes #12 and close with `-->`",
          origin,
        ),
      ).toEqual(["#12"]);
    });

    it("for inline code inside a comment", () => {
      expect(
        getMentionedIssueRefs("<!-- use `foo` #1 --> visible #2", origin),
      ).toEqual(["#2"]);
    });

    it("for a backtick inside a comment", () => {
      expect(getMentionedIssueRefs("<!-- a ` #1 --> b ` #3", origin)).toEqual([
        "#3",
      ]);
    });

    it("for a comment end inside inline code", () => {
      expect(getMentionedIssueRefs("``a ` <!-- `` #5 -->", origin)).toEqual([
        "#5",
      ]);
    });
  });

  describe("ignores references inside links and HTML", () => {
    it("for a link's text and destination", () => {
      expect(
        getMentionedIssueRefs(
          "[#7](https://example.com) [see](https://github.com/a/b/issues/8) #1",
          origin,
        ),
      ).toEqual(["#1"]);
    });

    it("for a link reference definition", () => {
      expect(
        getMentionedIssueRefs(
          "[x]: https://github.com/a/b/issues/7\n\n#1",
          origin,
        ),
      ).toEqual(["#1"]);
    });

    it("but not for a footnote", () => {
      expect(getMentionedIssueRefs("x[^1]\n\n[^1]: #1", origin)).toEqual([
        "#1",
      ]);
    });

    it("for a url to another site", () => {
      expect(
        getMentionedIssueRefs("https://example.com/#7 #1", origin),
      ).toEqual(["#1"]);
    });

    it("for a github.com url other than an issue or pull request", () => {
      expect(
        getMentionedIssueRefs(
          "https://github.com/a/b/issues?q=is:open+#7 https://github.com/a/b/wiki/Page/#8 #1",
          origin,
        ),
      ).toEqual(["#1"]);
    });

    it("for an unclosed <code> or <pre> element, which hides the rest of the description", () => {
      expect(getMentionedIssueRefs("#1 <code>#7\n\n<pre>#8", origin)).toEqual([
        "#1",
      ]);
    });

    it("for <a>, <code> and <pre> elements, and attributes", () => {
      expect(
        getMentionedIssueRefs(
          '<a href="x">#7</a> <code>#8</code> <pre>#9</pre> <img alt="#10"> #1',
          origin,
        ),
      ).toEqual(["#1"]);
    });

    it("but not for text that only looks like an HTML tag", () => {
      expect(getMentionedIssueRefs("x <y #1> z", origin)).toEqual(["#1"]);
    });

    it("but not for the content of other HTML elements", () => {
      expect(
        getMentionedIssueRefs(
          "<details><summary>x</summary>\n\n#1\n\n</details>",
          origin,
        ),
      ).toEqual(["#1"]);
    });
  });

  describe("finds references next to punctuation", () => {
    it("for references separated by single spaces", () => {
      expect(getMentionedIssueRefs("relates to #1 #2 #3", origin)).toEqual([
        "#1",
        "#2",
        "#3",
      ]);
    });

    it("for references between punctuation", () => {
      expect(
        getMentionedIssueRefs("Fixes #1. (#2) #3, [#4] #5's #6: #7!", origin),
      ).toEqual(["#1", "#2", "#3", "#4", "#5", "#6", "#7"]);
    });

    it("for references after a slash", () => {
      expect(
        getMentionedIssueRefs(
          "foo/#1 foo/zeebe-io/zeebe#2 foo/github.com/zeebe-io/zeebe/issues/3",
          origin,
        ),
      ).toEqual(["#1", "zeebe-io/zeebe#2", "zeebe-io/zeebe#3"]);
    });

    it("but not for a reference followed by a word or another reference", () => {
      expect(getMentionedIssueRefs("#1abc #2_ #3#4", origin)).toEqual(["#3"]);
    });

    it("for a full reference with an underscore in the owner", () => {
      expect(getMentionedIssueRefs("octocat_acme/tools#1", origin)).toEqual([
        "octocat_acme/tools#1",
      ]);
    });

    it("but not for a reference after an underscore", () => {
      expect(getMentionedIssueRefs("foo_#1 _#2", origin)).toEqual([]);
    });

    it("for references between underscores, which are emphasis", () => {
      expect(getMentionedIssueRefs("_#1_ __#2__", origin)).toEqual([
        "#1",
        "#2",
      ]);
    });

    it("but not for an HTML entity", () => {
      expect(getMentionedIssueRefs("&#1;", origin)).toEqual([]);
    });
  });

  describe("finds urls of issues and pull requests", () => {
    it("for a pull request url", () => {
      expect(
        getMentionedIssueRefs(
          "https://github.com/zeebe-io/zeebe/pull/1",
          origin,
        ),
      ).toEqual(["zeebe-io/zeebe#1"]);
    });

    it("for urls with a trailing slash, fragment or query", () => {
      expect(
        getMentionedIssueRefs(
          "https://github.com/a/b/pull/1/ https://github.com/a/b/issues/2#issuecomment-3 https://github.com/a/b/pull/4?x=1",
          origin,
        ),
      ).toEqual(["a/b#1", "a/b#2", "a/b#4"]);
    });

    it("for urls between punctuation", () => {
      expect(
        getMentionedIssueRefs(
          "(https://github.com/a/b/issues/1). https://github.com/a/b/pull/2, <https://github.com/a/b/pull/3>",
          origin,
        ),
      ).toEqual(["a/b#1", "a/b#2", "a/b#3"]);
    });

    it("but not for a url of a pull request's tab", () => {
      expect(
        getMentionedIssueRefs("https://github.com/a/b/pull/1/files", origin),
      ).toEqual([]);
    });

    it("but not for an http or www url", () => {
      expect(
        getMentionedIssueRefs(
          "http://github.com/a/b/issues/1 https://www.github.com/a/b/issues/2",
          origin,
        ),
      ).toEqual([]);
    });
  });

  describe("finds GH-N references", () => {
    it("in any casing", () => {
      expect(getMentionedIssueRefs("GH-1 gh-2", origin)).toEqual([
        "GH-1",
        "gh-2",
      ]);
    });

    it("after punctuation", () => {
      expect(
        getMentionedIssueRefs("(GH-1) -GH-2 /GH-3 zeebe-io/zeebe#GH-4", origin),
      ).toEqual(["GH-1", "GH-2", "GH-3", "GH-4"]);
    });

    it("but not inside a word", () => {
      expect(
        getMentionedIssueRefs("xGH-1 _GH-2 GH-3abc GH-4_", origin),
      ).toEqual([]);
    });
  });

  describe("writes references as first written", () => {
    it("for a full reference to the original repository", () => {
      expect(
        getMentionedIssueRefs("Korthout/Backport-Action#1", origin),
      ).toEqual(["Korthout/Backport-Action#1"]);
    });

    it("for a url, as owner/repo#N", () => {
      expect(
        getMentionedIssueRefs(
          "https://github.com/Korthout/backport-action/pull/01",
          origin,
        ),
      ).toEqual(["Korthout/backport-action#1"]);
    });

    it("once for the same issue written in different forms", () => {
      expect(
        getMentionedIssueRefs(
          "GH-1 #1 korthout/backport-action#1 https://github.com/korthout/backport-action/issues/1",
          origin,
        ),
      ).toEqual(["GH-1"]);
    });

    it("once for the same issue written in different casing", () => {
      expect(
        getMentionedIssueRefs(
          "https://github.com/KORTHOUT/backport-action/issues/1 Korthout/Backport-Action#1 #1",
          origin,
        ),
      ).toEqual(["KORTHOUT/backport-action#1"]);
    });

    it("once for another repository written in different casing", () => {
      expect(
        getMentionedIssueRefs("Zeebe-io/Zeebe#1 zeebe-io/zeebe#1", origin),
      ).toEqual(["Zeebe-io/Zeebe#1"]);
    });

    it("once for the same number written with leading zeros", () => {
      expect(
        getMentionedIssueRefs("#01 korthout/backport-action#001 #0", origin),
      ).toEqual(["#01"]);
    });
  });

  // A regex piece that scans ahead for a closer can take quadratic time, or worse, when the closer is missing.
  // When adding a piece, add the description that makes it scan furthest. At GitHub's maximum description length,
  // the quadratic pieces found so far took 0.4 to 2.4 seconds. These take a few milliseconds, apart from unclosed
  // backtick strings of growing length, which take about 50 ms.
  describe("takes little time for the longest descriptions", () => {
    const maxLength = 65_536;
    const repeat = (unit: string) =>
      unit.repeat(Math.ceil(maxLength / unit.length)).slice(0, maxLength);
    const growingBacktickStrings = () => {
      let body = "";
      for (let n = 1; body.length < maxLength; n++)
        body += "`".repeat(n) + " a ";
      return body.slice(0, maxLength);
    };

    it.each([
      ["references", repeat("#1 a/b#2 https://github.com/a/b/pull/3 GH-4 ")],
      ["unclosed backtick strings of growing length", growingBacktickStrings()],
      ["an unclosed backtick", "`" + repeat("a #1 ")],
      ["escaped backticks", repeat("\\`")],
      ["backslashes", repeat("\\")],
      ["unclosed fences", repeat("```\n")],
      ["fences too short to close", "````\n" + repeat("```\n")],
      ["indented lines", repeat("\n    a")],
      ["blank lines", repeat("\n \n")],
      ["list items", repeat("- a\n\n")],
      ["a long paragraph before indented code", repeat("a b\n") + "\n\n    c"],
      ["unclosed comments", repeat("a <!-- ")],
      ["unclosed links", repeat("[a](")],
      ["unclosed links with a space", repeat("[a](x ")],
      ["unclosed brackets", repeat("[a")],
      ["unclosed <a> elements", repeat("<a> x ")],
      ["unclosed <code> elements", repeat("<code> x ")],
      ["unclosed HTML tags", repeat("<b x ")],
      ["unclosed quotes in HTML tags", repeat('<b x="')],
      ["urls", repeat("https://")],
      ["incomplete issue urls", repeat("github.com/a/")],
      ["owners", repeat("a/")],
      ["hashes", repeat("#")],
      ["underscores", repeat("_#1")],
      ["leading zeros", "#" + repeat("0")],
      ["GH- prefixes", repeat("GH-")],
    ])("for %s", (_, body) => {
      const start = performance.now();
      getMentionedIssueRefs(body, origin);
      expect(performance.now() - start).toBeLessThan(250);
    });
  });

  describe("finds the references GitHub links when it renders the description", () => {
    // GitHub writes a reference to the origin as `#N`, without leading zeros; issue_refs keeps the spelling
    const asGitHubWrites = (refs: string[]) =>
      refs.map((ref) => {
        const [, name, number] = ref.match(/^(.*?)(?:#|GH-)0*(\d+)$/i)!;
        const inOrigin = name === "" || name.toLowerCase() === origin;
        return inOrigin ? `#${number}` : `${name}#${number}`;
      });

    it.each(rendered.filter((c) => !c.differs))("for $name", (c) => {
      expect(asGitHubWrites(getMentionedIssueRefs(c.body, origin))).toEqual(
        c.github,
      );
    });

    it.each(rendered.filter((c) => c.differs))(
      "except for $name, $differs.why",
      (c) => {
        expect(asGitHubWrites(getMentionedIssueRefs(c.body, origin))).toEqual(
          c.differs!.refs,
        );
      },
    );
  });
});

describe("compose body/title", () => {
  const main_default = {
    number: 123,
    body: "foo-body",
    user: { login: "foo-author" },
    title: "some pr title",
    base: {
      sha: "base-sha",
      repo: { name: "backport-action", owner: { login: "korthout" } },
    },
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

      it("and body refers to the same issue more than once", () => {
        expect(
          replacePlaceholders(
            template,
            {
              ...main_default,
              body: "Fixes #123 and see #123 again",
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

    describe("for a template that repeats a placeholder", () => {
      it("with pull_author placeholder", () => {
        const template = "Backported by @${pull_author}, cc @${pull_author}";
        expect(replacePlaceholders(template, main_default, target)).toEqual(
          "Backported by @foo-author, cc @foo-author",
        );
      });

      it("with pull_number placeholder", () => {
        const template = "Backport of #${pull_number} (see #${pull_number})";
        expect(replacePlaceholders(template, main_default, target)).toEqual(
          "Backport of #123 (see #123)",
        );
      });

      it("with pull_title placeholder", () => {
        const template = "${pull_title} (backport of ${pull_title})";
        expect(replacePlaceholders(template, main_default, target)).toEqual(
          "some pr title (backport of some pr title)",
        );
      });

      it("with pull_description placeholder", () => {
        const template = "${pull_description} -- repeated: ${pull_description}";
        expect(replacePlaceholders(template, main_default, target)).toEqual(
          "foo-body -- repeated: foo-body",
        );
      });

      it("with target_branch placeholder", () => {
        const template = "${target_branch}: backport to ${target_branch}";
        expect(replacePlaceholders(template, main_default, target)).toEqual(
          "foo-target: backport to foo-target",
        );
      });

      it("with issue_refs placeholder", () => {
        const template = "Refers to ${issue_refs} and again ${issue_refs}";
        expect(
          replacePlaceholders(
            template,
            { ...main_default, body: "Body mentions #123 and that's it." },
            target,
          ),
        ).toEqual("Refers to #123 and again #123");
      });
    });

    describe("inserts placeholder values verbatim", () => {
      it("does not corrupt a body containing $$ (whole-match token)", () => {
        const template = "${pull_description}";
        const body = "Run `echo $$ > app.pid` to reproduce.";
        expect(
          replacePlaceholders(template, { ...main_default, body }, target),
        ).toEqual(body);
      });

      it("does not corrupt a body containing $& (matched-substring token)", () => {
        const template = "${pull_description}";
        const body = "Replace with `sed 's/x/$&/'`.";
        expect(
          replacePlaceholders(template, { ...main_default, body }, target),
        ).toEqual(body);
      });

      it("does not corrupt a body containing $` (preceding-portion token)", () => {
        const template = "Backport:\n${pull_description}";
        const body = "Costs $`5` per run.";
        expect(
          replacePlaceholders(template, { ...main_default, body }, target),
        ).toEqual("Backport:\nCosts $`5` per run.");
      });

      it("does not corrupt a body containing $' (following-portion token)", () => {
        const template = "${pull_description}";
        const body = "Use `printf $'a\nb'` instead.";
        expect(
          replacePlaceholders(template, { ...main_default, body }, target),
        ).toEqual(body);
      });

      it("does not corrupt a body containing $1 (capture group token)", () => {
        const template = "${pull_description}";
        const body = "Pass `$1` through.";
        expect(
          replacePlaceholders(template, { ...main_default, body }, target),
        ).toEqual(body);
      });

      it("does not expand placeholders inside inserted content", () => {
        const template = "${pull_description}";
        const body = "Target is ${target_branch}";
        expect(
          replacePlaceholders(template, { ...main_default, body }, target),
        ).toEqual("Target is ${target_branch}");
      });
    });
  });
});

describe("coerceCherryPickingMergeMode", () => {
  it('coerces empty string to "default"', () => {
    expect(coerceCherryPickingMergeMode("")).toEqual("default");
  });

  it('passes through "default"', () => {
    expect(coerceCherryPickingMergeMode("default")).toEqual("default");
  });

  it('passes through "whitespace_tolerant"', () => {
    expect(coerceCherryPickingMergeMode("whitespace_tolerant")).toEqual(
      "whitespace_tolerant",
    );
  });

  it('returns "invalid" for an unrecognized value', () => {
    expect(coerceCherryPickingMergeMode("invalid_value")).toEqual("invalid");
  });

  it('returns "invalid" for wrong case (case-sensitive)', () => {
    expect(coerceCherryPickingMergeMode("WHITESPACE_TOLERANT")).toEqual(
      "invalid",
    );
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
  return [
    `${start} foo bar`,
    `bar bar ${middle} bar`,
    "",
    `foo${part}foo ${part}foo`,
    "",
    `foo bar bar foo ${end}`,
  ].join("\n");
}

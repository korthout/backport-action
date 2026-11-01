import { describe, it, expect } from "vitest";
import dedent from "dedent";
import {
  coerceCherryPickingMergeMode,
  getMentionedIssueRefs,
  replacePlaceholders,
} from "../utils.js";

// the original pull request's repository, which a bare `#N` refers to
const refs = (body: string | null) =>
  getMentionedIssueRefs(body, "korthout/backport-action");

describe("get mentioned issues", () => {
  describe("returns an empty list", () => {
    it("for an null text", () => {
      expect(refs(null)).toHaveLength(0);
    });

    it("for an empty text", () => {
      expect(refs("")).toHaveLength(0);
    });

    it("for a text without mentioned issues", () => {
      expect(refs(text({}))).toHaveLength(0);
    });

    it("for a text with an issue reference as part of a word", () => {
      expect(refs(text({ part: "#123" }))).toHaveLength(0);
    });

    it("for a text with an external issue reference as part of a word", () => {
      expect(refs(text({ part: "zeebe-io/zeebe#123" }))).toHaveLength(0);
    });

    it("for a text with an issue url as part of a word", () => {
      expect(
        refs(text({ part: "github.com/zeebe-io/backport-action/issues/123" })),
      ).toHaveLength(0);
    });
  });

  describe("returns a single reference", () => {
    it("for a text with an issue reference at the start", () => {
      expect(refs(text({ start: "#123" }))).toEqual(["#123"]);
    });
    it("for a text with an issue reference in the middle", () => {
      expect(refs(text({ middle: "#123" }))).toEqual(["#123"]);
    });
    it("for a text with an issue reference at the end", () => {
      expect(refs(text({ end: "#123" }))).toEqual(["#123"]);
    });

    it("for a text with an external issue reference at the start", () => {
      expect(refs(text({ start: "zeebe-io/zeebe#123" }))).toEqual([
        "zeebe-io/zeebe#123",
      ]);
    });
    it("for a text with an external issue reference in the middle", () => {
      expect(refs(text({ middle: "zeebe-io/zeebe#123" }))).toEqual([
        "zeebe-io/zeebe#123",
      ]);
    });
    it("for a text with an external issue reference at the end", () => {
      expect(refs(text({ end: "zeebe-io/zeebe#123" }))).toEqual([
        "zeebe-io/zeebe#123",
      ]);
    });

    it("for a text with an issue url at the start", () => {
      expect(
        refs(
          text({ start: "github.com/zeebe-io/backport-action/issues/123/" }),
        ),
      ).toEqual(["zeebe-io/backport-action#123"]);
    });
    it("for a text with an issue url in the middle", () => {
      expect(
        refs(
          text({ middle: "github.com/zeebe-io/backport-action/issues/123" }),
        ),
      ).toEqual(["zeebe-io/backport-action#123"]);
    });
    it("for a text with an issue url at the end", () => {
      expect(
        refs(text({ end: "github.com/zeebe-io/backport-action/issues/123" })),
      ).toEqual(["zeebe-io/backport-action#123"]);
    });
  });

  describe("returns all references", () => {
    it("for a text with an issue reference at the start, middle and end", () => {
      expect(
        refs(text({ start: "#123", middle: "#234", end: "#345" })),
      ).toEqual(["#123", "#234", "#345"]);
    });
    it("for a text with an external issue reference at the start, middle and end", () => {
      expect(
        refs(
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
        refs(
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
        refs(
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

  describe("returns each reference once", () => {
    it("for a text with a repeated issue reference", () => {
      expect(refs("Fixes #123 and see #123 again")).toEqual(["#123"]);
    });
    it("for a text with a repeated external issue reference", () => {
      expect(refs("zeebe-io/zeebe#123 and zeebe-io/zeebe#123")).toEqual([
        "zeebe-io/zeebe#123",
      ]);
    });
    it("for a text with a repeated issue url", () => {
      expect(
        refs(
          "github.com/zeebe-io/zeebe/issues/123 and github.com/zeebe-io/zeebe/issues/123",
        ),
      ).toEqual(["zeebe-io/zeebe#123"]);
    });
    it("for a text with an issue url and an external issue reference to the same issue", () => {
      expect(
        refs("github.com/zeebe-io/zeebe/issues/123 and zeebe-io/zeebe#123"),
      ).toEqual(["zeebe-io/zeebe#123"]);
    });
    it("in the order in which they were first found", () => {
      expect(refs("#1 and #2 and #1 and #3 and #2")).toEqual([
        "#1",
        "#2",
        "#3",
      ]);
    });
  });

  describe("returns references in the order they appear", () => {
    it("for an issue reference followed by an issue url", () => {
      expect(refs("#1 then github.com/a/b/issues/2")).toEqual(["#1", "a/b#2"]);
    });

    it("for an issue url followed by an issue reference", () => {
      expect(refs("github.com/a/b/issues/2 and #1")).toEqual(["a/b#2", "#1"]);
    });

    it("for a mix of issue references and urls with duplicates", () => {
      expect(refs("#1 and github.com/a/b/issues/2 and a/b#2 and #1")).toEqual([
        "#1",
        "a/b#2",
      ]);
    });

    it("for an issue url after several issue references", () => {
      expect(refs("#1 and a/b#3 and github.com/a/b/issues/2")).toEqual([
        "#1",
        "a/b#3",
        "a/b#2",
      ]);
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
      expect(refs(body)).toEqual([]);
    });

    it("while keeping references outside of the comment", () => {
      expect(
        refs("relates to #28374\n<!-- closes #1234 -->\nfixes #54840"),
      ).toEqual(["#28374", "#54840"]);
    });

    it("for a comment in the middle of a line", () => {
      expect(refs("see #1 <!-- not #2 --> and #3")).toEqual(["#1", "#3"]);
    });

    it("for an issue url", () => {
      expect(refs("<!-- github.com/zeebe-io/zeebe/issues/123 -->")).toEqual([]);
    });

    it("for an external issue reference", () => {
      expect(refs("<!-- zeebe-io/zeebe#123 -->")).toEqual([]);
    });

    it("without joining the text before and after a comment into a reference", () => {
      expect(refs("a/b<!-- x -->#7")).toEqual(["#7"]);
    });

    it("without joining the text before and after a comment into a word", () => {
      expect(refs("fixes #1<!-- x -->and more")).toEqual(["#1"]);
    });

    it("for an unclosed comment, which hides the rest of the description", () => {
      expect(refs("Fixes #1\n<!-- closes #1234")).toEqual(["#1"]);
    });

    it("for a closed comment followed by an unclosed comment", () => {
      expect(refs("#1 and <!-- #2 --> #3 and\n<!-- #4")).toEqual(["#1", "#3"]);
    });
  });
});

describe("get mentioned issues, read as Markdown", () => {
  describe("ignores references", () => {
    it("in a fenced code block and a code span", () => {
      const body = "```\n#7\n```\nand `see #8 now`";
      expect(refs(body)).toEqual([]);
    });

    it("in an indented code block", () => {
      expect(refs("Fixes #1\n\n    #2")).toEqual(["#1"]);
    });

    it("in a code span in a list item", () => {
      expect(refs("- see `#1`\n- fixes #2")).toEqual(["#2"]);
    });

    it("in a code span in a table cell", () => {
      expect(refs("| a | b |\n|---|---|\n| #1 | `#2` |")).toEqual(["#1"]);
    });

    it("in the text and destination of a link", () => {
      expect(
        refs("[see #1](https://github.com/korthout/backport-action/issues/2)"),
      ).toEqual([]);
    });

    it("in the description of an image", () => {
      expect(refs("![#1](image.png)")).toEqual([]);
    });

    it("in the attributes of an html tag", () => {
      expect(refs('<a href="#1">see</a> #2')).toEqual(["#2"]);
    });

    it("in an html block, which ends at a blank line", () => {
      const body = "<details>\n<summary>Fixes #1</summary>\n\nFixes #2";
      expect(refs(body)).toEqual(["#2"]);
    });

    it("in the url of another site", () => {
      expect(refs("https://example.com/#1")).toEqual([]);
    });

    it("written with an escaped or encoded #", () => {
      expect(refs("\\#1 and &#35;2")).toEqual([]);
    });
  });

  describe("finds references", () => {
    it("after a comment opener inside a code span", () => {
      expect(refs("Use `<!--` to start a comment. Fixes #12")).toEqual(["#12"]);
    });

    it("after an unclosed comment inside a paragraph, which is text", () => {
      expect(refs("Fixes #1 <!-- closes #2")).toEqual(["#1", "#2"]);
    });

    it("in emphasis, block quotes, headings and table cells", () => {
      const body = "# Fixes #1\n_#2_ **#3**\n> #4\n\n| #5 |\n|---|";
      expect(refs(body)).toEqual(["#1", "#2", "#3", "#4", "#5"]);
    });

    it("separated by a single space", () => {
      expect(refs("relates to #1 #2 #3")).toEqual(["#1", "#2", "#3"]);
    });

    it("followed or surrounded by punctuation", () => {
      expect(refs("Fixes #1. (#2), a/b#3!")).toEqual(["#1", "#2", "a/b#3"]);
    });

    it("written as a pull request url", () => {
      expect(
        refs(
          "Follow-up of https://github.com/korthout/backport-action/pull/749",
        ),
      ).toEqual(["korthout/backport-action#749"]);
    });

    it("written as a url, with or without https:// and www.", () => {
      expect(
        refs(
          "https://github.com/a/b/issues/1 <https://www.github.com/a/b/pull/2> www.github.com/a/b/issues/3 github.com/a/b/issues/4",
        ),
      ).toEqual(["a/b#1", "a/b#2", "a/b#3", "a/b#4"]);
    });
  });

  describe("lists each issue once", () => {
    it("when written in another case, as first written", () => {
      expect(
        refs("Zeebe-io/Zeebe#123 and github.com/zeebe-io/zeebe/issues/123"),
      ).toEqual(["Zeebe-io/Zeebe#123"]);
    });

    it("when written bare and in full, in full in the place of the first", () => {
      expect(
        refs(
          "Fixes #123, see #1 and https://github.com/korthout/backport-action/issues/123",
        ),
      ).toEqual(["korthout/backport-action#123", "#1"]);
    });

    it("when written in full and then bare", () => {
      expect(refs("korthout/backport-action#123 and #123")).toEqual([
        "korthout/backport-action#123",
      ]);
    });

    it("but not a bare reference and one to another repository", () => {
      expect(refs("#123 and zeebe-io/zeebe#123")).toEqual([
        "#123",
        "zeebe-io/zeebe#123",
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
    base: {
      sha: "def456",
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
    `foo/${part} foo${part}foo ${part}foo`,
    "",
    `foo bar bar foo ${end}`,
  ].join("\n");
}

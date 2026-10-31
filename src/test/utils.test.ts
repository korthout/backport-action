import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import dedent from "dedent";
import {
  coerceCherryPickingMergeMode,
  getMentionedIssueRefs,
  replacePlaceholders,
} from "../utils.js";

// Descriptions rendered by GitHub, as the original pull request's `body_html`.
// To add a case, run `node src/test/fixtures/render-issue-refs.mjs "<markdown>"`.
const fixtures: Record<string, string> = JSON.parse(
  readFileSync(new URL("fixtures/issue-refs.json", import.meta.url), "utf8"),
);
const repo = { name: "backport-action", owner: { login: "korthout" } };

function rendered(markdown: string): string {
  const html = fixtures[markdown];
  if (html === undefined) {
    throw new Error(`No rendered fixture for: ${JSON.stringify(markdown)}`);
  }
  return html;
}

function refs(markdown: string): string[] {
  return getMentionedIssueRefs(rendered(markdown), repo);
}

describe("get mentioned issues", () => {
  describe("returns an empty list", () => {
    it("for a missing rendered description", () => {
      expect(getMentionedIssueRefs(null, repo)).toEqual([]);
      expect(getMentionedIssueRefs(undefined, repo)).toEqual([]);
    });

    it("for an empty description", () => {
      expect(refs("")).toEqual([]);
    });

    it("for a description without mentioned issues", () => {
      expect(refs(text({}))).toEqual([]);
    });

    it("for an issue reference as part of a word", () => {
      expect(refs(text({ part: "#706" }))).toEqual([]);
    });

    it("for an external issue reference as part of a word", () => {
      expect(refs(text({ part: "actions/checkout#1" }))).toEqual([]);
    });

    it("for an issue url as part of a word", () => {
      expect(
        refs(text({ part: "github.com/actions/checkout/issues/1" })),
      ).toEqual([]);
    });

    it("for a reference without owner", () => {
      expect(refs("backport-action#706")).toEqual([]);
    });

    it("for a reference to an issue that doesn't exist", () => {
      expect(refs("#999999 actions/checkout#999999")).toEqual([]);
    });

    it("for a manual link to an issue", () => {
      expect(
        refs(
          "[#706](https://github.com/korthout/backport-action/issues/706) and [this](https://github.com/korthout/backport-action/pull/749)",
        ),
      ).toEqual([]);
    });

    it("for a discussion", () => {
      expect(
        refs("https://github.com/community/community/discussions/1"),
      ).toEqual([]);
    });
  });

  describe("returns a single reference", () => {
    it("for an issue reference at the start", () => {
      expect(refs(text({ start: "#706" }))).toEqual(["#706"]);
    });
    it("for an issue reference in the middle", () => {
      expect(refs(text({ middle: "#706" }))).toEqual(["#706"]);
    });
    it("for an issue reference at the end", () => {
      expect(refs(text({ end: "#706" }))).toEqual(["#706"]);
    });

    it("for an external issue reference", () => {
      expect(refs(text({ middle: "actions/checkout#1" }))).toEqual([
        "actions/checkout#1",
      ]);
    });

    it("for an issue url", () => {
      expect(
        refs(
          text({
            middle: "https://github.com/korthout/backport-action/issues/706",
          }),
        ),
      ).toEqual(["#706"]);
    });

    it("for an external issue url", () => {
      expect(
        refs(text({ middle: "https://github.com/actions/checkout/issues/1" })),
      ).toEqual(["actions/checkout#1"]);
    });

    it("for an issue url without scheme", () => {
      expect(refs("github.com/actions/checkout/issues/1")).toEqual([
        "actions/checkout#1",
      ]);
    });

    it("for an issue url linking to a comment", () => {
      expect(
        refs(
          "https://github.com/korthout/backport-action/issues/706#issuecomment-1",
        ),
      ).toEqual(["#706"]);
    });

    it("for a pull request reference", () => {
      expect(refs("#749")).toEqual(["#749"]);
    });

    it("for a pull request url", () => {
      expect(
        refs("https://github.com/korthout/backport-action/pull/749"),
      ).toEqual(["#749"]);
    });

    it("for an external pull request url", () => {
      expect(refs("https://github.com/actions/checkout/pull/1")).toEqual([
        "actions/checkout#1",
      ]);
    });

    it("for a full reference to the original pull request's repository", () => {
      expect(refs("korthout/backport-action#706")).toEqual(["#706"]);
    });

    it("for a GH- reference", () => {
      expect(refs("GH-706")).toEqual(["#706"]);
    });

    it("for a reference to a renamed repository, by its current name", () => {
      expect(refs("zeebe-io/zeebe#123")).toEqual(["camunda/camunda#123"]);
    });
  });

  describe("returns all references", () => {
    it("at the start, middle and end", () => {
      expect(
        refs(text({ start: "#706", middle: "#752", end: "#753" })),
      ).toEqual(["#706", "#752", "#753"]);
    });

    it("separated by a single space", () => {
      expect(refs("relates to #706 #752 #753")).toEqual([
        "#706",
        "#752",
        "#753",
      ]);
    });

    it("followed by punctuation", () => {
      expect(refs("Fixes #706. (#752) #753, [#749]")).toEqual([
        "#706",
        "#752",
        "#753",
        "#749",
      ]);
    });

    it("followed by a possessive or colon", () => {
      expect(refs("#706's fix; #752: done; #753!")).toEqual([
        "#706",
        "#752",
        "#753",
      ]);
    });

    it("in lists, quotes and tables", () => {
      expect(refs("- #706\n\n> #752\n\n| a |\n|---|\n| #753 |")).toEqual([
        "#706",
        "#752",
        "#753",
      ]);
    });
  });

  describe("returns each reference once", () => {
    it("for a repeated issue reference", () => {
      expect(refs("Fixes #706 and see #706 again")).toEqual(["#706"]);
    });

    it("for an issue url and a reference to the same issue", () => {
      expect(
        refs(
          "#706 https://github.com/korthout/backport-action/issues/706 korthout/backport-action#706",
        ),
      ).toEqual(["#706"]);
    });

    it("for references written in different casing", () => {
      expect(
        refs(
          "Korthout/Backport-Action#706 https://github.com/KORTHOUT/backport-action/issues/706 Actions/Checkout#1 actions/checkout#1",
        ),
      ).toEqual(["#706", "actions/checkout#1"]);
    });

    it("in the order in which they were first found", () => {
      expect(refs("#706 and #752 and #706 and #753 and #752")).toEqual([
        "#706",
        "#752",
        "#753",
      ]);
    });
  });

  it("returns references in the order they appear", () => {
    expect(
      refs(
        "#706 then https://github.com/actions/checkout/issues/1 and actions/checkout#2 and #752",
      ),
    ).toEqual(["#706", "actions/checkout#1", "actions/checkout#2", "#752"]);
  });

  it("lists references to the original pull request's repository as #N, whatever its casing", () => {
    const html = rendered("korthout/backport-action#706");
    expect(
      getMentionedIssueRefs(html, {
        name: "Backport-Action",
        owner: { login: "Korthout" },
      }),
    ).toEqual(["#706"]);
  });

  describe("ignores references inside code", () => {
    it("for a fenced code block", () => {
      expect(refs("```\n#706\n```\nfixes #752")).toEqual(["#752"]);
    });

    it("for a fenced code block with an info string", () => {
      expect(refs("```ts\n// see #706\n```\nfixes #752")).toEqual(["#752"]);
    });

    it("for a fenced code block with tildes", () => {
      expect(refs("~~~\n#706\n~~~\nfixes #752")).toEqual(["#752"]);
    });

    it("for a fenced code block indented by up to three spaces", () => {
      expect(refs("   ```\n#706\n   ```\nfixes #752")).toEqual(["#752"]);
    });

    it("for an unclosed fenced code block, which hides the rest of the description", () => {
      expect(refs("fixes #752\n```\n#706")).toEqual(["#752"]);
    });

    it("for an indented code block", () => {
      expect(refs("para\n\n    #706\n\nfixes #752")).toEqual(["#752"]);
    });

    it("for inline code", () => {
      expect(refs("see `#706` and #752")).toEqual(["#752"]);
    });

    it("for inline code containing other words", () => {
      expect(refs("and `see #706 now`")).toEqual([]);
    });

    it("for inline code delimited by multiple backticks", () => {
      expect(refs("``a ` #706`` #752")).toEqual(["#752"]);
    });

    it("for HTML code tags", () => {
      expect(refs("<code>#706</code> <pre>#752</pre> #753")).toEqual(["#753"]);
    });

    it("but not for unmatched backticks", () => {
      expect(refs("a `` b #752")).toEqual(["#752"]);
    });

    it("but not for backticks in separate paragraphs", () => {
      expect(refs("a ` b\n\nfixes #752 and ` c")).toEqual(["#752"]);
    });
  });

  describe("ignores references inside comments", () => {
    it("for a multi-line comment in a pull request template", () => {
      const body = dedent`
        ## Related issues

        <!--
        - This PR fully resolves the issue: closes #706
        - One of several PRs for the issue: relates to #706 or a bare #706
        -->

        - [x] This PR does not need a linked issue
      `;
      expect(refs(body)).toEqual([]);
    });

    it("while keeping references outside of the comment", () => {
      expect(refs("relates to #752\n<!-- closes #706 -->\nfixes #753")).toEqual(
        ["#752", "#753"],
      );
    });

    it("for a comment in the middle of a line", () => {
      expect(refs("see #706 <!-- not #752 --> and #753")).toEqual([
        "#706",
        "#753",
      ]);
    });

    it("for an issue url", () => {
      expect(
        refs("<!-- https://github.com/actions/checkout/issues/1 -->"),
      ).toEqual([]);
    });

    it("for an external issue reference", () => {
      expect(refs("<!-- actions/checkout#1 -->")).toEqual([]);
    });

    it("without joining the text before and after a comment into a reference", () => {
      expect(refs("a/b<!-- x -->#706")).toEqual(["#706"]);
    });

    it("without joining the text before and after a comment into a word", () => {
      expect(refs("fixes #706<!-- x -->and more")).toEqual(["#706"]);
    });

    it("for an unclosed comment, which hides the rest of the description", () => {
      expect(refs("Fixes #706\n<!-- closes #752")).toEqual(["#706"]);
    });

    it("for a closed comment followed by an unclosed comment", () => {
      expect(refs("#706 and <!-- #752 --> #753 and\n<!-- #749")).toEqual([
        "#706",
        "#753",
      ]);
    });
  });

  describe("handles code and comments in the order they open", () => {
    it("for a comment start inside inline code", () => {
      expect(refs("Use `<!--` to start a comment. Fixes #752")).toEqual([
        "#752",
      ]);
    });

    it("for a comment start inside a fenced code block", () => {
      expect(refs("```html\n<!-- a comment\n```\nFixes #752")).toEqual([
        "#752",
      ]);
    });

    it("for a comment start and end in separate inline code", () => {
      expect(
        refs("Escape `<!--` in templates, fixes #752 and close with `-->`"),
      ).toEqual(["#752"]);
    });

    it("for inline code inside a comment", () => {
      expect(refs("<!-- use `foo` #706 --> visible #752")).toEqual(["#752"]);
    });

    it("for a backtick inside a comment", () => {
      expect(refs("<!-- a ` #706 --> b ` #753")).toEqual(["#753"]);
    });

    it("for a comment end inside inline code", () => {
      expect(refs("``a ` <!-- `` #752 -->")).toEqual(["#752"]);
    });
  });
});

describe("compose body/title", () => {
  const main_default = {
    number: 123,
    body: "foo-body",
    body_html: rendered("foo-body"),
    base: { repo },
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
              body_html: rendered("Body mentions #706 and that's it."),
            },
            target,
          ),
        ).toEqual("Backport that refers to: #706");
      });

      it("and body refers to the same issue more than once", () => {
        expect(
          replacePlaceholders(
            template,
            {
              ...main_default,
              body_html: rendered("Fixes #706 and see #706 again"),
            },
            target,
          ),
        ).toEqual("Backport that refers to: #706");
      });

      it("and body has some referred issues", () => {
        expect(
          replacePlaceholders(
            template,
            {
              ...main_default,
              body_html: rendered(
                "This body refers to #706 and actions/checkout#1",
              ),
            },
            target,
          ),
        ).toEqual("Backport that refers to: #706 actions/checkout#1");
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
            {
              ...main_default,
              body_html: rendered("Body mentions #706 and that's it."),
            },
            target,
          ),
        ).toEqual("Refers to #706 and again #706");
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
  return dedent`
    ${start} foo bar
    bar bar ${middle} bar

    foo${part}foo ${part}foo

    foo bar bar foo ${end}
  `;
}

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import dedent from "dedent";
import {
  coerceCherryPickingMergeMode,
  getMentionedIssueRefs,
  replacePlaceholders,
} from "../utils.js";

// Each case's markdown, the references it should give, and its html: the
// description as GitHub renders it in the original pull request's `body_html`.
// To add a case, write its markdown and refs, then render its html with
// `node src/test/fixtures/render-issue-refs.mjs`.
const cases: Record<
  string,
  { markdown: string; refs: string[]; html?: string }
> = JSON.parse(
  readFileSync(new URL("fixtures/issue-refs.json", import.meta.url), "utf8"),
);
const repo = { name: "backport-action", owner: { login: "korthout" } };

function rendered(name: string): string {
  const html = cases[name]?.html;
  if (html === undefined) {
    throw new Error(`No rendered case in fixtures/issue-refs.json: ${name}`);
  }
  return html;
}

describe("get mentioned issues", () => {
  it("returns an empty list for a missing rendered description", () => {
    expect(getMentionedIssueRefs(null, repo)).toEqual([]);
    expect(getMentionedIssueRefs(undefined, repo)).toEqual([]);
  });

  it.each(Object.keys(cases))("%s", (name) => {
    expect(getMentionedIssueRefs(rendered(name), repo)).toEqual(
      cases[name].refs,
    );
  });

  it("recognizes the original pull request's repository whatever its casing", () => {
    const html = rendered(
      "lists references to the original pull request's repository as #N",
    );
    expect(
      getMentionedIssueRefs(html, {
        name: "Backport-Action",
        owner: { login: "Korthout" },
      }),
    ).toEqual(["#706"]);
  });
});

describe("compose body/title", () => {
  const main_default = {
    number: 123,
    body: "foo-body",
    body_html: null,
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

      it("and body has referred issues", () => {
        expect(
          replacePlaceholders(
            template,
            {
              ...main_default,
              body_html: rendered("lists issues and pull requests"),
            },
            target,
          ),
        ).toEqual("Backport that refers to: #706 #749");
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
              body_html: rendered("lists issues and pull requests"),
            },
            target,
          ),
        ).toEqual("Refers to #706 #749 and again #706 #749");
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

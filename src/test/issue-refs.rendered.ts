// Pull request descriptions rendered by GitHub, with the issues and pull requests GitHub linked in each.
// Rendered with: gh api -X POST /markdown -f mode=gfm -f context=korthout/backport-action -f text=<body>
// `github` lists the links as `${issue_refs}` writes them. Where getMentionedIssueRefs differs, `differs` says
// what it finds instead, and why.

export const rendered: {
  name: string;
  body: string;
  github: string[];
  differs?: { refs: string[]; why: string };
}[] = [
  {
    name: "start/middle/end",
    body: "#1 foo #2 bar #3",
    github: ["#1", "#2", "#3"],
  },
  {
    name: "part of word",
    body: "foo#123 abc#1",
    github: [],
  },
  {
    name: "external ref",
    body: "zeebe-io/zeebe#123",
    github: ["camunda/camunda#123"],
    differs: {
      refs: ["zeebe-io/zeebe#123"],
      why: "needs the API: GitHub writes the new name of a renamed repository",
    },
  },
  {
    name: "issue url",
    body: "https://github.com/zeebe-io/zeebe/issues/123",
    github: ["camunda/camunda#123"],
    differs: {
      refs: ["zeebe-io/zeebe#123"],
      why: "needs the API: GitHub writes the new name of a renamed repository",
    },
  },
  {
    name: "url without scheme",
    body: "github.com/zeebe-io/zeebe/issues/123",
    github: ["camunda/camunda#123"],
    differs: {
      refs: ["zeebe-io/zeebe#123"],
      why: "needs the API: GitHub writes the new name of a renamed repository",
    },
  },
  {
    name: "www url",
    body: "https://www.github.com/zeebe-io/zeebe/issues/123",
    github: [],
  },
  {
    name: "url trailing slash",
    body: "https://github.com/zeebe-io/zeebe/issues/123/",
    github: ["camunda/camunda#123"],
    differs: {
      refs: ["zeebe-io/zeebe#123"],
      why: "needs the API: GitHub writes the new name of a renamed repository",
    },
  },
  {
    name: "same-repo url",
    body: "https://github.com/korthout/backport-action/issues/706",
    github: ["#706"],
  },
  {
    name: "multi-line comment",
    body: "<!--\ncloses #706\n-->\nfixes #752",
    github: ["#752"],
  },
  {
    name: "comment mid-line",
    body: "see #706 <!-- not #752 --> and #753",
    github: ["#706", "#753"],
  },
  {
    name: "comment joins ref",
    body: "a/b<!-- x -->#706",
    github: ["#706"],
  },
  {
    name: "unclosed comment",
    body: "Fixes #706\n<!-- closes #752",
    github: ["#706"],
  },
  {
    name: "fenced",
    body: "```\n#706\n```\nfixes #752",
    github: ["#752"],
  },
  {
    name: "inline code",
    body: "see `#706` and #752",
    github: ["#752"],
  },
  {
    name: "indented code",
    body: "para\n\n    #706\n\nfixes #752",
    github: ["#752"],
  },
  {
    name: "indented after paragraph",
    body: "para\n    #706",
    github: ["#706"],
  },
  {
    name: "comment start in code",
    body: "Use `<!--` to start a comment. Fixes #752",
    github: ["#752"],
  },
  {
    name: "backtick in comment",
    body: "<!-- a ` #1 --> b ` #753",
    github: ["#753"],
  },
  {
    name: "longer closing fence",
    body: "```\n#706\n````\n`x` #752",
    github: ["#752"],
  },
  {
    name: "escaped backtick",
    body: "\\`#706\\` #752",
    github: ["#706", "#752"],
  },
  {
    name: "html code tag",
    body: "<code>#706</code> <pre>#752</pre> #753",
    github: ["#753"],
  },
  {
    name: "escaped hash",
    body: "\\#706 #752",
    github: ["#706", "#752"],
  },
  {
    name: "single spaces",
    body: "relates to #706 #752 #753",
    github: ["#706", "#752", "#753"],
  },
  {
    name: "punctuation",
    body: "Fixes #706. (#752) #753, [#749]",
    github: ["#706", "#752", "#753", "#749"],
  },
  {
    name: "possessive/colon",
    body: "#706's fix; #752: done; #753!",
    github: ["#706", "#752", "#753"],
  },
  {
    name: "pull url",
    body: "https://github.com/korthout/backport-action/pull/749",
    github: ["#749"],
  },
  {
    name: "pull url ext",
    body: "https://github.com/zeebe-io/zeebe/pull/1",
    github: ["camunda/camunda#1"],
    differs: {
      refs: ["zeebe-io/zeebe#1"],
      why: "needs the API: GitHub writes the new name of a renamed repository",
    },
  },
  {
    name: "pull url files tab",
    body: "https://github.com/korthout/backport-action/pull/749/files",
    github: [],
  },
  {
    name: "issue url comment anchor",
    body: "https://github.com/korthout/backport-action/issues/706#issuecomment-1",
    github: ["#706"],
  },
  {
    name: "issue url query",
    body: "https://github.com/korthout/backport-action/issues/706?x=1",
    github: ["#706"],
  },
  {
    name: "pulls (plural) url",
    body: "https://github.com/korthout/backport-action/pulls/749",
    github: [],
  },
  {
    name: "casing",
    body: "Korthout/Backport-Action#706 and https://github.com/KORTHOUT/backport-action/issues/706",
    github: ["#706"],
  },
  {
    name: "bare + full same issue",
    body: "#706 https://github.com/korthout/backport-action/issues/706 korthout/backport-action#706",
    github: ["#706"],
  },
  {
    name: "full same-repo ref",
    body: "korthout/backport-action#706",
    github: ["#706"],
  },
  {
    name: "ext ref casing",
    body: "Camunda/Camunda#1 camunda/camunda#1",
    github: ["camunda/camunda#1"],
    differs: {
      refs: ["Camunda/Camunda#1"],
      why: "needs the API: GitHub writes the canonical casing of another repository",
    },
  },
  {
    name: "ext url",
    body: "https://github.com/camunda/camunda/issues/1",
    github: ["camunda/camunda#1"],
  },
  {
    name: "#N pointing at PR",
    body: "#749",
    github: ["#749"],
  },
  {
    name: "markdown link url",
    body: "[see here](https://github.com/korthout/backport-action/issues/706) and [#752](https://example.com)",
    github: [],
  },
  {
    name: "markdown link #N text",
    body: "[#706](https://github.com/korthout/backport-action/issues/706)",
    github: [],
  },
  {
    name: "autolink brackets",
    body: "<https://github.com/korthout/backport-action/issues/706>",
    github: ["#706"],
  },
  {
    name: "raw html anchor",
    body: '<a href="https://github.com/korthout/backport-action/issues/706">x</a>',
    github: [],
  },
  {
    name: "GH- prefix",
    body: "GH-706",
    github: ["#706"],
  },
  {
    name: "owner-less",
    body: "backport-action#706",
    github: [],
  },
  {
    name: "ext GH- prefix",
    body: "zeebe-io/zeebe#GH-1",
    github: ["#1"],
  },
  {
    name: "heading",
    body: "# 706\n#706",
    github: ["#706"],
  },
  {
    name: "list/quote/table",
    body: "- #706\n\n> #752\n\n| a |\n|---|\n| #753 |",
    github: ["#706", "#752", "#753"],
  },
  {
    name: "details",
    body: "<details><summary>x</summary>\n\n#706\n\n</details>",
    github: ["#706"],
  },
  {
    name: "nonexistent number",
    body: "#999999",
    github: [],
    differs: {
      refs: ["#999999"],
      why: "needs the API: GitHub doesn't link what doesn't exist",
    },
  },
  {
    name: "nonexistent ext number",
    body: "actions/checkout#999999",
    github: [],
    differs: {
      refs: ["actions/checkout#999999"],
      why: "needs the API: GitHub doesn't link what doesn't exist",
    },
  },
  {
    name: "nonexistent repo",
    body: "nonexistent-org-xyz/nope#1",
    github: [],
    differs: {
      refs: ["nonexistent-org-xyz/nope#1"],
      why: "needs the API: GitHub doesn't link what doesn't exist",
    },
  },
  {
    name: "nonexistent repo url",
    body: "https://github.com/nonexistent-org-xyz/nope/issues/1",
    github: [],
    differs: {
      refs: ["nonexistent-org-xyz/nope#1"],
      why: "needs the API: GitHub doesn't link what doesn't exist",
    },
  },
  {
    name: "private repo",
    body: "camunda/camunda-private#1",
    github: [],
    differs: {
      refs: ["camunda/camunda-private#1"],
      why: "needs the API: GitHub doesn't link private repositories the reader can't see",
    },
  },
  {
    name: "private repo url",
    body: "https://github.com/camunda/camunda-private/issues/1",
    github: [],
    differs: {
      refs: ["camunda/camunda-private#1"],
      why: "needs the API: GitHub doesn't link private repositories the reader can't see",
    },
  },
  {
    name: "public ext",
    body: "actions/checkout#1",
    github: ["actions/checkout#1"],
  },
  {
    name: "discussion",
    body: "https://github.com/korthout/backport-action/discussions/1",
    github: ["#1"],
    differs: {
      refs: [],
      why: "out of scope: discussions aren't issues or pull requests",
    },
  },
  {
    name: "discussion ext",
    body: "https://github.com/community/community/discussions/1",
    github: ["orgs/community#1"],
    differs: {
      refs: [],
      why: "out of scope: discussions aren't issues or pull requests",
    },
  },
  {
    name: "commit and user",
    body: "18df263 @korthout",
    github: [],
  },
  {
    name: "number zero / leading zero",
    body: "#0 #0706",
    github: ["#706"],
  },
  {
    name: "list indented code",
    body: "- item\n\n      #706\n\nfixes #752",
    github: ["#752"],
    differs: {
      refs: ["#706", "#752"],
      why: "regex limit: code in a list item is indented relative to the item",
    },
  },
  {
    name: "list continuation (not code)",
    body: "- item\n    #706",
    github: ["#706"],
  },
  {
    name: "list para after blank (not code)",
    body: "- item\n\n    #706",
    github: ["#706"],
  },
  {
    name: "fence in list item",
    body: "1. item\n\n   ```\n   #706\n   ```\n\n#752",
    github: ["#752"],
  },
  {
    name: "fence in blockquote",
    body: "> ```\n> #706\n> ```\n\n#752",
    github: ["#752"],
  },
  {
    name: "unclosed fence in blockquote",
    body: "> ```\n> #706\n\n#752",
    github: ["#752"],
    differs: {
      refs: ["#706", "#752"],
      why: "regex limit: a fence in a block quote ends with the quote",
    },
  },
  {
    name: "unclosed fence in list",
    body: "- ```\n  #706\n\n#752",
    github: ["#752"],
    differs: {
      refs: ["#706", "#752"],
      why: "regex limit: a fence in a list item ends with the item",
    },
  },
  {
    name: "lazy continuation",
    body: "> para\n#706",
    github: ["#706"],
  },
  {
    name: "blockquote indented code",
    body: ">     #706\n\n#752",
    github: ["#752"],
    differs: {
      refs: ["#706", "#752"],
      why: "regex limit: code in a block quote is indented after the `>`",
    },
  },
  {
    name: "tab indented code",
    body: "para\n\n\t#706\n\n#752",
    github: ["#752"],
  },
  {
    name: "closing fence indented 4",
    body: "```\n#706\n    ```\n#752",
    github: [],
  },
  {
    name: "fence interrupts paragraph",
    body: "para\n```\n#706\n```\n#752",
    github: ["#752"],
  },
  {
    name: "mismatched fence char",
    body: "~~~\n#706\n```\n#752",
    github: [],
  },
  {
    name: "backtick info with backtick",
    body: "``` a`b\n#706\n```\n#752",
    github: ["#706"],
    differs: {
      refs: ["#752"],
      why: "not handled: a fence line interrupts the paragraph, and so the code span",
    },
  },
  {
    name: "tilde info with backtick",
    body: "~~~ a`b\n#706\n~~~\n#752",
    github: ["#752"],
  },
  {
    name: "html block div",
    body: "<div>\n#706\n</div>\n\n#752",
    github: ["#706", "#752"],
  },
  {
    name: "html pre block",
    body: "<pre>\n#706\n</pre>\n\n#752",
    github: ["#752"],
  },
  {
    name: "inline code tag",
    body: "<code>#706</code> #752",
    github: ["#752"],
  },
  {
    name: "inline html anchor",
    body: '<a href="https://github.com/korthout/backport-action/issues/706">x</a> #752',
    github: ["#752"],
  },
  {
    name: "comment across blank in para",
    body: "text <!--\n\n#706\n\n-->",
    github: ["#706"],
  },
  {
    name: "comment block across blank",
    body: "<!-- a\n\n#706\n\n-->\n#752",
    github: ["#752"],
  },
  {
    name: "escaped comment",
    body: "\\<!-- #706 -->",
    github: ["#706"],
  },
  {
    name: "comment line after text",
    body: "#706 <!--\nstill comment #752\n--> #753",
    github: ["#706", "#753"],
  },
  {
    name: "code span across lines",
    body: "`a\n#706` #752",
    github: ["#752"],
  },
  {
    name: "triple backtick inline",
    body: "x ```#706``` #752",
    github: ["#752"],
  },
  {
    name: "backslash in code span",
    body: "`a\\`#706` #752",
    github: ["#706", "#752"],
  },
  {
    name: "code span in link text",
    body: "[`#706`](https://example.com) #752",
    github: ["#752"],
  },
  {
    name: "escaped hash (2)",
    body: "\\#706",
    github: ["#706"],
  },
  {
    name: "link ref definition",
    body: "[x]: https://github.com/korthout/backport-action/issues/706\n\n#752",
    github: ["#752"],
  },
  {
    name: "link ref def used",
    body: "[x][y]\n\n[y]: https://github.com/korthout/backport-action/issues/706",
    github: [],
  },
  {
    name: "ref in link url",
    body: "[a](#706) #752",
    github: ["#752"],
  },
  {
    name: "colon/excl",
    body: "#706: x #752!",
    github: ["#706", "#752"],
  },
  {
    name: "apostrophe",
    body: "#706's #752-foo",
    github: ["#706", "#752"],
  },
  {
    name: "underscore",
    body: "#706_ _#752_",
    github: ["#752"],
  },
  {
    name: "emphasis",
    body: "*#706* **#752**",
    github: ["#706", "#752"],
  },
  {
    name: "quotes",
    body: "\"#706\" '#752'",
    github: ["#706", "#752"],
  },
  {
    name: "letter suffix",
    body: "#706abc",
    github: [],
  },
  {
    name: "slash suffix",
    body: "#706/ x",
    github: ["#706"],
  },
  {
    name: "double ref",
    body: "#706#752",
    github: ["#706"],
  },
  {
    name: "ext ref period",
    body: "korthout/backport-action#706.",
    github: ["#706"],
  },
  {
    name: "url trailing period",
    body: "https://github.com/korthout/backport-action/issues/706.",
    github: ["#706"],
  },
  {
    name: "url in parens",
    body: "(https://github.com/korthout/backport-action/issues/706)",
    github: ["#706"],
  },
  {
    name: "http url",
    body: "http://github.com/korthout/backport-action/issues/706",
    github: [],
  },
  {
    name: "url issue ref fragment",
    body: "https://github.com/korthout/backport-action/issues/706#top",
    github: ["#706"],
  },
  {
    name: "table cell",
    body: "| a |\n|---|\n| #706 |",
    github: ["#706"],
  },
  {
    name: "heading ref",
    body: "## Fixes #706",
    github: ["#706"],
  },
  {
    name: "ref after hash char",
    body: "a#706 b/#752 (#753",
    github: ["#752", "#753"],
  },
  {
    name: "nested owner path",
    body: "a/b/c#706",
    github: [],
    differs: {
      refs: ["b/c#706"],
      why: "needs the API: GitHub doesn't link what doesn't exist",
    },
  },
  {
    name: "dot in repo",
    body: "korthout/backport.action#1",
    github: [],
    differs: {
      refs: ["korthout/backport.action#1"],
      why: "needs the API: GitHub doesn't link what doesn't exist",
    },
  },
  {
    name: "url pull number zero",
    body: "https://github.com/korthout/backport-action/pull/0",
    github: [],
  },
  {
    name: "t fenced",
    body: "```\n#7\n```\nfixes #1",
    github: ["#1"],
  },
  {
    name: "t info string",
    body: "```ts\n// see #7\n```\nfixes #1",
    github: ["#1"],
  },
  {
    name: "t tildes",
    body: "~~~\n#7\n~~~\nfixes #1",
    github: ["#1"],
  },
  {
    name: "t fence 3 spaces",
    body: "   ```\n#7\n   ```\nfixes #1",
    github: ["#1"],
  },
  {
    name: "t unclosed fence",
    body: "fixes #1\n```\n#7",
    github: ["#1"],
  },
  {
    name: "t inline",
    body: "see `#8` and #1",
    github: ["#1"],
  },
  {
    name: "t inline words",
    body: "and `see #8 now`",
    github: [],
  },
  {
    name: "t multi backtick",
    body: "``a ` #5`` #6",
    github: ["#6"],
  },
  {
    name: "t unmatched",
    body: "a `` b #1",
    github: ["#1"],
  },
  {
    name: "t backtick paragraphs",
    body: "a ` b\n\nfixes #1 and ` c",
    github: ["#1"],
  },
  {
    name: "t comment in code",
    body: "Use `<!--` to start a comment. Fixes #12",
    github: ["#12"],
  },
  {
    name: "t comment in fence",
    body: "```html\n<!-- a comment\n```\nFixes #12",
    github: ["#12"],
  },
  {
    name: "t comment start end code",
    body: "Escape `<!--` in templates, fixes #12 and close with `-->`",
    github: ["#12"],
  },
  {
    name: "t code in comment",
    body: "<!-- use `foo` #1 --> visible #2",
    github: ["#2"],
  },
  {
    name: "t backtick in comment",
    body: "<!-- a ` #1 --> b ` #3",
    github: ["#3"],
  },
  {
    name: "t comment end in code",
    body: "``a ` <!-- `` #5 -->",
    github: ["#5"],
  },
  {
    name: "t comment joins",
    body: "a/b<!-- x -->#7",
    github: ["#7"],
  },
  {
    name: "t comment word",
    body: "fixes #1<!-- x -->and more",
    github: ["#1"],
  },
  {
    name: "t closed then unclosed",
    body: "#1 and <!-- #2 --> #3 and\n<!-- #4",
    github: ["#1", "#3"],
  },
  {
    name: "nested list after blank",
    body: "- a\n\n    - b #706",
    github: ["#706"],
  },
  {
    name: "code in nested list",
    body: "- a\n  - b\n\n        #706\n\n#752",
    github: ["#752"],
    differs: {
      refs: ["#706", "#752"],
      why: "regex limit: code in a list item is indented relative to the item",
    },
  },
  {
    name: "pre block blank lines",
    body: "<pre>\n\n#706\n\n</pre>\n#752",
    github: ["#752"],
  },
  {
    name: "details block",
    body: "<details>\n<summary>x</summary>\n\n#706\n\n</details>",
    github: ["#706"],
  },
  {
    name: "img alt attr",
    body: '<img src="x" alt="#706"> #752',
    github: ["#752"],
  },
  {
    name: "image link",
    body: "![img](https://github.com/korthout/backport-action/issues/706) #752",
    github: ["#752"],
  },
  {
    name: "task list",
    body: "- [x] #706",
    github: ["#706"],
  },
  {
    name: "fence in quote+list",
    body: "> - ```\n>   #706\n\n#752",
    github: ["#752"],
    differs: {
      refs: ["#706", "#752"],
      why: "regex limit: a fence in a block quote ends with the quote",
    },
  },
  {
    name: "br between",
    body: "#706<br>#752",
    github: ["#706", "#752"],
  },
  {
    name: "comment then text same line",
    body: "<!-- x --> #706",
    github: ["#706"],
  },
  {
    name: "link with ref in text",
    body: "[fixes #706 here](https://example.com) #752",
    github: ["#752"],
  },
  {
    name: "helper part #",
    body: " foo bar\nbar bar  bar \n\nfoo/#706 foo#706foo #706foo\n\nfoo bar bar foo ",
    github: ["#706"],
  },
  {
    name: "helper part ext",
    body: " foo bar\nbar bar  bar \n\nfoo/korthout/backport-action#706 fookorthout/backport-action#706foo korthout/backport-action#706foo\n\nfoo bar bar foo ",
    github: ["#706"],
  },
  {
    name: "helper part url",
    body: " foo bar\nbar bar  bar \n\nfoo/github.com/korthout/backport-action/issues/706 foogithub.com/korthout/backport-action/issues/706foo github.com/korthout/backport-action/issues/706foo\n\nfoo bar bar foo ",
    github: ["#706"],
  },
  {
    name: "helper start/mid/end",
    body: "#706 foo bar\nbar bar #752 bar \n\nfoo/ foofoo foo\n\nfoo bar bar foo #753",
    github: ["#706", "#752", "#753"],
  },
  {
    name: "mid-line unclosed comment",
    body: "a <!-- #706\n\n#752",
    github: ["#706", "#752"],
  },
  {
    name: "mid-line unclosed, same para",
    body: "a <!-- #706\nb #752",
    github: ["#706", "#752"],
  },
  {
    name: "non-github url fragment",
    body: "https://example.com/#706 #752",
    github: ["#752"],
  },
  {
    name: "prefix punct 1",
    body: "-#706 .#752 @#753 :#749",
    github: ["#706", "#752", "#753", "#749"],
  },
  {
    name: "prefix punct 2",
    body: "&#706; =#752 +#753 ~#749",
    github: ["#752", "#753", "#749"],
  },
  {
    name: "prefix punct 3",
    body: "{#706} <#752> |#753 ,#749",
    github: ["#706", "#752", "#753", "#749"],
  },
  {
    name: "uppercase host",
    body: "GITHUB.COM/korthout/backport-action/issues/706",
    github: ["#706"],
  },
  {
    name: "url glued prefix",
    body: "xhttps://github.com/korthout/backport-action/issues/706",
    github: ["#706"],
  },
  {
    name: "url glued suffix",
    body: "github.com/korthout/backport-action/issues/706abc",
    github: [],
  },
  {
    name: "url in md link",
    body: "[x](https://github.com/korthout/backport-action/issues/706) #752",
    github: ["#752"],
  },
  {
    name: "full ref suffix",
    body: "korthout/backport-action#706abc",
    github: [],
  },
  {
    name: "full ref dot prefix",
    body: "x.korthout/backport-action#706",
    github: ["#706"],
  },
  {
    name: "full ref paren",
    body: "(korthout/backport-action#706) [korthout/backport-action#752]",
    github: ["#706", "#752"],
  },
  {
    name: "escaped then code",
    body: "\\``#706` #752",
    github: ["#752"],
  },
  {
    name: "list 7sp after dash",
    body: "- item\n\n       #706\n\n#752",
    github: ["#752"],
    differs: {
      refs: ["#706", "#752"],
      why: "regex limit: code in a list item is indented relative to the item",
    },
  },
  {
    name: "ordered 4sp",
    body: "1. item\n\n    #706\n\n#752",
    github: ["#706", "#752"],
  },
  {
    name: "ordered 7sp",
    body: "1. item\n\n       #706\n\n#752",
    github: ["#752"],
    differs: {
      refs: ["#706", "#752"],
      why: "regex limit: code in a list item is indented relative to the item",
    },
  },
  {
    name: "code after heading",
    body: "# h\n    #706\n\n#752",
    github: ["#752"],
    differs: {
      refs: ["#706", "#752"],
      why: "not handled: indented code may follow a heading without a blank line",
    },
  },
  {
    name: "longer tilde closer",
    body: "~~~\n#706\n~~~~\n#752",
    github: ["#752"],
  },
  {
    name: "shorter closer",
    body: "````\n#706\n```\n#752",
    github: [],
  },
  {
    name: "closer trailing text",
    body: "```\n#706\n``` x\n#752",
    github: [],
  },
  {
    name: "kbd samp",
    body: "<kbd>#706</kbd> <samp>#752</samp> <tt>#753</tt>",
    github: ["#706", "#752", "#753"],
  },
  {
    name: "anchor text",
    body: '<a href="https://example.com">#706</a> #752',
    github: ["#752"],
  },
  {
    name: "inline link ref text",
    body: "[#706](https://example.com) [x #752](https://example.com) #753",
    github: ["#753"],
  },
  {
    name: "shortcut ref with def",
    body: "[#706]\n\n[#706]: https://example.com\n\n#752",
    github: ["#752"],
    differs: {
      refs: ["#706", "#752"],
      why: "not handled: a reference link [text] is a link when a definition for it exists",
    },
  },
  {
    name: "image alt",
    body: "![#706](x.png) #752",
    github: ["#752"],
  },
  {
    name: "nested list 4sp para",
    body: "- a\n\n    - #706",
    github: ["#706"],
  },
  {
    name: "quote fence closes",
    body: "> ```\n> #706\n> ```\n> #752",
    github: ["#752"],
  },
  {
    name: "indented comment 4sp",
    body: "    <!-- x\n#706 -->\n#752",
    github: ["#706", "#752"],
  },
  {
    name: "comment inline closer later para",
    body: "a <!-- x --> #706 <!--\n\n-->#752",
    github: ["#706", "#752"],
  },
  {
    name: "two-space url sep",
    body: "https://github.com/korthout/backport-action/issues/706  https://github.com/korthout/backport-action/pull/749",
    github: ["#706", "#749"],
  },
  {
    name: "url then comma",
    body: "https://github.com/korthout/backport-action/issues/706, https://github.com/korthout/backport-action/pull/749.",
    github: ["#706", "#749"],
  },
  {
    name: "owner casing link text",
    body: "KORTHOUT/BACKPORT-ACTION#706 Actions/Checkout#1",
    github: ["#706", "actions/checkout#1"],
    differs: {
      refs: ["#706", "Actions/Checkout#1"],
      why: "needs the API: GitHub writes the canonical casing of another repository",
    },
  },
  {
    name: "setext heading",
    body: "#706\n---",
    github: ["#706"],
  },
  {
    name: "html block div with blank",
    body: "<div>\n\n    #706\n\n</div>",
    github: [],
  },
  {
    name: "html block div inline",
    body: "<div>#706</div>\n\n#752",
    github: ["#706", "#752"],
  },
  {
    name: "span inline",
    body: "x <span>#706</span> #752",
    github: ["#706", "#752"],
  },
  {
    name: "emphasis joins",
    body: "a/b**x**#706 **foo**#752",
    github: ["#706", "#752"],
  },
  {
    name: "emph around",
    body: "**#706** _#752_ ~~#753~~",
    github: ["#706", "#752", "#753"],
  },
  {
    name: "adjacent",
    body: "#706#752 #706abc #753_",
    github: ["#706"],
  },
  {
    name: "url trailing dot/paren",
    body: "(https://github.com/korthout/backport-action/issues/706). https://github.com/korthout/backport-action/pull/749,",
    github: ["#706", "#749"],
  },
  {
    name: "image alt (2)",
    body: "![#706](https://example.com/x.png) #752",
    github: ["#752"],
  },
  {
    name: "table escaped pipe code",
    body: "| a |\n|---|\n| `x\\|#706` |\n\n#752",
    github: ["#752"],
  },
  {
    name: "entity",
    body: "&#35;706 #752",
    github: ["#706", "#752"],
    differs: {
      refs: ["#752"],
      why: "not handled: HTML entities like &#35; aren't decoded",
    },
  },
  {
    name: "unclosed backtick",
    body: "`#706 #752",
    github: ["#706", "#752"],
  },
  {
    name: "footnote",
    body: "x[^1] #752\n\n[^1]: #706",
    github: ["#752", "#706"],
  },
  {
    name: "url in text no scheme mid",
    body: "see github.com/korthout/backport-action/pull/749 ok",
    github: ["#749"],
  },
  {
    name: "slash before hash",
    body: "a/#706 /#752 x/y/z#753",
    github: ["#706", "#752"],
    differs: {
      refs: ["#706", "#752", "y/z#753"],
      why: "needs the API: GitHub doesn't link what doesn't exist",
    },
  },
  {
    name: "html comment inline code",
    body: "`<!--` #706 `-->` #752",
    github: ["#706", "#752"],
  },
  {
    name: "unclosed fence tilde",
    body: "~~~\n#706",
    github: [],
  },
  {
    name: "task list (2)",
    body: "- [ ] #706\n- [x] #752",
    github: ["#706", "#752"],
  },
  {
    name: "dash words",
    body: "foo-#706 foo.#752 foo:#753",
    github: ["#706", "#752", "#753"],
  },
  {
    name: "gh lowercase",
    body: "gh-706 Gh-752",
    github: ["#706", "#752"],
  },
  {
    name: "gh boundaries",
    body: "xGH-706 (GH-752) GH-753. -GH-749 _GH-706",
    github: ["#752", "#753", "#749"],
  },
  {
    name: "gh after slash",
    body: "a/GH-706 /GH-752",
    github: ["#706", "#752"],
  },
  {
    name: "gh word after",
    body: "GH-706abc GH-752_ GH-753-x",
    github: ["#753"],
  },
  {
    name: "gh in code",
    body: "`GH-706` GH-752",
    github: ["#752"],
  },
  {
    name: "gh leading zero",
    body: "GH-0706",
    github: ["#706"],
  },
  {
    name: "gh hash",
    body: "#GH-706",
    github: ["#706"],
  },
  {
    name: "footnote def",
    body: "x[^1]\n\n[^1]: #706",
    github: ["#706"],
  },
  {
    name: "ref def label",
    body: "[foo]: https://example.com\n\n[foo] #752",
    github: ["#752"],
  },
  {
    name: "link title single",
    body: "[a](https://example.com 'x #706') #752",
    github: ["#752"],
  },
  {
    name: "link title paren",
    body: "[a](https://example.com (x #706)) #752",
    github: ["#752"],
  },
  {
    name: "link angle dest",
    body: "[a](<https://example.com/#706>) #752",
    github: ["#752"],
  },
  {
    name: "nested link text",
    body: "[a [b] #706](https://example.com) #752",
    github: ["#752"],
  },
  {
    name: "full ref leading zero",
    body: "korthout/backport-action#0706",
    github: ["#706"],
  },
  {
    name: "url leading zero",
    body: "https://github.com/korthout/backport-action/issues/0706",
    github: ["#706"],
  },
  {
    name: "crlf indented code",
    body: "para\r\n\r\n    #706\r\n\r\nfixes #752",
    github: ["#752"],
  },
  {
    name: "crlf fence",
    body: "```\r\n#706\r\n```\r\nfixes #752",
    github: ["#752"],
  },
  {
    name: "gh ext origin dup",
    body: "GH-706 #706 korthout/backport-action#706",
    github: ["#706"],
  },
  {
    name: "link in link text",
    body: '[`#706`](x) [x](y "t") #752',
    github: ["#752"],
  },
  {
    name: "underscore before hash",
    body: "foo_#706 _#752",
    github: [],
  },
  {
    name: "non-ascii before hash",
    body: "ä#706 日本#752 é#753",
    github: ["#706", "#752", "#753"],
  },
  {
    name: "github non-ref url",
    body: "https://github.com/korthout/backport-action/issues?q=is:open+#706 https://github.com/korthout/backport-action/wiki/Page/#752",
    github: [],
  },
  {
    name: "unclosed code element",
    body: "<code>#706 more\n\n#752",
    github: [],
  },
  {
    name: "unclosed pre element",
    body: "<pre>#706\n\n#752",
    github: [],
  },
  {
    name: "repo trailing dot",
    body: "see korthout/backport-action.#706",
    github: [],
    differs: {
      refs: ["korthout/backport-action.#706"],
      why: "needs the API: GitHub doesn't link what doesn't exist",
    },
  },
  {
    name: "unclosed a element",
    body: '<a href="x">#706\n\n#752',
    github: ["#752"],
    differs: {
      refs: ["#706", "#752"],
      why: "not handled: an unclosed <a> element ends with its paragraph",
    },
  },
  {
    name: "two code one closed",
    body: "<code>#706 <code>#752</code> #753",
    github: [],
    differs: {
      refs: ["#753"],
      why: "not handled: nested <code> elements",
    },
  },
  {
    name: "emphasis underscores",
    body: "_#706_ __#752__",
    github: ["#706", "#752"],
  },
  {
    name: "list item continuation line",
    body: "- a\n  b\n\n    #706\n\n#752",
    github: ["#706", "#752"],
  },
  {
    name: "paragraph two lines then code",
    body: "a\nb\n\n    #706\n\n#752",
    github: ["#752"],
  },
  {
    name: "underscore owner",
    body: "korthout_x/backport-action#706 foo_bar/baz#1",
    github: [],
    differs: {
      refs: ["korthout_x/backport-action#706", "foo_bar/baz#1"],
      why: "needs the API: GitHub doesn't link what doesn't exist",
    },
  },
  {
    name: "domain before ref",
    body: "see docs.example.com/guide#706 x.korthout/backport-action#752",
    github: ["#752"],
    differs: {
      refs: ["com/guide#706", "#752"],
      why: "needs the API: GitHub doesn't link what doesn't exist",
    },
  },
  {
    name: "list item third paragraph",
    body: "- a\n\n    para under a\n\n    see #706",
    github: ["#706"],
  },
  {
    name: "invalid html tag text",
    body: "x <y #706> z",
    github: ["#706"],
  },
  {
    name: "issue url subpath tail",
    body: "https://github.com/korthout/backport-action/issues/1/x/korthout/backport-action#706",
    github: ["#1"],
    differs: {
      refs: ["#706"],
      why: "not handled: GitHub links an issue URL with a subpath as a whole",
    },
  },
];

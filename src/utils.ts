import { PullRequest } from "./github.js";

/**
 * @param template The template potentially containing placeholders
 * @param main The main pull request that is backported
 * @param target The target branchname
 * @returns Description that can be used in the backport pull request
 */
export function replacePlaceholders(
  template: string,
  main: Pick<PullRequest, "body" | "user" | "number" | "title" | "base">,
  target: string,
): string {
  const origin = `${main.base.repo.owner.login}/${main.base.repo.name}`;
  const values: Record<string, string> = {
    pull_author: main.user.login,
    pull_number: main.number.toString(),
    pull_title: main.title,
    pull_description: main.body ?? "",
    target_branch: target,
    issue_refs: getMentionedIssueRefs(main.body, origin).join(" "),
  };
  return template.replace(/\$\{(\w+)\}/g, (match, name) =>
    Object.hasOwn(values, name) ? values[name] : match,
  );
}

/**
 * @param body Text in which to search for references to issues and pull requests, ignoring those inside code, comments (`<!-- ... -->`) and links, like GitHub does
 * @param origin The repository (`owner/repo`) of the pull request the body belongs to, which `#N` and `GH-N` refer to
 * @returns Each referenced issue or pull request once, in the order first found, written as first found,
 *   but preferring a full reference over a bare `#N` or `GH-N`; a URL is written as `owner/repo#N`
 */
export function getMentionedIssueRefs(
  body: string | null,
  origin: string,
): string[] {
  const visible = (body ?? "").replace(/\r\n?/g, "\n").replace(hidden, " ");
  const refs = new Map<string, string>();
  for (const match of visible.matchAll(reference)) {
    const g = match.groups!;
    const owner = g.urlOwner ?? g.refOwner;
    const repo = g.urlRepo ?? g.refRepo;
    const number =
      g.urlNumber ?? g.refNumber ?? g.originNumber ?? g.emphasizedNumber;
    const key =
      `${owner ? `${owner}/${repo}` : origin}#${number}`.toLowerCase();
    // a full reference replaces a bare one (which has no `/`), because only the full one still refers to the
    // original repository in a backport pull request in another repository; it keeps the bare one's position
    if (!refs.has(key) || (owner && !refs.get(key)!.includes("/"))) {
      refs.set(key, g.urlNumber ? `${owner}/${repo}#${number}` : match[0]);
    }
  }
  return [...refs.values()];
}

// What GitHub doesn't link references in: code, comments and links.
// It's one regex, so whichever construct opens first wins: a `<!--` inside code doesn't start a comment,
// and a backtick inside a comment doesn't start code.
// Each piece mirrors a CommonMark rule (https://spec.commonmark.org). Regexes can't measure the indentation
// of list items and block quotes, so code nested in those is only approximated.

const textStart = String.raw`(?<![\s\S])`;
const textEnd = String.raw`(?![\s\S])`;
const blankLine = String.raw`\n[ \t]*\n`;
// any character, unless `stop` starts at it: a lazy repetition of this scans up to the first `stop`
const charUnless = (stop: string) => String.raw`(?:(?!${stop})[\s\S])`;
// a paragraph ends at a blank line
const inParagraph = charUnless(blankLine);
// preceded by an even number of backslashes (or none), so the next character isn't escaped
const unescaped = String.raw`(?<=(?<!\\)(?:\\\\)*)`;
const listItemLine = String.raw`^ {0,3}(?:[-+*]|\d{1,9}[.)])[ \t][^\n]*`;

// a fence of 3+ backticks or tildes, indented up to 3 spaces; it's closed by a fence of the same character that's
// at least as long, or else runs to the end of the text; a backtick fence's info string can't contain a backtick
const backtickFence = String.raw`^ {0,3}(?<ticks>\`{3,})[^\`\n]*$[\s\S]*?(?:^ {0,3}\k<ticks>\`*[ \t]*$|${textEnd})`;
const tildeFence = String.raw`^ {0,3}(?<tildes>~{3,})[^\n]*$[\s\S]*?(?:^ {0,3}\k<tildes>~*[ \t]*$|${textEnd})`;

// lines indented by 4+ spaces or a tab, the first one not blank; they can't interrupt a paragraph, so they start
// the text or follow a blank line; after a list item's paragraph, that indentation continues the item instead
const indent = String.raw`(?: {4}| {0,3}\t)`;

// a list item's paragraph, or an indented paragraph after a blank line, which can only continue a list item here
// because an indented code block would already be hidden
const listItemParagraph = String.raw`(?:${listItemLine}|(?<=${blankLine})${indent}[^\n]*)(?:\n[^\n]+)*`;
const indentedCode = String.raw`(?<=${textStart}|${blankLine})(?<!${listItemParagraph}${blankLine})${indent}[ \t]*\S[^\n]*(?:\n(?:${indent}[^\n]*|[ \t]*(?=\n)))*`;

// a string of backticks, unless escaped or part of a longer string, up to the next string of the same length
// in the same paragraph; without one, the backticks are just text
const notAfterBacktick = String.raw`(?<!${unescaped}\`)`;
const codeSpan = String.raw`${unescaped}${notAfterBacktick}(?<span>\`+)(?!\`)${inParagraph}*?(?<!\`)\k<span>(?!\`)`;

// a comment at the start of a line is an HTML block: it may span paragraphs, and an unclosed one runs to the end
const blockComment = String.raw`^ {0,3}<!--[\s\S]*?(?:-->|${textEnd})`;
// elsewhere, a comment must close within its paragraph, otherwise it's just text
// (stopping at the next `<!--` keeps many unclosed comments from taking quadratic time)
const inlineComment = String.raw`${unescaped}<!--${charUnless(`${blankLine}|<!--`)}*?-->`;

// [text](destination "title") or ![alt](source); the text may contain one level of nested brackets, the destination
// one level of nested parentheses (not more, so many unclosed links don't take quadratic time)
const linkText = String.raw`\[(?:[^\[\]\n]|\[[^\[\]\n]*\])*\]`;
const linkDestination = String.raw`(?:[^()\s]|\([^()\s]*\))*`;
const linkTitle = String.raw`"[^"]*"|'[^']*'|\([^()]*\)`;
const inlineLink = String.raw`${unescaped}!?${linkText}\(${linkDestination}(?:\s+(?:${linkTitle}))?\s*\)`;
// [label]: destination, but not a footnote `[^label]: text`, whose text is linked
const linkReferenceDefinition = String.raw`^ {0,3}\[(?!\^)[^\]\n]+\]:[^\n]*`;

// a tag name is followed by a space, `/` or `>`, so an autolink like <https://...> isn't a tag
// <code> and <pre> elements with their content; an unclosed one runs to the end
const codeElement = String.raw`<(?<code>code|pre)(?=[\s>])[^<>]*>[\s\S]*?(?:<\/\k<code>\s*>|${textEnd})`;
// <a> elements with their content (stopping at the next <a> keeps many unclosed ones from taking quadratic time)
const anchorElement = String.raw`<a(?=[\s>])[^<>]*>${charUnless(String.raw`<a[\s>]`)}*?<\/a\s*>`;
// the attributes of any other HTML tag; outside quotes, a `#` means it's text, not a tag
const htmlTag = String.raw`<\/?[a-z][a-z\d-]*(?=[\s/>])(?:[^<>"'#]|"[^"]*"|'[^']*')*>`;

// a URL that's linked as a whole, like https://example.com/#1, unless it's the URL of an issue or pull request
const otherUrl = String.raw`(?:https?:\/\/|www\.)(?!github\.com\/[\w.-]+\/[\w.-]+\/(?:issues|pull)\/)[^\s<]*`;

const hidden = new RegExp(
  [
    backtickFence,
    tildeFence,
    indentedCode,
    blockComment,
    codeSpan,
    inlineComment,
    inlineLink,
    linkReferenceDefinition,
    codeElement,
    anchorElement,
    htmlTag,
    otherUrl,
  ].join("|"),
  "gmi",
);

// References GitHub links: `#N`, `GH-N`, `owner/repo#N`, and URLs of issues and pull requests.
// Each form names its own groups, because duplicate group names are new in ES2025, after the TypeScript target.

// user and organization names, with `_` for Enterprise Managed Users like `octocat_acme`
const owner = String.raw`[a-z\d][\w-]*`;
const repo = String.raw`[\w.-]+`;
// leading zeros are ignored: #0706 is #706
const number = (group: string) => String.raw`0*(?<${group}>[1-9]\d*)`;
// a reference ends at anything but a word character, e.g. `#1.`, `(#1)`, `#1's`, `#1-fix`
const refEnd = String.raw`(?!\w)`;

// `#N` or `GH-N`, not inside a word, and `#N` not in an HTML entity like `&#1;`; but `(#1)`, `b/#1`, `x-GH-1` are fine
const originRef = String.raw`(?:(?<![\w&])#|(?<!\w)GH-)${number("originNumber")}${refEnd}`;
// `_#N_` or `__#N__`: underscores around a reference are emphasis, not part of a word
const emphasizedRef = String.raw`(?<=(?<!\w)_+)#${number("emphasizedNumber")}(?=_+(?!\w))`;
// `owner/repo#N`, not inside a word
const fullRef = String.raw`(?<![\w-])(?<refOwner>${owner})\/(?<refRepo>${repo})#${number("refNumber")}${refEnd}`;
// https://github.com/owner/repo/issues/N or .../pull/N; the scheme is optional; a trailing slash, `#fragment` or
// `?query` is fine, but a subpage like `/pull/N/files` isn't; not inside a word, nor an `http://` or `www.` link
const url = String.raw`(?<![\w.-]|http:\/\/)(?:https:\/\/)?github\.com\/(?<urlOwner>${owner})\/(?<urlRepo>${repo})\/(?:issues|pull)\/${number("urlNumber")}\/?(?![\w/-])`;

const reference = new RegExp(
  [url, fullRef, originRef, emphasizedRef].join("|"),
  "gi",
);

export function coerceCherryPickingMergeMode(
  raw: string,
): "default" | "whitespace_tolerant" | "invalid" {
  const value = raw === "" ? "default" : raw;
  if (value === "default" || value === "whitespace_tolerant") {
    return value;
  }
  return "invalid";
}

/**
 * Describes commits dropped from a cherry-pick because the target branch
 * already contained them, e.g. "1 commit skipped (target already contains
 * changes)". Shared so both comment styles word it identically.
 */
export function describeSkippedCommits(skippedShas: string[]): string {
  const plural = skippedShas.length === 1 ? "commit" : "commits";
  return `${skippedShas.length} ${plural} skipped (target already contains changes)`;
}

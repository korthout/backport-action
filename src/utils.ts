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
 * @param body Text in which to search for references to issues and pull requests as written, ignoring those inside code, comments (`<!-- ... -->`) and links
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
    // only a full reference still refers to the original repository from a backport in another repository,
    // so it replaces a bare one (which has no `/`), keeping the bare one's position
    if (!refs.has(key) || (owner && !refs.get(key)!.includes("/"))) {
      refs.set(key, g.urlNumber ? `${owner}/${repo}#${number}` : match[0]);
    }
  }
  return [...refs.values()];
}

// Text that isn't a reference, even if it looks like one: code, comments and links.
// It's one regex, so whichever construct opens first wins: a `<!--` inside code doesn't start a comment,
// and a backtick inside a comment doesn't start code.
// Each piece mirrors a CommonMark rule (https://spec.commonmark.org). Regexes can't measure the indentation
// of list items and block quotes, so code nested in those is only approximated.

const textStart = String.raw`(?<![\s\S])`;
const textEnd = String.raw`(?![\s\S])`;
const blankLine = String.raw`\n[ \t]*\n`;
// any character, unless `stop` starts at it: a lazy repetition of this scans up to the first `stop`
const charUnless = (stop: string) => String.raw`(?:(?!${stop})[\s\S])`;
// preceded by an even number of backslashes (or none), so the next character isn't escaped
const unescaped = String.raw`(?<=(?<!\\)(?:\\\\)*)`;

// a closing fence is at least as long as the opening one; a backtick fence's info string can't contain a backtick
const backtickFence = String.raw`^ {0,3}(?<ticks>\`{3,})[^\`\n]*$[\s\S]*?(?:^ {0,3}\k<ticks>\`*[ \t]*$|${textEnd})`;
const tildeFence = String.raw`^ {0,3}(?<tildes>~{3,})[^\n]*$[\s\S]*?(?:^ {0,3}\k<tildes>~*[ \t]*$|${textEnd})`;

const indent = String.raw`(?: {4}| {0,3}\t)`;
const listItemLine = String.raw`^ {0,3}(?:[-+*]|\d{1,9}[.)])[ \t][^\n]*`;
// a list item's paragraph, or an indented paragraph after a blank line, which can only continue a list item here
// because an indented code block would already be hidden
const listItemParagraph = String.raw`(?:${listItemLine}|(?<=${blankLine})${indent}[^\n]*)(?:\n[^\n]+)*`;
// indented code can't interrupt a paragraph, so it starts the text or follows a blank line;
// after a list item's paragraph, the indentation continues the item instead
const indentedCode = String.raw`(?<=${textStart}|${blankLine})(?<!${listItemParagraph}${blankLine})${indent}[ \t]*\S[^\n]*(?:\n(?:${indent}[^\n]*|[ \t]*(?=\n)))*`;

// a string of backticks, not escaped and not inside a longer string, up to the next string of the same length
// in the same paragraph; without one, it's just text
const codeSpan = String.raw`${unescaped}(?<!${unescaped}\`)(?<span>\`+)(?!\`)${charUnless(blankLine)}*?(?<!\`)\k<span>(?!\`)`;

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
// not a footnote `[^label]: text`, whose text is linked
const linkReferenceDefinition = String.raw`^ {0,3}\[(?!\^)[^\]\n]+\]:[^\n]*`;

// In HTML, a tag name is followed by a space, `/` or `>`, so an autolink like <https://...> isn't a tag.
// An unclosed <code> or <pre> runs to the end, but an unclosed <a> is just text
const codeElement = String.raw`<(?<code>code|pre)(?=[\s>])[^<>]*>[\s\S]*?(?:<\/\k<code>\s*>|${textEnd})`;
// stopping at the next <a> keeps many unclosed ones from taking quadratic time
const anchorElement = String.raw`<a(?=[\s>])[^<>]*>${charUnless(String.raw`<a[\s>]`)}*?<\/a\s*>`;
// outside quotes, a `#` means it's text, not a tag
const htmlTag = String.raw`<\/?[a-z][a-z\d-]*(?=[\s/>])(?:[^<>"'#]|"[^"]*"|'[^']*')*>`;

// a `#` inside a URL, like https://example.com/#1, isn't a reference, unless it's the URL of an issue or pull request
const otherUrl = String.raw`(?:https?:\/\/|www\.)(?!(?:www\.)?github\.com\/[\w.-]+\/[\w.-]+\/(?:issues|pull)\/)[^\s<]*`;

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

// `#N`, `GH-N`, `owner/repo#N` and URLs each name their own groups, because duplicate group names are new in
// ES2025, after the TypeScript target.

// with `_` for Enterprise Managed Users like `octocat_acme`
const owner = String.raw`[a-z\d][\w-]*`;
const repo = String.raw`[\w.-]+`;
// the zeros are outside the group, so `#0706` and `#706` are the same issue
const number = (group: string) => String.raw`0*(?<${group}>[1-9]\d*)`;
// a reference ends at anything but a word character, so `#1-fix` and `#1's` are references
const refEnd = String.raw`(?!\w)`;

// a `#` after `&` starts an HTML entity like `&#1;`, not a reference
const originRef = String.raw`(?:(?<![\w&])#|(?<!\w)GH-)${number("originNumber")}${refEnd}`;
// underscores around a reference are emphasis, not part of a word
const emphasizedRef = String.raw`(?<=(?<!\w)_+)#${number("emphasizedNumber")}(?=_+(?!\w))`;
const fullRef = String.raw`(?<![\w-])(?<refOwner>${owner})\/(?<refRepo>${repo})#${number("refNumber")}${refEnd}`;
// a trailing `/`, `#fragment` or `?query` is fine, a subpage like `/pull/N/files` isn't
const url = String.raw`(?<![\w.-])(?:https?:\/\/)?(?:www\.)?github\.com\/(?<urlOwner>${owner})\/(?<urlRepo>${repo})\/(?:issues|pull)\/${number("urlNumber")}\/?(?![\w/-])`;

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

import type { Repo } from "./github.js";

// Finds the references to issues and pull requests in a pull request description, as written there.
//
// References inside code, comments, links or html tags aren't references in the rendered description. So the
// description is first reduced to the text GitHub renders (`visibleText`), and then references are matched in it. The
// markdown rules below follow GitHub's renderer only as far as they change which text is rendered. The cases in
// src/test/fixtures/issue-refs.json are rendered by GitHub; cases marked `gap` show where these rules differ from it.
// Which references count deliberately differs from GitHub's links: `www.github.com` urls and references to issues that
// don't exist are listed, though GitHub doesn't link them. The unit tests cover these differences.

/**
 * @param body The description of the original pull request
 * @param repo The repository of the original pull request, to which a bare reference like `#123` refers
 * @returns Each issue and pull request referred to in the description once, in the order first found, as first written
 *   in full: a url as `owner/repo#123`, any other reference as is
 */
export function getMentionedIssueRefs(
  body: string | null,
  repo: Repo,
): string[] {
  const refs = new Map<string, string>();
  for (const { 0: written, groups = {} } of visibleText(body ?? "").matchAll(
    reference,
  )) {
    const number =
      groups.urlNumber ?? groups.fullNumber ?? groups.number ?? groups.ghNumber;
    if (number === undefined) continue; // a link that isn't to an issue or pull request
    const issueRepo =
      groups.urlRepo ?? groups.fullRepo ?? `${repo.owner}/${repo.repo}`;
    // the same issue can be written differently, also as a bare reference to `repo`
    const key = `${issueRepo}#${number}`.toLowerCase();
    const ref = groups.urlRepo ? `${groups.urlRepo}#${number}` : written;
    // a full reference keeps referring to `repo` when the backport pull request is in another repository
    const first = refs.get(key);
    if (first === undefined || (!first.includes("/") && ref.includes("/"))) {
      refs.set(key, ref);
    }
  }
  return [...refs.values()];
}

// Each form has its own group names: duplicate named groups aren't needed, and not every Node.js version supports them.
const reference = new RegExp(
  [
    // github.com/owner/repo/issues/123 or /pull/123, optionally with https:// or www. and followed by `/`, a query or a
    // fragment
    String.raw`(?<![\w.\/-])(?:https:\/\/)?(?:www\.)?github\.com\/(?<urlRepo>[\w-]+\/[\w.-]+)\/(?:issues|pull)\/0*(?<urlNumber>[1-9]\d*)\/?(?![\w\/])`,
    // any other url is a plain link, references inside it aren't references
    String.raw`https?:\/\/[^\s<>]*|www\.[^\s<>]*`,
    String.raw`(?<![\w-])(?<fullRepo>[\w-]+\/[\w.-]+)#0*(?<fullNumber>[1-9]\d*)(?!\w)`,
    String.raw`(?<![\w#&])#0*(?<number>[1-9]\d*)(?!\w)`,
    String.raw`(?<!\w)[Gg][Hh]-0*(?<ghNumber>[1-9]\d*)(?![\w#])`,
  ].join("|"),
  "g",
);

// -------------------------------------------------------------------------------------------------------------------
// Block structure: line by line, find the paragraphs, and skip the blocks that GitHub doesn't render as text.

type BlockState = {
  /** Open block quotes and list items, outermost first */
  containers: Container[];
  paragraph: string[];
  /** Open block whose lines are hidden, like a fenced code block */
  hidden?: HiddenBlock;
  paragraphs: string[];
  definitions: Set<string>;
};

/** A block quote, or a list item by the indentation of its content */
type Container = "quote" | number;

type HiddenBlock = {
  /** The number of containers the block is in, it ends with them */
  depth: number;
  /** Ends the block: returns the rest of the line after the block's end, or undefined if the block doesn't end */
  end: (line: string) => string | undefined;
};

/** Deeper containers are read as text, so that scanning stays fast for deeply nested input */
const maxContainers = 100;

/**
 * @returns The text of the paragraphs, as far as it isn't hidden by inline markup.
 *   Hidden parts are replaced by a space, so the text around them isn't joined into a reference.
 */
function visibleText(body: string): string {
  const state: BlockState = {
    containers: [],
    paragraph: [],
    paragraphs: [],
    definitions: new Set(),
  };
  for (const line of body.split(/\r?\n/)) {
    const rest = enterContainers(state, expandIndentTabs(line));
    if (continueHiddenBlock(state, rest)) continue;
    readBlock(state, openContainers(state, rest));
  }
  closeParagraph(state);
  // a link can refer to a definition further down, so inline structure is read after all definitions are known
  return state.paragraphs
    .map((paragraph) => visibleInline(paragraph, state.definitions))
    .join("\n");
}

function expandIndentTabs(line: string): string {
  return line.replace(/^[\t ]+/, (indent) => indent.replaceAll("\t", "    "));
}

/**
 * Matches the line against the open containers, and closes those it doesn't continue, unless the line continues the
 * open paragraph lazily (a line without the `>` or indentation of the containers it is in).
 * @returns The rest of the line, inside the containers that continue
 */
function enterContainers(state: BlockState, line: string): string {
  let matched = 0;
  let rest = line;
  for (const container of state.containers) {
    const content = continueContainer(container, rest);
    if (content === undefined) break;
    rest = content;
    matched++;
  }
  const lazy =
    matched < state.containers.length &&
    state.paragraph.length > 0 &&
    !isBlank(rest) &&
    !startsBlock(rest);
  if (!lazy) closeContainers(state, matched);
  return rest;
}

/** @returns The rest of the line inside the container: "" for a blank line, undefined if the line doesn't continue it */
function continueContainer(
  container: Container,
  line: string,
): string | undefined {
  if (container === "quote") {
    const marker = quoteMarker.exec(line);
    return marker ? line.slice(marker[0].length) : undefined;
  }
  if (isBlank(line)) return "";
  const indent = /^ */.exec(line)![0].length;
  return indent >= container ? line.slice(container) : undefined;
}

function closeContainers(state: BlockState, keep: number) {
  if (keep === state.containers.length) return;
  closeParagraph(state);
  state.containers.length = keep;
  if (state.hidden && state.hidden.depth > keep) state.hidden = undefined;
}

/** @returns Whether the line belongs to an open hidden block */
function continueHiddenBlock(state: BlockState, line: string): boolean {
  if (state.hidden === undefined) return false;
  const rest = state.hidden.end(line);
  if (rest === undefined) return true;
  state.hidden = undefined;
  state.paragraph.push(rest);
  closeParagraph(state);
  return true;
}

function openContainers(state: BlockState, line: string): string {
  let rest = line;
  while (state.containers.length < maxContainers) {
    const quote = quoteMarker.exec(rest);
    const marker = quote ?? listItemAt(rest, state.paragraph.length > 0);
    if (marker === null) break;
    closeParagraph(state);
    state.containers.push(quote ? "quote" : marker[0].length);
    rest = rest.slice(marker[0].length);
  }
  return rest;
}

const quoteMarker = /^ {0,3}> ?/;
// a list item's content starts after its marker and 1 to 4 spaces; with 5 or more, the content is indented code
const listItem = /^ {0,3}(?:[-+*]|\d{1,9}[.)])(?: {1,4}(?! )| (?= {4})| *$)/;
const thematicBreak = /^ {0,3}([-*_])(?: *\1){2,} *$/;

function listItemAt(line: string, inParagraph: boolean) {
  if (thematicBreak.test(line)) return null;
  const item = listItem.exec(line);
  if (item === null || !inParagraph) return item;
  // only an item with content, and an ordered item starting at 1, interrupts a paragraph
  const interrupts =
    !isBlank(line.slice(item[0].length)) &&
    /^ {0,3}(?:[-+*]|0*1[.)])/.test(item[0]);
  return interrupts ? item : null;
}

function readBlock(state: BlockState, line: string) {
  if (isBlank(line)) return closeParagraph(state);
  if (state.paragraph.length === 0) {
    if (/^ {4}/.test(line)) return; // indented code, which can't interrupt a paragraph
    const definition = linkReferenceDefinition.exec(line);
    if (definition) {
      state.definitions.add(normalizeLabel(definition[1])); // not rendered itself
      return;
    }
  } else if (setextUnderline.test(line)) {
    return closeParagraph(state); // the paragraph is a heading
  }
  if (openHiddenBlock(state, line)) return;
  if (heading.test(line) || thematicBreak.test(line)) {
    // a heading or thematic break ends the paragraph, and a heading is a paragraph of its own
    closeParagraph(state);
    state.paragraphs.push(line);
    return;
  }
  state.paragraph.push(line);
}

const heading = /^ {0,3}#{1,6}(?:[ \t]|$)/;
const setextUnderline = /^ {0,3}(?:=+|-+) *$/;

// [label]: destination "optional title", on a single line
const linkReferenceDefinition =
  /^ {0,3}\[(?!\^)([^\[\]\n]+)\]:[ \t]*(?:<[^>\n]*>|[^\s<]\S*)(?:[ \t]+(?:"[^"\n]*"|'[^'\n]*'|\([^()\n]*\)))?[ \t]*$/;

function normalizeLabel(label: string): string {
  return label.trim().replace(/\s+/g, " ").toLowerCase();
}

function openHiddenBlock(state: BlockState, line: string): boolean {
  const depth = state.containers.length;
  const fence = fenceAt(line);
  if (fence !== undefined) {
    closeParagraph(state);
    state.hidden = { depth, end: (next) => closingFence(fence, next) };
    return true;
  }
  const html = hidingHtmlBlocks.find(({ start }) => start.test(line));
  if (html) {
    closeParagraph(state);
    const end = (text: string) => {
      const match = html.end.exec(text);
      return match ? text.slice(match.index + match[0].length) : undefined;
    };
    state.hidden = { depth, end };
    continueHiddenBlock(state, line); // the block can end on its first line
    return true;
  }
  return false;
}

// html blocks that hide their content up to the line with their end; the rest of that line is raw html, which is rendered as text
const hidingHtmlBlocks = [
  { start: /^ {0,3}<!--/, end: /-->/ },
  { start: /^ {0,3}<pre(?=[\s>]|$)/i, end: /<\/pre>/i },
];

function fenceAt(line: string): string | undefined {
  const fence = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
  if (fence === null) return undefined;
  const [, marker, info] = fence;
  // a backtick fence can't have a backtick in its info string, then the line is text
  return marker[0] === "`" && info.includes("`") ? undefined : marker;
}

/** @returns An empty rest of the line if it closes the fence, or undefined if it doesn't */
function closingFence(fence: string, line: string): string | undefined {
  const close = /^ {0,3}(`{3,}|~{3,}) *$/.exec(line);
  const closes =
    close !== null &&
    close[1][0] === fence[0] &&
    close[1].length >= fence.length;
  return closes ? "" : undefined;
}

/** @returns Whether the line starts a block that ends a paragraph, so it can't continue a paragraph lazily */
function startsBlock(line: string): boolean {
  return (
    quoteMarker.test(line) ||
    listItemAt(line, true) !== null ||
    fenceAt(line) !== undefined ||
    hidingHtmlBlocks.some(({ start }) => start.test(line)) ||
    heading.test(line) ||
    thematicBreak.test(line)
  );
}

function closeParagraph(state: BlockState) {
  if (state.paragraph.length === 0) return;
  state.paragraphs.push(state.paragraph.join("\n"));
  state.paragraph = [];
}

function isBlank(line: string): boolean {
  return line.trim() === "";
}

// -------------------------------------------------------------------------------------------------------------------
// Inline structure: in a paragraph, whichever opens first wins: a code span, a comment, a link, or an html tag.
//
// Each construct is tried only where a character can open it, and searches for its end only move forward. So scanning
// takes time linear in the length of the paragraph, also when constructs don't close.

/** Replaces `text[start, end)`, the part of the paragraph that a construct takes up, by its visible text */
type Span = { end: number; visible: string };

function visibleInline(text: string, definitions: Set<string>): string {
  const search = new ForwardSearch(text);
  const opener = /[\\`<!\[]/g;
  let visible = "";
  let copied = 0;
  for (let m; (m = opener.exec(text));) {
    const span = inlineSpan(text, m.index, search, definitions);
    if (span === undefined) continue;
    visible += text.slice(copied, m.index) + span.visible;
    copied = opener.lastIndex = span.end;
  }
  return visible + text.slice(copied);
}

function inlineSpan(
  text: string,
  start: number,
  search: ForwardSearch,
  definitions: Set<string>,
): Span | undefined {
  switch (text[start]) {
    case "\\":
      return escapedCharacter(text, start);
    case "`":
      return codeSpan(text, start, search);
    case "<":
      return (
        comment(text, start, search) ??
        autolink(text, start) ??
        htmlTag(text, start, search)
      );
    default:
      return link(text, start, definitions);
  }
}

/** An escaped character is literal text, it doesn't open anything */
function escapedCharacter(text: string, start: number): Span | undefined {
  const escaped = text[start + 1];
  if (escaped === undefined || !/[!-\/:-@\[-`{-~]/.test(escaped)) return;
  return { end: start + 2, visible: escaped };
}

/** A code span ends at the next run of as many backticks; without one, the backticks are literal */
function codeSpan(text: string, start: number, search: ForwardSearch): Span {
  const run = matchAt(/`+/y, text, start)!;
  const end = start + run.length;
  const closer = search.backtickRun(run.length, end);
  if (closer === undefined) return { end, visible: run };
  return { end: closer + run.length, visible: " " };
}

/** A comment ends at the next `-->`; without one, it is literal text */
function comment(
  text: string,
  start: number,
  search: ForwardSearch,
): Span | undefined {
  const open = matchAt(/<!--(?:-?>)?/y, text, start);
  if (open === undefined) return;
  if (open.endsWith(">")) return { end: start + open.length, visible: " " };
  const close = search.next(commentEnd, start + open.length);
  return close === undefined ? undefined : { end: close.end, visible: " " };
}

const commentEnd = /-->/g;

/** An autolink's text is its url */
function autolink(text: string, start: number): Span | undefined {
  const url = matchAt(/<([a-z][\w+.-]*:[^\s<>]*)>/iy, text, start);
  if (url === undefined) return;
  return { end: start + url.length, visible: ` ${url.slice(1, -1)} ` };
}

/** An html tag's attributes aren't text, and a `code`, `pre` or `a` element hides its content */
function htmlTag(
  text: string,
  start: number,
  search: ForwardSearch,
): Span | undefined {
  const tag = matchAt(htmlTagPattern, text, start);
  if (tag === undefined) return;
  const end = start + tag.length;
  const element = /^<(code|pre|a)[\s\/>]/i.exec(tag)?.[1].toLowerCase();
  const close =
    element === undefined ? undefined : search.next(closingTags[element], end);
  return { end: close?.end ?? end, visible: " " };
}

// an open tag with its attributes, or a closing tag
const htmlTagPattern =
  /<(?:[a-z][a-z0-9-]*(?:\s+[a-z_:][\w.:-]*(?:\s*=\s*(?:[^\s"'=<>`]+|'[^']*'|"[^"]*"))?)*\s*\/?|\/[a-z][a-z0-9-]*\s*)>/iy;
const closingTags: Record<string, RegExp> = {
  code: /<\/code\s*>/gi,
  pre: /<\/pre\s*>/gi,
  a: /<\/a\s*>/gi,
};

/** A link or image: its text is already a link, and its destination isn't text */
function link(
  text: string,
  start: number,
  definitions: Set<string>,
): Span | undefined {
  linkPattern.lastIndex = start;
  const match = linkPattern.exec(text);
  if (match === null) return;
  const [whole, linkText, inline, label] = match;
  const hide = (length: number) => ({ end: start + length, visible: " " });
  if (inline !== undefined) return hide(whole.length);
  // a reference link is only a link when its label is defined
  const isDefined = (l: string) => definitions.has(normalizeLabel(l));
  if (label && isDefined(label)) return hide(whole.length);
  if (isDefined(linkText)) {
    // [text][] takes up the whole match, [text] only up to its `]`
    return hide(label === "" ? whole.length : whole.indexOf("]") + 1);
  }
}

// [text](destination "title"), [text][label], [text][] or [text]
const linkPattern =
  /!?\[([^\[\]]*)\](?:(\(\s*[^()\s]*(?:\s+(?:"[^"]*"|'[^']*'|\([^()]*\)))?\s*\))|\[([^\[\]]*)\])?/y;

/** @returns The match of the sticky `pattern` at `index`, if any */
function matchAt(
  pattern: RegExp,
  text: string,
  index: number,
): string | undefined {
  pattern.lastIndex = index;
  return pattern.exec(text)?.[0];
}

/**
 * Finds where a construct ends, in time linear in the length of the text overall. The scanner only moves forward, so
 * each search starts at or after the previous one for the same pattern, and a previous result can be reused.
 */
class ForwardSearch {
  readonly #text: string;
  readonly #found = new Map<RegExp, { index: number; end: number } | null>();
  /** Starts of the backtick runs by their length, and how many of those are before the last search */
  readonly #backtickRuns = new Map<
    number,
    { starts: number[]; passed: number }
  >();

  constructor(text: string) {
    this.#text = text;
    for (const run of text.matchAll(/`+/g)) {
      const runs = this.#backtickRuns.get(run[0].length) ?? {
        starts: [],
        passed: 0,
      };
      runs.starts.push(run.index);
      this.#backtickRuns.set(run[0].length, runs);
    }
  }

  /** @returns The first match of the global `pattern` that starts at or after `from`; use the same `pattern` object */
  next(pattern: RegExp, from: number) {
    let found = this.#found.get(pattern);
    if (found === undefined || (found !== null && found.index < from)) {
      pattern.lastIndex = from;
      const match = pattern.exec(this.#text);
      found = match && { index: match.index, end: pattern.lastIndex };
      this.#found.set(pattern, found);
    }
    return found ?? undefined;
  }

  /** @returns The start of the first run of exactly `length` backticks that starts at or after `from` */
  backtickRun(length: number, from: number): number | undefined {
    const runs = this.#backtickRuns.get(length);
    if (runs === undefined) return undefined;
    while (runs.starts[runs.passed] < from) runs.passed++;
    return runs.starts[runs.passed];
  }
}

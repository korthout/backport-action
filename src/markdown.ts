// Reads a pull request description as Markdown, to find the text that can hold references to issues: its visible text.
//
// Markdown is CommonMark (https://spec.commonmark.org/0.31.2/, whose section numbers are cited below) with GitHub's
// extensions (https://github.github.com/gfm/). The scanner follows it only as far as that changes the visible text. The
// cases in src/test/fixtures/issue-refs.json marked `gap` show where it differs.
//
// Terms
//
// Markdown's terms are used as CommonMark defines them, like block, container block (a block quote or list item, which
// holds other blocks), leaf block, paragraph, lazy continuation line, inline content and code span. On top of those:
//
// - Visible text: the text of the paragraphs and headings outside code, comments and html tags. An autolink's url is
//   visible text, and so is a bare url, which GitHub turns into a link (GFM's "Autolinks (extension)").
// - Hidden block: a block whose lines aren't visible text, and that stays open until a line ends it: a fenced code
//   block, or an html block opened by `<!--` or `<pre`. The rest of the line that ends an html block is visible text.
//
// How it works
//
// Like CommonMark's parsing strategy (appendix A), the scanner first reads the block structure of the whole
// description, and then the inline structure of each paragraph and heading.
//
// 1. Block structure, one line at a time (sections 4 and 5). The state is what's open, because that decides how the
//    next line is read: the container blocks, the paragraph, and the hidden block. For each line (`readLine`):
//    a. Match the line against the open container blocks, outermost first: a block quote continues on a line with its
//       `>` (5.1), a list item on a blank line or a line indented up to its content (5.2). The container blocks it
//       doesn't continue are closed, with what's open inside them, unless the line is a lazy continuation line of the
//       open paragraph (5.1).
//    b. If a hidden block is open, the line belongs to it, up to its end (4.5, 4.6).
//    c. Open the container blocks that the line starts (5.1, 5.2).
//    d. Read the rest of the line as part of a leaf block (4): a blank line or thematic break ends the paragraph (4.9,
//       4.1), and so does a setext heading underline (4.3); indented code (4.4) isn't visible text; a fence or html
//       block opens a hidden block (4.5, 4.6); an ATX heading is inline content of its own (4.2); any other line is
//       part of a paragraph (4.8).
//    What's kept for the next step is the inline content of the paragraphs and headings.
// 2. Inline structure, for each paragraph and heading (section 6). Left to right, at each character that can open an
//    inline construct, try a backslash escape (2.4), a code span (6.1), a comment or another html tag (6.6), or an
//    autolink (6.5). The first one that opens takes the place of its source, which is a space in the visible text, or
//    for an autolink its url.
//
// Scanning takes time linear in the length of the description, so no description can slow down the run: the nesting of
// container blocks is capped, and each search for the end of an inline construct only moves forward (`ForwardSearch`).

// -------------------------------------------------------------------------------------------------------------------
// Block structure: line by line, find the paragraphs and headings, and skip the blocks that aren't visible text.

type BlockState = {
  /** The open container blocks, outermost first */
  containerBlocks: ContainerBlock[];
  /** The lines of the open paragraph */
  paragraph: string[];
  hiddenBlock?: HiddenBlock;
  /** The inline content read so far: of each paragraph and heading, and of the rest of a line after a hidden block */
  inlineContent: string[];
};

type ContainerBlock =
  { type: "block quote" } | { type: "list item"; contentIndent: number };

type HiddenBlock = {
  /** The number of container blocks the hidden block is in, it closes with them */
  depth: number;
  /** @returns Where the hidden block ends in the line, or undefined if it doesn't end on this line */
  endIn: (line: string) => number | undefined;
};

/** Deeper container blocks are read as text, so that scanning stays fast for deeply nested input */
const maxContainerBlocks = 100;

/**
 * @returns The visible text of the paragraphs and headings, in order of occurrence. In visible text, hidden parts are
 *   replaced by a space, so the text around them isn't joined into a reference.
 */
export function visibleText(body: string): string[] {
  const state: BlockState = {
    containerBlocks: [],
    paragraph: [],
    inlineContent: [],
  };
  for (const line of body.split(/\r\n?|\n/)) {
    readLine(state, expandIndentTabs(line));
  }
  closeParagraph(state);
  return state.inlineContent.map(visibleInline);
}

/** A tab in the indentation advances to the next tab stop, at every 4 columns */
function expandIndentTabs(line: string): string {
  return line.replace(/^[\t ]+/, (indent) => {
    if (!indent.includes("\t")) return indent;
    let spaces = "";
    for (const c of indent) {
      spaces += c === "\t" ? " ".repeat(4 - (spaces.length % 4)) : " ";
    }
    return spaces;
  });
}

function readLine(state: BlockState, line: string) {
  const { continued, rest } = continuedContainerBlocks(
    state.containerBlocks,
    line,
  );
  if (
    continued < state.containerBlocks.length &&
    !isLazyContinuationLine(state, rest)
  ) {
    closeContainerBlocks(state, continued);
  }
  if (state.hiddenBlock) return readHiddenBlockLine(state, rest);
  readLeafBlockLine(state, openContainerBlocks(state, rest));
}

/**
 * @returns How many of the open container blocks the line continues, outermost first, and the rest of the line inside
 *   those
 */
function continuedContainerBlocks(blocks: ContainerBlock[], line: string) {
  let rest = line;
  for (const [index, block] of blocks.entries()) {
    const continuation = continuationOf(block, rest);
    if (continuation === undefined) return { continued: index, rest };
    rest = rest.slice(continuation);
  }
  return { continued: blocks.length, rest };
}

/**
 * @returns The length of the start of the line that continues the container block: a block quote's `>` marker, or a
 *   list item's indentation up to its content; the whole line if it's blank in a list item; undefined if it doesn't
 *   continue it
 */
function continuationOf(
  block: ContainerBlock,
  line: string,
): number | undefined {
  if (block.type === "block quote") return quoteMarker.exec(line)?.[0].length;
  if (isBlank(line)) return line.length;
  const indent = /^ */.exec(line)![0];
  return indent.length >= block.contentIndent ? block.contentIndent : undefined;
}

/** A lazy continuation line continues the open paragraph without the markers of all its container blocks */
function isLazyContinuationLine(state: BlockState, rest: string): boolean {
  return (
    state.paragraph.length > 0 && !isBlank(rest) && !interruptsParagraph(rest)
  );
}

/** Closes the container blocks after the first `keep`, and the paragraph and hidden block in them */
function closeContainerBlocks(state: BlockState, keep: number) {
  closeParagraph(state);
  state.containerBlocks.length = keep;
  if (state.hiddenBlock && state.hiddenBlock.depth > keep) {
    state.hiddenBlock = undefined;
  }
}

/** @returns The rest of the line inside the container blocks it opens */
function openContainerBlocks(state: BlockState, line: string): string {
  let rest = line;
  while (state.containerBlocks.length < maxContainerBlocks) {
    const start = containerBlockStart(rest, state.paragraph.length > 0);
    if (start === undefined) break;
    closeParagraph(state);
    state.containerBlocks.push(start.block);
    rest = rest.slice(start.marker.length);
  }
  return rest;
}

function containerBlockStart(
  line: string,
  inParagraph: boolean,
): { block: ContainerBlock; marker: string } | undefined {
  const quote = quoteMarker.exec(line)?.[0];
  if (quote !== undefined) {
    return { block: { type: "block quote" }, marker: quote };
  }
  const item = listItemMarker(line, inParagraph);
  if (item === undefined) return undefined;
  // an item that starts with a blank line has its content 1 column after the marker
  const contentIndent = isBlank(line.slice(item.length))
    ? item.trimEnd().length + 1
    : item.length;
  return { block: { type: "list item", contentIndent }, marker: item };
}

const quoteMarker = /^ {0,3}> ?/;
// a list item's content starts after its marker and 1 to 4 spaces; with 5 or more, the content is indented code
const listItem = /^ {0,3}(?:[-+*]|\d{1,9}[.)])(?: {1,4}(?! )| (?= {4})| *$)/;
const thematicBreak = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;

/** @returns The list item marker that the line starts with, up to the item's content */
function listItemMarker(
  line: string,
  inParagraph: boolean,
): string | undefined {
  if (thematicBreak.test(line)) return undefined;
  const marker = listItem.exec(line)?.[0];
  if (marker === undefined || !inParagraph) return marker;
  // only an item with content, and an ordered item starting at 1, interrupts a paragraph
  const interrupts =
    !isBlank(line.slice(marker.length)) &&
    /^ {0,3}(?:[-+*]|0*1[.)])/.test(marker);
  return interrupts ? marker : undefined;
}

function readHiddenBlockLine(state: BlockState, line: string) {
  const end = state.hiddenBlock!.endIn(line);
  if (end === undefined) return;
  state.hiddenBlock = undefined;
  const rest = line.slice(end);
  if (!isBlank(rest)) state.inlineContent.push(rest);
}

/** Reads the rest of the line, inside its container blocks, as a line of a leaf block */
function readLeafBlockLine(state: BlockState, line: string) {
  if (isBlank(line)) return closeParagraph(state);
  if (state.paragraph.length === 0) {
    if (/^ {4}/.test(line)) return; // indented code, which can't interrupt a paragraph
  } else if (setextUnderline.test(line)) {
    return closeParagraph(state); // the paragraph is a heading
  }
  if (openHiddenBlock(state, line)) return;
  if (thematicBreak.test(line)) return closeParagraph(state);
  if (heading.test(line)) {
    closeParagraph(state);
    state.inlineContent.push(line);
    return;
  }
  state.paragraph.push(line);
}

const heading = /^ {0,3}#{1,6}(?:[ \t]|$)/;
const setextUnderline = /^ {0,3}(?:=+|-+)[ \t]*$/;

/** @returns Whether the line opens a hidden block */
function openHiddenBlock(state: BlockState, line: string): boolean {
  const depth = state.containerBlocks.length;
  const fence = fenceAt(line);
  if (fence !== undefined) {
    closeParagraph(state);
    state.hiddenBlock = {
      depth,
      endIn: (next) => closingFenceEnd(fence, next),
    };
    return true;
  }
  const html = hiddenHtmlBlocks.find(({ start }) => start.test(line));
  if (html) {
    closeParagraph(state);
    const endIn = (next: string) => {
      const end = html.end.exec(next);
      return end ? end.index + end[0].length : undefined;
    };
    state.hiddenBlock = { depth, endIn };
    readHiddenBlockLine(state, line); // the html block can end on its first line
    return true;
  }
  return false;
}

// html blocks that are hidden up to their end; the rest of the line with the end is read as text
const hiddenHtmlBlocks = [
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

/** @returns The end of the line if it closes the fence, or undefined if it doesn't */
function closingFenceEnd(fence: string, line: string): number | undefined {
  const close = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line);
  const closes =
    close !== null &&
    close[1][0] === fence[0] &&
    close[1].length >= fence.length;
  return closes ? line.length : undefined;
}

/** @returns Whether the line starts a block that interrupts a paragraph, so it can't be a lazy continuation line */
function interruptsParagraph(line: string): boolean {
  return (
    quoteMarker.test(line) ||
    listItemMarker(line, true) !== undefined ||
    fenceAt(line) !== undefined ||
    hiddenHtmlBlocks.some(({ start }) => start.test(line)) ||
    heading.test(line) ||
    thematicBreak.test(line)
  );
}

function closeParagraph(state: BlockState) {
  if (state.paragraph.length === 0) return;
  state.inlineContent.push(state.paragraph.join("\n"));
  state.paragraph = [];
}

/** A blank line has only spaces and tabs, not other whitespace like a non-breaking space */
function isBlank(line: string): boolean {
  return /^[ \t]*$/.test(line);
}

// -------------------------------------------------------------------------------------------------------------------
// Inline structure: in a paragraph or heading, whichever opens first wins: a code span, a comment, or an html tag.
//
// Each construct is tried only where a character can open it, and searches for its end only move forward. So scanning
// takes time linear in the length of the paragraph, also when constructs don't close.

/** An inline construct: where it ends, and the visible text that takes its place */
type InlineConstruct = { end: number; visible: string };

function visibleInline(text: string): string {
  const search = new ForwardSearch(text);
  const constructStart = /[\\`<]/g;
  let visible = "";
  let copied = 0;
  for (let m; (m = constructStart.exec(text));) {
    const construct = inlineConstructAt(text, m.index, search);
    if (construct === undefined) continue;
    visible += text.slice(copied, m.index) + construct.visible;
    copied = constructStart.lastIndex = construct.end;
  }
  return visible + text.slice(copied);
}

function inlineConstructAt(
  text: string,
  start: number,
  search: ForwardSearch,
): InlineConstruct | undefined {
  switch (text[start]) {
    case "\\":
      return backslashEscape(text, start);
    case "`":
      return codeSpan(text, start, search);
    case "<":
      return (
        comment(text, start, search) ??
        autolink(text, start) ??
        htmlTag(text, start, search)
      );
  }
}

/** An escaped character is literal text, it doesn't open anything */
function backslashEscape(
  text: string,
  start: number,
): InlineConstruct | undefined {
  const escaped = text[start + 1];
  if (escaped === undefined || !/[!-\/:-@\[-`{-~]/.test(escaped)) return;
  return { end: start + 2, visible: escaped };
}

/** A code span ends at the next run of as many backticks; without one, the backticks are literal */
function codeSpan(
  text: string,
  start: number,
  search: ForwardSearch,
): InlineConstruct {
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
): InlineConstruct | undefined {
  const open = matchAt(/<!--(?:-?>)?/y, text, start);
  if (open === undefined) return;
  if (open.endsWith(">")) return { end: start + open.length, visible: " " };
  const close = search.next(commentEnd, start + open.length);
  return close === undefined ? undefined : { end: close.end, visible: " " };
}

const commentEnd = /-->/g;

/** An autolink's text is its url */
function autolink(text: string, start: number): InlineConstruct | undefined {
  const url = matchAt(/<([a-z][\w+.-]*:[^\s<>]*)>/iy, text, start);
  if (url === undefined) return;
  return { end: start + url.length, visible: ` ${url.slice(1, -1)} ` };
}

/** An html tag's attributes aren't text, and a `code`, `pre` or `a` element hides its content */
function htmlTag(
  text: string,
  start: number,
  search: ForwardSearch,
): InlineConstruct | undefined {
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

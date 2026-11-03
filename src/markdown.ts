// Reads a pull request description as Markdown, to find the text that can hold references to issues: its visible text.
//
// The visible text is the description without its comments (`<!-- ... -->`), which Markdown doesn't render.

/** @returns The visible text of the description, in order of occurrence */
export function visibleText(body: string): string[] {
  return [body.replace(comment, " ")];
}

// a comment, also across lines; an unclosed one hides the rest
const comment = /<!--[\s\S]*?(?:-->|$)/g;

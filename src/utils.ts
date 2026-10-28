import { PullRequest } from "./github.js";

/**
 * @param template The template potentially containing placeholders
 * @param main The main pull request that is backported
 * @param target The target branchname
 * @returns Description that can be used in the backport pull request
 */
export function replacePlaceholders(
  template: string,
  main: Pick<PullRequest, "body" | "user" | "number" | "title">,
  target: string,
): string {
  const issues = getMentionedIssueRefs(main.body);
  return template
    .replace("${pull_author}", main.user.login)
    .replace("${pull_number}", main.number.toString())
    .replace("${pull_title}", main.title)
    .replace("${pull_description}", main.body ?? "")
    .replace("${target_branch}", target)
    .replace("${issue_refs}", issues.join(" "));
}

/**
 * @param body Text in which to search for mentioned issues, references inside comments (`<!-- ... -->`) are ignored, an unclosed comment hides the rest of the text
 * @returns All found mentioned issues as GitHub issue references, each once in the order first found
 */
export function getMentionedIssueRefs(body: string | null): string[] {
  const text = body?.replace(patterns.comment, " ") ?? "";
  const urls = [...text.matchAll(patterns.url)].map((match) => ({
    index: match.index,
    ref: `${match.groups?.org}/${match.groups?.repo}#${match.groups?.number}`,
  }));
  const refs = [...text.matchAll(patterns.ref)].map((match) => ({
    index: match.index,
    ref: match[0].trim(),
  }));
  const ordered = urls.concat(refs).sort((a, b) => a.index - b.index);
  return [...new Set(ordered.map(({ ref }) => ref))];
}

const patterns = {
  // matches comments (`<!-- ... -->`), which GitHub does not render, including multi-line ones and an unclosed one up to the end
  comment: /<!--[\s\S]*?(?:-->|$)/g,

  // matches urls to github issues at start, middle, end of line as individual word
  // may be lead and trailed by whitespace which should be trimmed
  // captures the `org`, `repo` and `number` of the issue
  // https://regex101.com/r/XKRl8q/5
  url: /(?:^| )(?:(?:https:\/\/)?(?:www\.)?github\.com\/(?<org>[^ \/\n]+)\/(?<repo>[^ \/\n]+)\/issues\/(?<number>[1-9][0-9]*)(?:\/)?)(?: |$)/gm,

  // matches `#123` at start, middle, end of line as individual word
  // may be lead and trailed by whitespace which should be trimmed
  // captures `number` of the issue (and optionally the `org` and `repo`)
  // https://regex101.com/r/2gAB8O/2
  ref: /(?:^| )((?<org>[^\n #\/]+)\/(?<repo>[^\n #\/]+))?#(?<number>[1-9][0-9]*)(?: |$)/gm,
};

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

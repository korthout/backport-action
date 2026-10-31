import { PullRequest } from "./github.js";

/**
 * @param template The template potentially containing placeholders
 * @param main The main pull request that is backported
 * @param target The target branchname
 * @returns Description that can be used in the backport pull request
 */
export function replacePlaceholders(
  template: string,
  main: Pick<
    PullRequest,
    "body" | "body_html" | "base" | "user" | "number" | "title"
  >,
  target: string,
): string {
  const values: Record<string, string> = {
    pull_author: main.user.login,
    pull_number: main.number.toString(),
    pull_title: main.title,
    pull_description: main.body ?? "",
    target_branch: target,
    issue_refs: getMentionedIssueRefs(main.body_html, main.base.repo).join(" "),
  };
  return template.replace(/\$\{(\w+)\}/g, (match, name) =>
    Object.hasOwn(values, name) ? values[name] : match,
  );
}

/**
 * @param bodyHtml The original pull request's description as rendered by GitHub (`body_html`)
 * @param repo The original pull request's repository, whose references are listed as `#N`
 * @returns The issues and pull requests that GitHub links as references in the description, each once in the order first found, as `#N` or `owner/repo#N`
 */
export function getMentionedIssueRefs(
  bodyHtml: string | null | undefined,
  repo: PullRequest["base"]["repo"],
): string[] {
  const refs = new Set<string>();
  for (const [anchor] of bodyHtml?.matchAll(patterns.anchor) ?? []) {
    if (!patterns.reference.test(anchor)) continue;
    if (!patterns.issueOrPullRequest.test(anchor)) continue;
    const [, owner, name, number] = patterns.href.exec(anchor) ?? [];
    if (number === undefined) continue;
    const isSameRepo = owner === repo.owner.login && name === repo.name;
    refs.add(isSameRepo ? `#${number}` : `${owner}/${name}#${number}`);
  }
  return [...refs];
}

// GitHub doesn't document this markup. If it changes, `${issue_refs}` turns
// empty without failing the run; the Issue refs markup workflow notices it.
const patterns = {
  anchor: /<a\s[^>]*>/g,

  // GitHub autolinks references (`#N`, `owner/repo#N`, URLs) with this class.
  // A manual link like `[text](url)` doesn't get it, so it isn't listed.
  reference: /\sclass="(?:[^"]*\s)?issue-link[\s"]/,

  // excludes discussions, which GitHub also links with the class above
  issueOrPullRequest: /\sdata-hovercard-type="(?:issue|pull_request)"/,

  // captures `owner`, `repo` and `number`, on any host for GitHub Enterprise
  href: /\shref="https?:\/\/[^/"]+\/([^/"]+)\/([^/"]+)\/(?:issues|pull)\/(\d+)(?:#[^"]*)?"/,
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

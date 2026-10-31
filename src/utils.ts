import { PullRequest } from "./github.js";
import { getMentionedIssueRefs } from "./issue-refs.js";

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
  const values: Record<string, string> = {
    pull_author: main.user.login,
    pull_number: main.number.toString(),
    pull_title: main.title,
    pull_description: main.body ?? "",
    target_branch: target,
  };
  // scanning the description takes time, so only when the template uses it
  if (template.includes("${issue_refs}")) {
    values.issue_refs = getMentionedIssueRefs(main.body, {
      owner: main.base.repo.owner.login,
      repo: main.base.repo.name,
    }).join(" ");
  }
  return template.replace(/\$\{(\w+)\}/g, (match, name) =>
    Object.hasOwn(values, name) ? values[name] : match,
  );
}

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

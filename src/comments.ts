import { GitRefNotFoundError } from "./git.js";
import {
  BackportError,
  CheckoutError,
  CherryPickError,
  CreatePRError,
  GitPushError,
  type TargetResult,
} from "./errors.js";

export type CommentContext = {
  runId: string;
  runUrl: string;
};

function formatStatusCell(result: TargetResult): string {
  switch (result.status) {
    case "success":
      return `:white_check_mark: Created #${result.newPrNumber}`;
    case "success_with_conflicts":
      return `:warning: Drafted with conflicts #${result.newPrNumber}`;
    case "skipped":
      return `:heavy_minus_sign: Skipped (${result.reason})`;
    case "failed":
      return `:x: Failed`;
  }
}

function formatSingleTargetComment(
  result: TargetResult,
  context: CommentContext,
): string {
  if (result.status !== "failed") return "";

  const error = result.error;
  const targetBranch = result.targetBranch;

  if (error instanceof GitRefNotFoundError) {
    return [
      `<details><summary>:x: ${targetBranch} — ref not found</summary>`,
      "",
      `Tried to fetch \`${error.ref}\`, but it could not be found.`,
      "",
      `Please ensure that this repo has a branch named \`${error.ref}\`.`,
      "",
      "</details>",
    ].join("\n");
  }

  if (error instanceof CheckoutError) {
    return [
      `<details><summary>:x: ${targetBranch} — unable to create branch</summary>`,
      "",
      `Tried to create backport branch \`${error.branch}\`, but the checkout failed.`,
      "",
      "Please cherry-pick the changes locally.",
      "",
      "</details>",
    ].join("\n");
  }

  if (error instanceof CherryPickError) {
    return [
      `<details><summary>:x: ${targetBranch} — unable to cherry-pick</summary>`,
      "",
      `Tried to cherry-pick commits onto \`${targetBranch}\`, but the cherry-pick failed.`,
      "",
      "Please cherry-pick the changes locally and resolve any conflicts.",
      "```bash",
      `git fetch origin ${targetBranch}`,
      `git worktree add -d .worktree/${targetBranch} origin/${targetBranch}`,
      `cd .worktree/${targetBranch}`,
      `git switch --create <backport-branch-name>`,
      `git cherry-pick -x ${error.commits.join(" ")}`,
      "```",
      "",
      "</details>",
    ].join("\n");
  }

  if (error instanceof GitPushError) {
    return [
      `<details><summary>:x: ${targetBranch} — push failed</summary>`,
      "",
      `Tried to push backport branch to \`${error.remote}\`, but the push failed (exit code ${error.exitCode}).`,
      "",
      "This usually means the token lacks permission to push to this repository.",
      "Consider using a PAT with `repo` scope.",
      "",
      "</details>",
    ].join("\n");
  }

  if (error instanceof CreatePRError) {
    const parts = [
      `<details><summary>:x: ${targetBranch} — failed to create PR</summary>`,
      "",
      `Backport branch was created but the PR could not be opened (HTTP ${error.status}).`,
    ];
    if (error.responseMessage) {
      parts.push("", `Response: ${error.responseMessage}`);
    }
    parts.push("", "</details>");
    return parts.join("\n");
  }

  // Unknown error — direct to workflow run logs
  return [
    `<details><summary>:x: ${targetBranch} — unexpected error</summary>`,
    "",
    "An unexpected error occurred while processing this target.",
    "",
    `Please check the [workflow run logs](${context.runUrl}) for details.`,
    "If you believe this is a bug, please report it at https://github.com/korthout/backport-action/issues.",
    "",
    "</details>",
  ].join("\n");
}

const ACTION_LINK =
  "[Backport-action](https://github.com/korthout/backport-action)";

export function formatRunComment(
  results: TargetResult[],
  pendingTargets: string[],
  context: CommentContext,
  error?: string,
): string {
  const runLink = `[workflow run ${context.runId}](${context.runUrl})`;

  // Determine introduction
  let intro: string;
  if (error) {
    intro = `${ACTION_LINK} failed to backport this pull request in ${runLink}.`;
  } else if (pendingTargets.length > 0) {
    intro = `${ACTION_LINK} is backporting this pull request in ${runLink}.`;
  } else if (results.length > 0) {
    intro = `${ACTION_LINK} backported this pull request in ${runLink}.`;
  } else {
    intro = `${ACTION_LINK} is backporting this pull request in ${runLink}.`;
  }

  const parts: string[] = [intro];

  // Add error message if present
  if (error) {
    parts.push("", error);
  }

  // Build table if there are any results or pending targets
  const hasTable = results.length > 0 || pendingTargets.length > 0;
  if (hasTable) {
    parts.push("", "| Target | Status |", "|--------|--------|");

    for (const result of results) {
      parts.push(
        `| \`${result.targetBranch}\` | ${formatStatusCell(result)} |`,
      );
    }
    for (const target of pendingTargets) {
      parts.push(`| \`${target}\` | :hourglass: Pending |`);
    }
  }

  // Add details sections for failed targets
  const detailsSections = results
    .filter((r) => r.status === "failed")
    .map((r) => formatSingleTargetComment(r, context));

  if (detailsSections.length > 0) {
    parts.push("", detailsSections.join("\n\n"));
  }

  return parts.join("\n");
}

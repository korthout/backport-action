import dedent from "dedent";

import {
  CheckoutError,
  CherryPickError,
  CreatePRError,
  GitPushError,
  TargetResult,
} from "./errors.js";
import { GitRefNotFoundError } from "./git.js";

/**
 * Per-run context required to render the summary comment.
 *
 * Kept intentionally minimal: every other piece of information the
 * formatters need is on the {@link TargetResult} or its embedded error.
 */
export type CommentContext = {
  runId: string;
  runUrl: string;
};

const ACTION_LINK =
  "[Backport-action](https://github.com/korthout/backport-action)";

/**
 * Renders the full progressive summary comment.
 *
 * @param results   per-target outcomes that have already been processed
 * @param pendingTargets target branches that have not been processed yet
 * @param context   run-id and run-url for the workflow run link
 * @param error     pre-loop failure message (e.g. PR not merged); when set,
 *                  `results` should be empty
 */
export function formatRunComment(
  results: TargetResult[],
  pendingTargets: string[],
  context: CommentContext,
  error?: string,
): string {
  const intro = formatIntroduction(results, pendingTargets, context, error);
  const errorBlock = error ? `\n\n${error}` : "";
  const table = formatTable(results, pendingTargets);
  const detailsBlocks = results
    .filter(
      (r): r is Extract<TargetResult, { status: "failed" }> =>
        r.status === "failed",
    )
    .map((r) => formatSingleTargetComment(r, context))
    .join("\n\n");

  let out = intro;
  if (errorBlock) out += errorBlock;
  if (table) out += `\n\n${table}`;
  if (detailsBlocks) out += `\n\n${detailsBlocks}`;
  return out;
}

function formatIntroduction(
  _results: TargetResult[],
  pendingTargets: string[],
  context: CommentContext,
  error?: string,
): string {
  const runLink = `[workflow run ${context.runId}](${context.runUrl})`;
  if (error) {
    return `${ACTION_LINK} failed to backport this pull request in ${runLink}.`;
  }
  if (pendingTargets.length > 0) {
    return `${ACTION_LINK} is backporting this pull request in ${runLink}.`;
  }
  return `${ACTION_LINK} backported this pull request in ${runLink}.`;
}

/**
 * Initial placeholder body posted right after the action starts, before
 * targets are known. Replaced by `formatRunComment` updates on subsequent
 * events.
 */
export function formatInitialComment(context: CommentContext): string {
  const runLink = `[workflow run ${context.runId}](${context.runUrl})`;
  return `${ACTION_LINK} is backporting this pull request in ${runLink}.`;
}

function formatTable(
  results: TargetResult[],
  pendingTargets: string[],
): string {
  if (results.length === 0 && pendingTargets.length === 0) return "";

  const rows: string[] = [];
  for (const result of results) {
    rows.push(`| \`${result.targetBranch}\` | ${formatStatusCell(result)} |`);
  }
  for (const target of pendingTargets) {
    rows.push(`| \`${target}\` | :hourglass: Pending |`);
  }

  return ["| Target | Status |", "|--------|--------|", ...rows].join("\n");
}

function formatStatusCell(result: TargetResult): string {
  switch (result.status) {
    case "success":
      return `:white_check_mark: Created #${result.newPrNumber}`;
    case "success_with_conflicts":
      return `:warning: Drafted with conflicts #${result.newPrNumber}`;
    case "skipped":
      return `:heavy_minus_sign: Skipped (${result.reason})`;
    case "failed":
      return ":x: Failed";
  }
}

/**
 * Renders the collapsible `<details>` block for a single failed target.
 *
 * Private building block of {@link formatRunComment}. Exported only for
 * unit testing — callers should use `formatRunComment` to render full
 * progressive comments.
 */
export function formatSingleTargetComment(
  result: Extract<TargetResult, { status: "failed" }>,
  _context: CommentContext,
): string {
  const { targetBranch, error } = result;

  if (error instanceof GitRefNotFoundError) {
    return wrapDetails(
      `:x: ${targetBranch} — target branch not found`,
      dedent`Tried to fetch \`${error.ref}\`, but the ref was not found on the remote.

             Please ensure that this Github repo has a branch named \`${error.ref}\`.`,
    );
  }

  if (error instanceof CheckoutError) {
    return wrapDetails(
      `:x: ${targetBranch} — unable to create backport branch`,
      dedent`Tried to create a backport branch \`${error.branch}\` from \`${targetBranch}\`, but the checkout failed.

             Please cherry-pick the changes locally:
             \`\`\`bash
             git fetch origin ${targetBranch}
             git worktree add -d .worktree/${error.branch} origin/${targetBranch}
             cd .worktree/${error.branch}
             git switch --create ${error.branch}
             git cherry-pick -x ${error.commits.join(" ")}
             \`\`\``,
    );
  }

  if (error instanceof CherryPickError) {
    return wrapDetails(
      `:x: ${targetBranch} — unable to cherry-pick`,
      dedent`Tried to cherry-pick commits onto \`${targetBranch}\`, but the cherry-pick failed.

             Please cherry-pick the changes locally and resolve any conflicts:
             \`\`\`bash
             git fetch origin ${targetBranch}
             git worktree add -d .worktree/${error.branch} origin/${targetBranch}
             cd .worktree/${error.branch}
             git switch --create ${error.branch}
             git cherry-pick -x ${error.commits.join(" ")}
             \`\`\``,
    );
  }

  if (error instanceof GitPushError) {
    return wrapDetails(
      `:x: ${targetBranch} — push failed`,
      dedent`Tried to push backport branch \`${error.branch}\` to \`${error.remote}\`, but the push failed (exit code ${error.exitCode}).

             This usually means the token lacks permission to push to this repository. Consider using a Personal Access Token (PAT) with \`repo\` scope as \`github_token\`.`,
    );
  }

  if (error instanceof CreatePRError) {
    const responseLine = error.responseMessage
      ? `\n\nResponse: ${error.responseMessage}`
      : "";
    return wrapDetails(
      `:x: ${targetBranch} — failed to create pull request`,
      dedent`Backport branch was created, but creating the pull request failed with status ${error.status}.${responseLine}

             See the workflow run logs for the full response.`,
    );
  }

  return wrapDetails(
    `:x: ${targetBranch} — unexpected failure`,
    dedent`An unexpected error occurred while backporting to \`${targetBranch}\`.

           Please check the workflow run logs for the full error and stack trace, and consider reporting this as a bug at https://github.com/korthout/backport-action/issues.`,
  );
}

function wrapDetails(summary: string, body: string): string {
  return `<details><summary>${summary}</summary>\n\n${body}\n\n</details>`;
}

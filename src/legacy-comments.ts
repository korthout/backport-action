import dedent from "dedent";

import {
  CheckoutError,
  CherryPickError,
  CreatePRError,
  GitPushError,
  TargetResult,
} from "./errors.js";
import { GitRefNotFoundError } from "./git.js";

export function composeFailureMessage(
  result: Extract<TargetResult, { status: "failed" }>,
): string {
  const { targetBranch, error } = result;
  if (error instanceof GitRefNotFoundError) {
    return composeMessageForFetchTargetFailure(error.ref);
  }
  if (error instanceof CheckoutError) {
    return composeMessageForCheckoutFailure(
      targetBranch,
      error.branch,
      error.commits,
    );
  }
  if (error instanceof CherryPickError) {
    return composeMessageForCherryPickFailure(
      targetBranch,
      error.branch,
      error.commits,
    );
  }
  if (error instanceof GitPushError) {
    return composeMessageForGitPushFailure(targetBranch, error.exitCode);
  }
  if (error instanceof CreatePRError) {
    return dedent`Backport branch created but failed to create PR.
                  Request to create PR rejected with status ${error.status}.

                  (see action log for full response)`;
  }
  return error.message;
}

export function composeMessageForSuccess(
  pr_number: number,
  target: string,
  downstream: string,
): string {
  return dedent`Successfully created backport PR for \`${target}\`:
                - ${downstream}#${pr_number}`;
}

export function composeMessageForSuccessWithConflicts(
  pr_number: number,
  target: string,
  downstream: string,
  branchname: string,
  commitShasToCherryPick: string[],
  conflictResolution: string,
): string {
  const suggestionToResolve = composeMessageToResolveCommittedConflicts(
    target,
    branchname,
    commitShasToCherryPick,
    conflictResolution,
  );
  return dedent`Created backport PR for \`${target}\`:
                - ${downstream}#${pr_number} with remaining conflicts!

                ${suggestionToResolve}`;
}

export function composeMessageToResolveCommittedConflicts(
  target: string,
  branchname: string,
  commitShasToCherryPick: string[],
  confictResolution: string,
): string {
  const suggestion = composeSuggestion(
    target,
    branchname,
    commitShasToCherryPick,
    true,
    confictResolution,
  );

  return dedent`Please cherry-pick the changes locally and resolve any conflicts.
                ${suggestion}`;
}

function composeMessageForFetchTargetFailure(target: string): string {
  return dedent`Backport failed for \`${target}\`: couldn't find remote ref \`${target}\`.
                Please ensure that this Github repo has a branch named \`${target}\`.`;
}

function composeMessageForCheckoutFailure(
  target: string,
  branchname: string,
  commitShasToCherryPick: string[],
): string {
  const reason = "because it was unable to create a new branch";
  const suggestion = composeSuggestion(
    target,
    branchname,
    commitShasToCherryPick,
    false,
  );
  return dedent`Backport failed for \`${target}\`, ${reason}.

                Please cherry-pick the changes locally.
                ${suggestion}`;
}

function composeMessageForCherryPickFailure(
  target: string,
  branchname: string,
  commitShasToCherryPick: string[],
): string {
  const reason = "because it was unable to cherry-pick the commit(s)";

  const suggestion = composeSuggestion(
    target,
    branchname,
    commitShasToCherryPick,
    false,
    "fail",
  );

  return dedent`Backport failed for \`${target}\`, ${reason}.

                Please cherry-pick the changes locally and resolve any conflicts.
                ${suggestion}`;
}

function composeMessageForGitPushFailure(
  target: string,
  exitcode: number,
): string {
  //TODO better error messages depending on exit code
  return dedent`Git push to origin failed for ${target} with exitcode ${exitcode}`;
}

function composeSuggestion(
  target: string,
  branchname: string,
  commitShasToCherryPick: string[],
  branchExist: boolean,
  confictResolution: string = "fail",
) {
  if (branchExist) {
    if (confictResolution === "draft_commit_conflicts") {
      return dedent`\`\`\`bash
      git fetch origin ${branchname}
      git worktree add --checkout .worktree/${branchname} ${branchname}
      cd .worktree/${branchname}
      git reset --hard HEAD^
      git cherry-pick -x ${commitShasToCherryPick.join(" ")}
      \`\`\``;
    } else {
      return "";
    }
  } else {
    return dedent`\`\`\`bash
    git fetch origin ${target}
    git worktree add -d .worktree/${branchname} origin/${target}
    cd .worktree/${branchname}
    git switch --create ${branchname}
    git cherry-pick -x ${commitShasToCherryPick.join(" ")}
    \`\`\``;
  }
}

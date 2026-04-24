import dedent from "dedent";

import { CreatePRError } from "./errors.js";

export function composeMessageForFetchTargetFailure(target: string) {
  return dedent`Backport failed for \`${target}\`: couldn't find remote ref \`${target}\`.
                Please ensure that this Github repo has a branch named \`${target}\`.`;
}

export function composeMessageForCheckoutFailure(
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

export function composeMessageForCherryPickFailure(
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

export function composeMessageForGitPushFailure(
  target: string,
  exitcode: number,
): string {
  //TODO better error messages depending on exit code
  return dedent`Git push to origin failed for ${target} with exitcode ${exitcode}`;
}

export function composeMessageForCreatePRFailed(error: CreatePRError): string {
  return dedent`Backport branch created but failed to create PR.
              Request to create PR rejected with status ${error.status}.

              (see action log for full response)`;
}

export function composeMessageForSuccess(
  pr_number: number,
  target: string,
  downstream: string,
) {
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

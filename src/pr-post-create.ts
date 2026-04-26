import type { Config } from "./backport.js";
import {
  GithubApi,
  PullRequest,
  RequestError,
} from "./github.js";

/**
 * Performs the post-PR-creation side-effects: copying milestones, assignees,
 * reviewers, labels, and enabling auto-merge.
 *
 * Each side-effect is best-effort — a `RequestError` is logged and ignored so
 * that one failure doesn't block the others (the PR has already been created).
 * Non-`RequestError` failures propagate to the caller.
 */
export async function postCreatePR(
  github: GithubApi,
  config: Config,
  newPrNumber: number,
  mainpr: PullRequest,
  labelsToCopy: string[],
  targetRepo: { owner: string; repo: string },
  workflowRepo: { owner: string; repo: string },
): Promise<void> {
  if (config.copy_milestone == true) {
    const milestone = mainpr.milestone?.number;
    if (milestone) {
      console.info("Setting milestone to " + milestone);
      try {
        await github.setMilestone(newPrNumber, milestone);
      } catch (error) {
        if (!(error instanceof RequestError)) throw error;
        console.error(JSON.stringify(error.response));
      }
    }
  }

  if (config.copy_assignees == true) {
    const assignees = mainpr.assignees?.map((label) => label.login) ?? [];
    if (assignees.length > 0) {
      console.info("Setting assignees " + assignees);
      try {
        await github.addAssignees(newPrNumber, assignees, targetRepo);
      } catch (error) {
        if (!(error instanceof RequestError)) throw error;
        console.error(JSON.stringify(error.response));
      }
    }
  }

  if (config.copy_all_reviewers == true) {
    const requestedReviewers =
      mainpr.requested_reviewers?.map((reviewer) => reviewer.login) ?? [];

    let submittedReviewers: string[] = [];
    try {
      const { data: reviews } = await github.listReviews(
        workflowRepo.owner,
        workflowRepo.repo,
        mainpr.number,
      );

      submittedReviewers = [
        ...new Set(
          reviews
            .map((review) => review.user?.login)
            .filter((login): login is string => Boolean(login)),
        ),
      ];
    } catch (error) {
      if (!(error instanceof RequestError)) throw error;
      console.error(JSON.stringify(error.response));
    }

    const reviewers = [
      ...new Set([...requestedReviewers, ...submittedReviewers]),
    ];

    if (reviewers.length > 0) {
      console.info("Setting reviewers " + reviewers);
      try {
        await github.requestReviewers({
          owner: targetRepo.owner,
          repo: targetRepo.repo,
          pull_number: newPrNumber,
          reviewers: reviewers,
        });
      } catch (error) {
        if (!(error instanceof RequestError)) throw error;
        console.error(JSON.stringify(error.response));
      }
    }
  }

  if (config.copy_requested_reviewers == true) {
    const reviewers =
      mainpr.requested_reviewers?.map((reviewer) => reviewer.login) ?? [];
    if (reviewers.length > 0) {
      console.info("Setting reviewers " + reviewers);
      try {
        await github.requestReviewers({
          owner: targetRepo.owner,
          repo: targetRepo.repo,
          pull_number: newPrNumber,
          reviewers: reviewers,
        });
      } catch (error) {
        if (!(error instanceof RequestError)) throw error;
        console.error(JSON.stringify(error.response));
      }
    }
  }

  // Combine the labels to be copied with the static labels and deduplicate them using a Set
  const labels = [...new Set([...labelsToCopy, ...config.add_labels])];
  if (labels.length > 0) {
    try {
      await github.labelPR(newPrNumber, labels, targetRepo);
    } catch (error) {
      if (!(error instanceof RequestError)) throw error;
      console.error(JSON.stringify(error.response));
      // The PR was still created so let's still comment on the original.
    }
  }

  if (config.add_author_as_assignee == true) {
    const author = mainpr.user.login;
    console.info("Setting " + author + " as assignee");
    try {
      await github.addAssignees(newPrNumber, [author], targetRepo);
    } catch (error) {
      if (!(error instanceof RequestError)) throw error;
      console.error(JSON.stringify(error.response));
    }
  }

  if (config.add_author_as_reviewer == true) {
    const author = mainpr.user.login;
    console.info("Requesting review from " + author);
    try {
      await github.requestReviewers({
        owner: targetRepo.owner,
        repo: targetRepo.repo,
        pull_number: newPrNumber,
        reviewers: [author],
      });
    } catch (error) {
      if (!(error instanceof RequestError)) throw error;
      console.error(JSON.stringify(error.response));
    }
  }

  const addedReviewers = [...new Set(config.add_reviewers)];
  if (addedReviewers.length > 0) {
    console.info("Adding reviewers: " + addedReviewers);
    try {
      await github.requestReviewers({
        owner: targetRepo.owner,
        repo: targetRepo.repo,
        pull_number: newPrNumber,
        reviewers: addedReviewers,
      });
    } catch (error) {
      if (!(error instanceof RequestError)) throw error;
      console.error(JSON.stringify(error.response));
    }
  }

  const addedTeamReviewers = [...new Set(config.add_team_reviewers)];
  if (addedTeamReviewers.length > 0) {
    console.info("Adding team reviewers: " + addedTeamReviewers);
    try {
      await github.requestReviewers({
        owner: targetRepo.owner,
        repo: targetRepo.repo,
        pull_number: newPrNumber,
        reviewers: [],
        team_reviewers: addedTeamReviewers,
      } as any);
    } catch (error) {
      if (!(error instanceof RequestError)) throw error;
      console.error(JSON.stringify(error.response));
    }
  }

  if (config.auto_merge_enabled === true) {
    console.info("Attempting to enable auto-merge for PR #" + newPrNumber);
    try {
      await github.enableAutoMerge(
        newPrNumber,
        targetRepo,
        config.auto_merge_method,
      );
      console.info("Successfully enabled auto-merge for PR #" + newPrNumber);
    } catch (error) {
      if (!(error instanceof RequestError)) throw error;

      // Handle auto-merge failures gracefully
      const errorMessage = getAutoMergeErrorMessage(
        error,
        config.auto_merge_method,
      );
      console.warn(
        `Failed to enable auto-merge for PR #${newPrNumber}: ${errorMessage}`,
      );
      console.warn(
        "The backport PR was created successfully, but auto-merge could not be enabled.",
      );
    }
  }
}

function getAutoMergeErrorMessage(
  error: RequestError,
  mergeMethod: string,
): string {
  const errorStr = JSON.stringify(error.response?.data) || error.message;

  // Check for common auto-merge error scenarios
  if (errorStr.includes("auto-merge") && errorStr.includes("not allowed")) {
    return `Repository does not have "Allow auto-merge" enabled. Please enable it in repository Settings > General > Pull Requests.`;
  }

  if (
    errorStr.includes("merge commits are not allowed") ||
    errorStr.includes("Merge method merge commits are not allowed")
  ) {
    return `Repository does not allow merge commits. Try using 'auto_merge_method: squash' or 'auto_merge_method: rebase' instead.`;
  }

  if (errorStr.includes("squash") && errorStr.includes("not allowed")) {
    return `Repository does not allow squash merging. Try using 'auto_merge_method: merge' or 'auto_merge_method: rebase' instead.`;
  }

  if (errorStr.includes("rebase") && errorStr.includes("not allowed")) {
    return `Repository does not allow rebase merging. Try using 'auto_merge_method: merge' or 'auto_merge_method: squash' instead.`;
  }

  if (
    errorStr.includes("not authorized") ||
    errorStr.includes("insufficient permissions")
  ) {
    return `Insufficient permissions to enable auto-merge. Ensure the GitHub token has 'contents: write' and 'pull-requests: write' permissions.`;
  }

  if (errorStr.includes("protected branch")) {
    return `Branch protection rules prevent auto-merge. Check if the bot/user has merge permissions on protected branches.`;
  }

  if (
    errorStr.includes("Pull request is in clean status") ||
    errorStr.includes("clean status")
  ) {
    return `PR can be merged immediately, so auto-merge is not needed. Auto-merge only works when there are pending requirements (like required status checks or reviews).`;
  }

  // Generic fallback with some context
  return `Auto-merge method '${mergeMethod}' failed. Check repository merge settings and permissions. Error: ${error.message}`;
}

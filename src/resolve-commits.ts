import dedent from "dedent";

import type { Config } from "./backport.js";
import type { GitApi } from "./git.js";
import { GithubApi, MergeStrategy, PullRequest } from "./github.js";

/**
 * Thrown when the source PR contains merge commits and `merge_commits` is
 * configured to `fail`. Carries the user-facing message so the caller can
 * post it as a comment on the source PR without duplicating wording.
 */
export class MergeCommitsNotAllowedError extends Error {
  constructor() {
    super(
      dedent`Backport failed because this pull request contains merge commits. \
        You can either backport this pull request manually, or configure the action to skip merge commits.`,
    );
    this.name = "MergeCommitsNotAllowedError";
  }
}

/**
 * Resolves the list of commit SHAs to cherry-pick for a backport.
 *
 * Steps:
 *   1. Fetches the source PR's commits.
 *   2. Detects the merge strategy (squash/rebase/merge) and resolves the
 *      correct SHAs to cherry-pick.
 *   3. Detects merge commits in the range and either filters them out
 *      (`merge_commits: skip`) or throws (`merge_commits: fail`).
 */
export async function resolveCommitsToCherryPick(
  git: GitApi,
  github: GithubApi,
  config: Pick<Config, "pwd" | "commits">,
  mainpr: PullRequest,
  pullNumber: number,
): Promise<string[]> {
  console.log(
    `Fetching all the commits from the pull request: ${mainpr.commits + 1}`,
  );
  await git.fetch(
    `refs/pull/${pullNumber}/head`,
    config.pwd,
    mainpr.commits + 1, // +1 in case this concerns a shallowly cloned repo
  );

  const commitShas = await github.getCommits(mainpr);

  let commitShasToCherryPick: string[];

  if (config.commits.cherry_picking === "auto") {
    const merge_commit_sha = await github.getMergeCommitSha(mainpr);

    // switch case to check if it is a squash, rebase, or merge commit
    switch (await github.mergeStrategy(mainpr, merge_commit_sha)) {
      case MergeStrategy.SQUASHED:
        // If merged via a squash merge_commit_sha represents the SHA of the squashed commit on
        // the base branch. We must fetch it and its parent in case of a shallowly cloned repo
        // To store the fetched commits indefinitely we save them to a remote ref using the sha
        await git.fetch(
          `+${merge_commit_sha}:refs/remotes/origin/${merge_commit_sha}`,
          config.pwd,
          2, // +1 in case this concerns a shallowly cloned repo
        );
        commitShasToCherryPick = [merge_commit_sha!];
        break;
      case MergeStrategy.REBASED:
        // If rebased merge_commit_sha represents the commit that the base branch was updated to
        // We must fetch it, its parents, and one extra parent in case of a shallowly cloned repo
        // To store the fetched commits indefinitely we save them to a remote ref using the sha
        await git.fetch(
          `+${merge_commit_sha}:refs/remotes/origin/${merge_commit_sha}`,
          config.pwd,
          mainpr.commits + 1, // +1 in case this concerns a shallowly cloned repo
        );
        const range = `${merge_commit_sha}~${mainpr.commits}..${merge_commit_sha}`;
        commitShasToCherryPick = await git.findCommitsInRange(
          range,
          config.pwd,
        );
        break;
      case MergeStrategy.MERGECOMMIT:
        commitShasToCherryPick = commitShas;
        break;
      case MergeStrategy.UNKNOWN:
      default:
        console.log(
          "Could not detect merge strategy. Using commits from the Pull Request.",
        );
        commitShasToCherryPick = commitShas;
        break;
    }
  } else {
    console.log(
      "Not detecting merge strategy. Using commits from the Pull Request.",
    );
    commitShasToCherryPick = commitShas;
  }
  console.log(`Found commits to backport: ${commitShasToCherryPick}`);

  console.log("Checking the merged pull request for merge commits");
  const mergeCommitShas = await git.findMergeCommits(
    commitShasToCherryPick,
    config.pwd,
  );
  console.log(`Encountered ${mergeCommitShas.length ?? "no"} merge commits`);

  if (mergeCommitShas.length > 0 && config.commits.merge_commits === "fail") {
    throw new MergeCommitsNotAllowedError();
  }

  if (mergeCommitShas.length > 0 && config.commits.merge_commits === "skip") {
    console.log("Skipping merge commits: " + mergeCommitShas);
    commitShasToCherryPick = commitShasToCherryPick.filter(
      (sha) => !mergeCommitShas.includes(sha),
    );
  }
  console.log(
    "Will cherry-pick the following commits: " + commitShasToCherryPick,
  );

  return commitShasToCherryPick;
}

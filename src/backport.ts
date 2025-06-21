import * as core from "@actions/core";
import dedent from "dedent";

import {
  CreatePullRequestResponse,
  PullRequest,
  MergeStrategy,
  RequestError,
} from "./github";
import { GithubApi } from "./github";
import { Git, GitRefNotFoundError } from "./git";
import * as utils from "./utils";

type PRContent = {
  title: string;
  body: string;
};

export type Config = {
  pwd: string;
  source_labels_pattern?: RegExp;
  source_pr_number?: number;
  pull: {
    description: string;
    title: string;
    branch_name: string;
  };
  copy_labels_pattern?: RegExp;
  add_labels: string[];
  target_branches?: string;
  commits: {
    cherry_picking: "auto" | "pull_request_head";
    merge_commits: "fail" | "skip";
  };
  copy_milestone: boolean;
  copy_assignees: boolean;
  copy_requested_reviewers: boolean;
  add_author_as_assignee: boolean;
  experimental: Experimental;
};

type DeprecatedExperimental = {
  detect_merge_method?: boolean;
};
const deprecatedExperimental: DeprecatedExperimental = {};
type Experimental = {
  conflict_resolution: "fail" | "draft_commit_conflicts";
  downstream_repo?: string;
  downstream_owner?: string;
} & DeprecatedExperimental;
const experimentalDefaults: Experimental = {
  detect_merge_method: undefined,
  conflict_resolution: `fail`,
  downstream_repo: undefined,
  downstream_owner: undefined,
};
export { experimentalDefaults, deprecatedExperimental };

enum Output {
  wasSuccessful = "was_successful",
  wasSuccessfulByTarget = "was_successful_by_target",
  created_pull_numbers = "created_pull_numbers",
}

export class Backport {
  private github;
  private config;
  private git;

  private downstreamRepo;
  private downstreamOwner;

  constructor(github: GithubApi, config: Config, git: Git) {
    this.github = github;
    this.config = config;
    this.git = git;

    this.downstreamRepo = this.config.experimental.downstream_repo ?? undefined;
    this.downstreamOwner =
      this.config.experimental.downstream_owner ?? undefined;
  }

  shouldUseDownstreamRepo(): boolean {
    return !!this.downstreamRepo;
  }

  getRemote(): "downstream" | "origin" {
    return this.shouldUseDownstreamRepo() ? "downstream" : "origin";
  }

  async run(): Promise<void> {
    try {
      const payload = this.github.getPayload();

      const workflowOwner = this.github.getRepo().owner;
      const owner =
        this.shouldUseDownstreamRepo() && this.downstreamOwner // if undefined, use owner of workflow
          ? this.downstreamOwner
          : workflowOwner;

      const workflowRepo =
        payload.repository?.name ?? this.github.getRepo().repo;
      const repo = this.shouldUseDownstreamRepo()
        ? this.downstreamRepo
        : workflowRepo;

      if (repo === undefined) throw new Error("No repository defined!");

      const pull_number =
        this.config.source_pr_number === undefined
          ? this.github.getPullNumber()
          : this.config.source_pr_number;
      const mainpr = await this.github.getPullRequest(pull_number);

      if (!(await this.github.isMerged(mainpr))) {
        const message = "Only merged pull requests can be backported.";
        this.github.createComment({
          owner: workflowOwner,
          repo: workflowRepo,
          issue_number: pull_number,
          body: message,
        });
        return;
      }

      const target_branches = this.findTargetBranches(mainpr, this.config);
      if (target_branches.length === 0) {
        console.log(
          `Nothing to backport: no 'target_branches' specified and none of the labels match the backport pattern '${this.config.source_labels_pattern?.source}'`,
        );
        return; // nothing left to do here
      }

      console.log(
        `Fetching all the commits from the pull request: ${mainpr.commits + 1}`,
      );
      await this.git.fetch(
        `refs/pull/${pull_number}/head`,
        this.config.pwd,
        mainpr.commits + 1, // +1 in case this concerns a shallowly cloned repo
      );

      const commitShas = await this.github.getCommits(mainpr);

      let commitShasToCherryPick;

      if (this.config.commits.cherry_picking === "auto") {
        const merge_commit_sha = await this.github.getMergeCommitSha(mainpr);

        // switch case to check if it is a squash, rebase, or merge commit
        switch (await this.github.mergeStrategy(mainpr, merge_commit_sha)) {
          case MergeStrategy.SQUASHED:
            // If merged via a squash merge_commit_sha represents the SHA of the squashed commit on
            // the base branch. We must fetch it and its parent in case of a shallowly cloned repo
            // To store the fetched commits indefinitely we save them to a remote ref using the sha
            await this.git.fetch(
              `+${merge_commit_sha}:refs/remotes/origin/${merge_commit_sha}`,
              this.config.pwd,
              2, // +1 in case this concerns a shallowly cloned repo
            );
            commitShasToCherryPick = [merge_commit_sha!];
            break;
          case MergeStrategy.REBASED:
            // If rebased merge_commit_sha represents the commit that the base branch was updated to
            // We must fetch it, its parents, and one extra parent in case of a shallowly cloned repo
            // To store the fetched commits indefinitely we save them to a remote ref using the sha
            await this.git.fetch(
              `+${merge_commit_sha}:refs/remotes/origin/${merge_commit_sha}`,
              this.config.pwd,
              mainpr.commits + 1, // +1 in case this concerns a shallowly cloned repo
            );
            const range = `${merge_commit_sha}~${mainpr.commits}..${merge_commit_sha}`;
            commitShasToCherryPick = await this.git.findCommitsInRange(
              range,
              this.config.pwd,
            );
            break;
          case MergeStrategy.MERGECOMMIT:
            commitShasToCherryPick = commitShas;
            break;
          case MergeStrategy.UNKNOWN:
            console.log(
              "Could not detect merge strategy. Using commits from the Pull Request.",
            );
            commitShasToCherryPick = commitShas;
            break;
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
      const mergeCommitShas = await this.git.findMergeCommits(
        commitShasToCherryPick,
        this.config.pwd,
      );
      console.log(
        `Encountered ${mergeCommitShas.length ?? "no"} merge commits`,
      );
      if (
        mergeCommitShas.length > 0 &&
        this.config.commits.merge_commits == "fail"
      ) {
        const message = dedent`Backport failed because this pull request contains merge commits. \
          You can either backport this pull request manually, or configure the action to skip merge commits.`;
        console.error(message);
        this.github.createComment({
          owner: workflowOwner,
          repo: workflowRepo,
          issue_number: pull_number,
          body: message,
        });
        return;
      }

      if (
        mergeCommitShas.length > 0 &&
        this.config.commits.merge_commits == "skip"
      ) {
        console.log("Skipping merge commits: " + mergeCommitShas);
        const nonMergeCommitShas = commitShasToCherryPick.filter(
          (sha) => !mergeCommitShas.includes(sha),
        );
        commitShasToCherryPick = nonMergeCommitShas;
      }
      console.log(
        "Will cherry-pick the following commits: " + commitShasToCherryPick,
      );

      let labelsToCopy: string[] = [];
      if (typeof this.config.copy_labels_pattern !== "undefined") {
        let copyLabelsPattern: RegExp = this.config.copy_labels_pattern;
        labelsToCopy = mainpr.labels
          .map((label) => label.name)
          .filter(
            (label) =>
              label.match(copyLabelsPattern) &&
              (this.config.source_labels_pattern === undefined ||
                !label.match(this.config.source_labels_pattern)),
          );
      }
      console.log(
        `Will copy labels matching ${this.config.copy_labels_pattern}. Found matching labels: ${labelsToCopy}`,
      );

      if (this.shouldUseDownstreamRepo()) {
        await this.git.remoteAdd(this.config.pwd, "downstream", owner, repo);
      }

      const successByTarget = new Map<string, boolean>();
      const createdPullRequestNumbers = new Array<number>();
      for (const target of target_branches) {
        console.log(`Backporting to target branch '${target}...'`);

        try {
          await this.git.fetch(target, this.config.pwd, 1, this.getRemote());
        } catch (error) {
          if (error instanceof GitRefNotFoundError) {
            const message = this.composeMessageForFetchTargetFailure(error.ref);
            console.error(message);
            successByTarget.set(target, false);
            await this.github.createComment({
              owner: workflowOwner,
              repo: workflowRepo,
              issue_number: pull_number,
              body: message,
            });
            continue;
          } else {
            throw error;
          }
        }

        try {
          const branchname = utils.replacePlaceholders(
            this.config.pull.branch_name,
            mainpr,
            target,
          );

          console.log(`Start backport to ${branchname}`);
          try {
            await this.git.checkout(
              branchname,
              `${this.getRemote()}/${target}`,
              this.config.pwd,
            );
          } catch (error) {
            const message = this.composeMessageForCheckoutFailure(
              target,
              branchname,
              commitShasToCherryPick,
            );
            console.error(message);
            successByTarget.set(target, false);
            await this.github.createComment({
              owner: workflowOwner,
              repo: workflowRepo,
              issue_number: pull_number,
              body: message,
            });
            continue;
          }

          let uncommitedShas: string[] | null;

          try {
            uncommitedShas = await this.git.cherryPick(
              commitShasToCherryPick,
              this.config.experimental.conflict_resolution,
              this.config.pwd,
            );
          } catch (error) {
            const message = this.composeMessageForCherryPickFailure(
              target,
              branchname,
              commitShasToCherryPick,
            );
            console.error(message);
            successByTarget.set(target, false);
            await this.github.createComment({
              owner: workflowOwner,
              repo: workflowRepo,
              issue_number: pull_number,
              body: message,
            });
            continue;
          }

          console.info(`Push branch to ${this.getRemote()}`);
          const pushExitCode = await this.git.push(
            branchname,
            this.getRemote(),
            this.config.pwd,
          );
          if (pushExitCode != 0) {
            try {
              // If the branch already exists, ignore the error and keep going.
              await this.git.fetch(
                branchname,
                this.config.pwd,
                1,
                this.getRemote(),
              );
            } catch {
              // Fetching the branch failed as well, so report the original push error.
              const message = this.composeMessageForGitPushFailure(
                target,
                pushExitCode,
              );
              console.error(message);
              successByTarget.set(target, false);
              await this.github.createComment({
                owner: workflowOwner,
                repo: workflowRepo,
                issue_number: pull_number,
                body: message,
              });
              continue;
            }
          }

          console.info(`Create PR for ${branchname}`);
          const { title, body } = this.composePRContent(target, mainpr);
          let new_pr_response: CreatePullRequestResponse;
          try {
            new_pr_response = await this.github.createPR({
              owner,
              repo,
              title,
              body,
              head: branchname,
              base: target,
              maintainer_can_modify: true,
              draft: uncommitedShas !== null,
            });
          } catch (error) {
            if (!(error instanceof RequestError)) throw error;

            if (
              error.status == 422 &&
              (error.response?.data as any).errors.some((err: any) =>
                err.message.startsWith("A pull request already exists for "),
              )
            ) {
              console.info(`PR for ${branchname} already exists, skipping.`);
              continue;
            }

            console.error(JSON.stringify(error.response?.data));
            successByTarget.set(target, false);
            const message = this.composeMessageForCreatePRFailed(error);
            await this.github.createComment({
              owner: workflowOwner,
              repo: workflowRepo,
              issue_number: pull_number,
              body: message,
            });
            continue;
          }
          const new_pr = new_pr_response.data;

          if (this.config.copy_milestone == true) {
            const milestone = mainpr.milestone?.number;
            if (milestone) {
              console.info("Setting milestone to " + milestone);
              try {
                await this.github.setMilestone(new_pr.number, milestone);
              } catch (error) {
                if (!(error instanceof RequestError)) throw error;
                console.error(JSON.stringify(error.response));
              }
            }
          }

          if (this.config.copy_assignees == true) {
            const assignees = mainpr.assignees.map((label) => label.login);
            if (assignees.length > 0) {
              console.info("Setting assignees " + assignees);
              try {
                await this.github.addAssignees(new_pr.number, assignees, {
                  owner,
                  repo,
                });
              } catch (error) {
                if (!(error instanceof RequestError)) throw error;
                console.error(JSON.stringify(error.response));
              }
            }
          }

          if (this.config.copy_requested_reviewers == true) {
            const reviewers = mainpr.requested_reviewers?.map(
              (reviewer) => reviewer.login,
            );
            if (reviewers?.length > 0) {
              console.info("Setting reviewers " + reviewers);
              const reviewRequest = {
                owner,
                repo,
                pull_number: new_pr.number,
                reviewers: reviewers,
              };
              try {
                await this.github.requestReviewers(reviewRequest);
              } catch (error) {
                if (!(error instanceof RequestError)) throw error;
                console.error(JSON.stringify(error.response));
              }
            }
          }

          // Combine the labels to be copied with the static labels and deduplicate them using a Set
          const labels = [
            ...new Set([...labelsToCopy, ...this.config.add_labels]),
          ];
          if (labels.length > 0) {
            try {
              await this.github.labelPR(new_pr.number, labels, {
                owner,
                repo,
              });
            } catch (error) {
              if (!(error instanceof RequestError)) throw error;
              console.error(JSON.stringify(error.response));
              // The PR was still created so let's still comment on the original.
            }
          }

          if (this.config.add_author_as_assignee == true) {
            const author = mainpr.user.login;
            console.info("Setting " + author + " as assignee");
            try {
              await this.github.addAssignees(new_pr.number, [author], {
                owner,
                repo,
              });
            } catch (error) {
              if (!(error instanceof RequestError)) throw error;
              console.error(JSON.stringify(error.response));
            }
          }

          // post success message to original pr
          {
            const message =
              uncommitedShas !== null
                ? this.composeMessageForSuccessWithConflicts(
                    new_pr.number,
                    target,
                    this.shouldUseDownstreamRepo() ? `${owner}/${repo}` : "",
                    branchname,
                    uncommitedShas,
                    this.config.experimental.conflict_resolution,
                  )
                : this.composeMessageForSuccess(
                    new_pr.number,
                    target,
                    this.shouldUseDownstreamRepo() ? `${owner}/${repo}` : "",
                  );

            successByTarget.set(target, true);
            createdPullRequestNumbers.push(new_pr.number);
            await this.github.createComment({
              owner: workflowOwner,
              repo: workflowRepo,
              issue_number: pull_number,
              body: message,
            });
          }
          // post message to new pr to resolve conflict
          if (uncommitedShas !== null) {
            const message: string =
              this.composeMessageToResolveCommittedConflicts(
                target,
                branchname,
                uncommitedShas,
                this.config.experimental.conflict_resolution,
              );

            await this.github.createComment({
              owner,
              repo,
              issue_number: new_pr.number,
              body: message,
            });
          }
        } catch (error) {
          if (error instanceof Error) {
            console.error(error.message);
            successByTarget.set(target, false);
            await this.github.createComment({
              owner: workflowOwner,
              repo: workflowRepo,
              issue_number: pull_number,
              body: error.message,
            });
          } else {
            throw error;
          }
        }
      }

      this.createOutput(successByTarget, createdPullRequestNumbers);
    } catch (error) {
      if (error instanceof Error) {
        console.error(error.message);
        core.setFailed(error.message);
      } else {
        console.error(`An unexpected error occurred: ${JSON.stringify(error)}`);
        core.setFailed(
          "An unexpected error occured. Please check the logs for details",
        );
      }
    }
  }

  private findTargetBranches(mainpr: PullRequest, config: Config): string[] {
    const labels = mainpr.labels.map((label) => label.name);
    return findTargetBranches(config, labels, mainpr.head.ref);
  }

  private composePRContent(target: string, main: PullRequest): PRContent {
    const title = utils.replacePlaceholders(
      this.config.pull.title,
      main,
      target,
    );
    const body = utils.replacePlaceholders(
      this.config.pull.description,
      main,
      target,
    );
    return { title, body };
  }

  private composeMessageForFetchTargetFailure(target: string) {
    return dedent`Backport failed for \`${target}\`: couldn't find remote ref \`${target}\`.
                  Please ensure that this Github repo has a branch named \`${target}\`.`;
  }

  private composeMessageForCheckoutFailure(
    target: string,
    branchname: string,
    commitShasToCherryPick: string[],
  ): string {
    const reason = "because it was unable to create a new branch";
    const suggestion = this.composeSuggestion(
      target,
      branchname,
      commitShasToCherryPick,
      false,
    );
    return dedent`Backport failed for \`${target}\`, ${reason}.

                  Please cherry-pick the changes locally.
                  ${suggestion}`;
  }

  private composeMessageForCherryPickFailure(
    target: string,
    branchname: string,
    commitShasToCherryPick: string[],
  ): string {
    const reason = "because it was unable to cherry-pick the commit(s)";

    const suggestion = this.composeSuggestion(
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

  private composeMessageToResolveCommittedConflicts(
    target: string,
    branchname: string,
    commitShasToCherryPick: string[],
    confictResolution: string,
  ): string {
    const suggestion = this.composeSuggestion(
      target,
      branchname,
      commitShasToCherryPick,
      true,
      confictResolution,
    );

    return dedent`Please cherry-pick the changes locally and resolve any conflicts.
                  ${suggestion}`;
  }

  private composeSuggestion(
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
        git push --force-with-lease
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

  private composeMessageForGitPushFailure(
    target: string,
    exitcode: number,
  ): string {
    //TODO better error messages depending on exit code
    return dedent`Git push to origin failed for ${target} with exitcode ${exitcode}`;
  }

  private composeMessageForCreatePRFailed(error: RequestError): string {
    return dedent`Backport branch created but failed to create PR.
                Request to create PR rejected with status ${error.status}.

                (see action log for full response)`;
  }

  private composeMessageForSuccess(
    pr_number: number,
    target: string,
    downstream: string,
  ) {
    return dedent`Successfully created backport PR for \`${target}\`:
                  - ${downstream}#${pr_number}`;
  }

  private composeMessageForSuccessWithConflicts(
    pr_number: number,
    target: string,
    downstream: string,
    branchname: string,
    commitShasToCherryPick: string[],
    conflictResolution: string,
  ): string {
    const suggestionToResolve = this.composeMessageToResolveCommittedConflicts(
      target,
      branchname,
      commitShasToCherryPick,
      conflictResolution,
    );
    return dedent`Created backport PR for \`${target}\`:
                  - ${downstream}#${pr_number} with remaining conflicts!

                  ${suggestionToResolve}`;
  }

  private createOutput(
    successByTarget: Map<string, boolean>,
    createdPullRequestNumbers: Array<number>,
  ) {
    const anyTargetFailed = Array.from(successByTarget.values()).includes(
      false,
    );
    core.setOutput(Output.wasSuccessful, !anyTargetFailed);

    const byTargetOutput = Array.from(successByTarget.entries()).reduce<string>(
      (i, [target, result]) => `${i}${target}=${result}\n`,
      "",
    );
    core.setOutput(Output.wasSuccessfulByTarget, byTargetOutput);

    const createdPullNumbersOutput = createdPullRequestNumbers.join(" ");
    core.setOutput(Output.created_pull_numbers, createdPullNumbersOutput);
  }
}

export function findTargetBranches(
  config: Pick<Config, "source_labels_pattern" | "target_branches">,
  labels: string[],
  headref: string,
) {
  console.log("Determining target branches...");

  console.log(`Detected labels on PR: ${labels}`);

  const targetBranchesFromLabels = findTargetBranchesFromLabels(labels, config);
  const configuredTargetBranches =
    config.target_branches
      ?.split(" ")
      .map((t) => t.trim())
      .filter((t) => t !== "") ?? [];

  console.log(`Found target branches in labels: ${targetBranchesFromLabels}`);
  console.log(
    `Found target branches in \`target_branches\` input: ${configuredTargetBranches}`,
  );
  console.log(
    `Exclude pull request's headref from target branches: ${headref}`,
  );

  const targetBranches = [
    ...new Set([...targetBranchesFromLabels, ...configuredTargetBranches]),
  ].filter((t) => t !== headref);

  console.log(`Determined target branches: ${targetBranches}`);

  return targetBranches;
}

function findTargetBranchesFromLabels(
  labels: string[],
  config: Pick<Config, "source_labels_pattern">,
) {
  const pattern = config.source_labels_pattern;
  if (pattern === undefined) {
    return [];
  }
  return labels
    .map((label) => {
      return { label: label, match: pattern.exec(label) };
    })
    .filter((result) => {
      if (!result.match) {
        console.log(
          `label '${result.label}' doesn't match \`label_pattern\` '${pattern.source}'`,
        );
      } else if (result.match.length < 2) {
        console.error(
          dedent`label '${result.label}' matches \`label_pattern\` '${pattern.source}', \
          but no branchname could be captured. Please make sure to provide a regex with a capture group as \
          \`label_pattern\`.`,
        );
      }
      return !!result.match && result.match.length === 2;
    })
    .map((result) => result.match!![1]);
}

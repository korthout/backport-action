import * as core from "@actions/core";
import dedent from "dedent";

import { CreatePullRequestResponse, PullRequest } from "./github";
import { GithubApi } from "./github";
import { Git, GitRefNotFoundError } from "./git";
import * as utils from "./utils";

type PRContent = {
  title: string;
  body: string;
};

export type Config = {
  pwd: string;
  labels: {
    pattern?: RegExp;
  };
  pull: {
    description: string;
    title: string;
  };
  copy_labels_pattern?: RegExp;
  target_branches?: string;
  commits: {
    merge_commits: "fail" | "skip";
  };
  copy_milestone: boolean;
  copy_assignees: boolean;
  copy_requested_reviewers: boolean;
};

enum Output {
  wasSuccessful = "was_successful",
  wasSuccessfulByTarget = "was_successful_by_target",
}

export class Backport {
  private github;
  private config;
  private git;

  constructor(github: GithubApi, config: Config, git: Git) {
    this.github = github;
    this.config = config;
    this.git = git;
  }

  async run(): Promise<void> {
    try {
      const payload = this.github.getPayload();
      const owner = this.github.getRepo().owner;
      const repo = payload.repository?.name ?? this.github.getRepo().repo;
      const pull_number = this.github.getPullNumber();
      const mainpr = await this.github.getPullRequest(pull_number);
      const headref = mainpr.head.sha;
      const baseref = mainpr.base.sha;

      if (!(await this.github.isMerged(mainpr))) {
        const message = "Only merged pull requests can be backported.";
        this.github.createComment({
          owner,
          repo,
          issue_number: pull_number,
          body: message,
        });
        return;
      }

      const target_branches = this.findTargetBranches(mainpr, this.config);
      if (target_branches.length === 0) {
        console.log(
          `Nothing to backport: no 'target_branches' specified and none of the labels match the backport pattern '${this.config.labels.pattern?.source}'`,
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
      console.log(`Found commits: ${commitShas}`);

      console.log("Checking the merged pull request for merge commits");
      const mergeCommitShas = await this.git.findMergeCommits(
        commitShas,
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
          owner,
          repo,
          issue_number: pull_number,
          body: message,
        });
        return;
      }

      let commitShasToCherryPick = commitShas;
      if (
        mergeCommitShas.length > 0 &&
        this.config.commits.merge_commits == "skip"
      ) {
        console.log("Skipping merge commits: " + mergeCommitShas);
        const nonMergeCommitShas = commitShas.filter(
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
              (this.config.labels.pattern === undefined ||
                !label.match(this.config.labels.pattern)),
          );
      }
      console.log(
        `Will copy labels matching ${this.config.copy_labels_pattern}. Found matching labels: ${labelsToCopy}`,
      );

      const successByTarget = new Map<string, boolean>();
      for (const target of target_branches) {
        console.log(`Backporting to target branch '${target}...'`);

        try {
          await this.git.fetch(target, this.config.pwd, 1);
        } catch (error) {
          if (error instanceof GitRefNotFoundError) {
            const message = this.composeMessageForFetchTargetFailure(error.ref);
            console.error(message);
            successByTarget.set(target, false);
            await this.github.createComment({
              owner,
              repo,
              issue_number: pull_number,
              body: message,
            });
            continue;
          } else {
            throw error;
          }
        }

        try {
          const branchname = `backport-${pull_number}-to-${target}`;

          console.log(`Start backport to ${branchname}`);
          try {
            await this.git.checkout(
              branchname,
              `origin/${target}`,
              this.config.pwd,
            );
          } catch (error) {
            const message = this.composeMessageForBackportScriptFailure(
              target,
              3,
              baseref,
              headref,
              branchname,
            );
            console.error(message);
            successByTarget.set(target, false);
            await this.github.createComment({
              owner,
              repo,
              issue_number: pull_number,
              body: message,
            });
            continue;
          }

          try {
            await this.git.cherryPick(commitShasToCherryPick, this.config.pwd);
          } catch (error) {
            const message = this.composeMessageForBackportScriptFailure(
              target,
              4,
              baseref,
              headref,
              branchname,
            );
            console.error(message);
            successByTarget.set(target, false);
            await this.github.createComment({
              owner,
              repo,
              issue_number: pull_number,
              body: message,
            });
            continue;
          }

          console.info(`Push branch to origin`);
          const pushExitCode = await this.git.push(branchname, this.config.pwd);
          if (pushExitCode != 0) {
            const message = this.composeMessageForGitPushFailure(
              target,
              pushExitCode,
            );
            console.error(message);
            successByTarget.set(target, false);
            await this.github.createComment({
              owner,
              repo,
              issue_number: pull_number,
              body: message,
            });
            continue;
          }

          console.info(`Create PR for ${branchname}`);
          const { title, body } = this.composePRContent(target, mainpr);
          const new_pr_response = await this.github.createPR({
            owner,
            repo,
            title,
            body,
            head: branchname,
            base: target,
            maintainer_can_modify: true,
          });

          if (new_pr_response.status != 201) {
            console.error(JSON.stringify(new_pr_response));
            successByTarget.set(target, false);
            const message =
              this.composeMessageForCreatePRFailed(new_pr_response);
            await this.github.createComment({
              owner,
              repo,
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
              const set_milestone_response = await this.github.setMilestone(
                new_pr.number,
                milestone,
              );
              if (set_milestone_response.status != 200) {
                console.error(set_milestone_response.status);
                console.error(JSON.stringify(set_milestone_response));
              }
            }
          }

          if (this.config.copy_assignees == true) {
            const assignees = mainpr.assignees.map((label) => label.login);
            if (assignees.length > 0) {
              console.info("Setting assignees " + assignees);
              const set_assignee_response = await this.github.setAssignees(
                new_pr.number,
                assignees,
              );
              if (set_assignee_response.status != 201) {
                console.error(set_assignee_response.status);
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
                ...this.github.getRepo(),
                pull_number: new_pr.number,
                reviewers: reviewers,
              };
              const set_reviewers_response =
                await this.github.requestReviewers(reviewRequest);
              if (set_reviewers_response.status != 201) {
                console.error(set_reviewers_response.status);
              }
            }
          }

          if (labelsToCopy.length > 0) {
            const label_response = await this.github.labelPR(
              new_pr.number,
              labelsToCopy,
            );
            if (label_response.status != 200) {
              console.error(JSON.stringify(label_response));
              // The PR was still created so let's still comment on the original.
            }
          }

          const message = this.composeMessageForSuccess(new_pr.number, target);
          successByTarget.set(target, true);
          await this.github.createComment({
            owner,
            repo,
            issue_number: pull_number,
            body: message,
          });
        } catch (error) {
          if (error instanceof Error) {
            console.error(error.message);
            successByTarget.set(target, false);
            await this.github.createComment({
              owner,
              repo,
              issue_number: pull_number,
              body: error.message,
            });
          } else {
            throw error;
          }
        }
      }

      this.createOutput(successByTarget);
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

  private composeMessageForBackportScriptFailure(
    target: string,
    exitcode: number,
    baseref: string,
    headref: string,
    branchname: string,
  ): string {
    const reasons: { [key: number]: string } = {
      1: "due to an unknown script error",
      2: "because it was unable to create/access the git worktree directory",
      3: "because it was unable to create a new branch",
      4: "because it was unable to cherry-pick the commit(s)",
      5: "because 1 or more of the commits are not available",
      6: "because 1 or more of the commits are not available",
    };
    const reason = reasons[exitcode] ?? "due to an unknown script error";

    const suggestion =
      exitcode <= 4
        ? dedent`\`\`\`bash
                git fetch origin ${target}
                git worktree add -d .worktree/${branchname} origin/${target}
                cd .worktree/${branchname}
                git checkout -b ${branchname}
                ancref=$(git merge-base ${baseref} ${headref})
                git cherry-pick -x $ancref..${headref}
                \`\`\``
        : dedent`Note that rebase and squash merges are not supported at this time.
                For more information see https://github.com/korthout/backport-action/issues/46.`;

    return dedent`Backport failed for \`${target}\`, ${reason}.

                  Please cherry-pick the changes locally.
                  ${suggestion}`;
  }

  private composeMessageForGitPushFailure(
    target: string,
    exitcode: number,
  ): string {
    //TODO better error messages depending on exit code
    return dedent`Git push to origin failed for ${target} with exitcode ${exitcode}`;
  }

  private composeMessageForCreatePRFailed(
    response: CreatePullRequestResponse,
  ): string {
    return dedent`Backport branch created but failed to create PR.
                Request to create PR rejected with status ${response.status}.

                (see action log for full response)`;
  }

  private composeMessageForSuccess(pr_number: number, target: string) {
    return dedent`Successfully created backport PR for \`${target}\`:
                  - #${pr_number}`;
  }

  private createOutput(successByTarget: Map<string, boolean>) {
    const anyTargetFailed = Array.from(successByTarget.values()).includes(
      false,
    );
    core.setOutput(Output.wasSuccessful, !anyTargetFailed);

    const byTargetOutput = Array.from(successByTarget.entries()).reduce<string>(
      (i, [target, result]) => `${i}${target}=${result}\n`,
      "",
    );
    core.setOutput(Output.wasSuccessfulByTarget, byTargetOutput);
  }
}

export function findTargetBranches(
  config: Pick<Config, "labels" | "target_branches">,
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
  config: Pick<Config, "labels">,
) {
  const pattern = config.labels.pattern;
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

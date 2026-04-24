import * as core from "@actions/core";
import dedent from "dedent";

import {
  CreatePullRequestResponse,
  PullRequest,
  RequestError,
} from "./github.js";
import { GithubApi } from "./github.js";
import { GitApi, GitRefNotFoundError } from "./git.js";
import {
  BackportError,
  CheckoutError,
  CherryPickError,
  CreatePRError,
  GitPushError,
} from "./errors.js";
import {
  composeMessageForCheckoutFailure,
  composeMessageForCherryPickFailure,
  composeMessageForCreatePRFailed,
  composeMessageForFetchTargetFailure,
  composeMessageForGitPushFailure,
  composeMessageForSuccess,
  composeMessageForSuccessWithConflicts,
  composeMessageToResolveCommittedConflicts,
} from "./legacy-comments.js";
import { postCreatePR } from "./pr-post-create.js";
import { resolveCommitsToCherryPick } from "./resolve-commits.js";
import * as utils from "./utils.js";

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
  copy_all_reviewers: boolean;
  copy_requested_reviewers: boolean;
  add_author_as_assignee: boolean;
  add_author_as_reviewer: boolean;
  add_reviewers: string[];
  add_team_reviewers: string[];
  auto_merge_enabled: boolean;
  auto_merge_method: "merge" | "squash" | "rebase";
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

/**
 * Repo where the workflow runs — used for commenting on the source PR.
 * Repo where backport branches and PRs are created — same as workflow repo
 * unless using the downstream_repo experimental config.
 */
type BackportContext = {
  workflowOwner: string;
  workflowRepo: string;
  targetOwner: string;
  targetRepo: string;
  pullNumber: number;
  runId: string;
  runUrl: string;
  remote: "origin" | "downstream";
  commitShasToCherryPick: string[];
  labelsToCopy: string[];
  mainpr: PullRequest;
};

type TargetResult =
  | { status: "success"; targetBranch: string; newPrNumber: number }
  | {
      status: "success_with_conflicts";
      targetBranch: string;
      newPrNumber: number;
      uncommittedShas: string[];
    }
  | { status: "skipped"; targetBranch: string; reason: string }
  | { status: "failed"; targetBranch: string; error: BackportError | Error };

export class Backport {
  private github;
  private config;
  private git;

  private downstreamRepo;
  private downstreamOwner;

  constructor(github: GithubApi, config: Config, git: GitApi) {
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

      // Repo where the workflow runs — used for commenting on the source PR
      const workflowOwner = this.github.getRepo().owner;
      const workflowRepo =
        payload.repository?.name ?? this.github.getRepo().repo;

      // Repo where backport branches and PRs are created (same as workflow repo unless using downstream)
      const targetOwner =
        this.shouldUseDownstreamRepo() && this.downstreamOwner // if undefined, use owner of workflow
          ? this.downstreamOwner
          : workflowOwner;
      const targetRepo = this.shouldUseDownstreamRepo()
        ? this.downstreamRepo
        : workflowRepo;

      if (targetRepo === undefined) throw new Error("No repository defined!");

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

      let commitShasToCherryPick: string[];
      try {
        commitShasToCherryPick = await resolveCommitsToCherryPick(
          this.git,
          this.github,
          this.config,
          mainpr,
          pull_number,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(message);
        this.github.createComment({
          owner: workflowOwner,
          repo: workflowRepo,
          issue_number: pull_number,
          body: message,
        });
        return;
      }

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
        await this.git.remoteAdd(
          this.config.pwd,
          "downstream",
          targetOwner,
          targetRepo,
        );
      }

      const runUrl = this.github.getRunUrl();
      const runId = process.env.GITHUB_RUN_ID ?? "";
      const context: BackportContext = {
        workflowOwner,
        workflowRepo,
        targetOwner,
        targetRepo,
        pullNumber: pull_number,
        runId,
        runUrl,
        remote: this.getRemote(),
        commitShasToCherryPick,
        labelsToCopy,
        mainpr,
      };

      const successByTarget = new Map<string, boolean>();
      const results: TargetResult[] = [];
      for (const targetBranch of target_branches) {
        const result = await this.backportToTarget(targetBranch, context);
        results.push(result);

        // Post per-target comment (legacy style)
        switch (result.status) {
          case "success": {
            const message = composeMessageForSuccess(
              result.newPrNumber,
              result.targetBranch,
              this.shouldUseDownstreamRepo()
                ? `${context.targetOwner}/${context.targetRepo}`
                : "",
            );
            successByTarget.set(targetBranch, true);
            await this.github.createComment({
              owner: workflowOwner,
              repo: workflowRepo,
              issue_number: pull_number,
              body: message,
            });
            break;
          }
          case "success_with_conflicts": {
            const branchname = utils.replacePlaceholders(
              this.config.pull.branch_name,
              mainpr,
              result.targetBranch,
            );
            const message = composeMessageForSuccessWithConflicts(
              result.newPrNumber,
              result.targetBranch,
              this.shouldUseDownstreamRepo()
                ? `${context.targetOwner}/${context.targetRepo}`
                : "",
              branchname,
              result.uncommittedShas,
              this.config.experimental.conflict_resolution,
            );
            successByTarget.set(targetBranch, true);
            await this.github.createComment({
              owner: workflowOwner,
              repo: workflowRepo,
              issue_number: pull_number,
              body: message,
            });
            // post message to new pr to resolve conflict
            const resolveMessage = composeMessageToResolveCommittedConflicts(
              result.targetBranch,
              branchname,
              result.uncommittedShas,
              this.config.experimental.conflict_resolution,
            );
            await this.github.createComment({
              owner: context.targetOwner,
              repo: context.targetRepo,
              issue_number: result.newPrNumber,
              body: resolveMessage,
            });
            break;
          }
          case "skipped":
            // No comment posted for skipped targets (matches current behavior)
            break;
          case "failed": {
            successByTarget.set(targetBranch, false);
            const error = result.error;
            const branchname = utils.replacePlaceholders(
              this.config.pull.branch_name,
              mainpr,
              result.targetBranch,
            );
            let message: string;
            if (error instanceof GitRefNotFoundError) {
              message = composeMessageForFetchTargetFailure(error.ref);
            } else if (error instanceof CheckoutError) {
              message = composeMessageForCheckoutFailure(
                result.targetBranch,
                branchname,
                commitShasToCherryPick,
              );
            } else if (error instanceof CherryPickError) {
              message = composeMessageForCherryPickFailure(
                result.targetBranch,
                branchname,
                error.commits,
              );
            } else if (error instanceof GitPushError) {
              message = composeMessageForGitPushFailure(
                result.targetBranch,
                error.exitCode,
              );
            } else if (error instanceof CreatePRError) {
              message = composeMessageForCreatePRFailed(error);
            } else {
              message = error.message;
            }
            console.error(message);
            await this.github.createComment({
              owner: workflowOwner,
              repo: workflowRepo,
              issue_number: pull_number,
              body: message,
            });
            break;
          }
        }
      }

      const createdPullRequestNumbers = results
        .filter(
          (
            r,
          ): r is Extract<
            TargetResult,
            { status: "success" | "success_with_conflicts" }
          > => r.status === "success" || r.status === "success_with_conflicts",
        )
        .map((r) => r.newPrNumber);

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

  private async backportToTarget(
    targetBranch: string,
    context: BackportContext,
  ): Promise<TargetResult> {
    const {
      targetOwner,
      targetRepo,
      workflowOwner,
      workflowRepo,
      remote,
      commitShasToCherryPick,
      labelsToCopy,
      mainpr,
    } = context;

    console.log(`Backporting to target branch '${targetBranch}...'`);

    try {
      await this.git.fetch(targetBranch, this.config.pwd, 1, remote);
    } catch (error) {
      if (error instanceof GitRefNotFoundError) {
        return { status: "failed", targetBranch, error };
      } else {
        throw error;
      }
    }

    try {
      const branchname = utils.replacePlaceholders(
        this.config.pull.branch_name,
        mainpr,
        targetBranch,
      );

      console.log(`Start backport to ${branchname}`);
      try {
        await this.git.checkout(
          branchname,
          `${remote}/${targetBranch}`,
          this.config.pwd,
        );
      } catch (error) {
        if (error instanceof CheckoutError) {
          return { status: "failed", targetBranch, error };
        }
        throw error;
      }

      let uncommittedShas: string[] | null;

      try {
        uncommittedShas = await this.git.cherryPick(
          commitShasToCherryPick,
          this.config.experimental.conflict_resolution,
          this.config.pwd,
        );
      } catch (error) {
        if (error instanceof CherryPickError) {
          return { status: "failed", targetBranch, error };
        }
        throw error;
      }

      console.info(`Push branch to ${remote}`);
      try {
        await this.git.push(branchname, remote, this.config.pwd);
      } catch (pushError) {
        if (!(pushError instanceof GitPushError)) throw pushError;
        try {
          // If the branch already exists, ignore the error and keep going.
          console.info(
            `Branch ${branchname} may already exist, fetching it instead to recover previous run`,
          );
          await this.git.fetch(branchname, this.config.pwd, 1, remote);
          console.info(
            `Previous branch successfully recovered, retrying PR creation`,
          );
          // note that the recovered branch is not guaranteed to be up-to-date
        } catch {
          // Fetching the branch failed as well, so report the original push error.
          return { status: "failed", targetBranch, error: pushError };
        }
      }

      console.info(`Create PR for ${branchname}`);
      const { title, body } = this.composePRContent(targetBranch, mainpr);
      let new_pr_response: CreatePullRequestResponse;
      try {
        new_pr_response = await this.github.createPR({
          owner: targetOwner,
          repo: targetRepo,
          title,
          body,
          head: branchname,
          base: targetBranch,
          maintainer_can_modify: true,
          draft: uncommittedShas !== null,
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
          return {
            status: "skipped",
            targetBranch,
            reason: "PR already exists",
          };
        }

        console.error(JSON.stringify(error.response?.data));
        return {
          status: "failed",
          targetBranch,
          error: new CreatePRError(
            `Request to create PR rejected with status ${error.status}`,
            error.status,
            JSON.stringify(error.response?.data),
          ),
        };
      }
      const new_pr = new_pr_response.data;

      await postCreatePR(
        this.github,
        this.config,
        new_pr.number,
        mainpr,
        labelsToCopy,
        { owner: targetOwner, repo: targetRepo },
        { owner: workflowOwner, repo: workflowRepo },
      );

      if (uncommittedShas !== null) {
        return {
          status: "success_with_conflicts",
          targetBranch,
          newPrNumber: new_pr.number,
          uncommittedShas,
        };
      }

      return { status: "success", targetBranch, newPrNumber: new_pr.number };
    } catch (error) {
      if (error instanceof Error) {
        console.error(error.message);
        return { status: "failed", targetBranch, error };
      } else {
        throw error;
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

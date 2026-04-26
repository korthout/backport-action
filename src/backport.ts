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
  CheckoutError,
  CherryPickError,
  CreatePRError,
  GitPushError,
  TargetResult,
} from "./errors.js";
import { postCreatePR } from "./pr-post-create.js";
import {
  MergeCommitsNotAllowedError,
  resolveCommitsToCherryPick,
} from "./resolve-commits.js";
import * as utils from "./utils.js";

type PRContent = {
  title: string;
  body: string;
};

/**
 * Per-run context shared by every per-target backport.
 *
 * `workflow*` fields point at the repo where the action runs (and where the
 * source PR lives — comments go here). `target*` fields point at the repo
 * where backport branches and PRs are created — same as the workflow repo
 * unless using the `downstream_repo` experimental config.
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
  comment_style: "legacy" | "summary";
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

      // Repo where the workflow runs — used for commenting on the source PR.
      const workflowOwner = this.github.getRepo().owner;
      const workflowRepo =
        payload.repository?.name ?? this.github.getRepo().repo;

      // Repo where backport branches and PRs are created — same as workflow
      // repo unless using the downstream_repo experimental config.
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
        if (error instanceof MergeCommitsNotAllowedError) {
          console.error(error.message);
          this.github.createComment({
            owner: workflowOwner,
            repo: workflowRepo,
            issue_number: pull_number,
            body: error.message,
          });
          return;
        }
        throw error;
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

      const context: BackportContext = {
        workflowOwner,
        workflowRepo,
        targetOwner,
        targetRepo,
        pullNumber: pull_number,
        runId: this.github.getRunId(),
        runUrl: this.github.getRunUrl(),
        remote: this.getRemote(),
        commitShasToCherryPick,
        labelsToCopy,
        mainpr,
      };

      const successByTarget = new Map<string, boolean>();
      const createdPullRequestNumbers = new Array<number>();
      for (const targetBranch of target_branches) {
        const result = await this.backportToTarget(targetBranch, context);
        await this.handleTargetResultLegacy(result, context);

        if (result.status === "skipped") continue;

        successByTarget.set(targetBranch, result.status !== "failed");

        if (
          result.status === "success" ||
          result.status === "success_with_conflicts"
        ) {
          createdPullRequestNumbers.push(result.newPrNumber);
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

  private async backportToTarget(
    targetBranch: string,
    context: BackportContext,
  ): Promise<TargetResult> {
    const { targetOwner, targetRepo, remote, commitShasToCherryPick, mainpr } =
      context;

    console.log(`Backporting to target branch '${targetBranch}...'`);

    try {
      await this.git.fetch(targetBranch, this.config.pwd, 1, remote);
    } catch (error) {
      if (error instanceof GitRefNotFoundError) {
        return { status: "failed", targetBranch, error };
      }
      throw error;
    }

    const branchname = utils.replacePlaceholders(
      this.config.pull.branch_name,
      mainpr,
      targetBranch,
    );

    try {
      console.log(`Start backport to ${branchname}`);
      try {
        await this.git.checkout(
          branchname,
          `${remote}/${targetBranch}`,
          this.config.pwd,
        );
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : `git checkout ${branchname} failed`;
        return {
          status: "failed",
          targetBranch,
          branchname,
          error: new CheckoutError(message, branchname, commitShasToCherryPick),
        };
      }

      let uncommittedShas: string[] | null;

      try {
        uncommittedShas = await this.git.cherryPick(
          commitShasToCherryPick,
          this.config.experimental.conflict_resolution,
          this.config.pwd,
        );
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : `cherry-pick failed for ${commitShasToCherryPick.join(", ")}`;
        return {
          status: "failed",
          targetBranch,
          branchname,
          error: new CherryPickError(
            message,
            branchname,
            commitShasToCherryPick,
          ),
        };
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
          return {
            status: "failed",
            targetBranch,
            branchname,
            error: pushError,
          };
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
          branchname,
          error: new CreatePRError(
            error.message,
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
        context.labelsToCopy,
        { owner: targetOwner, repo: targetRepo },
        { owner: context.workflowOwner, repo: context.workflowRepo },
      );

      if (uncommittedShas !== null) {
        return {
          status: "success_with_conflicts",
          targetBranch,
          newPrNumber: new_pr.number,
          branchname,
          uncommittedShas,
        };
      }
      return {
        status: "success",
        targetBranch,
        newPrNumber: new_pr.number,
        branchname,
      };
    } catch (error) {
      if (error instanceof Error) {
        console.error(error.message);
        console.error(error.stack ?? "");
        return { status: "failed", targetBranch, branchname, error };
      }
      throw error;
    }
  }

  /**
   * Posts the per-target comments matching the existing legacy behavior:
   *   - failed: post the failure message on the source PR
   *   - success / success_with_conflicts: post the success message on the
   *     source PR; for conflicts, also post the recovery instructions on
   *     the new backport PR
   *   - skipped: no comment (matches the previous `continue` behavior)
   *
   * Phase 8c will replace this with the progressive summary comment flow
   * when `comment_style: summary` is enabled.
   */
  private async handleTargetResultLegacy(
    result: TargetResult,
    context: BackportContext,
  ): Promise<void> {
    const { workflowOwner, workflowRepo, targetOwner, targetRepo, pullNumber } =
      context;

    if (result.status === "skipped") return;

    if (result.status === "failed") {
      const message = this.composeFailureMessage(result, context);
      console.error(message);
      await this.github.createComment({
        owner: workflowOwner,
        repo: workflowRepo,
        issue_number: pullNumber,
        body: message,
      });
      return;
    }

    const { targetBranch, newPrNumber, branchname } = result;
    const downstream = this.shouldUseDownstreamRepo()
      ? `${targetOwner}/${targetRepo}`
      : "";

    const successMessage =
      result.status === "success_with_conflicts"
        ? this.composeMessageForSuccessWithConflicts(
            newPrNumber,
            targetBranch,
            downstream,
            branchname,
            result.uncommittedShas,
            this.config.experimental.conflict_resolution,
          )
        : this.composeMessageForSuccess(newPrNumber, targetBranch, downstream);

    await this.github.createComment({
      owner: workflowOwner,
      repo: workflowRepo,
      issue_number: pullNumber,
      body: successMessage,
    });

    if (result.status === "success_with_conflicts") {
      const conflictMessage = this.composeMessageToResolveCommittedConflicts(
        targetBranch,
        branchname,
        result.uncommittedShas,
        this.config.experimental.conflict_resolution,
      );
      await this.github.createComment({
        owner: targetOwner,
        repo: targetRepo,
        issue_number: newPrNumber,
        body: conflictMessage,
      });
    }
  }

  private composeFailureMessage(
    result: Extract<TargetResult, { status: "failed" }>,
    context: BackportContext,
  ): string {
    const { targetBranch, error } = result;
    if (error instanceof GitRefNotFoundError) {
      return this.composeMessageForFetchTargetFailure(error.ref);
    }
    if (error instanceof CheckoutError) {
      return this.composeMessageForCheckoutFailure(
        targetBranch,
        error.branch,
        error.commits,
      );
    }
    if (error instanceof CherryPickError) {
      return this.composeMessageForCherryPickFailure(
        targetBranch,
        error.branch,
        error.commits,
      );
    }
    if (error instanceof GitPushError) {
      return this.composeMessageForGitPushFailure(targetBranch, error.exitCode);
    }
    if (error instanceof CreatePRError) {
      return dedent`Backport branch created but failed to create PR.
                    Request to create PR rejected with status ${error.status}.

                    (see action log for full response)`;
    }
    return error.message;
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

import * as core from "@actions/core";
import dedent from "dedent";

import { CreatePullRequestResponse, RequestReviewersResponse } from "./github";
import { GithubApi } from "./github";
import * as exec from "./exec";
import * as utils from "./utils";

type PRContent = {
  title: string;
  body: string;
};

type Config = {
  version: string;
  pwd: string;
  labels: {
    pattern: RegExp;
  };
  pull: {
    description: string;
  };
};

export class Backport {
  private github;
  private config;

  constructor(github: GithubApi, config: Config) {
    this.github = github;
    this.config = config;
  }

  async run(): Promise<void> {
    try {
      const payload = this.github.getPayload();
      const owner = this.github.getRepo().owner;
      const repo = payload.repository?.name ?? this.github.getRepo().repo;
      const pull_number = this.github.getPullNumber();
      const mainpr = await this.github.getPullRequest(pull_number);

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

      const headref = mainpr.head.sha;
      const baseref = mainpr.base.sha;
      const labels = mainpr.labels;
      const reviewers = mainpr.requested_reviewers?.map((r) => r.login) ?? [];

      console.log(
        `Detected labels on PR: ${labels.map((label) => label.name)}`
      );

      for (const label of labels) {
        console.log(`Working on label ${label.name}`);

        // we are looking for labels like "backport stable/0.24"
        const match = this.config.labels.pattern.exec(label.name);

        if (!match) {
          console.log("Doesn't match expected prefix");
          continue;
        }
        if (match.length < 2) {
          console.error(
            dedent`\`label_pattern\` '${this.config.labels.pattern.source}' \
            matched "${label.name}", but did not capture any branchname. \
            Please make sure to provide a regex with a capture group as \
            \`label_pattern\`.`
          );
          continue;
        }

        //extract the target branch (e.g. "stable/0.24")
        const target = match[1];
        console.log(`Found target in label: ${target}`);

        try {
          const branchname = `backport-${pull_number}-to-${target}`;

          console.log(`Start backport to ${branchname}`);
          const scriptExitCode = await exec.callBackportScript(
            this.config.pwd,
            headref,
            baseref,
            target,
            branchname,
            this.config.version
          );

          if (scriptExitCode != 0) {
            const message = this.composeMessageForBackportScriptFailure(
              target,
              scriptExitCode,
              baseref,
              headref,
              branchname
            );
            console.error(`exitcode(${scriptExitCode}): ${message}`);
            await this.github.createComment({
              owner,
              repo,
              issue_number: pull_number,
              body: message,
            });
            continue;
          }

          console.info(`Push branch to origin`);
          const pushExitCode = await exec.call(
            `git push --set-upstream origin ${branchname}`
          );
          if (pushExitCode != 0) {
            const message = this.composeMessageForGitPushFailure(
              target,
              pushExitCode
            );
            console.error(message);
            await this.github.createComment({
              owner,
              repo,
              issue_number: pull_number,
              body: message,
            });
            continue;
          }

          console.info(`Create PR for ${branchname}`);
          const { title, body } = this.composePRContent(
            target,
            mainpr.title,
            pull_number,
            mainpr.body
          );
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

          const review_response = await this.github.requestReviewers({
            owner,
            repo,
            pull_number: new_pr.number,
            reviewers,
          });
          if (review_response.status != 201) {
            console.error(JSON.stringify(review_response));
            const message = this.composeMessageForRequestReviewersFailed(
              review_response,
              target
            );
            await this.github.createComment({
              owner,
              repo,
              issue_number: pull_number,
              body: message,
            });
            continue;
          }

          const message = this.composeMessageForSuccess(new_pr.number, target);
          await this.github.createComment({
            owner,
            repo,
            issue_number: pull_number,
            body: message,
          });
        } catch (error) {
          console.error(error.message);
          await this.github.createComment({
            owner,
            repo,
            issue_number: pull_number,
            body: error.message,
          });
        }
      }
    } catch (error) {
      console.error(error.message);
      core.setFailed(error.message);
    }
  }

  private composePRContent(
    target: string,
    issue_title: string,
    issue_number: number,
    original_body: string
  ): PRContent {
    const title = `[Backport ${target}] ${issue_title}`;
    const issues = utils.getMentionedIssueRefs(original_body);
    const body = this.config.pull.description
      .replace("${pull_number}", issue_number.toString())
      .replace("${target_branch}", target)
      .replace("${issue_refs}", issues.join(" "));
    return { title, body };
  }

  private composeMessageForBackportScriptFailure(
    target: string,
    exitcode: number,
    baseref: string,
    headref: string,
    branchname: string
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
                For more information see https://github.com/zeebe-io/backport-action/issues/46.`;

    return dedent`Backport failed for \`${target}\`, ${reason}.

                  Please cherry-pick the changes locally.
                  ${suggestion}`;
  }

  private composeMessageForGitPushFailure(
    target: string,
    exitcode: number
  ): string {
    //TODO better error messages depending on exit code
    return dedent`Git push to origin failed for ${target} with exitcode ${exitcode}`;
  }

  private composeMessageForCreatePRFailed(
    response: CreatePullRequestResponse
  ): string {
    return dedent`Backport branch created but failed to create PR. 
                Request to create PR rejected with status ${response.status}.

                (see action log for full response)`;
  }

  private composeMessageForRequestReviewersFailed(
    response: RequestReviewersResponse,
    target: string
  ): string {
    return dedent`${this.composeMessageForSuccess(response.data.number, target)}
                But, request reviewers was rejected with status ${
                  response.status
                }.

                (see action log for full response)`;
  }

  private composeMessageForSuccess(pr_number: number, target: string) {
    return dedent`Successfully created backport PR #${pr_number} for \`${target}\`.`;
  }
}

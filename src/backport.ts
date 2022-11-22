import * as core from "@actions/core";
import dedent from "dedent";

import { CreatePullRequestResponse, PullRequest } from "./github";
import { GithubApi } from "./github";
import * as git from "./git";
import * as utils from "./utils";

type PRContent = {
  title: string;
  body: string;
};

type Config = {
  pwd: string;
  labels: {
    pattern: RegExp;
  };
  pull: {
    description: string;
    title: string;
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

      console.log(
        `Detected labels on PR: ${labels.map((label) => label.name)}`
      );

      if (!someLabelIn(labels).matches(this.config.labels.pattern)) {
        console.log(
          `Nothing to backport: none of the labels match the backport pattern '${this.config.labels.pattern.source}'`
        );
        return; // nothing left to do here
      }

      console.log(
        `Fetching all the commits from the pull request: ${mainpr.commits + 1}`
      );
      await git.fetch(
        `refs/pull/${pull_number}/head`,
        this.config.pwd,
        mainpr.commits + 1 // +1 in case this concerns a shallowly cloned repo
      );

      console.log(
        "Determining first and last commit shas, so we can cherry-pick the commit range"
      );
      const { firstCommitSha, lastCommitSha } =
        await this.github.getFirstAndLastCommitSha(mainpr);

      console.log(`Found commits: ${firstCommitSha}..${lastCommitSha}`);

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

        await git.fetch(target, this.config.pwd, 1);

        try {
          const branchname = `backport-${pull_number}-to-${target}`;

          console.log(`Start backport to ${branchname}`);
          try {
            await git.checkout(branchname, `origin/${target}`, this.config.pwd);
          } catch (error) {
            const message = this.composeMessageForBackportScriptFailure(
              target,
              3,
              baseref,
              headref,
              branchname
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

          try {
            await git.cherryPick(
              firstCommitSha,
              lastCommitSha,
              this.config.pwd
            );
          } catch (error) {
            const message = this.composeMessageForBackportScriptFailure(
              target,
              4,
              baseref,
              headref,
              branchname
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

          console.info(`Push branch to origin`);
          const pushExitCode = await git.push(branchname, this.config.pwd);
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

          const message = this.composeMessageForSuccess(new_pr.number, target);
          await this.github.createComment({
            owner,
            repo,
            issue_number: pull_number,
            body: message,
          });
        } catch (error) {
          if (error instanceof Error) {
            console.error(error.message);
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
    } catch (error) {
      if (error instanceof Error) {
        console.error(error.message);
        core.setFailed(error.message);
      } else {
        console.error(`An unexpected error occurred: ${JSON.stringify(error)}`);
        core.setFailed(
          "An unexpected error occured. Please check the logs for details"
        );
      }
    }
  }

  private composePRContent(target: string, main: PullRequest): PRContent {
    const title = utils.replacePlaceholders(
      this.config.pull.title,
      main,
      target
    );
    const body = utils.replacePlaceholders(
      this.config.pull.description,
      main,
      target
    );
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

  private composeMessageForSuccess(pr_number: number, target: string) {
    return dedent`Successfully created backport PR #${pr_number} for \`${target}\`.`;
  }
}

/**
 * Helper method for label arrays to check that it matches a particular pattern
 *
 * @param labels an array of labels
 * @returns a 'curried' function to easily test for a matching a label
 */
function someLabelIn(labels: { name: string }[]): {
  matches: (pattern: RegExp) => boolean;
} {
  return {
    matches: (pattern) => labels.some((l) => pattern.test(l.name)),
  };
}

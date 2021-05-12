import * as core from "@actions/core";
import dedent from "dedent";

import { CreatePullRequestResponse, RequestReviewersResponse } from "./github";
import * as github from "./github";
import * as exec from "./exec";

const labelRegExp = /^backport ([^ ]+)?$/;

type PRContent = {
  title: string;
  body: string;
};

export async function run(): Promise<void> {
  try {
    const token = core.getInput("github_token", { required: true });
    const pwd = core.getInput("github_workspace", { required: true });
    const version = core.getInput("version", { required: true });
    const payload = github.getPayload();

    const owner = github.getRepo().owner;
    const repo = payload.repository.name;
    const pull_number = github.getPullNumber();
    const mainpr = await github.getPullRequest(pull_number, token);

    if (!(await github.isMerged(mainpr, token))) {
      const message = "Only merged pull requests can be backported.";
      github.createComment(
        { owner, repo, issue_number: pull_number, body: message },
        token
      );
      return;
    }

    const headref = mainpr.head.sha;
    const baseref = mainpr.base.sha;
    const labels = mainpr.labels;
    const reviewers = mainpr.requested_reviewers?.map((r) => r.login) ?? [];

    console.log(`Detected labels on PR: ${labels.map((label) => label.name)}`);

    for (const label of labels) {
      console.log(`Working on label ${label.name}`);

      // we are looking for labels like "backport stable/0.24"
      const match = labelRegExp.exec(label.name);

      if (!match) {
        console.log("Doesn't match expected prefix");
        continue;
      }

      //extract the target branch (e.g. "stable/0.24")
      const target = match[1];
      console.log(`Found target in label: ${target}`);

      try {
        const branchname = `backport-${pull_number}-to-${target}`;

        console.log(`Start backport to ${branchname}`);
        const scriptExitCode = await exec.callBackportScript(
          pwd,
          headref,
          baseref,
          target,
          branchname,
          version
        );

        if (scriptExitCode != 0) {
          const message = composeMessageForBackportScriptFailure(
            target,
            scriptExitCode
          );
          console.error(message);
          await github.createComment(
            { owner, repo, issue_number: pull_number, body: message },
            token
          );
          continue;
        }

        console.info(`Push branch to origin`);
        const pushExitCode = await exec.call(
          `git push --set-upstream origin ${branchname}`
        );
        if (pushExitCode != 0) {
          const message = composeMessageForGitPushFailure(target, pushExitCode);
          console.error(message);
          await github.createComment(
            { owner, repo, issue_number: pull_number, body: message },
            token
          );
          continue;
        }

        console.info(`Create PR for ${branchname}`);
        const { title, body } = composePRContent(
          target,
          mainpr.title,
          pull_number
        );
        const new_pr_response = await github.createPR(
          {
            owner,
            repo,
            title,
            body,
            head: branchname,
            base: target,
            maintainer_can_modify: true,
          },
          token
        );

        if (new_pr_response.status != 201) {
          console.error(JSON.stringify(new_pr_response));
          const message = composeMessageForCreatePRFailed(new_pr_response);
          await github.createComment(
            { owner, repo, issue_number: pull_number, body: message },
            token
          );
          continue;
        }
        const new_pr = new_pr_response.data;

        const review_response = await github.requestReviewers(
          { owner, repo, pull_number: new_pr.number, reviewers },
          token
        );
        if (review_response.status != 201) {
          console.error(JSON.stringify(review_response));
          const message = composeMessageForRequestReviewersFailed(
            review_response,
            target
          );
          await github.createComment(
            { owner, repo, issue_number: pull_number, body: message },
            token
          );
          continue;
        }

        const message = composeMessageForSuccess(new_pr.number, target);
        await github.createComment(
          { owner, repo, issue_number: pull_number, body: message },
          token
        );
      } catch (error) {
        console.error(error.message);
        await github.createComment(
          {
            owner,
            repo,
            issue_number: pull_number,
            body: error.message,
          },
          token
        );
      }
    }
  } catch (error) {
    console.error(error.message);
    core.setFailed(error.message);
  }
}

function composePRContent(
  target: string,
  issue_title: string,
  issue_number: number
): PRContent {
  const title = `[Backport ${target}] ${issue_title}`;
  const body = dedent`# Description
                      Backport of #${issue_number} to \`${target}\`.`;
  return { title, body };
}

function composeMessageForBackportScriptFailure(
  target: string,
  exitcode: number
): string {
  //TODO better error messages depending on exit code
  return dedent`Backport failed for ${target} with exitcode ${exitcode}`;
}

function composeMessageForGitPushFailure(
  target: string,
  exitcode: number
): string {
  //TODO better error messages depending on exit code
  return dedent`Git push to origin failed for ${target} with exitcode ${exitcode}`;
}

function composeMessageForCreatePRFailed(
  response: CreatePullRequestResponse
): string {
  return dedent`Backport branch created but failed to create PR. 
                Request to create PR rejected with status ${response.status}.

                (see action log for full response)`;
}

function composeMessageForRequestReviewersFailed(
  response: RequestReviewersResponse,
  target: string
): string {
  return dedent`${composeMessageForSuccess(response.data.number, target)}
                But, request reviewers was rejected with status ${
                  response.status
                }.

                (see action log for full response)`;
}

function composeMessageForSuccess(pr_number: number, target: string) {
  return dedent`Successfully created backport PR #${pr_number} for \`${target}\`.`;
}

import * as core from "@actions/core";
import { exec } from "@actions/exec";
import * as github from "@actions/github";
import { EventPayloads } from "@octokit/webhooks";
import {
  OctokitResponse,
  PullsCreateResponseData,
  PullsRequestReviewersResponseData,
} from "@octokit/types";
import dedent from "dedent";
import { resolve } from "path";

const labelRegExp = /^backport ([^ ]+)?$/;

type Comment = {
  owner: string;
  repo: string;
  issue_number: number;
  body: string;
};

type PR = {
  owner: string;
  repo: string;
  title: string;
  body: string;
  head: string;
  base: string;
  maintainer_can_modify: boolean;
};

type PRContent = {
  title: string;
  body: string;
};

type ReviewRequest = {
  owner: string;
  repo: string;
  pull_number: number;
  reviewers?: string[];
};

async function run(): Promise<void> {
  try {
    const token = core.getInput("github_token", { required: true });
    const pwd = core.getInput("github_workspace", { required: true });
    const version = core.getInput("version", { required: true });
    const payload = github.context
      .payload as EventPayloads.WebhookPayloadPullRequest;

    const owner = github.context.repo.owner;
    const repo = payload.repository.name;

    const pr = payload.pull_request;
    const headref = pr.head.sha;
    const baseref = pr.base.sha;
    const labels = pr.labels;
    const reviewers = pr.requested_reviewers.map((r) => r.login);

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
        const branchname = `backport-${pr.number}-to-${target}`;

        console.log(`Start backport to ${branchname}`);
        const exitcode = await callBackportScript(
          pwd,
          headref,
          baseref,
          target,
          branchname,
          version
        );

        if (exitcode != 0) {
          const message = composeMessageForGitFailure(target, exitcode);
          console.error(message);
          await createComment(
            { owner, repo, issue_number: pr.number, body: message },
            token
          );
          continue;
        }

        console.info(`Create PR for ${branchname}`);
        const { title, body } = composePRContent(target, pr.title, pr.number);
        const new_pr_response = await createPR(
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
          await createComment(
            { owner, repo, issue_number: pr.number, body: message },
            token
          );
          continue;
        }
        const new_pr = new_pr_response.data;

        const review_response = await requestReviewers(
          { owner, repo, pull_number: new_pr.number, reviewers },
          token
        );
        if (review_response.status != 201) {
          console.error(JSON.stringify(review_response));
          const message = composeMessageForRequestReviewersFailed(
            review_response,
            target
          );
          await createComment(
            { owner, repo, issue_number: pr.number, body: message },
            token
          );
          continue;
        }

        const message = composeMessageForSuccess(new_pr.number, target);
        await createComment(
          { owner, repo, issue_number: pr.number, body: message },
          token
        );
      } catch (error) {
        console.error(error.message);
        await createComment(
          { owner, repo, issue_number: pr.number, body: error.message },
          token
        );
      }
    }
  } catch (error) {
    console.error(error.message);
    core.setFailed(error.message);
  }
}

async function callBackportScript(
  pwd: string,
  headref: string,
  baseref: string,
  target: string,
  branchname: string,
  version: string
): Promise<number> {
  return exec(
    `/home/runner/work/_actions/zeebe-io/backport-action/${version}/backport.sh`,
    [pwd, headref, baseref, target, branchname],
    {
      listeners: {
        stdout: (data) => console.log(data.toString()),
      },
    }
  );
}

async function createComment(comment: Comment, token: string): Promise<any> {
  console.log(`Create comment: ${comment.body}`);
  return github.getOctokit(token).issues.createComment(comment);
}

async function createPR(
  pr: PR,
  token: string
): Promise<OctokitResponse<PullsCreateResponseData>> {
  console.log(`Create PR: ${pr.body}`);
  return github.getOctokit(token).pulls.create(pr);
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

async function requestReviewers(request: ReviewRequest, token: string) {
  console.log(`Request reviewers: ${request.reviewers}`);
  return github.getOctokit(token).pulls.requestReviewers(request);
}

function composeMessageForGitFailure(target: string, exitcode: number): string {
  //TODO better error messages depending on exit code
  return dedent`Backport failed for ${target} with exitcode ${exitcode}`;
}

function composeMessageForCreatePRFailed(
  response: OctokitResponse<PullsCreateResponseData>
): string {
  return dedent`Backport branch created but failed to create PR. 
                Request to create PR rejected with status ${response.status}.

                (see action log for full response)`;
}

function composeMessageForRequestReviewersFailed(
  response: OctokitResponse<PullsRequestReviewersResponseData>,
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

run();

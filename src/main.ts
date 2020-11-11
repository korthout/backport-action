import * as core from "@actions/core";
import { exec } from "@actions/exec";
import * as github from "@actions/github";
import { EventPayloads } from "@octokit/webhooks";
import { OctokitResponse, PullsCreateResponseData } from "@octokit/types";
import dedent from "dedent";

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

async function run(): Promise<void> {
  try {
    const token = core.getInput("github_token", { required: true });
    const pwd = core.getInput("github_workspace", { required: true });
    const payload = github.context
      .payload as EventPayloads.WebhookPayloadPullRequest;

    const owner = github.context.repo.owner;
    const repo = payload.repository.name;

    const issue_number = payload.pull_request.number;
    const issue_title = payload.pull_request.title;
    const headref = payload.pull_request.head.sha;
    const baseref = payload.pull_request.base.sha;
    const labels = payload.pull_request.labels;

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
        const branchname = `backport-${issue_number}-to-${target}`;

        console.log(`Start backport to ${branchname}`);
        const exitcode = await callBackportScript(
          pwd,
          headref,
          baseref,
          target,
          branchname
        );

        if (exitcode != 0) {
          const message = composeMessageForGitFailure(target, exitcode);
          console.error(message);
          await createComment(
            { owner, repo, issue_number, body: message },
            token
          );
          continue;
        }

        const { title, body } = composePRContent(
          target,
          issue_title,
          issue_number
        );

        console.info(`Create PR for ${branchname}`);
        const response = await createPR(
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

        if (response.status != 201) {
          console.error(JSON.stringify(response));
          const message = composeMessageForCreatePRFailed(response);
          await createComment(
            { owner, repo, issue_number, body: message },
            token
          );
          continue;
        }

        const pr_number = response.data.number;
        const message = `Successfully created backport PR #${pr_number} for \`${target}\`.`;
        await createComment(
          { owner, repo, issue_number, body: message },
          token
        );
      } catch (error) {
        console.error(error.message);
        await createComment(
          { owner, repo, issue_number, body: error.message },
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
  branchname: string
): Promise<number> {
  return exec(`${pwd}/backport.sh`, [headref, baseref, target, branchname], {
    listeners: {
      stdout: (data) => console.log(data.toString()),
    },
  });
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

run();

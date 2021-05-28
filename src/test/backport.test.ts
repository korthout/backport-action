import { mocked } from "ts-jest/utils";
import { PullRequestClosedEvent } from "@octokit/webhooks-types";
import dedent from "dedent";
import { MockedObject } from "ts-jest/dist/utils/testing";

import { Github, GithubApi, PullRequest } from "../github";
import { Backport } from "../backport";
import * as exec from "../exec";

import * as golden from "./constants";

jest.mock("../github");
jest.mock("../exec");
const pwd = "./test/project";
const version = "0.0.2";
const mockedExec = mocked(exec, true);

describe("the backport action", () => {
  let backport: Backport;

  describe("given a payload for a PR without backport label", () => {
    beforeEach(() => {
      backport = new Backport(mockedDefaultGithub, pwd, version);
    });

    it("can be run without impact", async () => {
      await backport.run();
      expect(mockedDefaultGithub.createComment).toHaveBeenCalledTimes(0);
    });
  });

  describe("given a payload for a PR with backport label", () => {
    beforeEach(() => {
      backport = new Backport(
        mockedDefaultGithubWithBackportLabel,
        pwd,
        version
      );
    });

    describe("and backport.sh returns exit code 1", () => {
      beforeEach(() => {
        mockedExec.callBackportScript.mockResolvedValue(1);
      });
      it("comments on failure", async () => {
        await backport.run();
        expect(
          mockedDefaultGithubWithBackportLabel.createComment
        ).toHaveBeenCalledWith({
          owner: "octocat",
          repo: "Hello-World",
          issue_number: 1347,
          body: dedent`Backport failed for \`stable/0.25\`, due to an unknown script error.

                      Please cherry-pick the changes locally.
                      \`\`\`bash
                      git fetch origin stable/0.25
                      git worktree add -d .worktree/backport-1347-to-stable/0.25 origin/stable/0.25
                      cd .worktree/backport-1347-to-stable/0.25
                      git checkout -b backport-1347-to-stable/0.25
                      ancref=$(git merge-base 6dcb09b5b57875f334f61aebed695e2e4193db5e 6dcb09b5b57875f334f61aebed695e2e4193db5e)
                      git cherry-pick -x $ancref..6dcb09b5b57875f334f61aebed695e2e4193db5e
                      \`\`\``,
        });
      });
    });

    describe("and backport.sh returns exit code 5", () => {
      beforeEach(() => {
        mockedExec.callBackportScript.mockResolvedValue(5);
      });
      it("comments on failure", async () => {
        await backport.run();
        expect(
          mockedDefaultGithubWithBackportLabel.createComment
        ).toHaveBeenCalledWith({
          owner: "octocat",
          repo: "Hello-World",
          issue_number: 1347,
          body: dedent`Backport failed for \`stable/0.25\`, because 1 or more of the commits are not available.

                Please cherry-pick the changes locally.
                Note that rebase and squash merges are not supported at this time.
                For more information see https://github.com/zeebe-io/backport-action/issues/46.`,
        });
      });
    });

    describe("and backport.sh returns exit code 0", () => {
      beforeEach(() => {
        mockedExec.callBackportScript.mockResolvedValue(0);
      });
      it("pushes the commits to origin", async () => {
        mockedExec.call.mockResolvedValue(0);
        await backport.run();
        expect(mockedExec.call).toHaveBeenLastCalledWith(
          "git push --set-upstream origin backport-1347-to-stable/0.25"
        );
      });
      it("creates a pull request and requests reviewers", async () => {
        mockedExec.call.mockResolvedValue(0);
        await backport.run();
        expect(
          mockedDefaultGithubWithBackportLabel.createPR
        ).toHaveBeenCalledWith({
          owner: "octocat",
          repo: "Hello-World",
          base: "stable/0.25",
          head: "backport-1347-to-stable/0.25",
          title: "[Backport stable/0.25] Amazing new feature",
          body: dedent`# Description
                  Backport of #1347 to \`stable/0.25\`.`,
          maintainer_can_modify: true,
        });
        expect(
          mockedDefaultGithubWithBackportLabel.requestReviewers
        ).toHaveBeenCalledWith({
          owner: "octocat",
          repo: "Hello-World",
          pull_number: 9000,
          reviewers: ["other_user"],
        });
      });
    });
  });
});

function mockedGithubFactory({
  event,
  pull,
}: {
  event: PullRequestClosedEvent;
  pull: PullRequest;
}): GithubApi {
  const inner: MockedObject<GithubApi> = mocked(new Github(""));
  inner.getRepo.mockReturnValue(golden.repo);
  inner.getPayload.mockReturnValue(event);
  inner.getPullNumber.mockReturnValue(event.pull_request.number);
  inner.getPullRequest.mockResolvedValue(pull);
  inner.isMerged.mockResolvedValue(true);
  inner.createComment.mockResolvedValue({ status: 201 });
  inner.createPR.mockResolvedValue({
    status: 201,
    data: {
      number: 9000,
    },
  });
  inner.requestReviewers.mockResolvedValue({
    status: 201,
    data: {
      number: 9000,
    },
  });
  return inner;
}
const mockedDefaultGithub = mockedGithubFactory({
  event: golden.payloads.default,
  pull: golden.pulls.default(),
});
const mockedDefaultGithubWithBackportLabel = mockedGithubFactory({
  event: golden.payloads.with_backport_label,
  pull: golden.pulls.default_with_backport_label(),
});

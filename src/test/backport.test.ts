import { mocked } from "ts-jest/utils";
import * as core from "@actions/core";

import * as github from "../github";
import * as backport from "../backport";
import * as exec from "../exec";

import * as golden from "./constants";
import dedent from "dedent";

jest.mock("@actions/core");
jest.mock("../github");
jest.mock("../exec");
const mockedCore = mocked(core, true);
const mockedGithub = mocked(github, true);
const mockedExec = mocked(exec, true);

const token = "EB6B2C67-6298-4857-9792-280F293CAAE0";
const pwd = "./test/project";
const version = "0.0.2";

describe("the backport action", () => {
  beforeEach(() => {
    mockedCore.getInput
      .mockReturnValueOnce(token)
      .mockReturnValueOnce(pwd)
      .mockReturnValueOnce(version);
    mockedGithub.getRepo.mockReturnValue(golden.repo);
  });

  describe("given a payload for a PR without backport label", () => {
    beforeEach(() => {
      mockedGithub.getPullNumber.mockReturnValueOnce(
        golden.payloads.default.pull_request.number
      );
      mockedGithub.getPayload.mockReturnValue(golden.payloads.default);
      mockedGithub.getPullRequest.mockResolvedValue(golden.pulls.default());
    });
    it("can be run without impact", async () => {
      await backport.run();
      expect(mockedGithub.createComment).toHaveBeenCalledTimes(0);
    });
  });

  describe("given a payload for a PR with backport label", () => {
    beforeEach(() => {
      mockedGithub.getPullNumber.mockReturnValueOnce(
        golden.payloads.with_backport_label.pull_request.number
      );
      mockedGithub.getPayload.mockReturnValue(
        golden.payloads.with_backport_label
      );
      mockedGithub.getPullRequest.mockResolvedValue(
        golden.pulls.default_with_backport_label()
      );
    });

    describe("and backport.sh returns exit code 1", () => {
      beforeEach(() => {
        mockedExec.callBackportScript.mockResolvedValue(1);
      });
      it("comments on failure", async () => {
        await backport.run();
        expect(mockedGithub.createComment).toHaveBeenCalledWith(
          {
            owner: "octocat",
            repo: "Hello-World",
            issue_number: 1347,
            body: "Backport failed for stable/0.25 with exitcode 1",
          },
          token
        );
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
        mockedGithub.createPR.mockResolvedValue({
          status: 201,
          data: {
            ...golden.pullPayloads.backport_to_stable_0_25(),
            number: 9000,
          },
        });
        mockedGithub.requestReviewers.mockResolvedValue({
          status: 201,
          data: {
            ...golden.pullPayloads.backport_to_stable_0_25(),
            number: 9000,
          },
        });
        await backport.run();
        expect(mockedGithub.createPR).toHaveBeenCalledWith(
          {
            owner: "octocat",
            repo: "Hello-World",
            base: "stable/0.25",
            head: "backport-1347-to-stable/0.25",
            title: "[Backport stable/0.25] Amazing new feature",
            body: dedent`# Description
                  Backport of #1347 to \`stable/0.25\`.`,
            maintainer_can_modify: true,
          },
          token
        );
        expect(mockedGithub.requestReviewers).toHaveBeenCalledWith(
          {
            owner: "octocat",
            repo: "Hello-World",
            pull_number: 9000,
            reviewers: ["other_user"],
          },
          token
        );
      });
    });
  });
});

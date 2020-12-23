import { mocked } from "ts-jest/utils";
import * as core from "@actions/core";

import * as github from "../github";
import * as backport from "../backport";
import * as exec from "../exec";

import * as golden from "./constants";

jest.mock("@actions/core");
jest.mock("../github");
jest.mock("../exec");
const mockedCore = mocked(core, true);
const mockedGithub = mocked(github, true);
const mockedExec = mocked(exec, true);

describe("the backport action", () => {
  beforeEach(() => {
    const token = "EB6B2C67-6298-4857-9792-280F293CAAE0";
    const pwd = "./test/project";
    const version = "0.0.2";
    mockedCore.getInput
      .mockReturnValueOnce(token)
      .mockReturnValueOnce(pwd)
      .mockReturnValueOnce(version);
    mockedGithub.getRepo.mockReturnValue(golden.repo);
  });

  describe("given a payload without backport label", () => {
    beforeEach(() => {
      mockedGithub.getPayload.mockReturnValue(golden.payloads.default);
    });
    it("can be run without impact", async () => {
      await backport.run();
      expect(mockedGithub.createComment.mock.calls.length).toEqual(0);
    });
  });

  describe("given a payload for a pull request with backport label", () => {
    beforeEach(() => {
      mockedGithub.getPayload.mockReturnValue(
        golden.payloads.with_backport_label
      );
    });

    describe("and backport.sh returns exit code 1", () => {
      beforeEach(() => {
        mockedExec.callBackportScript.mockResolvedValue(1);
      });
      it("comments on failure", async () => {
        await backport.run();
        expect(mockedGithub.createComment.mock.calls.length).toEqual(1);
      });
    });

    describe("and backport.sh returns exit code 0", () => {
      beforeEach(() => {
        mockedExec.callBackportScript.mockResolvedValue(0);
      });
      it("creates a pull request and requests reviewers", async () => {
        mockedGithub.createPR.mockResolvedValue({
          status: 201,
          data: golden.pulls.backport_to_stable_0_25,
        });
        mockedGithub.requestReviewers.mockResolvedValue({
          status: 201,
          data: golden.pulls.backport_to_stable_0_25,
        });
        await backport.run();
        expect(mockedGithub.createPR.mock.calls.length).toEqual(1);
        expect(mockedGithub.requestReviewers.mock.calls.length).toEqual(1);
      });
    });
  });
});

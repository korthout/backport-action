/**
 * Github module
 *
 * Used to isolate the boundary between the code of this project and the github
 * actions api. Handy during testing, because we can easily mock this module's
 * functions. Properties are harder to mock, so this module just offers
 * functions to retrieve those properties.
 */

import * as github from "@actions/github";
import { EventPayloads } from "@octokit/webhooks";
import {
  OctokitResponse,
  PullsCreateResponseData,
  PullsRequestReviewersResponseData,
} from "@octokit/types";

export type PullRequestPayload = EventPayloads.WebhookPayloadPullRequest;
export type PullRequest = EventPayloads.WebhookPayloadPullRequestPullRequest;
export type Label = EventPayloads.WebhookPayloadPullRequestLabel;
export type CreatePullRequestResponse = {
  status: number;
  data: {
    number: number;
    requested_reviewers?: { login: string }[];
  };
};
export type RequestReviewersResponse = CreatePullRequestResponse;

export function getRepo() {
  return github.context.repo;
}

export function getPayload() {
  return github.context.payload as PullRequestPayload;
}

export async function createComment(comment: Comment, token: string) {
  console.log(`Create comment: ${comment.body}`);
  return github.getOctokit(token).issues.createComment(comment);
}

export async function createPR(
  pr: PR,
  token: string
): Promise<CreatePullRequestResponse> {
  console.log(`Create PR: ${pr.body}`);
  return github.getOctokit(token).pulls.create(pr);
}

export async function requestReviewers(
  request: ReviewRequest,
  token: string
): Promise<RequestReviewersResponse> {
  console.log(`Request reviewers: ${request.reviewers}`);
  return github.getOctokit(token).pulls.requestReviewers(request);
}

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

type ReviewRequest = {
  owner: string;
  repo: string;
  pull_number: number;
  reviewers: string[];
};

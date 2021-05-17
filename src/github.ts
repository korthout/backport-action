/**
 * Github module
 *
 * Used to isolate the boundary between the code of this project and the github
 * api. Handy during testing, because we can easily mock this module's functions.
 * Properties are harder to mock, so this module just offers functions to retrieve
 * those properties.
 */

import * as github from "@actions/github";
import { WebhookPayload } from "@actions/github/lib/interfaces";

export interface GithubApi {
  getRepo(): { owner: string; repo: string };
  getPayload(): Payload;
  getPullNumber(): number;
  createComment(comment: Comment): Promise<{}>;
  getPullRequest(pull_number: number): Promise<PullRequest>;
  isMerged(pull: PullRequest): Promise<boolean>;
  getLinkedIssues(pull_number: number): Promise<string[]>;
  createPR(pr: CreatePullRequest): Promise<CreatePullRequestResponse>;
  requestReviewers(request: ReviewRequest): Promise<RequestReviewersResponse>;
}

export class Github implements GithubApi {
  #octokit;
  #context;

  constructor(token: string) {
    this.#octokit = github.getOctokit(token);
    this.#context = github.context;
  }

  public getRepo() {
    return this.#context.repo;
  }

  public getPayload() {
    return this.#context.payload;
  }

  public getPullNumber() {
    if (this.#context.payload.pull_request) {
      return this.#context.payload.pull_request.number;
    }

    // if the pr is not part of the payload
    // the number can be taken from the issue
    return this.#context.issue.number;
  }

  public async createComment(comment: Comment) {
    console.log(`Create comment: ${comment.body}`);
    return this.#octokit.issues.createComment(comment);
  }

  public async getPullRequest(pull_number: number) {
    console.log(`Retrieve pull request data for #${pull_number}`);
    return this.#octokit.pulls
      .get({
        ...this.getRepo(),
        pull_number,
      })
      .then((response) => response.data as PullRequest);
  }

  public async isMerged(pull: PullRequest) {
    console.log(`Check whether pull request ${pull.number} is merged`);
    return this.#octokit.pulls
      .checkIfMerged({ ...this.getRepo(), pull_number: pull.number })
      .then(() => true /* status is always 204 */)
      .catch((error) => {
        if (error?.status == 404) return false;
        else throw error;
      });
  }

  public async getLinkedIssues(pull_number: number) {
    return this.#octokit.issues
      .listEvents({ ...this.getRepo(), issue_number: pull_number })
      .then((response) =>
        response.data
          .filter((x) => x.event == `connected`)
          .map((x) => x.issue_url)
      );
  }

  public async createPR(pr: CreatePullRequest) {
    console.log(`Create PR: ${pr.body}`);
    return this.#octokit.pulls.create(pr);
  }

  public async requestReviewers(request: ReviewRequest) {
    console.log(`Request reviewers: ${request.reviewers}`);
    return this.#octokit.pulls.requestReviewers(request);
  }
}

export type PullRequest = {
  number: number;
  title: string;
  head: {
    sha: string;
  };
  base: {
    sha: string;
  };
  labels: {
    name: string;
  }[];
  requested_reviewers: {
    login: string;
  }[];
};
export type CreatePullRequestResponse = {
  status: number;
  data: {
    number: number;
    requested_reviewers?: ({ login: string } | null)[] | null;
  };
};
export type RequestReviewersResponse = CreatePullRequestResponse;

export type Comment = {
  owner: string;
  repo: string;
  issue_number: number;
  body: string;
};

export type CreatePullRequest = {
  owner: string;
  repo: string;
  title: string;
  body: string;
  head: string;
  base: string;
  maintainer_can_modify: boolean;
};

export type ReviewRequest = {
  owner: string;
  repo: string;
  pull_number: number;
  reviewers: string[];
};

type Payload = WebhookPayload;

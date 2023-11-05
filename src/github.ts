/**
 * Github module
 *
 * Used to isolate the boundary between the code of this project and the github
 * api. Handy during testing, because we can easily mock this module's functions.
 * Properties are harder to mock, so this module just offers functions to retrieve
 * those properties.
 */

import * as github from "@actions/github";

export interface GithubApi {
  getRepo(): { owner: string; repo: string };
  getPayload(): Payload;
  getPullNumber(): number;
  createComment(comment: Comment): Promise<{}>;
  getPullRequest(pull_number: number): Promise<PullRequest>;
  isMerged(pull: PullRequest): Promise<boolean>;
  getCommits(pull: PullRequest): Promise<string[]>;
  createPR(pr: CreatePullRequest): Promise<CreatePullRequestResponse>;
  labelPR(pr: number, labels: string[]): Promise<LabelPullRequestResponse>;
  requestReviewers(request: ReviewRequest): Promise<RequestReviewersResponse>;
  setAssignees(pr: number, assignees: string[]): Promise<GenericResponse>;
  setMilestone(pr: number, milestone: number): Promise<GenericResponse>;
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
    return this.#octokit.rest.issues.createComment(comment);
  }

  public async getPullRequest(pull_number: number) {
    console.log(`Retrieve pull request data for #${pull_number}`);
    return this.#octokit.rest.pulls
      .get({
        ...this.getRepo(),
        pull_number,
      })
      .then((response) => response.data as PullRequest);
  }

  public async isMerged(pull: PullRequest) {
    console.log(`Check whether pull request ${pull.number} is merged`);
    return this.#octokit.rest.pulls
      .checkIfMerged({ ...this.getRepo(), pull_number: pull.number })
      .then(() => true /* status is always 204 */)
      .catch((error) => {
        if (error?.status == 404) return false;
        else throw error;
      });
  }

  public async getFirstAndLastCommitSha(
    pull: PullRequest,
  ): Promise<{ firstCommitSha: string; lastCommitSha: string | null }> {
    const commits = await this.getCommits(pull);
    return {
      firstCommitSha: commits[0],
      lastCommitSha: commits.length > 1 ? commits[commits.length - 1] : null,
    };
  }

  public async getCommits(pull: PullRequest) {
    console.log(`Retrieving the commits from pull request ${pull.number}`);

    const commits: string[] = [];

    const getCommitsPaged = (page: number) =>
      this.#octokit.rest.pulls
        .listCommits({
          ...this.getRepo(),
          pull_number: pull.number,
          per_page: 100,
          page: page,
        })
        .then((commits) => commits.data.map((commit) => commit.sha));

    for (let page = 1; page <= Math.ceil(pull.commits / 100); page++) {
      const commitsOnPage = await getCommitsPaged(page);
      commits.push(...commitsOnPage);
    }

    return commits;
  }

  public async createPR(pr: CreatePullRequest) {
    console.log(`Create PR: ${pr.body}`);
    return this.#octokit.rest.pulls.create(pr);
  }

  public async requestReviewers(request: ReviewRequest) {
    console.log(`Request reviewers: ${request.reviewers}`);
    return this.#octokit.rest.pulls.requestReviewers(request);
  }

  public async labelPR(pr: number, labels: string[]) {
    console.log(`Label PR #${pr} with labels: ${labels}`);
    return this.#octokit.rest.issues.addLabels({
      ...this.getRepo(),
      issue_number: pr,
      labels,
    });
  }

  public async setAssignees(pr: number, assignees: string[]) {
    console.log(`Set Assignees ${assignees} to #${pr}`);
    return this.#octokit.rest.issues.addAssignees({
      ...this.getRepo(),
      issue_number: pr,
      assignees,
    });
  }

  public async setMilestone(pr: number, milestone: number) {
    console.log(`Set Milestone ${milestone} to #${pr}`);
    return this.#octokit.rest.issues.update({
      ...this.getRepo(),
      issue_number: pr,
      milestone: milestone,
    });
  }
}

export type PullRequest = {
  number: number;
  title: string;
  body: string | null;
  head: {
    sha: string;
    ref: string;
  };
  base: {
    sha: string;
  };
  user: {
    login: string;
  };
  labels: {
    name: string;
  }[];
  requested_reviewers: {
    login: string;
  }[];
  commits: number;
  milestone: {
    number: number;
    id: number;
    title: string;
  };
  assignees: {
    login: string;
    id: number;
  }[];
  merged_by: {
    login: string;
  };
};
export type CreatePullRequestResponse = {
  status: number;
  data: {
    number: number;
    requested_reviewers?: ({ login: string } | null)[] | null;
  };
};
export type RequestReviewersResponse = CreatePullRequestResponse;

export type GenericResponse = {
  status: number;
};

export type LabelPullRequestResponse = {
  status: number;
};

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

type Payload = {
  repository?: {
    name: string;
  };
};

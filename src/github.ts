/**
 * Github module
 *
 * Used to isolate the boundary between the code of this project and the github
 * api. Handy during testing, because we can easily mock this module's functions.
 * Properties are harder to mock, so this module just offers functions to retrieve
 * those properties.
 */

import * as github from "@actions/github";
export { RequestError } from "@octokit/request-error";

export interface GithubApi {
  getRepo(): Repo;
  getPayload(): Payload;
  getPullNumber(): number;
  createComment(comment: Comment): Promise<{}>;
  getPullRequest(pull_number: number): Promise<PullRequest>;
  isMerged(pull: PullRequest): Promise<boolean>;
  getCommits(pull: PullRequest): Promise<string[]>;
  createPR(pr: CreatePullRequest): Promise<CreatePullRequestResponse>;
  labelPR(
    pr: number,
    labels: string[],
    repo: Repo,
  ): Promise<LabelPullRequestResponse>;
  requestReviewers(request: ReviewRequest): Promise<RequestReviewersResponse>;
  addAssignees(
    pr: number,
    assignees: string[],
    repo: Repo,
  ): Promise<GenericResponse>;
  setMilestone(pr: number, milestone: number): Promise<GenericResponse>;
  mergeStrategy(
    pull: PullRequest,
    merge_commit_sha: string | null,
  ): Promise<string | null>;
  getMergeCommitSha(pull: PullRequest): Promise<string | null>;
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

  public async labelPR(pr: number, labels: string[], repo: Repo) {
    console.log(`Label PR #${pr} with labels: ${labels}`);
    return this.#octokit.rest.issues.addLabels({
      ...repo,
      issue_number: pr,
      labels,
    });
  }

  public async addAssignees(pr: number, assignees: string[], repo: Repo) {
    console.log(`Set Assignees ${assignees} to #${pr}`);
    return this.#octokit.rest.issues.addAssignees({
      ...repo,
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

  /**
   * Retrieves the SHA of the merge commit for a given pull request.
   *
   * After merging a pull request, the `merge_commit_sha` attribute changes depending on how you merged the pull request:
   *
   * - If merged as a merge commit, `merge_commit_sha` represents the SHA of the merge commit.
   * - If merged via a squash, `merge_commit_sha` represents the SHA of the squashed commit on the base branch.
   * - If rebased, `merge_commit_sha` represents the commit that the base branch was updated to.
   *
   * See: https://docs.github.com/en/free-pro-team@latest/rest/pulls/pulls?apiVersion=2022-11-28#get-a-pull-request
   *
   * @param pull - The pull request object.
   * @returns The SHA of the merge commit.
   */
  public async getMergeCommitSha(pull: PullRequest) {
    return pull.merge_commit_sha;
  }

  /**
   * Retrieves a commit from the repository.
   * @param sha - The SHA of the commit to retrieve.
   * @returns A promise that resolves to the retrieved commit.
   */
  public async getCommit(sha: string) {
    const commit = this.#octokit.rest.repos.getCommit({
      ...this.getRepo(),
      ref: sha,
    });
    return commit;
  }

  /**
   * Retrieves the parents of a commit.
   * @param sha - The SHA of the commit.
   * @returns A promise that resolves to the parents of the commit.
   */
  public async getParents(sha: string) {
    const commit = await this.getCommit(sha);
    return commit.data.parents;
  }

  /**
   * Retrieves the pull requests associated with a specific commit.
   * @param sha The SHA of the commit.
   * @returns A promise that resolves to the pull requests associated with the commit.
   */
  public async getPullRequestsAssociatedWithCommit(sha: string) {
    const pr = this.#octokit.rest.repos.listPullRequestsAssociatedWithCommit({
      ...this.getRepo(),
      commit_sha: sha,
    });
    return pr;
  }

  /**
   * Checks if a given SHA is associated with a specific pull request.
   * @param sha - The SHA of the commit.
   * @param pull - The pull request to check against.
   * @returns A boolean indicating whether the SHA is associated with the pull request.
   */
  public async isShaAssociatedWithPullRequest(sha: string, pull: PullRequest) {
    const assoc_pr = await this.getPullRequestsAssociatedWithCommit(sha);
    const assoc_pr_data = assoc_pr.data;
    // commits can be associated with multiple PRs
    // checks if any of the assoc_prs is the same as the pull
    return assoc_pr_data.some((pr) => pr.number == pull.number);
  }

  /**
   * Checks if a commit is a merge commit.
   * @param parents - An array of parent commit hashes.
   * @returns A promise that resolves to a boolean indicating whether the commit is a merge commit.
   */
  public async isMergeCommit(parents: any[]): Promise<boolean> {
    return parents.length > 1;
  }

  /**
   * Checks if a pull request is rebased.
   * @param first_parent_belongs_to_pr - Indicates if the parent belongs to a pull request.
   * @param merge_belongs_to_pr - Indicates if the merge belongs to a pull request.
   * @param pull - The pull request object.
   * @returns A boolean value indicating if the pull request is rebased.
   */
  public async isRebased(
    first_parent_belongs_to_pr: boolean,
    merge_belongs_to_pr: boolean,
    pull: PullRequest,
  ): Promise<boolean> {
    return first_parent_belongs_to_pr && merge_belongs_to_pr;
  }

  /**
   * Checks if a merge commit is squashed.
   * @param first_parent_belongs_to_pr - Indicates if the parent commit belongs to a pull request.
   * @param merge_belongs_to_pr - Indicates if the merge commit belongs to a pull request.
   * @returns A boolean value indicating if the merge commit is squashed.
   */
  public async isSquashed(
    first_parent_belongs_to_pr: boolean,
    merge_belongs_to_pr: boolean,
  ): Promise<boolean> {
    return !first_parent_belongs_to_pr && merge_belongs_to_pr;
  }

  /**
   * Determines the merge strategy used for a given pull request.
   *
   * @param pull - The pull request to analyze.
   * @returns The merge strategy used for the pull request.
   */
  public async mergeStrategy(
    pull: PullRequest,
    merge_commit_sha: string | null,
  ) {
    if (merge_commit_sha == null) {
      console.log(
        "PR was merged without merge_commit_sha unable to detect merge method",
      );
      return MergeStrategy.UNKNOWN;
    }

    const parents = await this.getParents(merge_commit_sha);

    if (await this.isMergeCommit(parents)) {
      console.log("PR was merged using a merge commit");
      return MergeStrategy.MERGECOMMIT;
    }

    // if there is only one commit, it is a rebase OR a squash but we treat it
    // as a squash.
    if (pull.commits == 1) {
      console.log(
        "PR was merged using a squash or a rebase. Choosing squash strategy.",
      );
      return MergeStrategy.SQUASHED;
    }

    // Prepare the data for the rebase and squash checks.
    const first_parent_sha = parents[0].sha;
    const first_parent_belonts_to_pr =
      await this.isShaAssociatedWithPullRequest(first_parent_sha, pull);
    const merge_belongs_to_pr = await this.isShaAssociatedWithPullRequest(
      merge_commit_sha,
      pull,
    );

    // This is the case when the PR is merged using a rebase.
    // and has multiple commits.
    if (
      await this.isRebased(
        first_parent_belonts_to_pr,
        merge_belongs_to_pr,
        pull,
      )
    ) {
      console.log("PR was merged using a rebase");
      return MergeStrategy.REBASED;
    }

    if (
      await this.isSquashed(first_parent_belonts_to_pr, merge_belongs_to_pr)
    ) {
      console.log("PR was merged using a squash");
      return MergeStrategy.SQUASHED;
    }

    return MergeStrategy.UNKNOWN;
  }
}

export enum MergeStrategy {
  SQUASHED = "squashed",
  REBASED = "rebased",
  MERGECOMMIT = "mergecommit",
  UNKNOWN = "unknown",
}

export type Repo = {
  owner: string;
  repo: string;
};

export type PullRequest = {
  number: number;
  title: string;
  body: string | null;
  merge_commit_sha: string | null;
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
  draft: boolean;
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

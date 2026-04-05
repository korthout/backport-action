import type {
  GithubApi,
  PullRequest,
  CreatePullRequest,
  Comment,
  Repo,
  ReviewRequest,
  PullRequestReview,
} from "../../github.js";
import { MergeStrategy, RequestError } from "../../github.js";

function makePullRequest(overrides?: Partial<PullRequest>): PullRequest {
  return {
    number: 42,
    title: "Test PR",
    body: "Test body",
    merge_commit_sha: "abc123",
    head: { ref: "feature-branch", sha: "abc123" },
    base: { sha: "def456" },
    user: { login: "author" },
    labels: [{ name: "backport main" }],
    requested_reviewers: [],
    commits: 1,
    milestone: null,
    assignees: [],
    merged_by: { login: "merger" },
    ...overrides,
  };
}

export interface FakeSourcePr {
  number?: number;
  title?: string;
  body?: string | null;
  labels?: { name: string }[];
  milestone?: { number: number; id: number; title: string } | null;
  assignees?: { login: string; id: number }[] | null;
  user?: { login: string };
  merged_by?: { login: string } | null;
  requested_reviewers?: { login: string }[] | null;
  head?: { ref: string; sha: string };
  base?: { sha: string };
  commitShas?: string[];
  mergeCommitSha?: string;
}

export interface FakeGithubOptions {
  sourcePr?: FakeSourcePr;
  merged?: boolean;
  mergeStrategyResult?: string | null;
  nextPrNumber?: number;
  /** Head branch names for which a PR already exists in the repo. */
  existingPRBranches?: string[];
  /** Reviews submitted on the source PR (used by copy_all_reviewers). */
  reviews?: PullRequestReview[];
}

export class FakeGithub implements GithubApi {
  private _sourcePr: PullRequest;
  private _commitShas: string[];
  private _mergeCommitSha: string | null;
  private _merged: boolean;
  private _mergeStrategyResult: string | null;
  private _nextPrNumber: number;
  private _existingPRBranches: Set<string>;
  private _reviews: PullRequestReview[];

  readonly createdPRs: Array<CreatePullRequest & { number: number }> = [];
  readonly comments: Comment[] = [];
  readonly labelsByPR = new Map<number, string[]>();
  readonly assigneesByPR = new Map<number, string[]>();
  readonly reviewersByPR = new Map<number, string[]>();
  readonly milestonesByPR = new Map<number, number>();
  readonly autoMergeByPR = new Map<number, string>();

  constructor(options?: FakeGithubOptions) {
    const {
      commitShas: shas,
      mergeCommitSha: mcs,
      ...prFields
    } = options?.sourcePr ?? {};
    const commitShas = shas ?? ["abc123"];
    const mergeCommitSha = mcs ?? "abc123";
    this._sourcePr = makePullRequest({
      ...prFields,
      commits: commitShas.length,
      merge_commit_sha: mergeCommitSha,
    });
    this._commitShas = commitShas;
    this._mergeCommitSha = mergeCommitSha;
    this._merged = options?.merged ?? true;
    this._mergeStrategyResult =
      options?.mergeStrategyResult ?? MergeStrategy.SQUASHED;
    this._nextPrNumber = options?.nextPrNumber ?? 100;
    this._existingPRBranches = new Set(options?.existingPRBranches ?? []);
    this._reviews = options?.reviews ?? [];
  }

  getRepo(): Repo {
    return { owner: "test-owner", repo: "test-repo" };
  }

  getPayload() {
    return { repository: { name: "test-repo" } };
  }

  getPullNumber(): number {
    return this._sourcePr.number;
  }

  async getPullRequest(_pull_number: number): Promise<PullRequest> {
    return this._sourcePr;
  }

  async isMerged(_pull: PullRequest): Promise<boolean> {
    return this._merged;
  }

  async getCommits(_pull: PullRequest): Promise<string[]> {
    return this._commitShas;
  }

  async getMergeCommitSha(_pull: PullRequest): Promise<string | null> {
    return this._mergeCommitSha;
  }

  async mergeStrategy(
    _pull: PullRequest,
    _merge_commit_sha: string | null,
  ): Promise<string | null> {
    return this._mergeStrategyResult;
  }

  async createComment(comment: Comment): Promise<{}> {
    this.comments.push(comment);
    return {};
  }

  async createPR(pr: CreatePullRequest) {
    if (this._existingPRBranches.has(pr.head)) {
      throw new RequestError("Validation Failed", 422, {
        request: { method: "POST", url: "", headers: {} },
        response: {
          url: "",
          status: 422,
          headers: {},
          data: {
            errors: [
              {
                message: `A pull request already exists for ${pr.owner}:${pr.head}`,
              },
            ],
          },
        },
      });
    }
    const number = this._nextPrNumber++;
    this.createdPRs.push({ ...pr, number });
    return { status: 201 as const, data: { number } };
  }

  async labelPR(pr: number, labels: string[], _repo: Repo) {
    const existing = this.labelsByPR.get(pr) ?? [];
    this.labelsByPR.set(pr, [...existing, ...labels]);
    return { status: 200 as const };
  }

  async listReviews(_owner: string, _repo: string, _pull_number: number) {
    return { status: 200 as const, data: this._reviews };
  }

  async requestReviewers(request: ReviewRequest) {
    const existing = this.reviewersByPR.get(request.pull_number) ?? [];
    this.reviewersByPR.set(request.pull_number, [
      ...existing,
      ...request.reviewers,
    ]);
    return { status: 201 as const, data: { number: request.pull_number } };
  }

  async addAssignees(pr: number, assignees: string[], _repo: Repo) {
    const existing = this.assigneesByPR.get(pr) ?? [];
    this.assigneesByPR.set(pr, [...existing, ...assignees]);
    return { status: 201 as const };
  }

  async setMilestone(pr: number, milestone: number) {
    this.milestonesByPR.set(pr, milestone);
    return { status: 200 as const };
  }

  async enableAutoMerge(
    pr: number,
    _repo: Repo,
    mergeMethod: "merge" | "squash" | "rebase",
  ) {
    this.autoMergeByPR.set(pr, mergeMethod);
    return { status: 200 as const };
  }
}

import { Dashboard } from "../dashboard";
import { GithubApi, PullRequest } from "../github";
import dedent from "dedent";

const mockGithubApi = {
  getIssues: jest.fn(),
  createIssue: jest.fn(),
  updateIssue: jest.fn(),
  getPullRequest: jest.fn(),
};

describe("Dashboard", () => {
  let dashboard: Dashboard;

  beforeEach(() => {
    dashboard = new Dashboard(mockGithubApi as unknown as GithubApi);
    jest.clearAllMocks();
  });

  const originalPR = {
    number: 123,
    title: "My bug fix",
  } as PullRequest;

  const backportPR = {
    number: 124,
    html_url: "http://github.com/owner/repo/pull/124",
    base: { ref: "branch/x" },
  };

  it("creates a new dashboard with a new entry", async () => {
    mockGithubApi.getIssues.mockResolvedValue([]);

    await dashboard.createOrUpdateDashboard(originalPR, [backportPR]);

    expect(mockGithubApi.createIssue).toHaveBeenCalledWith(
      "Backport Dashboard",
      expect.stringMatching(/## #123 My bug fix\n- `branch\/x`: #124/),
    );
  });

  it("removes older entries that are completed", async () => {
    mockGithubApi.getIssues.mockResolvedValue([
      {
        number: 1,
        title: "Backport Dashboard",
        body: dedent`<!-- VERSION: 1 -->
          This issue lists pull requests...

          ## #100 Old PR
          - \`branch/old\`: #101`,
      },
    ]);

    mockGithubApi.getPullRequest.mockResolvedValue({
      number: 101,
      state: "closed",
    });

    await dashboard.createOrUpdateDashboard(originalPR, [backportPR]);

    expect(mockGithubApi.updateIssue).toHaveBeenCalledWith(
      1,
      expect.not.stringContaining("## #100 Old PR"),
    );
  });

  it("keeps older entries that are still pending", async () => {
    mockGithubApi.getIssues.mockResolvedValue([
      {
        number: 1,
        title: "Backport Dashboard",
        body: dedent`<!-- VERSION: 1 -->
          This issue lists pull requests...

          ## #100 Old PR
          - \`branch/old\`: #101`,
      },
    ]);

    mockGithubApi.getPullRequest.mockResolvedValue({
      number: 101,
      state: "open",
    });

    await dashboard.createOrUpdateDashboard(originalPR, [backportPR]);

    const [issueNumber, updatedBody] = mockGithubApi.updateIssue.mock.lastCall;
    expect(issueNumber).toBe(1);
    expect(updatedBody).toContain("## #100 Old PR");
    expect(updatedBody).toContain("## #123 My bug fix");
  });

  it("adds new backports to existing entries", async () => {
    mockGithubApi.getIssues.mockResolvedValue([
      {
        number: 1,
        title: "Backport Dashboard",
        body: dedent`<!-- VERSION: 1 -->
          This issue lists pull requests...

          ## #123 My bug fix
          - \`branch/x\`: #124`,
      },
    ]);

    mockGithubApi.getPullRequest.mockResolvedValue({
      number: 124,
      state: "open",
    });

    const newBackportPR = {
      number: 125,
      html_url: "http://github.com/owner/repo/pull/125",
      base: { ref: "branch/y" },
    };

    await dashboard.createOrUpdateDashboard(originalPR, [
      backportPR,
      newBackportPR,
    ]);

    const [issueNumber, updatedBody] = mockGithubApi.updateIssue.mock.lastCall;
    expect(issueNumber).toBe(1);
    expect(updatedBody).toContain("- `branch/x`: #124");
    expect(updatedBody).toContain("- `branch/y`: #125");
  });

  it("does not update on unsupported dashboard version", async () => {
    mockGithubApi.getIssues.mockResolvedValue([
      {
        number: 1,
        title: "Backport Dashboard",
        body: dedent`This issue lists pull requests...

          ## #100 Old PR
          - \`branch/old\`: #101 Old PR`,
      },
    ]);

    mockGithubApi.getPullRequest.mockResolvedValue({
      number: 101,
      state: "open",
    });

    await dashboard.createOrUpdateDashboard(originalPR, [backportPR]);

    expect(mockGithubApi.updateIssue).not.toHaveBeenCalled();
  });

  describe("when downstream repo is configured", () => {
    let downstreamDashboard: Dashboard;

    beforeEach(() => {
      downstreamDashboard = new Dashboard(
        mockGithubApi as unknown as GithubApi,
        "downstream-owner",
        "downstream-repo",
      );
    });

    it("renders fully qualified links", async () => {
      mockGithubApi.getIssues.mockResolvedValue([]);

      await downstreamDashboard.createOrUpdateDashboard(originalPR, [
        backportPR,
      ]);

      expect(mockGithubApi.createIssue).toHaveBeenCalledWith(
        "Backport Dashboard",
        expect.stringContaining(
          "- `branch/x`: downstream-owner/downstream-repo#124",
        ),
      );
    });

    it("parses fully qualified links correctly", async () => {
      mockGithubApi.getIssues.mockResolvedValue([
        {
          number: 1,
          title: "Backport Dashboard",
          body: dedent`<!-- VERSION: 1 -->
            This issue lists pull requests...

            ## #123 My bug fix
            - \`branch/x\`: downstream-owner/downstream-repo#124`,
        },
      ]);

      mockGithubApi.getPullRequest.mockResolvedValue({
        number: 124,
        state: "open",
      });

      await downstreamDashboard.createOrUpdateDashboard(originalPR, [
        backportPR,
      ]);

      expect(mockGithubApi.updateIssue).toHaveBeenCalledWith(
        1,
        expect.stringContaining(
          "- `branch/x`: downstream-owner/downstream-repo#124",
        ),
      );
    });
  });
});

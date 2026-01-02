import { Dashboard } from "../dashboard";
import { GithubApi } from "../github";

// Expose private method for testing
class TestableDashboard extends Dashboard {
  public renderDashboardPublic(entries: any[]) {
    // @ts-ignore
    return this.renderDashboard(entries);
  }
}

const mockGithubApi = {} as GithubApi;

describe("Dashboard Rendering", () => {
  let dashboard: TestableDashboard;

  beforeEach(() => {
    dashboard = new TestableDashboard(mockGithubApi);
  });

  it("sanitizes PR titles by replacing newlines with spaces", () => {
    const entries = [
      {
        originalPrNumber: 123,
        originalPrTitle: "Title\nwith\nnewlines",
        backports: [],
      },
    ];

    const rendered = dashboard.renderDashboardPublic(entries);
    expect(rendered).toContain("## #123 Title with newlines");
    expect(rendered).not.toContain("Title\nwith\nnewlines");
  });

  it("escapes backticks in branch names", () => {
    const entries = [
      {
        originalPrNumber: 123,
        originalPrTitle: "Title",
        backports: [
          {
            branch: "branch`with`backticks",
            number: 124,
          },
        ],
      },
    ];

    const rendered = dashboard.renderDashboardPublic(entries);
    // Expect backticks to be escaped: `branch\`with\`backticks`
    // In the rendered markdown list item: - `branch\`with\`backticks`: #124
    expect(rendered).toContain("- `branch\\`with\\`backticks`: #124");
  });

  it("renders standard entries correctly", () => {
    const entries = [
      {
        originalPrNumber: 123,
        originalPrTitle: "Standard Title",
        backports: [
          {
            branch: "feature/branch",
            number: 124,
          },
        ],
      },
    ];

    const rendered = dashboard.renderDashboardPublic(entries);
    expect(rendered).toContain("## #123 Standard Title");
    expect(rendered).toContain("- `feature/branch`: #124");
  });

  it("does not escape already escaped backticks", () => {
    const entries = [
      {
        originalPrNumber: 123,
        originalPrTitle: "Title",
        backports: [
          {
            branch: "branch\\`with\\`escaped",
            number: 124,
          },
        ],
      },
    ];

    const rendered = dashboard.renderDashboardPublic(entries);
    expect(rendered).toContain("- `branch\\`with\\`escaped`: #124");
    expect(rendered).not.toContain("- `branch\\\\`with\\\\`escaped`: #124");
  });

  it("renders a note when there are no entries", () => {
    const entries: any[] = [];
    const rendered = dashboard.renderDashboardPublic(entries);
    expect(rendered).toContain("No active backports.");
  });
});

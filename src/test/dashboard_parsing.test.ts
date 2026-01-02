import { Dashboard } from "../dashboard";
import { GithubApi } from "../github";
import dedent from "dedent";

// Expose private method for testing
class TestableDashboard extends Dashboard {
  public parseDashboardPublic(body: string) {
    // @ts-ignore
    return this.parseDashboard(body);
  }
}

const mockGithubApi = {} as GithubApi;

describe("Dashboard Parsing", () => {
  let dashboard: TestableDashboard;

  beforeEach(() => {
    dashboard = new TestableDashboard(mockGithubApi);
  });

  it("returns undefined for unsupported version", () => {
    const body = dedent`<!-- VERSION: 0 -->
      ## #123 Title
      - \`branch/a\`: #124
    `;

    const entries = dashboard.parseDashboardPublic(body);
    expect(entries).toBeUndefined();
  });

  it("parses a valid dashboard correctly", () => {
    const body = dedent`<!-- VERSION: 1 -->
      Header text...

      ## #123 My PR Title
      - \`branch/a\`: #124
      - \`branch/b\`: owner/repo#125

      ## #456 Another PR
      - \`branch/c\`: #457
    `;

    const entries = dashboard.parseDashboardPublic(body);

    if (entries === undefined) throw new Error("Entries should be defined");
    expect(entries).toHaveLength(2);
    expect(entries[0].originalPrNumber).toBe(123);
    expect(entries[0].originalPrTitle).toBe("My PR Title");
    expect(entries[0].backports).toHaveLength(2);
    expect(entries[0].backports[0]).toEqual({
      branch: "branch/a",
      number: 124,
    });
    expect(entries[0].backports[1]).toEqual({
      branch: "branch/b",
      number: 125,
    });

    expect(entries[1].originalPrNumber).toBe(456);
    expect(entries[1].originalPrTitle).toBe("Another PR");
    expect(entries[1].backports).toHaveLength(1);
    expect(entries[1].backports[0]).toEqual({
      branch: "branch/c",
      number: 457,
    });
  });

  it("ignores malformed headers", () => {
    const body = dedent`<!-- VERSION: 1 -->
      ## # Not a number
      - \`branch/a\`: #124

      ## #123
      - \`branch/b\`: #125

      ## Just text
    `;

    const entries = dashboard.parseDashboardPublic(body);
    expect(entries).toHaveLength(0);
  });

  it("ignores malformed items", () => {
    const body = dedent`<!-- VERSION: 1 -->
      ## #123 Title
      - Not an item
      - \`branch\`: not-a-number
      - \`\`: #124
      - \`branch\`: #
    `;

    const entries = dashboard.parseDashboardPublic(body);
    if (entries === undefined) throw new Error("Entries should be defined");
    expect(entries).toHaveLength(1);
    expect(entries[0].backports).toHaveLength(0);
  });

  it("handles extra whitespace", () => {
    const body = dedent`<!-- VERSION: 1 -->
      
      ## #123   Title with spaces  
      -   \`branch/a\`  :   #124  
    `;

    const entries = dashboard.parseDashboardPublic(body);
    if (entries === undefined) throw new Error("Entries should be defined");
    expect(entries).toHaveLength(1);
    expect(entries[0].originalPrNumber).toBe(123);
    expect(entries[0].originalPrTitle).toBe("Title with spaces");
    expect(entries[0].backports[0]).toEqual({
      branch: "branch/a",
      number: 124,
    });
  });

  it("is robust against markdown injection attempts in parsing", () => {
    const body = dedent`<!-- VERSION: 1 -->
      ## #123 Title with ## inside
      - \`branch with \` inside\`: #124
    `;

    const entries = dashboard.parseDashboardPublic(body);
    if (entries === undefined) throw new Error("Entries should be defined");
    expect(entries).toHaveLength(1);
    expect(entries[0].originalPrNumber).toBe(123);
    expect(entries[0].originalPrTitle).toBe("Title with ## inside");
    expect(entries[0].backports).toHaveLength(1);
    expect(entries[0].backports[0]).toEqual({
      branch: "branch with ` inside",
      number: 124,
    });
  });

  it("is robust against nan", () => {
    const body = dedent`<!-- VERSION: 1 -->
      ## #nan Title with nan
      - \`branch/a\`: #123
      ## #124 Title with entry that has nan
      - \`branch/a\`: #nan
    `;
    const entries = dashboard.parseDashboardPublic(body);
    if (entries === undefined) throw new Error("Entries should be defined");
    expect(entries).toHaveLength(1);
    expect(entries[0].originalPrNumber).toBe(124);
    expect(entries[0].originalPrTitle).toBe("Title with entry that has nan");
    expect(entries[0].backports).toHaveLength(0);
  });
});

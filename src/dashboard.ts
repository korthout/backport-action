import dedent from "dedent";
import { GithubApi, PullRequest, Issue } from "./github";

type BackportEntry = {
  number: number;
  branch: string;
  title: string;
};

type DashboardEntry = {
  originalPrNumber: number;
  originalPrTitle: string;
  backports: BackportEntry[];
};

export class Dashboard {
  private github: GithubApi;
  private static readonly TITLE = "Backport Dashboard";
  private static readonly HEADER = dedent`# ${Dashboard.TITLE}

    This issue lists pull requests that have been backported by [backport-action](https://github.com/korthout/backport-action) that have not been merged yet.`;

  constructor(github: GithubApi) {
    this.github = github;
  }

  public async createOrUpdateDashboard(
    originalPR: PullRequest,
    backportPRs: { number: number; html_url: string; base: { ref: string } }[],
  ): Promise<void> {
    console.log(`Updating Backport Dashboard for #${originalPR.number}`);
    const issue = await this.findDashboardIssue();
    if (issue) {
      console.log(`Found existing dashboard issue #${issue.number}`);
    } else {
      console.log(
        "No existing dashboard issue found, will create a new one at the end.",
      );
    }

    let body = issue ? (issue.body ?? "") : Dashboard.HEADER;

    // Parse existing body
    const entries = this.parseDashboard(body);

    // Check status of all backports in the dashboard
    console.log(`Checking status of backports in ${entries.length} entries`);

    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      const activeBackports: BackportEntry[] = [];

      for (const bpr of entry.backports) {
        const pr = await this.github.getPullRequest(bpr.number);
        if (pr.state === "open") {
          activeBackports.push(bpr);
          console.log(
            `Original PR #${entry.originalPrNumber} still has active backports, keeping it in the dashboard`,
          );
        } else {
          console.log(`Backport #${bpr.number} is closed or merged`);
        }
      }

      if (activeBackports.length === 0) {
        console.log(
          `All backports for #${entry.originalPrNumber} are closed or merged, removing entry`,
        );
        entries.splice(i, 1);
      }
    }

    // Find or create entry for originalPR
    let prEntry = entries.find((e) => e.originalPrNumber === originalPR.number);
    if (!prEntry) {
      prEntry = {
        originalPrNumber: originalPR.number,
        originalPrTitle: originalPR.title,
        backports: [],
      };
      entries.push(prEntry);
    }

    // Add new backports
    for (const bpr of backportPRs) {
      if (
        !prEntry.backports.some((existing) => existing.number === bpr.number)
      ) {
        console.log(
          `Tracking backport #${bpr.number} for original PR #${originalPR.number}`,
        );
        prEntry.backports.push({
          number: bpr.number,
          branch: bpr.base.ref,
          title: originalPR.title,
        });
      }
    }

    // Reconstruct body
    const newBody = this.renderDashboard(entries);

    try {
      if (issue) {
        if (issue.body !== newBody) {
          console.info(`Updating dashboard issue #${issue.number}`);
          await this.github.updateIssue(issue.number, newBody);
        } else {
          console.log(`Dashboard issue #${issue.number} is up to date`);
        }
      } else {
        console.info("Creating new dashboard issue");
        await this.github.createIssue(Dashboard.TITLE, newBody);
      }
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("Resource not accessible by integration")
      ) {
        console.error(
          "Failed to create or update the dashboard issue. " +
            "Please ensure that the 'issues: write' permission is enabled in your workflow.",
        );
      }
      throw error;
    }
  }

  private async findDashboardIssue(): Promise<Issue | undefined> {
    const issues = await this.github.getIssues(Dashboard.TITLE);
    // Filter by exact title match to be safe
    return issues.find((i) => i.title === Dashboard.TITLE);
  }

  private parseDashboard(body: string): DashboardEntry[] {
    const entries: DashboardEntry[] = [];
    const lines = body.split("\n");
    let currentEntry: DashboardEntry | null = null;

    const sectionRegex = /^## #(\d+) (.*)$/;
    const itemRegex = /^- `(.*)`: #(\d+) (.*)$/;

    for (const line of lines) {
      const sectionMatch = line.match(sectionRegex);
      if (sectionMatch) {
        currentEntry = {
          originalPrNumber: parseInt(sectionMatch[1], 10),
          originalPrTitle: sectionMatch[2],
          backports: [],
        };
        entries.push(currentEntry);
        continue;
      }

      const itemMatch = line.match(itemRegex);
      if (itemMatch && currentEntry) {
        currentEntry.backports.push({
          branch: itemMatch[1],
          number: parseInt(itemMatch[2], 10),
          title: itemMatch[3],
        });
      }
    }
    return entries;
  }

  private renderDashboard(entries: DashboardEntry[]): string {
    let body = Dashboard.HEADER;
    for (const entry of entries) {
      body += `\n## #${entry.originalPrNumber} ${entry.originalPrTitle}\n`;
      for (const bpr of entry.backports) {
        body += `- \`${bpr.branch}\`: #${bpr.number} ${bpr.title}\n`;
      }
    }
    return body;
  }
}

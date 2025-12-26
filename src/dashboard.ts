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
    const issue = await this.findDashboardIssue();
    let body = issue ? (issue.body ?? "") : Dashboard.HEADER;

    // Parse existing body
    const entries = this.parseDashboard(body);

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
        prEntry.backports.push({
          number: bpr.number,
          branch: bpr.base.ref,
          title: originalPR.title,
        });
      }
    }

    // Check status of all backports in this entry
    const activeBackports: BackportEntry[] = [];
    for (const bpr of prEntry.backports) {
      const pr = await this.github.getPullRequest(bpr.number);
      if (!(await this.github.isMerged(pr))) {
        activeBackports.push(bpr);
      }
    }
    prEntry.backports = activeBackports;

    // If no backports left, remove the entry
    if (prEntry.backports.length === 0) {
      const index = entries.indexOf(prEntry);
      if (index > -1) {
        entries.splice(index, 1);
      }
    }

    // Reconstruct body
    const newBody = this.renderDashboard(entries);

    if (issue) {
      if (issue.body !== newBody) {
        await this.github.updateIssue(issue.number, newBody);
      }
    } else {
      if (entries.length > 0) {
        await this.github.createIssue(Dashboard.TITLE, newBody);
      }
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

import dedent from "dedent";
import { GithubApi, PullRequest, Issue } from "./github";

type BackportEntry = {
  number: number;
  branch: string;
};

type DashboardEntry = {
  originalPrNumber: number;
  originalPrTitle: string;
  backports: BackportEntry[];
};

export class Dashboard {
  private github: GithubApi;
  private static readonly TITLE = "Backport Dashboard";
  private static readonly HEADER = dedent`\
    <!-- VERSION: 1 -->
    This issue lists pull requests that have been backported by \
    [backport-action](https://github.com/korthout/backport-action). \
    The action automatically adds newly created backports. \
    Pull requests where all backports are merged or closed are \
    automatically removed from this list on subsequent runs. \
    This allows maintainers to keep track of backports that still need \
    attention.

    > [!NOTE]
    > Please do not edit this issue manually unless you need to resolve \
    any issues. The action uses the issue as a data store. Additionally, \
    please note that this dashboard is an experimental feature. If you \
    notice any mistakes or problems, please report them in \
    [the action's repo](https://github.com/korthout/backport-action/issues).
    
    ---
    `;

  private downstreamOwner?: string;
  private downstreamRepo?: string;

  constructor(
    github: GithubApi,
    downstreamOwner?: string,
    downstreamRepo?: string,
  ) {
    this.github = github;
    this.downstreamOwner = downstreamOwner;
    this.downstreamRepo = downstreamRepo;
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

    const body = issue ? (issue.body ?? "") : Dashboard.HEADER;

    // Parse existing body
    const entries = this.parseDashboard(body);

    if (!entries) {
      console.log("Unsupported dashboard version detected, skipping update.");
      return;
    }

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
    const issues = await this.github.getIssues(Dashboard.TITLE, [
      "is:open",
      "sort:created-asc",
    ]);
    // Filter by exact title match to be safe
    return issues.find((i) => i.title === Dashboard.TITLE);
  }

  /**
   * The parser logic is robust against malformed entries.
   * Such entries are simply ignored.
   * Anything unrelated to the expected dashboard data is also ignored.
   * If the body is completely malformed (e.g., unsupported version), undefined is returned.
   */
  private parseDashboard(body: string): DashboardEntry[] | undefined {
    const entries: DashboardEntry[] = [];
    const lines = body.split("\n");

    if (lines.length === 0) {
      console.log("Dashboard body is empty, no entries parsed.");
      return entries;
    }

    const versionRegex = /<!-- VERSION: (\d+) -->/;
    const versionMatch = lines[0].match(versionRegex);
    const version = versionMatch ? parseInt(versionMatch[1], 10) : 0;
    if (isNaN(version) || version < 1) {
      console.log(`Unsupported dashboard version ${version} detected.`);
      return undefined;
    }

    let currentEntry: DashboardEntry | null = null;

    for (const line of lines) {
      const trimmedLine = line.trim();

      // Parse Original PR: "## #<number> <title>"
      if (trimmedLine.startsWith("## #")) {
        const spaceIndex = trimmedLine.indexOf(" ", 4);
        // If no space found, it might be "## #123" (empty title)
        // But we require a title in the format usually.
        // Let's be strict: require space.
        if (spaceIndex === -1) continue;

        const numberStr = trimmedLine.substring(4, spaceIndex);
        const number = parseInt(numberStr, 10);
        if (isNaN(number)) continue;

        const title = trimmedLine.substring(spaceIndex + 1).trim();
        // We allow empty title if it was just whitespace

        currentEntry = {
          originalPrNumber: number,
          originalPrTitle: title,
          backports: [],
        };
        entries.push(currentEntry);
        continue;
      }

      // Parse Item: "- `<branch>`: <link>"
      if (trimmedLine.startsWith("-") && currentEntry) {
        const firstBacktick = trimmedLine.indexOf("`");
        if (firstBacktick === -1) continue;

        // Ensure only spaces between dash and backtick
        if (trimmedLine.substring(1, firstBacktick).trim().length !== 0)
          continue;

        const colonIndex = trimmedLine.indexOf(":", firstBacktick + 1);
        if (colonIndex === -1) continue;

        const preColonPart = trimmedLine.substring(
          firstBacktick + 1,
          colonIndex,
        );
        const lastBacktickIndex = preColonPart.lastIndexOf("`");
        if (lastBacktickIndex === -1) continue;

        // Ensure only spaces between last backtick and colon
        if (preColonPart.substring(lastBacktickIndex + 1).trim().length !== 0)
          continue;

        const branch = preColonPart.substring(0, lastBacktickIndex);
        if (branch.length === 0) continue;

        const rest = trimmedLine.substring(colonIndex + 1).trim();

        // Find the last '#' to handle both "#123" and "owner/repo#123"
        const hashIndex = rest.lastIndexOf("#");
        if (hashIndex === -1) continue;

        const numberStr = rest.substring(hashIndex + 1);
        const numberMatch = numberStr.match(/^(\d+)/);
        if (!numberMatch) continue;

        const number = parseInt(numberMatch[1], 10);
        if (Number.isNaN(number)) continue;

        currentEntry.backports.push({
          branch,
          number,
        });
      }
    }
    return entries;
  }

  private renderDashboard(entries: DashboardEntry[]): string {
    let body = Dashboard.HEADER;

    if (entries.length === 0) {
      body += "\nNo active backports.\n";
      return body;
    }

    for (const entry of entries) {
      const sanitizedTitle = entry.originalPrTitle.replace(/\n/g, " ");
      body += `\n## #${entry.originalPrNumber} ${sanitizedTitle}\n`;
      for (const bpr of entry.backports) {
        const sanitizedBranch = bpr.branch.replace(/(\\)?`/g, (match, p1) => {
          return p1 ? match : "\\`";
        });
        const link =
          this.downstreamOwner && this.downstreamRepo
            ? `${this.downstreamOwner}/${this.downstreamRepo}#${bpr.number}`
            : `#${bpr.number}`;
        body += `- \`${sanitizedBranch}\`: ${link}\n`;
      }
    }
    return body;
  }
}

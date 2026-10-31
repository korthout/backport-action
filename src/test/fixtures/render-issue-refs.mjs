// Renders the markdown of each case in issue-refs.json with GitHub, and stores the issues and pull requests GitHub
// links in it as the case's `github` value: `#123` in the fixture's repository, otherwise `owner/repo#123`.
//
// Run it after adding a case, or to find out whether GitHub changed how it links references:
//   node src/test/fixtures/render-issue-refs.mjs
// It prints each case whose value changed. Requires the GitHub CLI (gh), logged in.
import { execFile } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { promisify } from "node:util";

const file = new URL("./issue-refs.json", import.meta.url);
const fixture = JSON.parse(readFileSync(file, "utf8"));
const run = promisify(execFile);

async function render(markdown) {
  const { stdout } = await run("gh", [
    "api",
    "--method=POST",
    "/markdown",
    "--field=mode=gfm",
    `--field=context=${fixture.repository}`,
    `--raw-field=text=${markdown}`,
  ]);
  return stdout;
}

/** @returns The issue links in the html, as GitHub writes them */
function issueRefs(html) {
  const refs = [];
  for (const [anchor] of html.matchAll(/<a [^>]*class="issue-link[^>]*>/g)) {
    const href =
      /href="https:\/\/github\.com\/([^/"]+\/[^/"]+)\/(?:issues|pull)\/(\d+)/.exec(
        anchor,
      );
    if (href === null) throw new Error(`Unexpected issue link: ${anchor}`);
    const [, repo, number] = href;
    const ref =
      repo.toLowerCase() === fixture.repository.toLowerCase()
        ? `#${number}`
        : `${repo}#${number}`;
    if (!refs.includes(ref)) refs.push(ref);
  }
  return refs;
}

// one at a time, because GitHub rate limits concurrent requests
for (const c of fixture.cases) {
  const github = issueRefs(await render(c.markdown));
  if (JSON.stringify(github) !== JSON.stringify(c.github)) {
    console.log(
      `${c.name}: ${JSON.stringify(c.github)} -> ${JSON.stringify(github)}`,
    );
    c.github = github;
  }
}
writeFileSync(file, JSON.stringify(fixture, null, 2) + "\n");

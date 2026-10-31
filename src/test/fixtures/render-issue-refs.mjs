// Renders each Markdown key of issue-refs.json as GitHub renders the original
// pull request's description (`body_html`), and stores the HTML as its value.
// Pass Markdown as arguments to add cases. Needs an authenticated `gh` CLI.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const file = new URL("issue-refs.json", import.meta.url);
const fixtures = JSON.parse(readFileSync(file, "utf8"));
for (const markdown of [...Object.keys(fixtures), ...process.argv.slice(2)]) {
  fixtures[markdown] = execFileSync("gh", ["api", "/markdown", "--input", "-"], {
    encoding: "utf8",
    input: JSON.stringify({
      text: markdown,
      mode: "gfm",
      context: "korthout/backport-action",
    }),
  });
}
writeFileSync(file, `${JSON.stringify(fixtures, null, 2)}\n`);

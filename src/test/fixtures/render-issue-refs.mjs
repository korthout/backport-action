// Renders the markdown of each case in issue-refs.json as GitHub renders the
// original pull request's description (`body_html`), and stores it as the
// case's html. Needs an authenticated `gh` CLI.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const file = new URL("issue-refs.json", import.meta.url);
const cases = JSON.parse(readFileSync(file, "utf8"));
for (const testCase of Object.values(cases)) {
  testCase.html = execFileSync("gh", ["api", "/markdown", "--input", "-"], {
    encoding: "utf8",
    input: JSON.stringify({
      text: testCase.markdown,
      mode: "gfm",
      context: "korthout/backport-action",
    }),
  });
}
writeFileSync(file, `${JSON.stringify(cases, null, 2)}\n`);

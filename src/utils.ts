import { PullRequest } from "./github";

/**
 * @param template The template potentially containing placeholders
 * @param main The main pull request that is backported
 * @param target The target branchname
 * @returns Description that can be used in the backport pull request
 */
export function replacePlaceholders(
  template: string,
  main: Pick<PullRequest, "body" | "user" | "number" | "title">,
  target: string,
): string {
  const issues = getMentionedIssueRefs(main.body);
  return template
    .replace("${pull_author}", main.user.login)
    .replace("${pull_number}", main.number.toString())
    .replace("${pull_title}", main.title)
    .replace("${pull_description}", main.body ?? "")
    .replace("${target_branch}", target)
    .replace("${issue_refs}", issues.join(" "));
}

/**
 * @param body Text in which to search for mentioned issues
 * @returns All found mentioned issues as GitHub issue references
 */
export function getMentionedIssueRefs(body: string | null): string[] {
  const issueUrls =
    body?.match(patterns.url.global)?.map((url) => toRef(url)) ?? [];
  const issueRefs = body?.match(patterns.ref) ?? [];
  return issueUrls.concat(issueRefs).map((ref) => ref.trim());
}

const patterns = {
  // matches urls to github issues at start, middle, end of line as individual word
  // may be lead and trailed by whitespace which should be trimmed
  // captures the `org`, `repo` and `number` of the issue
  // https://regex101.com/r/XKRl8q/5
  url: {
    global:
      /(?:^| )(?:(?:https:\/\/)?(?:www\.)?github\.com\/(?<org>[^ \/\n]+)\/(?<repo>[^ \/\n]+)\/issues\/(?<number>[1-9][0-9]*)(?:\/)?)(?: |$)/gm,
    first:
      /(?:^| )(?:(?:https:\/\/)?(?:www\.)?github\.com\/(?<org>[^ \/\n]+)\/(?<repo>[^ \/\n]+)\/issues\/(?<number>[1-9][0-9]*)(?:\/)?)(?: |$)/m,
  },

  // matches `#123` at start, middle, end of line as individual word
  // may be lead and trailed by whitespace which should be trimmed
  // captures `number` of the issue (and optionally the `org` and `repo`)
  // https://regex101.com/r/2gAB8O/2
  ref: /(?:^| )((?<org>[^\n #\/]+)\/(?<repo>[^\n #\/]+))?#(?<number>[1-9][0-9]*)(?: |$)/gm,
};

const toRef = (url: string) => {
  // matchAll is not yet available to directly access the captured groups of all matches
  // so this maps the urls to GitHub refs by matching again without the global flag
  const result = patterns.url.first.exec(url);
  if (!result) {
    console.error(
      `Expected to transform url (${url}) to GitHub reference, but it did not match pattern`,
    );
    return "";
  }
  const [, org, repo, number] = result;
  return `${org}/${repo}#${number}`;
};

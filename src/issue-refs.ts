import type { Repo } from "./github.js";
import { visibleText } from "./markdown.js";

// Finds the references to issues and pull requests in a pull request description, as written there.
//
// Markdown decides where a reference counts (markdown.ts): in the visible text. So a reference in a comment doesn't count.
// A reference is matched as written: an html entity like `&#35;1` isn't one.

/**
 * @param body The description of the original pull request
 * @param repo The repository of the original pull request, to which a bare reference like `#123` refers
 * @returns Each issue and pull request referred to in the description once, in the order first found, as first written
 *   in full: a url as `owner/repo#123`, any other reference as is
 */
export function getMentionedIssueRefs(
  body: string | null,
  repo: Repo,
): string[] {
  const refs = new Map<string, string>();
  for (const text of visibleText(body ?? "")) {
    for (const { 0: written, groups = {} } of text.matchAll(reference)) {
      addRef(refs, written, groups, repo);
    }
  }
  return [...refs.values()];
}

function addRef(
  refs: Map<string, string>,
  written: string,
  groups: Record<string, string | undefined>,
  repo: Repo,
) {
  const number =
    groups.urlNumber ?? groups.fullNumber ?? groups.number ?? groups.ghNumber;
  if (number === undefined) return; // a link that isn't to an issue or pull request
  const issueRepo =
    groups.urlRepo ?? groups.fullRepo ?? `${repo.owner}/${repo.repo}`;
  // the same issue can be written differently, also as a bare reference to `repo`
  const key = `${issueRepo}#${number}`.toLowerCase();
  const ref = groups.urlRepo ? `${groups.urlRepo}#${number}` : written;
  // a reference written in full replaces a bare one, because it keeps referring to `repo` when the backport pull request
  // is in another repository
  const first = refs.get(key);
  if (
    first === undefined ||
    (!isWrittenInFull(first) && isWrittenInFull(ref))
  ) {
    refs.set(key, ref);
  }
}

/** Written in full is `owner/repo#123`, also for a url, unlike a bare `#123` or `GH-123` */
function isWrittenInFull(ref: string): boolean {
  return ref.includes("/");
}

// github.com/owner/repo/issues/123 or /pull/123, optionally followed by `/`
const issueUrl = String.raw`(?:www\.)?github\.com\/(?<urlRepo>[\w-]+\/[\w.-]+)\/(?:issues|pull)\/0*(?<urlNumber>[1-9]\d*)\/?`;

// Each form has its own group names: duplicate named groups aren't needed, and not every Node.js version supports them.
const reference = new RegExp(
  [
    // a url to an issue, optionally with https://, and followed by a query, a fragment or punctuation; a trailing `/` is
    // part of `issueUrl`, so that `(?![\w\/])` doesn't reject it
    String.raw`(?<![\w.\/-])(?:https:\/\/)?${issueUrl}(?![\w\/])`,
    // any other url is a plain link, references inside it aren't references
    String.raw`https?:\/\/[^\s<>]*|www\.[^\s<>]*`,
    String.raw`(?<![\w.\/-])(?<fullRepo>[\w-]+\/[\w.-]+)#0*(?<fullNumber>[1-9]\d*)(?!\w)`,
    String.raw`(?<![\w#&])#0*(?<number>[1-9]\d*)(?!\w)`,
    String.raw`(?<!\w)[Gg][Hh]-0*(?<ghNumber>[1-9]\d*)(?![\w#])`,
  ].join("|"),
  "g",
);

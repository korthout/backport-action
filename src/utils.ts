import { lexer, type Token, type Tokens } from "marked";
import { PullRequest } from "./github.js";

/**
 * @param template The template potentially containing placeholders
 * @param main The main pull request that is backported
 * @param target The target branchname
 * @returns Description that can be used in the backport pull request
 */
export function replacePlaceholders(
  template: string,
  main: Pick<PullRequest, "body" | "user" | "number" | "title" | "base">,
  target: string,
): string {
  const values: Record<string, string> = {
    pull_author: main.user.login,
    pull_number: main.number.toString(),
    pull_title: main.title,
    pull_description: main.body ?? "",
    target_branch: target,
    // parsing a long description as Markdown can take seconds
    issue_refs: template.includes("${issue_refs}")
      ? getMentionedIssueRefs(
          main.body,
          `${main.base.repo.owner.login}/${main.base.repo.name}`,
        ).join(" ")
      : "",
  };
  return template.replace(/\$\{(\w+)\}/g, (match, name) =>
    Object.hasOwn(values, name) ? values[name] : match,
  );
}

/**
 * @param body Markdown in which to search for references to issues and pull requests, ignoring those inside code, comments, html and links
 * @param origin The repository (`owner/repo`) of the pull request the body belongs to, which a bare `#N` refers to
 * @returns Each referenced issue or pull request once, in the order first found, as first written,
 *   but a full reference replaces a bare `#N` to the same issue; a URL is written as `owner/repo#N`
 */
export function getMentionedIssueRefs(
  body: string | null,
  origin: string,
): string[] {
  const refs = new Map<string, Reference>();
  for (const ref of findReferences(lexer(body ?? "", { gfm: true }))) {
    const repo = ref.owner ? `${ref.owner}/${ref.repo}` : origin;
    const key = `${repo}#${ref.number}`.toLowerCase();
    // only a full reference still refers to the original repository from a backport in another repository
    if (!refs.has(key) || (ref.owner && !refs.get(key)!.owner)) {
      refs.set(key, ref);
    }
  }
  return [...refs.values()].map((ref) => ref.written);
}

type Reference = {
  owner?: string;
  repo?: string;
  number: string;
  written: string;
};

/** Finds the references in text as Markdown defines it, so not in code, html (including comments), images or link text */
function findReferences(tokens: Token[]): Reference[] {
  return tokens.flatMap((token): Reference[] => {
    switch (token.type) {
      case "text":
        return token.tokens
          ? findReferences(token.tokens)
          : matchReferences(token.raw, [patterns.url, patterns.ref]);
      case "link":
        return token.autolink ? matchReferences(token.raw, [patterns.url]) : [];
      case "list":
        return findReferences(token.items);
      case "table":
        return [token.header, ...token.rows]
          .flat()
          .flatMap((cell: Tokens.TableCell) => findReferences(cell.tokens));
      case "image":
        return [];
      default:
        return "tokens" in token && token.tokens
          ? findReferences(token.tokens)
          : [];
    }
  });
}

function matchReferences(text: string, regexes: RegExp[]): Reference[] {
  return regexes
    .flatMap((regex) =>
      [...text.matchAll(regex)].map((match) => {
        const { owner, repo, number } = match.groups!;
        const written =
          regex === patterns.url ? `${owner}/${repo}#${number}` : match[0];
        return { index: match.index, owner, repo, number, written };
      }),
    )
    .sort((a, b) => a.index - b.index);
}

const patterns = {
  // `github.com/owner/repo/issues/N` or `/pull/N`, optionally with `https://` and `www.`
  url: /(?<![\w./-])(?:https:\/\/)?(?:www\.)?github\.com\/(?<owner>[\w-]+)\/(?<repo>[\w.-]+)\/(?:issues|pull)\/(?<number>[1-9]\d*)\/?(?![\w/])/g,

  // `#N` or `owner/repo#N`; a `#` after `&` starts an html entity like `&#35;`
  ref: /(?<![\w./&-])(?:(?<owner>[\w-]+)\/(?<repo>[\w.-]+))?#(?<number>[1-9]\d*)(?!\w)/g,
};

export function coerceCherryPickingMergeMode(
  raw: string,
): "default" | "whitespace_tolerant" | "invalid" {
  const value = raw === "" ? "default" : raw;
  if (value === "default" || value === "whitespace_tolerant") {
    return value;
  }
  return "invalid";
}

/**
 * Describes commits dropped from a cherry-pick because the target branch
 * already contained them, e.g. "1 commit skipped (target already contains
 * changes)". Shared so both comment styles word it identically.
 */
export function describeSkippedCommits(skippedShas: string[]): string {
  const plural = skippedShas.length === 1 ? "commit" : "commits";
  return `${skippedShas.length} ${plural} skipped (target already contains changes)`;
}

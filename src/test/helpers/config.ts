import type { Config } from "../../backport.js";

export function makeConfig(overrides?: Partial<Config>): Config {
  return {
    pwd: "/tmp",
    source_labels_pattern: new RegExp("^backport ([^ ]+)$"),
    pull: {
      description: "Backport of #${pull_number}",
      title: "[Backport ${target_branch}] ${pull_title}",
      branch_name: "backport-${pull_number}-to-${target_branch}",
    },
    add_labels: [],
    add_reviewers: [],
    add_team_reviewers: [],
    commits: { cherry_picking: "auto", merge_commits: "fail" },
    copy_milestone: false,
    copy_assignees: false,
    copy_requested_reviewers: false,
    copy_all_reviewers: false,
    add_author_as_assignee: false,
    add_author_as_reviewer: false,
    auto_merge_enabled: false,
    auto_merge_method: "merge",
    comment_style: "legacy",
    experimental: { conflict_resolution: "fail" },
    ...overrides,
  };
}

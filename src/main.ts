import * as core from "@actions/core";
import {
  Backport,
  Config,
  experimentalDefaults,
  deprecatedExperimental,
} from "./backport";
import { Github } from "./github";
import { Git } from "./git";
import { execa } from "execa";
import dedent from "dedent";

/**
 * Called from the action.yml.
 *
 * Is separated from backport for testing purposes
 */
async function run(): Promise<void> {
  const token = core.getInput("github_token", { required: true });
  const pwd = core.getInput("github_workspace", { required: true });
  const gitCommitterName = core.getInput("git_committer_name");
  const gitCommitterEmail = core.getInput("git_committer_email");
  const pattern = core.getInput("label_pattern");
  const description = core.getInput("pull_description");
  const title = core.getInput("pull_title");
  const branch_name = core.getInput("branch_name");
  const add_labels = core.getInput("add_labels");
  const copy_labels_pattern = core.getInput("copy_labels_pattern");
  const target_branches = core.getInput("target_branches");
  const cherry_picking = core.getInput("cherry_picking");
  const merge_commits = core.getInput("merge_commits");
  const copy_assignees = core.getInput("copy_assignees");
  const copy_milestone = core.getInput("copy_milestone");
  const copy_requested_reviewers = core.getInput("copy_requested_reviewers");
  const add_author_as_assignee = core.getInput("add_author_as_assignee");
  const enable_auto_merge = core.getInput("enable_auto_merge");
  const auto_merge_enable_label = core.getInput("auto_merge_enable_label");
  const auto_merge_disable_label = core.getInput("auto_merge_disable_label");
  const auto_merge_method = core.getInput("auto_merge_method");
  const experimental = JSON.parse(core.getInput("experimental"));
  const source_pr_number = core.getInput("source_pr_number");

  if (cherry_picking !== "auto" && cherry_picking !== "pull_request_head") {
    const message = `Expected input 'cherry_picking' to be either 'auto' or 'pull_request_head', but was '${cherry_picking}'`;
    console.error(message);
    core.setFailed(message);
    return;
  }

  if (merge_commits != "fail" && merge_commits != "skip") {
    const message = `Expected input 'merge_commits' to be either 'fail' or 'skip', but was '${merge_commits}'`;
    console.error(message);
    core.setFailed(message);
    return;
  }

  if (
    auto_merge_method !== "merge" &&
    auto_merge_method !== "squash" &&
    auto_merge_method !== "rebase"
  ) {
    const message = `Expected input 'auto_merge_method' to be either 'merge', 'squash', or 'rebase', but was '${auto_merge_method}'`;
    console.error(message);
    core.setFailed(message);
    return;
  }

  for (const key in experimental) {
    if (!(key in experimentalDefaults)) {
      console.warn(dedent`Encountered unexpected key in input 'experimental'.\
        No experimental config options known for key '${key}'.\
        Please check the documentation for details about experimental features.`);
    }

    if (key in deprecatedExperimental) {
      console.warn(dedent`Encountered deprecated key in input 'experimental'.\
        Key '${key}' is no longer used. You should remove it from your workflow.\
        Please check the release notes or the documentation for more details.`);
    }

    if (key == "conflict_resolution") {
      if (
        experimental[key] !== "fail" &&
        experimental[key] !== "draft_commit_conflicts"
      ) {
        const message = `Expected input 'conflict_resolution' to be either 'fail' or 'draft_commit_conflicts', but was '${experimental[key]}'`;
        console.error(message);
        core.setFailed(message);
        return;
      }
    }
  }

  const github = new Github(token);
  const git = new Git(execa, gitCommitterName, gitCommitterEmail);
  const config: Config = {
    pwd,
    source_labels_pattern: pattern === "" ? undefined : new RegExp(pattern),
    pull: { description, title, branch_name },
    copy_labels_pattern:
      copy_labels_pattern === "" ? undefined : new RegExp(copy_labels_pattern),
    add_labels: add_labels === "" ? [] : add_labels.split(/[,]/),
    target_branches: target_branches === "" ? undefined : target_branches,
    commits: { cherry_picking, merge_commits },
    copy_assignees: copy_assignees === "true",
    copy_milestone: copy_milestone === "true",
    copy_requested_reviewers: copy_requested_reviewers === "true",
    add_author_as_assignee: add_author_as_assignee === "true",
    enable_auto_merge: enable_auto_merge === "true",
    auto_merge_enable_label:
      auto_merge_enable_label === "" ? undefined : auto_merge_enable_label,
    auto_merge_disable_label:
      auto_merge_disable_label === "" ? undefined : auto_merge_disable_label,
    auto_merge_method: auto_merge_method as "merge" | "squash" | "rebase",
    experimental: { ...experimentalDefaults, ...experimental },
    source_pr_number:
      source_pr_number === "" ? undefined : parseInt(source_pr_number),
  };
  const backport = new Backport(github, config, git);

  return backport.run();
}

// this would be executed on import in a test file
run();

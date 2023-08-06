import * as core from "@actions/core";
import { Backport, Config } from "./backport";
import { Github } from "./github";

/**
 * Called from the action.yml.
 *
 * Is separated from backport for testing purposes
 */
async function run(): Promise<void> {
  const token = core.getInput("github_token", { required: true });
  const pwd = core.getInput("github_workspace", { required: true });
  const pattern = core.getInput("label_pattern");
  const description = core.getInput("pull_description");
  const title = core.getInput("pull_title");
  const copy_labels_pattern = core.getInput("copy_labels_pattern");
  const target_branches = core.getInput("target_branches");
  const default_mainline = core.getInput("default_mainline");

  const config: Config = {
    pwd,
    labels: { pattern: pattern === "" ? undefined : new RegExp(pattern) },
    pull: { description, title },
    copy_labels_pattern:
      copy_labels_pattern === "" ? undefined : new RegExp(copy_labels_pattern),
    target_branches:
      target_branches === "" ? undefined : (target_branches as string),
    default_mainline:
      default_mainline === "" ? undefined : Number(default_mainline),
  };

  // todo: improve config validation
  if (isNaN(config.default_mainline ?? -1)) {
    throw new Error(
      `When defined, \`default_mainline\` must be a number but it was '${default_mainline}''`,
    );
  }

  const github = new Github(token);
  const backport = new Backport(github, config);

  return backport.run();
}

// this would be executed on import in a test file
run();

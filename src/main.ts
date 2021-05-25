import * as core from "@actions/core";
import { Backport } from "./backport";
import { Github } from "./github";

/**
 * Called from the action.yml.
 *
 * Is separated from backport for testing purposes
 */
async function run(): Promise<void> {
  const token = core.getInput("github_token", { required: true });
  const pwd = core.getInput("github_workspace", { required: true });
  const version = core.getInput("version", { required: true });
  const pattern = new RegExp(core.getInput("label_pattern"));

  const github = new Github(token);
  const backport = new Backport(github, { version, pwd, labels: { pattern } });

  return backport.run();
}

// this would be executed on import in a test file
run();

import * as backport from "./backport";

/**
 * Called from the action.yml.
 *
 * Is separated from backport for testing purposes
 */
async function run(): Promise<void> {
  return backport.run();
}

// this would be executed on import in a test file
run();

/**
 * Github module
 *
 * Used to isolate the boundary between the code of this project and the github
 * actions api. Handy during testing, because we can easily mock this module's
 * functions. Properties are harder to mock, so this module just offers
 * functions to retrieve those properties.
 */

import * as github from "@actions/github";
import { EventPayloads } from "@octokit/webhooks";

const getOctokit = github.getOctokit;
const context = github.context;

function getContext() {
  return context;
}

function getPayload() {
  return context.payload as EventPayloads.WebhookPayloadPullRequest;
}

export { getContext, getOctokit, getPayload };

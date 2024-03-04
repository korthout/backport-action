import dedent from "dedent";
import { PushResult } from "./git";

/**
 * Composes a new message, for usage in issue comments.
 *
 * The goal of this method is to provide an error message on best effort.
 * That means it is lenient in case context information is missing.
 * Missing context will simply result in the message missing this data too.
 *
 * @param type Determines which message template is used
 * @param context Provides details of what happened
 * @returns the composed message
 */
function compose(type: MessageType, context: Context): string {
  switch (type) {
    case "failed_to_push":
      const { introduction, failure, action } = composeFailedToPush(context);
      return dedent`\
        ${introduction} ${failure}
  
        ${action}`;
    default:
      throw new Error(dedent`\
        Expected to compose a comment, but message type '${type}' is unknown. \
        Please report this bug.`);
  }
}

const PAT_DOCS_URL =
  "https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens";

function composeFailedToPush(context: Context) {
  const introduction = dedent`\
    [Backport-action](https://github.com/korthout/backport-action) \
    failed to backport this pull request in workflow run: \
    [${context.run_id}](${context.run_url}).`;

  const attempt = `Tried to push branch \`${context.target}\``;

  switch (context.push_result) {
    case PushResult.permission_denied: {
      return {
        introduction,
        failure: `${attempt}, but not permitted to push to this repo.`,
        action: dedent`
          You can use a [Personal Access Token](${PAT_DOCS_URL}) (PAT) with \
          \`repo\` scope as the \`token\` input for the \
          [actions/checkout-action](https://github.com/actions/checkout) step \
          to permit pushing to the repo.`,
      };
    }
    default: {
      return {
        introduction,
        failure: `${attempt}, but failed for an unknown reason.`,
        action: "Please check the logs.",
      };
    }
  }
}

export const comments = {
  compose,
};

export enum MessageType {
  failed_to_push = "failed_to_push",
}

type Context = Partial<{
  run_id: number;
  run_url: string;
  push_result: PushResult;
  target: string;
}>;

import * as matchers from "jest-extended";
expect.extend(matchers);

import { comments, MessageType } from "../comments";
import dedent from "dedent";
import { PushResult } from "../git";

describe("comments.compose", () => {
  const introduction = dedent`\
    [Backport-action](https://github.com/korthout/backport-action) \
    failed to backport this pull request`;

  describe("of type failed_to_push", () => {
    test("should start with standard introduction", () => {
      expect(comments.compose(MessageType.failed_to_push, {})).toStartWith(
        introduction,
      );
    });

    test("should link to workflow run", () => {
      expect(
        comments.compose(MessageType.failed_to_push, {
          run_id: 123,
          run_url: "https://github.com/owner/repo/actions/runs/123",
        }),
      ).toContain(
        "in workflow run: [123](https://github.com/owner/repo/actions/runs/123)",
      );
    });

    test("should say what happened", () => {
      expect(
        comments.compose(MessageType.failed_to_push, {
          target: "target_branch",
        }),
      ).toContain("Tried to push branch `target_branch`");
    });

    describe("should say what went wrong", () => {
      test("on permission denied", () => {
        expect(
          comments.compose(MessageType.failed_to_push, {
            push_result: PushResult.permission_denied,
          }),
        ).toContain("but not permitted to push to this repo");
      });

      test("on unknown failure", () => {
        expect(
          comments.compose(MessageType.failed_to_push, {
            push_result: PushResult.unknown_failure,
          }),
        ).toContain("but failed for an unknown reason");
      });
    });

    describe("should say how to recover", () => {
      test("on permission denied", () => {
        expect(
          comments.compose(MessageType.failed_to_push, {
            push_result: PushResult.permission_denied,
          }),
        ).toContain(dedent`
          You can use a \
          [Personal Access Token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens) \
          (PAT) with \`repo\` scope as the \`token\` input for the \
          [actions/checkout-action](https://github.com/actions/checkout) step \
          to permit pushing to the repo.`);
      });

      test("on unknown failure", () => {
        expect(
          comments.compose(MessageType.failed_to_push, {
            push_result: PushResult.unknown_failure,
          }),
        ).toContain("Please check the logs.");
      });
    });
  });
});

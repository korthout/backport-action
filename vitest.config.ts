import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    root: "src",
    clearMocks: true,
    env: {
      GIT_SILENT: "1",
    },
  },
});

import type { Config } from "jest";

export default {
  testEnvironment: "node",
  transform: {
    "^.+\\.[tj]s$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.test.json" }],
  },
  roots: ["<rootDir>/src"],
  coverageDirectory: "coverage",
  clearMocks: true,
  preset: "ts-jest",
} satisfies Config;

import { vi } from "vitest";
import type { GitApi } from "../../git.js";

export function createMockGit(overrides?: Partial<GitApi>): GitApi {
  return {
    fetch: vi.fn().mockResolvedValue(undefined),
    remoteAdd: vi.fn().mockResolvedValue(undefined),
    findCommitsInRange: vi.fn().mockResolvedValue([]),
    findMergeCommits: vi.fn().mockResolvedValue([]),
    push: vi.fn().mockResolvedValue(0),
    checkout: vi.fn().mockResolvedValue(undefined),
    cherryPick: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

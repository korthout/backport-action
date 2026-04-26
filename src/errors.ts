/**
 * Typed error classes for per-target backport failures.
 *
 * Each subclass carries the structured data the comment formatter (Phase 8a)
 * needs to render actionable recovery instructions for the user.
 */

export class BackportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackportError";
  }
}

export class CheckoutError extends BackportError {
  branch: string;
  commits: string[];

  constructor(message: string, branch: string, commits: string[]) {
    super(message);
    this.name = "CheckoutError";
    this.branch = branch;
    this.commits = commits;
  }
}

export class CherryPickError extends BackportError {
  branch: string;
  commits: string[];

  constructor(message: string, branch: string, commits: string[]) {
    super(message);
    this.name = "CherryPickError";
    this.branch = branch;
    this.commits = commits;
  }
}

export class GitPushError extends BackportError {
  branch: string;
  remote: string;
  exitCode: number;

  constructor(
    message: string,
    branch: string,
    remote: string,
    exitCode: number,
  ) {
    super(message);
    this.name = "GitPushError";
    this.branch = branch;
    this.remote = remote;
    this.exitCode = exitCode;
  }
}

export class CreatePRError extends BackportError {
  status: number;
  responseMessage?: string;

  constructor(message: string, status: number, responseMessage?: string) {
    super(message);
    this.name = "CreatePRError";
    this.status = status;
    this.responseMessage = responseMessage;
  }
}

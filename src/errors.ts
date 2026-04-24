export class BackportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class CheckoutError extends BackportError {
  branch: string;
  commits: string[];

  constructor(message: string, branch: string, commits: string[]) {
    super(message);
    this.branch = branch;
    this.commits = commits;
  }
}

export class CherryPickError extends BackportError {
  branch: string;
  commits: string[];

  constructor(message: string, branch: string, commits: string[]) {
    super(message);
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
    this.status = status;
    this.responseMessage = responseMessage;
  }
}

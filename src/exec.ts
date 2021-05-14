import { exec } from "@actions/exec";

export async function callBackportScript(
  pwd: string,
  headref: string,
  baseref: string,
  target: string,
  branchname: string,
  version: string
): Promise<number> {
  return exec(
    `/home/runner/work/_actions/zeebe-io/backport-action/${version}/backport.sh`,
    [pwd, headref, baseref, target, branchname],
    {
      listeners: {
        stdout: (data) => console.log(data.toString()),
      },
      ignoreReturnCode: true,
    }
  );
}

export async function call(command: string): Promise<number> {
  return exec(command);
}

import { exec } from "@actions/exec";

export async function performBackport(
  pwd: string,
  headref: string,
  baseref: string,
  target: string,
  branchname: string,
  version: string
) {
  return exec(
    `
    # Make sure the process exits on any failure and output commands
    set -ex

    root=$1
    headref=$2
    baseref=$3
    target=$4
    branchname=$5
    worktree=".worktree/backport-$branchname"

    cd "$root"

    # Check that checkout location is available
    if [ -d "$worktree" ]
    then
      echo "This backport scripts uses $worktree as its worktree, but it already exists
      please remove it 'git worktree remove $worktree' and try again"
      exit 2
    fi

    user_name="github-actions[bot]"
    export GIT_COMMITTER_NAME="$user_name"

    user_email="github-actions[bot]@users.noreply.github.com"
    export GIT_COMMITTER_EMAIL="$user_email"

    git cat-file -t "$headref" || exit 5
    git cat-file -t "$baseref" || exit 6

    echo "Find common ancestor between $baseref and $headref"
    ancref=$(git merge-base "$baseref" "$headref")

    echo "Find commits between common ancestor $ancref and source branch $headref"
    diffrefs=$(git log "$ancref..$headref" --reverse --format="%h")

    echo "Checkout $branchname"
    git worktree add "$worktree" "$target" || exit 2
    cd "$worktree" || exit 2
    git switch --create "$branchname" || exit 3

    echo "Cherry pick commits between $ancref and $headref to $target"
    echo "$diffrefs" | xargs git cherry-pick -x || exit 4

    exit 0
  `,
    [pwd, headref, baseref, target, branchname],
    {
      listeners: {
        stdout: (data) => console.log(data.toString()),
      },
      ignoreReturnCode: true,
    }
  );
}

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

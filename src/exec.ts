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
    getBackportScript(pwd, headref, baseref, target, branchname),
    [],
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

/**
 * Returns a shell script that can backport
 * exit codes:
 *   0: all good
 *   1: incorrect usage / this message
 *   2: unable to access worktree directory
 *   3: unable to create new branch
 *   4: unable to cherry-pick commit
 *   5: headref not found
 *   6: baseref not found"
 * @param directory the root of the git repository
 * @param headref refers to the source branch of the merge commit, i.e. PR head
 * @param baseref refers to the target branch of the merge commit, i.e. PR merge target
 * @param target refers to the target to backport onto, e.g. stable/0.24
 * @param branchname is the name of the new branch containing the backport, e.g. backport-x-to-0.24
 * @returns the backport script
 */
export function getBackportScript(
  directory: string,
  headref: string,
  baseref: string,
  target: string,
  branchname: string
): string {
  return `
  # Make sure the process exits on any failure and output commands
  set -x

  root=${directory}
  headref=${headref}
  baseref=${baseref}
  target=${target}
  branchname=${branchname}
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
`;
}

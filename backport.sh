#!/bin/bash

# Make sure the process exits on any failure
set -e

# Check usage
if [ -z "$1" ] | [ -z "$2" ] | [ -z "$3" ] | [ -z "$4" ] | [ -z "$5" ]
then
  echo "Usage: backport.sh directory headref baseref target branchname
  where:
    directory the root of the git repository
    headref refers to the source branch of the merge commit, i.e. PR head
    baseref refers to the target branch of the merge commit, i.e. PR merge target
    target refers to the target to backport onto, e.g. stable/0.24
    branchname is the name of the new branch containing the backport, e.g. backport-x-to-0.24
    
  exit codes:
    0: all good
    1: incorrect usage / this message
    2: unable to access worktree directory
    3: unable to create new branch
    4: unable to cherry-pick commit
    5: unable to push changes"
  exit 1
fi

root=$1
headref=$2
baseref=$3
target=$4
branchname=$5
worktree=".worktree/backport-$branchname"

cd "${root}"

git config --global user.email "github-actions[bot]@users.noreply.github.com"
git config --global user.name "github-actions[bot]"

# Check that checkout location is available
if [ -d "$worktree" ]
then
  echo "This backport scripts uses $worktree as its worktree, but it already exists
  please remove it 'git worktree remove $worktree' and try again"
  exit 2
fi

echo "Find common ancestor between $baseref and $headref"
ancref=$(git merge-base "$baseref" "$headref")

echo "Find commits between common ancestor $ancref and source branch $headref"
diffrefs=$(git log "$ancref..$headref" --reverse --format="%h")

echo "Checkout $branchname"
git worktree add "$worktree" "$target" || exit 2
cd "$worktree" || exit 2
git switch --create "$branchname" || exit 3

echo "Cherry pick commits between $ancref and $headref to $target"
echo "$diffrefs" | xargs git cherry-pick  -x || exit 4

git remote get-url origin

echo "Push results to $branchname"
git push --set-upstream origin "$branchname" || exit 5

exit 0
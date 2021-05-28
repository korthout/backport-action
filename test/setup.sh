#!/bin/bash
# ------------------------------------------------------------------
# Setup test repo to be used to test the backport action
#
# Produces a dir "repo" with history like:
# 
# (cd repo; git log --graph --oneline)
# *-.   071b055 (HEAD -> master, release-2) Merge branches 'feature-b' and 'feature-c'
# |\ \
# | | * fa7b5cd (feature-c) chore: add to c
# | | * 1b3090f feat: add c
# | |/
# |/|
# * |   52241cf (release-1) Merge branch 'feature-a'
# |\ \
# | * | a908d73 (feature-a) feat: add a
# |/ /
# | * 651f859 (feature-b) chore: add to b
# | * f072dc1 chore: add to b
# | * fef5efe feat: add b
# |/
# * 922bcb9 init: add README.md
# ------------------------------------------------------------------

set -e  # Abort script at first error, when a command exits with non-zero status (except in until or while loops, if-tests, list constructs)
# set -u  # Attempt to use undefined variable outputs error message, and forces an exit
# set -x  # Similar to verbose mode (-v), but expands commands
# set -o pipefail  # Causes a pipeline to return the exit status of the last command in the pipe that returned a non-zero return value.

# ------------------------------------------------------------------
# Lock script, to make sure it's only run once
# ------------------------------------------------------------------

SUBJECT=setup-test-repo
LOCK_FILE=/tmp/${SUBJECT}.lock

if [ -f "$LOCK_FILE" ]; then
echo "Script is already running"
exit
fi

# cleanup on exit
trap 'rm -f $LOCK_FILE && cleanup' EXIT
touch $LOCK_FILE 

# -----------------------------------------------------------------
# Script
# -----------------------------------------------------------------

REPOSITORY_NAME="repo"
PWDO="$(pwd)"

cleanup () {
    echo "clean up"
    cd "$PWDO"
    rm -rf ./$REPOSITORY_NAME
};

setup () {
    echo "setup"
    mkdir $REPOSITORY_NAME
    cd $REPOSITORY_NAME

    git init

    echo "[commit]" >> .git/config
    echo "	gpgsign = false" >> .git/config

    name="test-setup[bot]"
    export GIT_AUTHOR_NAME="$name"
    export GIT_COMMITTER_NAME="$name"

    email="test-setup[bot]@users.noreply.github.com"
    export GIT_AUTHOR_EMAIL="$email"
    export GIT_COMMITTER_EMAIL="$email"

    printf "%q" "# Test repository

This repository contains history that can be used to test the
[backport-action](https://github.com/zeebe-io/backport-action).
" >> README.md
    git add README.md
    git commit -m "init: add README.md"

    git branch --create feature-a
    git branch --create feature-b

    addNewFeature "a"
    addNewFeature "b"
    addToFeature "b"

    git switch master
    git merge feature-a --no-edit --no-ff
    git branch --create release-1

    git branch --create feature-c
    
    addToFeature "b"
    addNewFeature "c"
    addToFeature "c"

    git switch master
    git merge feature-b feature-c --no-edit --no-ff
    git branch --create release-2

    # Only remove lock file, but don't cleanup the repo since it was created successfully
    trap 'rm -f $LOCK_FILE' EXIT
}

addNewFeature() {
    name=$1
    git switch feature-"$name"
    echo "This file represents feature $name" >> "$name".feature
    git add "$name".feature
    git commit -m "feat: add $name"
}

addToFeature() {
    name=$1
    git switch feature-"$name"
    echo "This line represents an addition to feature $name" >> "$name".feature
    git add "$name".feature
    git commit -m "chore: add to $name"
}

setup

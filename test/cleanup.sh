#!/bin/bash
# ------------------------------------------------------------------
# [korthout] Removes the test repo, sourced from setup.sh
# ------------------------------------------------------------------

set -e  # Abort script at first error, when a command exits with non-zero status (except in until or while loops, if-tests, list constructs)
# set -u  # Attempt to use undefined variable outputs error message, and forces an exit
# set -x  # Similar to verbose mode (-v), but expands commands
# set -o pipefail  # Causes a pipeline to return the exit status of the last command in the pipe that returned a non-zero return value.

# ------------------------------------------------------------------
# Lock script, to make sure it's only run once
# ------------------------------------------------------------------

SUBJECT=cleanup-test-repo
LOCK_FILE=/tmp/${SUBJECT}.lock

if [ -f "$LOCK_FILE" ]; then
echo "Script is already running"
exit
fi

trap 'rm -f $LOCK_FILE' EXIT
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

cleanup

# Testing

This folder contains integration-style tests.
They are run against an actual git repository.

## Tests

At this time the `acceptance.test.ts` contain the only integration-style tests.
It runs the `backport.sh` script against the test git repository and verifies that the correct commits are cherry picked to the backport branch.

## Setup

The git repository is created using a `setup.sh` script.
Running it will create a new directory named `repo` containing a git history that is useful for the tests.

First run: `./setup.sh`, and then: `(cd repo; git log --graph --oneline)`.
The created repo then looks like this:

```
*-.   9eb963e (HEAD -> master, release-2) Merge branches 'feature-b' and 'feature-c'
|\ \
| | * 4e2abaa (feature-c) chore: add to c
| | * e5a330b feat: add c
| |/
|/|
* |   b840dd0 (release-1) Merge branch 'feature-a'
|\ \
| * | f416144 (feature-a) feat: add a
|/ /
| * 3d0a6d1 (feature-b) chore: add to b
| * fb01d91 chore: add to b
| * 09d9eed feat: add b
|/
* c23161f init: add README.md
```

## Cleanup

You can clean up the test git repository using `(cd test; ./cleanup.sh)`.
This cleanup script is also used in the automated acceptance tests.

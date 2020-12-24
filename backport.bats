#!/usr/bin/env bats

load './node_modules/bats-support/load'
load './node_modules/bats-assert/load'

@test "shows usage when run without args" {
    run ./backport.sh
    [ "$status" == "1" ]
    assert_equal "${lines[0]}" "Usage: backport.sh directory headref baseref target branchname"
}

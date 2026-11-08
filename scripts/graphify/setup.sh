#!/bin/sh
# Once per clone: https://docs.graphify.com/guides/team-workflows. core.hooksPath replaces .git/hooks, graphify's
# post-commit rebuild included, which would otherwise leave the committed graph modified after every commit.
set -e
git config core.hooksPath .githooks
PY="$(sed -n '1s/^#!//p' "$(command -v graphify)")"
git config merge.graphify.name "graphify graph.json union merge"
git config merge.graphify.driver "\"$PY\" -m graphify merge-driver %O %A %B"

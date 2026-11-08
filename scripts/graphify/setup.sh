#!/bin/sh
# Once per clone: https://docs.graphify.com/guides/team-workflows. core.hooksPath replaces .git/hooks, graphify's
# post-commit rebuild included, which would otherwise leave the committed graph modified after every commit.
set -e
GRAPHIFY="$(command -v graphify)" || { echo "graphify is not on PATH; install it, then rerun this script." >&2; exit 1; }
git config core.hooksPath .githooks
git config merge.graphify.name "graphify graph.json union merge"
# An absolute path, so a git client without ~/.local/bin on PATH still finds it. Rerun after moving graphify.
git config merge.graphify.driver "\"$GRAPHIFY\" merge-driver %O %A %B"

#!/usr/bin/env bash
set -euo pipefail

source_ref="${1:-refs/remotes/upstream/main}"
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Refusing to sync over uncommitted changes." >&2
  exit 1
fi
if [[ "$(git cat-file -s "$source_ref:_worker.js")" -eq 0 ]]; then
  echo "Upstream _worker.js is empty." >&2
  exit 1
fi
# Keep our automation; never import upstream workflows into a secrets-enabled repo.
git restore --source="$source_ref" --staged --worktree -- . ':(exclude).github'
node --check --input-type=module < _worker.js

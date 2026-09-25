#!/usr/bin/env bash
# Usage: scripts/release.sh [--minor | --version=X.Y.Z], run again once the drafted notes are read.
set -euo pipefail

cd "$(dirname "$0")/.."

# Release settings stay out of the environment, where the pre-push hook's tests would find them.
platform=$(grep -E '^PUPITRE_PLATFORM_URL=' scripts/release/release.env.tpl | cut -d= -f2-)

step() {
  bun scripts/release/index.ts "$@"
}

test -z "$(git status --porcelain --untracked-files=no -- . ':!apps/desktop/package.json' ':!apps/site/src/content/changelog')" || {
  echo "the working tree has changes: commit or stash them before a release." >&2
  exit 1
}

step next "$@"
eval "$(step resolve | sed 's/^/export /')"
echo "release $PUPITRE_RELEASE_VERSION in $PUPITRE_RELEASE_CHANNEL to $platform"

if ! step check >/dev/null 2>&1; then
  step notes
  echo
  echo "Read the two entries, fix what needs it, then run scripts/release.sh again."
  exit 0
fi

step check
step ship
echo "the runners take it from here, up to the merge into main: $(git remote get-url origin | sed -E 's#\.git$##; s#^git@github\.com:#https://github.com/#')/actions/workflows/release.yml"

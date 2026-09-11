#!/usr/bin/env bash
# A release, from this Mac: the next version, the notes, the agent, the app on
# the three systems, the buckets, the platform, then the commit and the tag.
# Every value comes from 1Password through `op run`; nothing touches the disk.
#
#   scripts/release.sh                 # a patch release from the current branch
#   scripts/release.sh --minor         # a feature release
#   scripts/release.sh --version=X.Y.Z # a version named outright
#   scripts/release.sh promote X.Y.Z   # after the merge to main: production, stable
#
# The script stops once the notes are drafted, for them to be read; run it
# again to continue — every step is idempotent and picks up where it stands.
set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE=scripts/release/release.env.tpl

step() {
  op run --env-file="$ENV_FILE" --no-masking -- bun scripts/release/index.ts "$@"
}

if [ "${1:-}" = "promote" ]; then
  shift
  step promote "--version=${1:?the version to promote}" --channel="${2:-stable}"
  exit 0
fi

test -z "$(git status --porcelain --untracked-files=no)" || {
  echo "the working tree has changes: commit or stash them before a release." >&2
  exit 1
}

step next "$@"
eval "$(step resolve | sed 's/^/export /')"
echo "release $PUPITRE_RELEASE_VERSION from $PUPITRE_RELEASE_BRANCH to $PUPITRE_PLATFORM_URL"

if ! step check >/dev/null 2>&1; then
  step notes
  echo
  echo "Read the two entries, fix what needs it, then run scripts/release.sh again."
  exit 0
fi

step check
step agent build
step agent publish
step desktop
step app publish
step ship

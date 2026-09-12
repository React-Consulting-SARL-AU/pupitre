#!/usr/bin/env bash
# A release, from this Mac: the next version, the notes, then the commit and
# the tag. The tag has the runners build the agent and the app, publish them,
# check what a customer downloads and merge `staging` into `main` —
# `.github/workflows/release.yml`. Nothing here needs a secret.
#
#   scripts/release.sh                 # a patch release
#   scripts/release.sh --minor         # a feature release
#   scripts/release.sh --version=X.Y.Z # a version named outright
#
# The script stops once the notes are drafted, for them to be read; run it
# again to continue — every step is idempotent and picks up where it stands.
set -euo pipefail

cd "$(dirname "$0")/.."

while IFS= read -r line; do
  export "$line"
done < <(grep -Ev '^\s*(#|$)|op://' scripts/release/release.env.tpl)

step() {
  bun scripts/release/index.ts "$@"
}

# The version and the notes are the release's own changes, left by the first
# pass for the second: anything else in the tree does not belong in it.
test -z "$(git status --porcelain --untracked-files=no -- . ':!apps/desktop/package.json' ':!apps/site/src/content/changelog')" || {
  echo "the working tree has changes: commit or stash them before a release." >&2
  exit 1
}

step next "$@"
eval "$(step resolve | sed 's/^/export /')"
echo "release $PUPITRE_RELEASE_VERSION in $PUPITRE_RELEASE_CHANNEL to $PUPITRE_PLATFORM_URL"

if ! step check >/dev/null 2>&1; then
  step notes
  echo
  echo "Read the two entries, fix what needs it, then run scripts/release.sh again."
  exit 0
fi

step check
step ship
echo "the runners take it from here, up to the merge into main: $(git remote get-url origin | sed -E 's#\.git$##; s#^git@github\.com:#https://github.com/#')/actions/workflows/release.yml"

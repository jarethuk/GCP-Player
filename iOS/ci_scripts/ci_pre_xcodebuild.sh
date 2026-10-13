#!/bin/bash
#
#  ci_pre_xcodebuild.sh
#  GCP Player
#
#  Xcode Cloud runs this before each xcodebuild invocation, from this
#  directory. It stamps the build number so no one has to remember to.
#
#  CI_BUILD_NUMBER is Xcode Cloud's own counter: it increases on every build
#  of the product, which is the only thing App Store Connect asks of
#  CFBundleVersion. CURRENT_PROJECT_VERSION is the lever because the target
#  has GENERATE_INFOPLIST_FILE = YES — CFBundleVersion is derived from it
#  rather than stored in Info.plist, so there is one place to write.
#
#  MARKETING_VERSION is deliberately untouched. That number says what this
#  release *is*, which is a decision, not a counter.
#
#  Only the CI checkout is edited, and that clone is thrown away after the
#  build — nothing is committed and your working copy never sees this.

set -euo pipefail

# Local runs have no CI_BUILD_NUMBER. Do nothing rather than stamping a
# developer's project with a number that means nothing.
if [ -z "${CI_BUILD_NUMBER:-}" ]; then
    echo "note: CI_BUILD_NUMBER unset — not in Xcode Cloud, leaving the build number alone."
    exit 0
fi

# Resolve the project from this script's own location rather than
# CI_PRIMARY_REPOSITORY_PATH, so it stays correct if the repo layout moves.
PROJECT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/GCP Player.xcodeproj/project.pbxproj"

if [ ! -f "$PROJECT" ]; then
    echo "error: project.pbxproj not found at $PROJECT" >&2
    exit 1
fi

sed -i '' -E "s/CURRENT_PROJECT_VERSION = [0-9]+;/CURRENT_PROJECT_VERSION = ${CI_BUILD_NUMBER};/g" "$PROJECT"

# Both the Debug and Release configurations carry the setting. A silent
# no-op here would ship a duplicate build number and App Store Connect
# would reject the upload well after this build looked green, so insist.
STAMPED=$(grep -c "CURRENT_PROJECT_VERSION = ${CI_BUILD_NUMBER};" "$PROJECT" || true)
if [ "$STAMPED" -lt 2 ]; then
    echo "error: expected 2 configurations stamped, got ${STAMPED}. Has the project's versioning changed?" >&2
    exit 1
fi

echo "Build number set to ${CI_BUILD_NUMBER} in ${STAMPED} configurations."

#!/bin/bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(cd "$script_dir/.." && pwd)"
group_id="${TODO_TRACKER_WIDGET_GROUP_ID:-}"
signing_identity="${TODO_TRACKER_SIGNING_IDENTITY:-}"
output_dir="${TODO_TRACKER_PACKAGE_OUTPUT_DIR:-/tmp/todo-tracker-widget-review}"
missing=()

fail() {
  printf 'Widget package unavailable: %s\n' "$1" >&2
  exit 2
}

for tool in npm python3 cargo rustc plutil codesign; do
  command -v "$tool" >/dev/null 2>&1 || missing+=("$tool: required to build and validate the host app package")
done
for path in \
  "$repo_dir/package.json" \
  "$repo_dir/src-tauri/tauri.conf.json" \
  "$repo_dir/src-tauri/Info.plist" \
  "$script_dir/build.sh"; do
  [[ -f "$path" ]] || missing+=("$path: required package input")
done

if ((${#missing[@]} > 0)); then
  printf 'Host package prerequisites are missing; no build was started:\n' >&2
  for item in "${missing[@]}"; do
    printf '  - %s\n' "$item" >&2
  done
  exit 2
fi

# Validate the shared signing, App Group, Xcode and App Intents prerequisites
# before either Xcode or Tauri starts a build.
"$script_dir/build.sh" --preflight

stage_dir="$(mktemp -d "${TMPDIR:-/tmp}/todo-tracker-package.XXXXXX")"
cleanup() {
  rm -rf "$stage_dir"
}
trap cleanup EXIT

widget_dir="$stage_dir/widget-artifacts"
mkdir -p "$widget_dir"
TODO_TRACKER_WIDGET_OUTPUT_DIR="$widget_dir" "$script_dir/build.sh"

host_info_plist="$stage_dir/Host-Info.plist"
cp "$repo_dir/src-tauri/Info.plist" "$host_info_plist"
plutil -insert TodoTrackerWidgetAppGroupIdentifier -string "$group_id" "$host_info_plist"
plutil -lint "$host_info_plist" >/dev/null || fail "the merged host Info.plist is invalid."

tauri_config="$stage_dir/tauri-widget-package.json"
TODO_TRACKER_SIGNING_IDENTITY_FOR_CONFIG="$signing_identity" \
TODO_TRACKER_HOST_INFO_PLIST="$host_info_plist" \
TODO_TRACKER_HOST_ENTITLEMENTS="$widget_dir/Host.entitlements" \
python3 - "$tauri_config" <<'PY'
import json
import os
import sys

config = {
    "bundle": {
        "macOS": {
            "entitlements": os.environ["TODO_TRACKER_HOST_ENTITLEMENTS"],
            "hardenedRuntime": True,
            "infoPlist": os.environ["TODO_TRACKER_HOST_INFO_PLIST"],
            "signingIdentity": os.environ["TODO_TRACKER_SIGNING_IDENTITY_FOR_CONFIG"],
        }
    }
}
with open(sys.argv[1], "w", encoding="utf-8") as stream:
    json.dump(config, stream)
PY

(
  cd "$repo_dir"
  TODO_TRACKER_WIDGET_GROUP_ID="$group_id" \
    npm run tauri -- build --bundles app --config "$tauri_config"
)

bundle_dir="$repo_dir/src-tauri/target/release/bundle/macos"
shopt -s nullglob
bundle_apps=("$bundle_dir"/*.app)
shopt -u nullglob
if ((${#bundle_apps[@]} != 1)); then
  fail "expected one Tauri .app in $bundle_dir, found ${#bundle_apps[@]}"
fi
host_app="${bundle_apps[0]}"
contents="$host_app/Contents"
appex_source="$widget_dir/ToDoTrackerWidget.appex"
helper_source="$widget_dir/todo-widgetctl"
[[ -d "$appex_source" ]] || fail "the signed widget extension was not produced."
[[ -x "$helper_source" ]] || fail "the signed widget reload helper was not produced."

embedded_appex="$contents/PlugIns/ToDoTrackerWidget.appex"
embedded_helper="$contents/MacOS/todo-widgetctl"
mkdir -p "$contents/PlugIns"
rm -rf "$embedded_appex"
cp -R "$appex_source" "$embedded_appex"
install -m 755 "$helper_source" "$embedded_helper"

embedded_group_id="$(plutil -extract TodoTrackerWidgetAppGroupIdentifier raw -o - "$contents/Info.plist")"
[[ "$embedded_group_id" == "$group_id" ]] || fail "the host Info.plist does not contain the configured App Group."

# Keep the signature hierarchy valid: extension and helper first, host last.
codesign --force --options runtime --timestamp=none \
  --sign "$signing_identity" \
  --entitlements "$widget_dir/widget.entitlements" \
  "$embedded_appex"
codesign --force --options runtime --timestamp=none \
  --sign "$signing_identity" \
  "$embedded_helper"
codesign --force --options runtime --timestamp=none \
  --sign "$signing_identity" \
  --entitlements "$widget_dir/Host.entitlements" \
  "$host_app"
codesign --verify --deep --strict --verbose=2 "$host_app" || fail "the signed app bundle could not be verified."

mkdir -p "$output_dir"
stamp="$(date '+%Y%m%d-%H%M%S')"
review_app="$output_dir/To-Do Tracker-widget-review-$stamp.app"
if [[ -e "$review_app" ]]; then
  review_app="$output_dir/To-Do Tracker-widget-review-$stamp-$$.app"
fi
cp -R "$host_app" "$review_app"
codesign --verify --deep --strict --verbose=2 "$review_app" || fail "the copied review app bundle could not be verified."

printf 'Signed review bundle: %s\n' "$review_app"
printf 'The app was not installed, registered, or launched.\n'

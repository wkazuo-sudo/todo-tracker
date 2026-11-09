#!/bin/bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
output_dir="${TODO_TRACKER_WIDGET_OUTPUT_DIR:-/tmp/todo-tracker-widget-build}"
group_id="${TODO_TRACKER_WIDGET_GROUP_ID:-}"
team_id="${TODO_TRACKER_TEAM_ID:-}"
signing_identity="${TODO_TRACKER_SIGNING_IDENTITY:-}"
missing=()

fail() {
  printf 'Widget build unavailable: %s\n' "$1" >&2
  exit 2
}

preflight_only=false
if [[ "${1:-}" == "--preflight" ]]; then
  preflight_only=true
elif (($# > 0)); then
  fail "usage: $0 [--preflight]"
fi

if ! [[ "$team_id" =~ ^[A-Z0-9]{10}$ ]]; then
  missing+=("TODO_TRACKER_TEAM_ID: a 10-character Apple Developer Team ID")
fi
if ! [[ "$group_id" =~ ^[A-Z0-9]{10}\.[A-Za-z0-9][A-Za-z0-9.-]*$ ]] || [[ -z "$team_id" || "$group_id" != "$team_id".* ]]; then
  missing+=("TODO_TRACKER_WIDGET_GROUP_ID: an App Group prefixed by that Team ID")
fi
if [[ -z "$signing_identity" ]]; then
  missing+=("TODO_TRACKER_SIGNING_IDENTITY: a valid Apple code-signing identity")
fi
for tool in swiftc xcrun codesign plutil security; do
  command -v "$tool" >/dev/null 2>&1 || missing+=("$tool: Apple build tool")
done

if ! command -v xcodebuild >/dev/null 2>&1 || ! xcodebuild -version >/dev/null 2>&1; then
  missing+=("full Xcode: xcodebuild is unavailable from the selected developer directory")
fi

metadata_processor=""
if command -v xcrun >/dev/null 2>&1; then
  metadata_processor="$(xcrun --find appintentsmetadataprocessor 2>/dev/null || true)"
fi
if [[ -z "$metadata_processor" ]]; then
  missing+=("appintentsmetadataprocessor: required to generate App Intents metadata for widget buttons")
fi

if command -v security >/dev/null 2>&1 && [[ -n "$signing_identity" ]]; then
  identity_list="$(security find-identity -v -p codesigning 2>/dev/null || true)"
  printf '%s\n' "$identity_list" | grep -Fq "$signing_identity" || \
    missing+=("signing identity: the requested identity is not present in Keychain")
fi

if ((${#missing[@]} > 0)); then
  printf 'Widget build is not available; missing prerequisites:\n' >&2
  for item in "${missing[@]}"; do
    printf '  - %s\n' "$item" >&2
  done
  printf 'Swift source can still be type-checked and linked with the Command Line Tools SDK. No extension was packaged or registered.\n' >&2
  exit 2
fi

sdk_path="$(xcrun --sdk macosx --show-sdk-path 2>/dev/null)" || fail "the macOS SDK is unavailable."
[[ -d "$sdk_path/System/Library/Frameworks/WidgetKit.framework" ]] || fail "WidgetKit is missing from the selected macOS SDK."
[[ -d "$sdk_path/System/Library/Frameworks/AppIntents.framework" ]] || fail "AppIntents is missing from the selected macOS SDK."

if [[ "$preflight_only" == true ]]; then
  printf 'Widget build prerequisites are available. No build was started.\n'
  exit 0
fi

stage_dir="$(mktemp -d "${TMPDIR:-/tmp}/todo-widget-build.XXXXXX")"
cleanup() {
  rm -rf "$stage_dir"
}
trap cleanup EXIT

info_plist="$stage_dir/Widget-Info.plist"
entitlements="$stage_dir/widget.entitlements"
host_info_plist="$stage_dir/Host-Info.plist"
host_entitlements="$stage_dir/Host.entitlements"
sed "s/__APP_GROUP_ID__/$group_id/g" "$script_dir/Widget-Info.plist.in" > "$info_plist"
sed "s/__APP_GROUP_ID__/$group_id/g" "$script_dir/Widget.entitlements.in" > "$entitlements"
sed "s/__APP_GROUP_ID__/$group_id/g" "$script_dir/Host-Info.plist.in" > "$host_info_plist"
sed "s/__APP_GROUP_ID__/$group_id/g" "$script_dir/Host.entitlements.in" > "$host_entitlements"
plutil -lint "$info_plist" >/dev/null || fail "the widget extension Info.plist is invalid."
plutil -lint "$entitlements" >/dev/null || fail "the widget entitlements are invalid."
plutil -lint "$host_info_plist" >/dev/null || fail "the host app Info.plist fragment is invalid."
plutil -lint "$host_entitlements" >/dev/null || fail "the host app entitlements are invalid."

sym_root="$stage_dir/products"
obj_root="$stage_dir/objects"
project="$script_dir/ToDoTrackerWidget.xcodeproj"
xcodebuild \
  -project "$project" \
  -target ToDoTrackerWidget \
  -configuration Release \
  -sdk macosx \
  SYMROOT="$sym_root" \
  OBJROOT="$obj_root" \
  CODE_SIGN_IDENTITY="$signing_identity" \
  DEVELOPMENT_TEAM="$team_id" \
  TODO_TRACKER_SIGNING_IDENTITY="$signing_identity" \
  TODO_TRACKER_TEAM_ID="$team_id" \
  TODO_TRACKER_WIDGET_GROUP_ID="$group_id" \
  WIDGET_INFO_PLIST="$info_plist" \
  WIDGET_ENTITLEMENTS="$entitlements" \
  build
xcodebuild \
  -project "$project" \
  -target WidgetReloadHelper \
  -configuration Release \
  -sdk macosx \
  SYMROOT="$sym_root" \
  OBJROOT="$obj_root" \
  CODE_SIGN_IDENTITY="$signing_identity" \
  DEVELOPMENT_TEAM="$team_id" \
  TODO_TRACKER_SIGNING_IDENTITY="$signing_identity" \
  TODO_TRACKER_TEAM_ID="$team_id" \
  build

appex="$sym_root/Release/ToDoTrackerWidget.appex"
helper="$sym_root/Release/todo-widgetctl"
[[ -d "$appex" ]] || fail "Xcode did not produce the widget extension bundle."
[[ -x "$helper" ]] || fail "Xcode did not produce the widget reload helper."
find "$appex" -type d -name 'Metadata.appintents' -print -quit | grep -q . || \
  fail "Xcode did not generate App Intents metadata for the completion button."
codesign --verify --deep --strict "$appex" || fail "the widget extension signature could not be verified."
codesign --verify --strict "$helper" || fail "the reload helper signature could not be verified."

mkdir -p "$output_dir"
rm -rf "$output_dir/ToDoTrackerWidget.appex"
cp -R "$appex" "$output_dir/ToDoTrackerWidget.appex"
install -m 755 "$helper" "$output_dir/todo-widgetctl"
cp "$entitlements" "$output_dir/widget.entitlements"
cp "$host_info_plist" "$output_dir/Host-Info.plist"
cp "$host_entitlements" "$output_dir/Host.entitlements"

printf 'Widget sources compiled and signed. Artifacts: %s\n' "$output_dir"
printf 'The host app still needs the matching App Group entitlement and must embed the extension in Contents/PlugIns before the system can offer the widget.\n'
printf 'This script does not install the app, register the extension, or launch any window.\n'

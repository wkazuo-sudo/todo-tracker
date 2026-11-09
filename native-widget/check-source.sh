#!/bin/bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sdk_path="$(xcrun --sdk macosx --show-sdk-path)"
architecture="$(uname -m)"
target="${architecture}-apple-macosx14.0"
output_dir="$(mktemp -d "${TMPDIR:-/tmp}/todo-widget-check.XXXXXX")"
trap 'rm -rf "$output_dir"' EXIT

swiftc -parse-as-library -typecheck -sdk "$sdk_path" -target "$target" \
  "$script_dir/ToDoTrackerWidget.swift"
swiftc -parse-as-library -typecheck -sdk "$sdk_path" -target "$target" \
  "$script_dir/WidgetReloadHelper.swift"

swiftc -parse-as-library -emit-executable -O -sdk "$sdk_path" -target "$target" \
  -framework AppIntents -framework SwiftUI -framework WidgetKit \
  -o "$output_dir/ToDoTrackerWidget" "$script_dir/ToDoTrackerWidget.swift"
swiftc -parse-as-library -emit-executable -O -sdk "$sdk_path" -target "$target" \
  -framework WidgetKit -o "$output_dir/todo-widgetctl" \
  "$script_dir/WidgetReloadHelper.swift"

printf 'Widget and helper sources type-checked and linked without launching either executable.\n'
printf 'This source check does not generate App Intents metadata, sign an App Group, or register a widget.\n'

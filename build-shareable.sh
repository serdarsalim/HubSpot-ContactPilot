#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUTPUT_DIR="$ROOT_DIR/shareable"

rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

copy_path() {
  local source_path="$1"
  if [ -d "$ROOT_DIR/$source_path" ]; then
    cp -R "$ROOT_DIR/$source_path" "$OUTPUT_DIR/$source_path"
  else
    mkdir -p "$OUTPUT_DIR/$(dirname "$source_path")"
    cp "$ROOT_DIR/$source_path" "$OUTPUT_DIR/$source_path"
  fi
}

copy_path manifest.json
copy_path background.js
copy_path content.js
copy_path popup.html
copy_path popup.js
copy_path popup
copy_path shared
copy_path vendor
copy_path icons

find "$OUTPUT_DIR" -name '.DS_Store' -delete

echo "Shareable extension files written to: $OUTPUT_DIR"

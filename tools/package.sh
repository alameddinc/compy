#!/usr/bin/env bash
# Build a Chrome Web Store-ready zip from src/, excluding dev-only files
# (the demo pages / seeder) and stripping their manifest entries.
#
# Usage:  bash tools/package.sh
# Output: dist/  (unpacked, publish-safe)  +  compy-<version>.zip
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/src"
DIST="$ROOT/dist"

echo "▸ Cleaning dist/"
rm -rf "$DIST"
mkdir -p "$DIST"

echo "▸ Copying src/ → dist/ (excluding dev-only files)"
# Ship everything except the demo folder and OS cruft.
( cd "$SRC" && find . \
    -path './demo' -prune -o \
    -name '.DS_Store' -prune -o \
    -type f -print ) | while read -r f; do
  mkdir -p "$DIST/$(dirname "$f")"
  cp "$SRC/$f" "$DIST/$f"
done

echo "▸ Stripping demo entries from manifest web_accessible_resources"
node -e '
  const fs = require("fs");
  const p = process.argv[1];
  const m = JSON.parse(fs.readFileSync(p, "utf8"));
  for (const war of (m.web_accessible_resources || [])) {
    if (Array.isArray(war.resources)) {
      war.resources = war.resources.filter((r) => !r.startsWith("demo/"));
    }
  }
  // Drop any now-empty WAR blocks.
  m.web_accessible_resources = (m.web_accessible_resources || []).filter(
    (w) => Array.isArray(w.resources) && w.resources.length
  );
  if (!m.web_accessible_resources.length) delete m.web_accessible_resources;
  fs.writeFileSync(p, JSON.stringify(m, null, 2) + "\n");
' "$DIST/manifest.json"

VERSION="$(node -e 'process.stdout.write(require(process.argv[1]).version)' "$DIST/manifest.json")"
ZIP="$ROOT/compy-${VERSION}.zip"

echo "▸ Zipping → compy-${VERSION}.zip"
rm -f "$ZIP"
( cd "$DIST" && zip -rq "$ZIP" . -x '*.DS_Store' )

echo "✓ Done."
echo "  Unpacked (test): $DIST"
echo "  Upload to store: $ZIP"
echo
echo "  Verify before upload:"
echo "   - no demo/ folder in the zip"
echo "   - manifest has no demo/* in web_accessible_resources"
echo "   - load dist/ unpacked once and smoke-test popup + dashboard"

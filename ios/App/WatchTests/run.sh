#!/bin/sh
# Compiles WatchShared + tests for macOS and runs them. Needs only Xcode command line tools.
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${TMPDIR:-/tmp}/huddle-watch-tests"
xcrun swiftc -O -o "$OUT" "$DIR/WatchShared/WatchModels.swift" "$DIR/WatchTests/main.swift"
"$OUT"

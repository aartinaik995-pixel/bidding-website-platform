#!/usr/bin/env bash
# Bundles the node:test files with esbuild and runs them with Node.
# Needs esbuild on PATH or in node_modules (installed by npm ci).
set -euo pipefail
OUT="$(mktemp -d)"
ESBUILD="${ESBUILD:-$(command -v esbuild || echo node_modules/.bin/esbuild)}"
for file in tests/*.node-check.ts; do
  name="$(basename "$file" .ts)"
  "$ESBUILD" "$file" --bundle --platform=node --format=cjs --outfile="$OUT/$name.cjs" --log-level=warning
done
node --test "$OUT"/*.cjs

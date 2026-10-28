#!/usr/bin/env bash
# The desktop app's version lives in three files that must agree: package.json,
# src-tauri/tauri.conf.json and src-tauri/Cargo.toml (plus Cargo.lock). A release also needs a
# section in CHANGELOG.md. It's separate from the website's version (apps/web/package.json).
#
#   apps/desktop/scripts/check-version.sh          the files agree
#   apps/desktop/scripts/check-version.sh 0.2.0    ... and say 0.2.0 (the release workflow passes the tag)
set -euo pipefail
cd "$(dirname "$0")/.."

ok=1
fail() { echo "error: $*" >&2; ok=0; }

v=$(node -p 'require("./package.json").version')
conf=$(node -p 'require("./src-tauri/tauri.conf.json").version')
cargo=$(sed -n 's/^version = "\(.*\)"/\1/p' src-tauri/Cargo.toml | head -n1)
lock=$(awk '/^name = "soniroll-desktop"$/{getline; print}' src-tauri/Cargo.lock | sed 's/version = "\(.*\)"/\1/')

[[ $# -eq 0 || "$1" == "$v" ]] || fail "expected version $1, package.json has $v"
[[ "$conf" == "$v" ]] || fail "tauri.conf.json has $conf, package.json has $v"
[[ "$cargo" == "$v" ]] || fail "Cargo.toml has $cargo, package.json has $v"
[[ "$lock" == "$v" ]] || fail "Cargo.lock has $lock (run cargo build in src-tauri)"
grep -q "^## \[$v\]" CHANGELOG.md || fail "CHANGELOG.md has no '## [$v]' section"

((ok)) && echo "desktop version $v is consistent"
((ok))

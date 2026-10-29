#!/usr/bin/env bash
# Starts the Worker locally with test invite/review hashes and a fresh local D1, runs the API tests, stops it.
set -euo pipefail
cd "$(dirname "$0")/.."
INV="test-invite-0123456789abcdef"; REV="test-review-key-0123456789abcdefghijklmnopqrstuv"
IH=$(printf 'inv:%s' "$INV" | sha256sum | cut -d' ' -f1); RH=$(printf 'rv:%s' "$REV" | sha256sum | cut -d' ' -f1)
STATE=$(mktemp -d)
setsid npx wrangler dev --port 8799 --persist-to "$STATE" --var "INVITE_HASHES:$IH" --var "OWNER_INVITE_HASH:$IH" --var "REVIEW_HASHES:$RH" > "$STATE/dev.log" 2>&1 &
PID=$!
trap 'kill -- -$PID 2>/dev/null; sleep 1; rm -rf "$STATE"' EXIT
for i in $(seq 1 60); do curl -s -o /dev/null http://localhost:8799/api/health && break; sleep 1; done
TEST_INVITE="$INV" TEST_REVIEW="$REV" node tests/api.test.mjs http://localhost:8799 || { tail -40 "$STATE/dev.log"; exit 1; }

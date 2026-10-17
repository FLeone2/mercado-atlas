#!/usr/bin/env bash
# Runs every automated test: Node (*.test.cjs) and Python (unittest).
# Python statistical tests need scripts/requirements-scenarios.txt installed.
cd "$(dirname "$0")/.."
pass=0; fail=0; failed=""
log=$(mktemp)
run(){ if timeout 900 "$@" >"$log" 2>&1; then pass=$((pass+1)); else fail=$((fail+1)); failed="$failed $(basename "${@: -1}")"; fi; }
for t in tests/*.cjs; do run node "$t"; done
for t in tests/test_*.py; do run python3 -m unittest "$t"; done
rm -f "$log"
echo "pass=$pass fail=$fail${failed:+:$failed}"
[ "$fail" -eq 0 ]

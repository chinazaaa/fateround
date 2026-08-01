#!/usr/bin/env bash
#
# Supply-chain tripwire. Scans build-time config files and everything shipped
# under public/ for the fingerprints of the payloads this repo has been hit with
# before (see MEMORY: "Supply-chain contamination (lobster/thanos)" — a VSCode
# auto-task plus an obfuscated JS payload dropped into public/). It is
# deliberately CONSERVATIVE: it only looks at config + public/ assets (not the
# whole src/ tree) and only flags patterns that never legitimately appear in
# those files, so it should not false-positive on the real codebase.
#
# Exits NON-ZERO on any hit. Checks:
#   1. The `global['!']` payload marker anywhere in the tracked tree.
#   2. Suspiciously long lines (>200 chars) in config / public JS — a classic
#      sign of an inlined/minified obfuscated payload.
#   3. Obfuscation/exec primitives (eval(, Function(, String.fromCharCode,
#      createRequire) in config / public JS.
#   4. postcss.config.mjs integrity — must stay tiny and static (no require,
#      dynamic import, process.env, child_process or fetch).
#
# Usage: scripts/forbidden-pattern-scan.sh [ROOT]
set -euo pipefail

ROOT="${1:-.}"
cd "$ROOT"

FAILED=0

# Longest line we tolerate in a hand-written config / small public asset.
MAX_LINE=200
# Largest postcss.config.mjs we expect (it should just wire up the tailwind plugin).
POSTCSS_MAX_BYTES=500

# ---------------------------------------------------------------------------
# [1/4] The `global['!']` payload marker.
# The literal is assembled from fragments so this script does not itself contain
# the contiguous string it is searching for (otherwise the scan flags itself).
# ---------------------------------------------------------------------------
MARKER="global""['!']"
echo "[1/4] Scanning for the '${MARKER}' payload marker..."
# Exclude this script and any CI workflow that legitimately references the marker.
if marker_hits=$(git grep -lF "$MARKER" -- . \
  ':(exclude)scripts/forbidden-pattern-scan.sh' \
  ':(exclude).github/workflows/*' 2>/dev/null); then
  if [[ -n "$marker_hits" ]]; then
    echo "FAIL [payload-marker] Blocked literal '${MARKER}' found in:" >&2
    printf '%s\n' "$marker_hits" >&2
    git grep -nF "$MARKER" -- . \
      ':(exclude)scripts/forbidden-pattern-scan.sh' \
      ':(exclude).github/workflows/*' >&2 || true
    FAILED=1
  fi
fi

# ---------------------------------------------------------------------------
# Build the list of files to scan for checks 2 & 3: root config files plus any
# JavaScript shipped under public/.
# ---------------------------------------------------------------------------
scan_files=()
while IFS= read -r f; do
  [[ -n "$f" ]] && scan_files+=("$f")
done < <(find . \
  \( -path './node_modules' -o -path './.git' -o -path './.next' \) -prune -o \
  \( \
    \( -maxdepth 1 -type f \( -name '*.mjs' -o -name '*.cjs' -o -name 'postcss*' -o -name '*.config.*' \) \) \
    -o \( -path './public/*' -type f \( -name '*.js' -o -name '*.mjs' -o -name '*.cjs' \) \) \
  \) -print 2>/dev/null)

# ---------------------------------------------------------------------------
# [2/4] Long-line detection.
# ---------------------------------------------------------------------------
echo "[2/4] Checking for suspiciously long lines (>${MAX_LINE} chars)..."
for file in "${scan_files[@]}"; do
  if awk -v max="$MAX_LINE" 'length > max { exit 1 }' "$file"; then :; else
    line=$(awk -v max="$MAX_LINE" 'length > max { print NR": "length" chars"; exit }' "$file")
    echo "FAIL [long-line] $file:$line" >&2
    FAILED=1
  fi
done

# ---------------------------------------------------------------------------
# [3/4] Obfuscation / exec primitives in config + public JS.
# ---------------------------------------------------------------------------
echo "[3/4] Checking for exec/obfuscation primitives..."
for file in "${scan_files[@]}"; do
  for pattern in 'eval[[:space:]]*\(' 'Function[[:space:]]*\(' 'String\.fromCharCode' 'createRequire'; do
    if grep -nE "$pattern" "$file" >/dev/null 2>&1; then
      echo "FAIL [forbidden-pattern] $file matches: $pattern" >&2
      grep -nE "$pattern" "$file" >&2 || true
      FAILED=1
    fi
  done
done

# ---------------------------------------------------------------------------
# [4/4] postcss.config.mjs integrity.
# ---------------------------------------------------------------------------
echo "[4/4] Checking postcss.config.mjs integrity..."
POSTCSS="postcss.config.mjs"
if [[ -f "$POSTCSS" ]]; then
  size=$(wc -c < "$POSTCSS")
  if [[ "$size" -gt "$POSTCSS_MAX_BYTES" ]]; then
    echo "FAIL [postcss-size] $POSTCSS is $size bytes (expected < $POSTCSS_MAX_BYTES)" >&2
    FAILED=1
  fi
  for token in 'require' 'import[[:space:]]*\(' 'process\.env' 'child_process' 'fetch'; do
    if grep -nE "$token" "$POSTCSS" >/dev/null 2>&1; then
      echo "FAIL [postcss-integrity] $POSTCSS contains forbidden token: $token" >&2
      FAILED=1
    fi
  done
fi

if [[ "$FAILED" -ne 0 ]]; then
  echo "Supply-chain scan FAILED — review the findings above." >&2
  exit 1
fi

echo "OK: supply-chain scan passed (no forbidden patterns)."

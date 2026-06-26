#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-.}"
cd "$ROOT"

FORBIDDEN=$'global[\'!\']'
EXCLUDE=${2:-":(exclude).github/workflows/forbidden-pattern-scan.yml"}

matches=$(git grep -lF "$FORBIDDEN" -- . "$EXCLUDE" || true)
if [[ -n "$matches" ]]; then
  echo "::error::Blocked literal pattern detected in repository files." >&2
    echo "Affected file(s):" >&2
      printf '%s\n' "$matches" >&2
        echo "" >&2
          git grep -nF "$FORBIDDEN" -- . "$EXCLUDE" >&2 || true
            exit 1
            fi

            echo "OK: no files contain the forbidden pattern."

            # |
            #           set -e
            #           ROOT="${{ github.workspace }}"
            #           FAILED=0

            #           echo "[1/3] Checking for suspiciously long lines in config files..."
            #           while IFS= read -r file; do
            #             awk -v f="$file" 'length > 200 {
            #               print "FAIL [long-line] " f ":" NR " (" length " chars)"
            #               exit 1
            #             }' "$file" || FAILED=1
            #           done <<< "$(find "$ROOT" \
            #             \( -path "*/node_modules" -o -path "*/.git" \) -prune \
            #             -o \( -name "*.mjs" -o -name "*.cjs" -o -name "postcss*" -o -name "*.config.*" \) \
            #             -type f -print)"

            #           echo "[2/3] Checking for forbidden patterns in config files..."
            #           while IFS= read -r file; do
            #             for pattern in "createRequire" "String\.fromCharCode" "global\[" "_\$_[0-9a-zA-Z]" "eval\s*\(" "Function\s*\("; do
            #               if grep -qE "$pattern" "$file" 2>/dev/null; then
            #                 echo "FAIL [forbidden-pattern] $file matches: $pattern"
            #                 FAILED=1
            #               fi
            #             done
            #           done <<< "$(find "$ROOT" \
            #             \( -path "*/node_modules" -o -path "*/.git" \) -prune \
            #             -o \( -name "*.mjs" -o -name "*.cjs" -o -name "postcss*" -o -name "*.config.*" \) \
            #             -type f -print)"

            #           echo "[3/3] Checking postcss.config.mjs integrity..."
            #           POSTCSS="$ROOT/postcss.config.mjs"
            #           if [ -f "$POSTCSS" ]; then
            #             SIZE=$(wc -c < "$POSTCSS")
            #             if [ "$SIZE" -gt 500 ]; then
            #               echo "FAIL [file-size] postcss.config.mjs is $SIZE bytes (expected < 500)"
            #               FAILED=1
            #             fi
            #             for token in require import process\.env child_process fetch; do
            #               if grep -qE "$token" "$POSTCSS" 2>/dev/null; then
            #                 echo "FAIL [postcss-integrity] postcss.config.mjs contains forbidden token: $token"
            #                 FAILED=1
            #               fi
            #             done
            #           fi

            #           if [ "$FAILED" -eq 1 ]; then
            #             echo "Scan failed. Review the findings above."
            #             exit 1
            #           fi
            #           echo "All checks passed."#!/usr/bin/env bash
            set -euo pipefail

            ROOT="${1:-.}"
            cd "$ROOT"

            FORBIDDEN=$'global[\'!\']'
            EXCLUDE=${2:-":(exclude).github/workflows/forbidden-pattern-scan.yml"}

            matches=$(git grep -lF "$FORBIDDEN" -- . "$EXCLUDE" || true)
            if [[ -n "$matches" ]]; then
              echo "::error::Blocked literal pattern detected in repository files." >&2
                echo "Affected file(s):" >&2
                  printf '%s\n' "$matches" >&2
                    echo "" >&2
                      git grep -nF "$FORBIDDEN" -- . "$EXCLUDE" >&2 || true
                        exit 1
                        fi

                        echo "OK: no files contain the forbidden pattern."

                        # |
                        #           set -e
                        #           ROOT="${{ github.workspace }}"
                        #           FAILED=0

                        #           echo "[1/3] Checking for suspiciously long lines in config files..."
                        #           while IFS= read -r file; do
                        #             awk -v f="$file" 'length > 200 {
                        #               print "FAIL [long-line] " f ":" NR " (" length " chars)"
                        #               exit 1
                        #             }' "$file" || FAILED=1
                        #           done <<< "$(find "$ROOT" \
                        #             \( -path "*/node_modules" -o -path "*/.git" \) -prune \
                        #             -o \( -name "*.mjs" -o -name "*.cjs" -o -name "postcss*" -o -name "*.config.*" \) \
                        #             -type f -print)"

                        #           echo "[2/3] Checking for forbidden patterns in config files..."
                        #           while IFS= read -r file; do
                        #             for pattern in "createRequire" "String\.fromCharCode" "global\[" "_\$_[0-9a-zA-Z]" "eval\s*\(" "Function\s*\("; do
                        #               if grep -qE "$pattern" "$file" 2>/dev/null; then
                        #                 echo "FAIL [forbidden-pattern] $file matches: $pattern"
                        #                 FAILED=1
                        #               fi
                        #             done
                        #           done <<< "$(find "$ROOT" \
                        #             \( -path "*/node_modules" -o -path "*/.git" \) -prune \
                        #             -o \( -name "*.mjs" -o -name "*.cjs" -o -name "postcss*" -o -name "*.config.*" \) \
                        #             -type f -print)"

                        #           echo "[3/3] Checking postcss.config.mjs integrity..."
                        #           POSTCSS="$ROOT/postcss.config.mjs"
                        #           if [ -f "$POSTCSS" ]; then
                        #             SIZE=$(wc -c < "$POSTCSS")
                        #             if [ "$SIZE" -gt 500 ]; then
                        #               echo "FAIL [file-size] postcss.config.mjs is $SIZE bytes (expected < 500)"
                        #               FAILED=1
                        #             fi
                        #             for token in require import process\.env child_process fetch; do
                        #               if grep -qE "$token" "$POSTCSS" 2>/dev/null; then
                        #                 echo "FAIL [postcss-integrity] postcss.config.mjs contains forbidden token: $token"
                        #                 FAILED=1
                        #               fi
                        #             done
                        #           fi

                        #           if [ "$FAILED" -eq 1 ]; then
                        #             echo "Scan failed. Review the findings above."
                        #             exit 1
                        #           fi
                        #           echo "All checks passed."
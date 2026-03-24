#!/usr/bin/env bash
set -euo pipefail

# ============== CONFIG =================
REQ_AGENTS_HEADER=${REQ_AGENTS_HEADER:-"LinZhi Agents Specification v0.1"}
FORBIDDEN_PATHS=(
  "docs/Constitution"    # any file starting with Constitution
  "docs/AGENTS.md"       # immutable by Codex; only via human-approved card
)
# Optional invariants
REPO_CHECKS(){
  test -f docs/AGENTS.md && grep -q "$REQ_AGENTS_HEADER" docs/AGENTS.md
  test -f api/index.js
  node -e 'try{const p=require("./api/package.json"); if(p.type!=="module") process.exit(2)}catch(e){process.exit(3)}'
}

# ============== DIFF SCOPE =============
BASE=${BASE_REF:-origin/main}
if git rev-parse --verify "$BASE" >/dev/null 2>&1; then
  :
else
  git fetch origin main >/dev/null 2>&1 || true
  BASE=origin/main
fi

CHANGED=$(git diff --name-only "$BASE"...HEAD 2>/dev/null || true)

# ============== FORBIDDEN EDITS ========
for f in $CHANGED; do
  for forbid in "${FORBIDDEN_PATHS[@]}"; do
    case "$forbid" in
      docs/Constitution*) [[ "$f" == docs/Constitution* ]] && {
        echo "[GATE][FAIL] Forbidden change: $f"; exit 10; } ;;
      *) [[ "$f" == "$forbid" ]] && { echo "[GATE][FAIL] Forbidden change: $f"; exit 11; } ;;
    esac
  done
done

# ============== REPO SANITY ============
REPO_CHECKS || { echo "[GATE][FAIL] Repo sanity checks failed"; exit 20; }

echo "[GATE][OK] All checks passed"

#!/usr/bin/env bash
# Step 3: build the merge SQL into ./merge.sql. Does NOT execute it.
#
# Strategy: take the OLD-DB data-only INSERT dump from step 1 and
# transform every closing ");" into ") ON CONFLICT DO NOTHING;" — so
# the same INSERTs become idempotent: rows that already exist in the
# destination (by any unique constraint) are silently skipped, and
# rows that don't yet exist are inserted.
#
# We wrap the whole thing in a single transaction with
#   SET session_replication_role = 'replica'
# which disables FK checks and triggers during the load. This lets the
# tables load in any order without having to topo-sort by FK
# dependency. We restore session_replication_role to 'origin' before
# COMMIT so the destination's FK enforcement is unaffected after the
# merge.

set -euo pipefail

cd "$(dirname "$0")"

TS="$(cat ./backups/LATEST)"
OUT="./backups/$TS"
SRC="$OUT/old-data.sql"
DEST="./merge.sql"

if [[ ! -f "$SRC" ]]; then
  echo "ERROR: $SRC missing. Run 1-backup.sh first." >&2
  exit 1
fi

echo "==> Transforming $SRC into idempotent INSERTs…"

{
  echo "-- Auto-generated. Source: $SRC ($(wc -l < "$SRC") lines)."
  echo "-- Generated at $(date -u +%Y-%m-%dT%H:%M:%SZ)."
  echo "BEGIN;"
  echo "SET LOCAL session_replication_role = 'replica';  -- skip FKs/triggers"
  echo "SET LOCAL statement_timeout = 0;"
  echo "SET LOCAL lock_timeout = '60s';"
  echo
  # pg_dump --inserts emits multi-line statements ending with a line
  # that is exactly ");". Turn that into ") ON CONFLICT DO NOTHING;".
  # SET / SELECT setval(...) lines pass through untouched.
  sed -E 's/^\);$/) ON CONFLICT DO NOTHING;/' "$SRC"
  echo
  echo "SET LOCAL session_replication_role = 'origin';"
  echo "COMMIT;"
} > "$DEST"

ROWS=$(grep -c "^) ON CONFLICT DO NOTHING;$" "$DEST" || true)
echo "    wrote $DEST ($(du -h "$DEST" | cut -f1), $ROWS idempotent statements)"
echo

# Sanity: warn about any INSERT statement that DIDN'T get the ON
# CONFLICT clause (likely a single-line INSERT that doesn't match our
# pattern). If any exist, we want to know before executing.
NAKED=$(grep -E '^INSERT INTO [^;]+;$' "$DEST" | wc -l || true)
if [[ "$NAKED" -gt 0 ]]; then
  echo "WARNING: $NAKED single-line INSERT statements weren't transformed."
  echo "        They will fail on PK conflicts. First few:"
  grep -E '^INSERT INTO [^;]+;$' "$DEST" | head -5
  echo
  echo "Fix: re-run step 1 with --rows-per-insert (already set), or stop"
  echo "and tell Claude what tables these were on."
fi

echo "Dry-run done. Open $DEST and skim a handful of INSERTs to confirm"
echo "they look right. Then run 4-execute.sh."

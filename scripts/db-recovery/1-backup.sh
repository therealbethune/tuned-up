#!/usr/bin/env bash
# Step 1: take pg_dump backups of BOTH databases before touching anything.
# The destination dump is the only thing standing between us and data
# loss if step 4 goes wrong, so this step never gets skipped.

set -euo pipefail

: "${OLD_DB:?Set OLD_DB to the source (recovered) connection string}"
: "${NEW_DB:?Set NEW_DB to the destination (live) connection string}"

cd "$(dirname "$0")"

TS="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="./backups/$TS"
mkdir -p "$OUT"

echo "==> Dumping OLD DB (data + schema, custom format)…"
pg_dump --format=custom --no-owner --no-acl \
  --file="$OUT/old-full.dump" "$OLD_DB"
echo "    wrote $OUT/old-full.dump ($(du -h "$OUT/old-full.dump" | cut -f1))"

echo "==> Dumping NEW DB (data + schema, custom format) — REQUIRED rollback artifact…"
pg_dump --format=custom --no-owner --no-acl \
  --file="$OUT/new-before.dump" "$NEW_DB"
echo "    wrote $OUT/new-before.dump ($(du -h "$OUT/new-before.dump" | cut -f1))"

echo
echo "==> Also writing a plain-SQL OLD-DB data-only dump (used by step 3)…"
pg_dump --data-only --no-owner --no-acl \
  --format=plain \
  --inserts --rows-per-insert=500 \
  --file="$OUT/old-data.sql" "$OLD_DB"
echo "    wrote $OUT/old-data.sql ($(du -h "$OUT/old-data.sql" | cut -f1))"

# Write a marker so the later scripts know which backup folder to use.
echo "$TS" > ./backups/LATEST

echo
echo "Backups complete. Folder: $OUT"
echo "Rollback if needed:"
echo "  pg_restore --clean --if-exists --no-owner --no-acl --dbname \"\$NEW_DB\" $OUT/new-before.dump"

#!/usr/bin/env bash
# Step 5: post-merge verification.
#
# Prints:
#   - new row count per table
#   - delta vs. the pre-merge new row count from step 2
#   - any foreign-key orphans (rows whose FK target doesn't exist)
#
# A healthy merge: every table's row count >= pre-merge count, and
# zero orphans across the board.

set -euo pipefail

: "${NEW_DB:?Set NEW_DB}"

cd "$(dirname "$0")"

TS="$(cat ./backups/LATEST)"
OUT="./backups/$TS"

ROW_COUNTS_SQL=$(cat <<'EOF'
SELECT n.nspname AS schema, c.relname AS table,
       (xpath('/row/c/text()',
              query_to_xml(format('SELECT COUNT(*) AS c FROM %I.%I',
                                  n.nspname, c.relname),
                          false, true, '')))[1]::text::bigint AS rows
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r'
  AND n.nspname NOT IN ('pg_catalog','information_schema','pg_toast')
ORDER BY n.nspname, c.relname;
EOF
)

echo "==> Post-merge NEW DB row counts:"
psql "$NEW_DB" -At -c "$ROW_COUNTS_SQL" | tee "$OUT/new-rowcounts-after.tsv"

echo
echo "==> Delta (before → after):"
join -t $'\t' -a 1 -a 2 -o '0,1.3,2.3' -e '0' \
  "$OUT/new-rowcounts.tsv" \
  "$OUT/new-rowcounts-after.tsv" \
  | awk -F'\t' 'BEGIN{OFS="\t"} {
      before=$2; after=$3;
      delta = after - before;
      printf "%-50s before=%10d  after=%10d  delta=%+d\n", $1, before, after, delta;
    }'

echo
echo "==> Looking for FK orphans introduced by the merge…"
ORPHAN_SQL=$(cat <<'EOF'
SELECT
  conrelid::regclass AS child_table,
  a.attname          AS child_col,
  confrelid::regclass AS parent_table,
  af.attname         AS parent_col
FROM pg_constraint c
JOIN pg_attribute  a  ON a.attrelid = c.conrelid  AND a.attnum  = ANY(c.conkey)
JOIN pg_attribute  af ON af.attrelid = c.confrelid AND af.attnum = ANY(c.confkey)
WHERE c.contype = 'f';
EOF
)

# For each FK, run COUNT(*) on the child where the FK doesn't resolve.
psql "$NEW_DB" -At -F $'\t' -c "$ORPHAN_SQL" | while IFS=$'\t' read -r ct cc pt pc; do
  COUNT=$(psql "$NEW_DB" -At -c "
    SELECT COUNT(*) FROM ${ct} WHERE ${cc} IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM ${pt} WHERE ${pc} = ${ct}.${cc});")
  if [[ "$COUNT" -gt 0 ]]; then
    echo "ORPHAN: ${COUNT} rows in ${ct}.${cc} → ${pt}.${pc}"
  fi
done

echo
echo "Verification complete. If you see no ORPHAN lines and the deltas"
echo "look sane, the merge is good."
echo
echo "FINAL STEP — REMINDER:"
echo "  Rotate the password on the OLD DB. The connection string was"
echo "  pasted into a chat transcript and should be treated as compromised."

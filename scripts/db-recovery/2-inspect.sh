#!/usr/bin/env bash
# Step 2: print a side-by-side summary of both DBs and the schema diff.
# Read the output carefully before continuing. If column types differ
# between the two DBs, the merge in step 4 will explode partway through
# and roll back — better to catch it here.

set -euo pipefail

: "${OLD_DB:?Set OLD_DB}"
: "${NEW_DB:?Set NEW_DB}"

cd "$(dirname "$0")"

TS="$(cat ./backups/LATEST)"
OUT="./backups/$TS"

# ─── Table list + row counts ──────────────────────────────────────────
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

echo "==> OLD DB tables + row counts:"
psql "$OLD_DB" -At -c "$ROW_COUNTS_SQL" | tee "$OUT/old-rowcounts.tsv"
echo
echo "==> NEW DB tables + row counts:"
psql "$NEW_DB" -At -c "$ROW_COUNTS_SQL" | tee "$OUT/new-rowcounts.tsv"

# ─── Schema diff (column list per table) ──────────────────────────────
COLUMNS_SQL=$(cat <<'EOF'
SELECT table_schema || '.' || table_name AS t,
       column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema NOT IN ('pg_catalog','information_schema')
ORDER BY t, ordinal_position;
EOF
)

echo
echo "==> Dumping column lists for schema diff…"
psql "$OLD_DB" -At -F $'\t' -c "$COLUMNS_SQL" > "$OUT/old-cols.tsv"
psql "$NEW_DB" -At -F $'\t' -c "$COLUMNS_SQL" > "$OUT/new-cols.tsv"

echo
echo "==> Schema diff (- = only in OLD, + = only in NEW):"
diff -u "$OUT/old-cols.tsv" "$OUT/new-cols.tsv" || true

echo
echo "==> Primary keys per table:"
PK_SQL=$(cat <<'EOF'
SELECT tc.table_schema || '.' || tc.table_name AS t,
       string_agg(kcu.column_name, ',' ORDER BY kcu.ordinal_position) AS pk_cols
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
 AND tc.table_schema    = kcu.table_schema
WHERE tc.constraint_type = 'PRIMARY KEY'
  AND tc.table_schema NOT IN ('pg_catalog','information_schema')
GROUP BY t
ORDER BY t;
EOF
)
psql "$OLD_DB" -At -F $'\t' -c "$PK_SQL" | tee "$OUT/old-pks.tsv"
echo "(NEW PKs:)"
psql "$NEW_DB" -At -F $'\t' -c "$PK_SQL" | tee "$OUT/new-pks.tsv"

echo
echo "Inspection done. Review the diff above. If columns are missing on"
echo "either side, or types differ, stop and tell Claude what you saw"
echo "before running step 3."

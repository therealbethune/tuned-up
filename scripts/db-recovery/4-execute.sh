#!/usr/bin/env bash
# Step 4: execute ./merge.sql against the destination DB.
#
# The merge.sql wraps the whole load in a single transaction. If
# anything fails — bad column type, missing table, permission issue —
# the entire merge rolls back and the destination is unchanged.
#
# We pass `-v ON_ERROR_STOP=1` so psql aborts on the first error
# instead of plowing through.

set -euo pipefail

: "${NEW_DB:?Set NEW_DB to the destination connection string}"

cd "$(dirname "$0")"

if [[ ! -f ./merge.sql ]]; then
  echo "ERROR: merge.sql missing. Run 3-dryrun.sh first." >&2
  exit 1
fi

echo "==> About to execute merge against the DESTINATION DB."
echo "    Destination: $(echo "$NEW_DB" | sed -E 's#://[^@]+@#://[REDACTED]@#')"
echo "    Press Ctrl-C in the next 5 seconds to abort."
sleep 5

LOG="./backups/$(cat ./backups/LATEST)/execute.log"

echo "==> Executing… (log: $LOG)"
psql "$NEW_DB" \
  -v ON_ERROR_STOP=1 \
  --single-transaction \
  -f ./merge.sql 2>&1 | tee "$LOG"

echo
echo "Merge executed. Run 5-verify.sh to confirm row counts."

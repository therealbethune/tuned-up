# One-shot recovery: merge old DB into new DB

This folder is a one-shot recovery playbook for restoring data from a
backed-up Postgres database into the current production DB. It is not
part of the deployed app — delete the folder once the recovery is done.

## Merge strategy

**Gap-fill.** Every row that already exists in the destination is
preserved as-is. Rows from the old DB are inserted only when their
primary key doesn't already exist in the destination. Nothing in the
new DB is ever overwritten or deleted.

This is the safest shape for a recovery scenario where the new DB
already has post-cutover activity worth keeping.

## Run order (from your laptop, NOT the sandbox)

```bash
cd scripts/db-recovery

# Edit these in your shell. Use single quotes so $ and ! aren't expanded.
export OLD_DB='postgresql://...old DB connection string...'
export NEW_DB='postgresql://...destination connection string...'

# 1. Backups (both DBs). Saves to ./backups/<timestamp>/.
bash 1-backup.sh

# 2. Inspect both databases. Prints table list + row counts + schema
#    diff. Read the output — abort if anything looks wrong.
bash 2-inspect.sh

# 3. Dry-run. Builds the merge SQL into ./merge.sql but does NOT
#    execute it against the destination. Open merge.sql, sanity-check
#    a few tables.
bash 3-dryrun.sh

# 4. Execute. Runs merge.sql inside a single transaction. If anything
#    errors, the whole thing rolls back.
bash 4-execute.sh

# 5. Verify. Re-runs row counts and confirms no FK orphans.
bash 5-verify.sh
```

## After it's done

1. **Rotate the password** on the old DB (the connection string was
   pasted in a chat transcript and should be treated as compromised).
2. Delete this `scripts/db-recovery/` folder — it's not part of the app.

## What if something goes wrong?

`1-backup.sh` saves a full `pg_dump` of the destination to
`./backups/<timestamp>/new-before.dump`. To restore:

```bash
pg_restore --clean --if-exists --no-owner --no-acl \
  --dbname "$NEW_DB" \
  ./backups/<timestamp>/new-before.dump
```

# Regular database update runbook

Use this runbook when you want the public/remote replica to catch up with the latest MusicBrainz data.

The regular flow is:

1. Refresh the local MusicBrainz database from the latest upstream dump.
2. Validate what changed locally and what the replica is missing.
3. Sync new local rows to the replica.
4. Verify the replica advanced, then clear API cache/restart services if needed.

## Important limitation

The current sync script is high-water-mark based. For each table in `.env` `TABLES`, it copies rows where the configured primary key is greater than the replica's current max primary key.

That means `sync_db.sh` syncs new rows only. It does **not** update or delete rows that already exist on the replica. If exact MusicBrainz parity is required, this project needs a different full-refresh/replace procedure for the replica.

## Prerequisites

- `.env` has correct local DB settings: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`.
- `.env` has correct replica DB settings: `REPLICA_DB_HOST`, `REPLICA_DB_PORT`, `REPLICA_DB_NAME`, `REPLICA_DB_USER`, `REPLICA_DB_PASSWORD`.
- `.env` has table sync settings:
  - `TABLES=musicbrainz.artist,musicbrainz.artist_credit_name,musicbrainz.artist_credit,musicbrainz.track`
  - `TABLE_PRIMARY_KEYS=musicbrainz.artist:id,musicbrainz.artist_credit_name:artist_credit,musicbrainz.artist_credit:id,musicbrainz.track:id`
- Local PostgreSQL is available and `init_db.sh` can connect as the `postgres` superuser.
- The API/dev server is stopped while the local DB is being recreated.

## Routine update checklist

Run from the repository root unless noted.

### 1. Refresh local MusicBrainz DB

This drops and recreates the local database named by `.env` `DB_NAME`.

```sh
cd setup
./init_db.sh
```

Use this only when you also want to delete previously downloaded dump files first:

```sh
./init_db.sh --clean
```

After import, optionally remove app-user superuser privileges:

```sh
psql --no-psqlrc -h "$DB_HOST" -p "$DB_PORT" -U postgres -d postgres -c 'ALTER USER musicbrainz WITH NOSUPERUSER;'
```

### 2. Check local vs replica state

Before syncing, run the debug script:

```sh
./debug_sync.sh
```

Review the output for each table:

- local connection succeeds
- replica connection succeeds
- table exists locally and remotely
- local max primary key is greater than or equal to replica max primary key
- “Potential records to sync” is reasonable

If the debug output shows zero potential records for every table after a fresh local import, the replica may already be caught up or the primary-key mapping may be wrong.

### 3. Sync new rows to the replica

```sh
./sync_db.sh
```

The script exports local rows to CSV under `EXPORT_DIR`, imports them into temporary staging tables on the replica, inserts in batches, then removes the CSV files.

### 4. Verify the replica advanced

Run the debug script again:

```sh
./debug_sync.sh
```

Expected result: “Potential records to sync” should be `0` for synced tables, or much lower if new upstream rows arrived while you were running the process.

### 5. Clear stale API cache and restart services

The API caches JSON responses under `${TMPDIR:-/tmp}/app_cache`. Clear the cache wherever the API process runs:

```sh
rm -rf "${TMPDIR:-/tmp}/app_cache"
```

Restart/redeploy any API process that points at the replica if needed.

### 6. Smoke-test the app/API

Start the API against the updated database and test the main endpoints:

```sh
deno task dev:api
```

In another shell, use a known artist search and GID:

```sh
curl 'http://localhost:8000/api/artists?q=radiohead'
curl 'http://localhost:8000/api/artists/<artist-gid>/collabs'
```

Confirm the responses are JSON and include expected artists/nodes/edges.

## Quick command sequence

For a normal additive replica update:

```sh
cd setup
./init_db.sh
./debug_sync.sh
./sync_db.sh
./debug_sync.sh
rm -rf "${TMPDIR:-/tmp}/app_cache"
```

Do not run `init_db.sh` against production or any shared database unless the intent is to drop and recreate it.

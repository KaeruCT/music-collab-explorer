# AGENTS.md

Guidance for coding agents working in this repository.

## Project overview

Music Collab Explorer is a full-stack Deno + React app that visualizes musical artist collaborations from a local MusicBrainz PostgreSQL database.

- Backend: Deno 2, Oak, PostgreSQL (`postgres` Deno module)
- Frontend: React 18, Vite, TypeScript, `vis-network`
- Data source: local MusicBrainz dump imported by scripts in `setup/`
- Package management: Deno import map in `deno.json`; there is no `package.json`

## Common commands

Run from the repository root unless noted.

```sh
deno task dev        # API on :8000 + Vite dev server with /api proxy
deno task dev:api    # API only, with --watch
deno task dev:vite   # Vite only
deno task build      # TypeScript build + Vite production build
deno task lint       # ESLint over api/ and src/
deno task start      # Serve API + built dist/ assets
deno task preview    # Vite preview for the frontend build
```

Use `deno task build` as the main verification command after changes. Use `deno task lint` for style/static checks. No test task is configured at the time of writing.

## Repository layout

```text
api/                    Deno/Oak backend
  main.ts               App entry point, CORS, API router, static dist serving
  router.ts             HTTP API routes and response shaping
  data.ts               MusicBrainz SQL queries and row-to-API mapping
  db/client.ts          PostgreSQL pool/env configuration
  cache.ts              Naive JSON file cache under TMPDIR/app_cache
  rateLimit.ts          In-memory per-IP rate limit middleware
  routeStaticFilesFrom.ts Static-file fallback for production build

src/                    React frontend
  App.tsx               Main app, vis-network graph, search/selection state
  types.ts              Shared frontend API/graph types
  fetchArtistImage.ts   Wikipedia thumbnail lookup + localStorage cache
  fetchArtistImagesInBatches.ts Batched graph node image hydration
  TrackInfo.tsx         YouTube search links for tracks
  Sticky.tsx            Sticky section headers for track list
  colors.ts             Deterministic-ish graph node color cache
  index.css             Global layout and styling

setup/                  Local/replica MusicBrainz database scripts
  init_db.sh            Download/import selected MusicBrainz tables and indexes
  sync_db.sh            One-way local -> replica table sync
```

## Backend notes

- `api/main.ts` loads `.env` through `@std/dotenv/load`, then reads env vars in imported modules.
- API routes currently exposed:
  - `GET /api/artists?q=<query>`: fuzzy artist search.
  - `GET /api/artists/:gid/collabs`: collaboration graph for a MusicBrainz artist GID.
- Database code expects `search_path=musicbrainz,public` and the imported MusicBrainz tables: `artist`, `artist_credit_name`, `artist_credit`, and `track`.
- Search depends on PostgreSQL `pg_trgm`, `unaccent`, and the custom immutable function/indexes created by `setup/init_db.sh`.
- Every route that calls the database must release the `PoolClient` in a `finally` block.
- Responses are cached as JSON files in `${TMPDIR:-/tmp}/app_cache`. Cache keys are URL/query-derived; remember stale cache when debugging data changes.
- Rate limiting is in-memory only (`10` requests per `500ms` per `ctx.request.ip`). It resets on process restart and is not multi-instance safe.
- Keep SQL parameterized. Do not interpolate user input into queries.

## Frontend notes

- `src/App.tsx` owns most behavior. Be careful when changing it: graph state lives both in React state and in the module-level singleton `visu`.
- `initVisu` intentionally creates a singleton `Network`/`DataSet` pair. Reinitializing it can duplicate event handlers or lose graph state.
- Selected artists and `showOnlySelected` persist in `localStorage`.
- Artist thumbnails are fetched directly from Wikipedia from the browser and cached in `localStorage` by artist name/comment.
- Collaboration graph flow:
  1. Search artist via `/api/artists`.
  2. Select/double-click artist.
  3. Fetch `/api/artists/:gid/collabs`.
  4. Add graph nodes/edges to `vis-network` datasets.
  5. Click nodes/edges to populate the right-hand track list.
- Graph edges are treated as undirected in the frontend when checking duplicates.
- Use explicit domain names for new UI/code paths; avoid generic names like `items`, `data`, or `details` when a music/domain term is clearer.

## Database setup

1. Copy env vars:
   ```sh
   cp .env.example .env
   ```
2. Edit `.env` for local PostgreSQL.
3. Import MusicBrainz data:
   ```sh
   cd setup
   ./init_db.sh
   # or ./init_db.sh --clean to remove existing dump files first
   ```
4. Optional hardening after import:
   ```sql
   ALTER USER musicbrainz WITH NOSUPERUSER;
   ```

`init_db.sh` downloads a large MusicBrainz dump and requires PostgreSQL superuser access for local setup. `sync_db.sh` uses `.env` `TABLES`, `TABLE_PRIMARY_KEYS`, and replica DB vars for one-way local-to-remote sync.

## Database update procedure

Use this procedure when updating local MusicBrainz data and/or pushing it to a replica.

### Local database refresh from MusicBrainz

This recreates the local database from the latest MusicBrainz full export. It is destructive to the local DB named by `.env` `DB_NAME`.

1. Confirm `.env` points at the intended local database (`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`).
2. Stop the API/dev server so no requests hit the database during import.
3. Run the import from `setup/`:
   ```sh
   cd setup
   ./init_db.sh
   ```
   Use `./init_db.sh --clean` only when you also want to delete any existing downloaded dump files first.
4. After import, optionally remove superuser from the app user:
   ```sql
   ALTER USER musicbrainz WITH NOSUPERUSER;
   ```
5. Clear stale API cache before testing updated data:
   ```sh
   rm -rf "${TMPDIR:-/tmp}/app_cache"
   ```
6. Start the API and smoke-test the two main endpoints with a known artist query/GID.

### Sync local updates to remote replica

`setup/sync_db.sh` performs a one-way local -> replica sync. It copies only rows whose configured primary key is greater than the current remote max for each table. It does not handle updates/deletes to existing remote rows.

1. Confirm `.env` has correct local DB vars, replica DB vars, `TABLES`, `TABLE_PRIMARY_KEYS`, and `EXPORT_DIR`.
2. Run the debug check first:
   ```sh
   cd setup
   ./debug_sync.sh
   ```
   Review connection success, table existence, row counts, and “Potential records to sync”.
3. If the debug output looks right, run:
   ```sh
   ./sync_db.sh
   ```
4. Re-run `./debug_sync.sh` or direct `COUNT(*)`/`MAX(id)` checks to confirm the replica advanced.
5. Restart or redeploy any API process pointed at the replica if needed, then clear its `${TMPDIR:-/tmp}/app_cache` so users do not see stale cached API responses.

Do not run `init_db.sh` against production or a shared database unless the intent is to drop and recreate it. Prefer `sync_db.sh` for replica updates.

## Environment variables

Primary app/database vars:

- `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_PORT`
- `HOSTNAME`, `PORT`
- `ENFORCE_TLS` (truthy string enables PostgreSQL TLS enforcement)

Replica sync vars are only used by `setup/sync_db.sh`:

- `REPLICA_DB_HOST`, `REPLICA_DB_NAME`, `REPLICA_DB_USER`, `REPLICA_DB_PASSWORD`, `REPLICA_DB_PORT`
- `TABLES`, `TABLE_PRIMARY_KEYS`, `EXPORT_DIR`

Do not commit real `.env` secrets.

## Docker/deploy notes

- `Dockerfile` builds the frontend in one Deno stage and copies `dist/` plus `api/` into a runtime Deno image.
- Production `deno task start` serves both API routes and static files from `dist/`.
- The container still needs database env vars and network access to PostgreSQL.

## Coding conventions

- Match the existing TypeScript style and keep changes simple.
- Prefer small, focused functions over new abstractions.
- Do not add dependencies unless explicitly needed; use the existing Deno imports first.
- Keep imports with `.ts`/`.tsx` extensions where the codebase already does.
- For React changes, keep state updates predictable and avoid mutating `vis-network` datasets from multiple places without checking the current singleton state.
- For backend changes, keep route validation explicit and return JSON error bodies with an appropriate status.
- Preserve comments that explain operational/domain context. Avoid adding comments that only restate code.

## Verification checklist

Before saying a change is done, run the relevant checks and report the exact command output summary.

- Backend/frontend code changes: `deno task build`
- Lint/style changes: `deno task lint`
- API/database behavior changes: run the API with `deno task dev:api` and exercise the changed endpoint when a database is available
- Frontend behavior changes: run `deno task dev` and verify through the browser when practical

If local PostgreSQL/MusicBrainz data is not available, say that explicitly and limit claims to build/lint/static verification.

#!/bin/bash
set -xe

# Load environment variables
set -o allexport
source "$(dirname "$0")/../.env"
set +o allexport

BASE_URL="https://data.metabrainz.org/pub/musicbrainz/data/fullexport"
LATEST_FILE="$BASE_URL/LATEST"

# Get the latest dump version
LATEST_VERSION=$(curl -s "$LATEST_FILE")
if [[ -z "$LATEST_VERSION" ]]; then
    echo "Failed to retrieve the latest version."
    exit 1
fi

DUMP_URL="$BASE_URL/$LATEST_VERSION/mbdump.tar.bz2"
FILE_NAME="mbdump.tar.bz2"

# Download using wget with resume support
wget -c "$DUMP_URL" -O "$FILE_NAME"

echo "MusicBrainz Database dump downloaded"

PGHOST="$DB_HOST"
PGUSER="postgres"  # Use postgres superuser for database operations
PGPORT="$DB_PORT"
DBNAME="$DB_NAME"
DBUSER="$DB_USER"
DBPASS="$DB_PASSWORD"

echo "(Re)creating database and user"

psql --no-psqlrc -p $PGPORT -h $PGHOST -U "$PGUSER" -d postgres -c "DROP DATABASE IF EXISTS $DBNAME;"
psql --no-psqlrc -p $PGPORT -h $PGHOST -U "$PGUSER" -d postgres -c "DO \$\$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$DBUSER') THEN CREATE USER $DBUSER WITH PASSWORD '$DBPASS'; END IF; END \$\$;"
psql --no-psqlrc -p $PGPORT -h $PGHOST -U "$PGUSER" -d postgres -c "CREATE DATABASE $DBNAME OWNER $DBUSER;"
psql --no-psqlrc -p $PGPORT -h $PGHOST -U "$PGUSER" -d postgres -c "ALTER USER $DBUSER WITH SUPERUSER;"
psql --no-psqlrc -p $PGPORT -h $PGHOST -U "$PGUSER" -d postgres -c "GRANT ALL PRIVILEGES ON DATABASE $DBNAME TO $DBUSER;"
psql --no-psqlrc -p $PGPORT -h $PGHOST -U "$PGUSER" -d "$DBNAME" -c "GRANT USAGE ON SCHEMA public TO $DBUSER;"
psql --no-psqlrc -p $PGPORT -h $PGHOST -U "$PGUSER" -d "$DBNAME" -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO $DBUSER;"
psql --no-psqlrc -p $PGPORT -h $PGHOST -U "$PGUSER" -d "$DBNAME" -c "GRANT SELECT ON ALL TABLES IN SCHEMA public TO $DBUSER;"

# the next section is heavily based on https://github.com/arey/musicbrainz-database/blob/master/create-database.sh

psql --no-psqlrc -p $PGPORT -h $PGHOST -d $DBNAME -U $PGUSER -a -c "CREATE SCHEMA IF NOT EXISTS musicbrainz;";

# not sure why this doesn't work so we create a different way
# wget https://raw.githubusercontent.com/metabrainz/musicbrainz-server/master/admin/sql/CreateCollations.sql
# psql --no-psqlrc -p $PGPORT -h $PGHOST -d $DBNAME -U $PGUSER -a -f CreateCollations.sql
# rm CreateCollations.sql
##psql --no-psqlrc -p $PGPORT -h $PGHOST -d $DBNAME -U $PGUSER -a -c "CREATE COLLATION public.musicbrainz (LOCALE = 'C');"
psql --no-psqlrc -p $PGPORT -h $PGHOST -d $DBNAME -U $PGUSER -a -c "CREATE COLLATION musicbrainz.musicbrainz (LOCALE = 'C');"

# fetch and modify SQL files before execution
fetch_and_execute_sql() {
    local sql_url=$1
    local sql_file=$(basename "$sql_url")
    wget "$sql_url"
    awk 'NR==1{print "SET search_path TO musicbrainz, public;"}1' "$sql_file" > tmp.sql && mv tmp.sql "$sql_file"
    psql --no-psqlrc -p $PGPORT -h $PGHOST -d $DBNAME -U $PGUSER -a -f "$sql_file"
    rm "$sql_file"
}

fetch_and_execute_sql "https://raw.githubusercontent.com/metabrainz/musicbrainz-server/master/admin/sql/Extensions.sql"
fetch_and_execute_sql "https://raw.githubusercontent.com/metabrainz/musicbrainz-server/master/admin/sql/CreateTypes.sql"
fetch_and_execute_sql "https://raw.githubusercontent.com/metabrainz/musicbrainz-server/master/admin/sql/CreateTables.sql"
fetch_and_execute_sql "https://raw.githubusercontent.com/metabrainz/musicbrainz-server/master/admin/sql/CreateSearchConfiguration.sql"
fetch_and_execute_sql "https://raw.githubusercontent.com/metabrainz/musicbrainz-server/master/admin/sql/CreateFunctions.sql"

# tables to import
tables=("artist" "artist_credit_name" "artist_credit" "track")

files_to_extract=()
for table in "${tables[@]}"; do
  files_to_extract+=("mbdump/${table}")
done

echo "Extracting tables from dump"
# extract only the selected files
tar xjvf "$FILE_NAME" "${files_to_extract[@]}"

for f in "${files_to_extract[@]}"
do
  tablename="${f:7}"
  echo "Importing table: $tablename"
  chmod a+rX "$f"
  (echo "SET search_path TO musicbrainz, public;" && echo "\COPY $tablename FROM '$f'") | psql --no-psqlrc -p $PGPORT -h $PGHOST -d $DBNAME -U $PGUSER -a
done

rm -rf mbdump

echo "Creating indexes and primary keys"

fetch_and_execute_sql "https://raw.githubusercontent.com/metabrainz/musicbrainz-server/master/admin/sql/CreatePrimaryKeys.sql"
fetch_and_execute_sql "https://raw.githubusercontent.com/metabrainz/musicbrainz-server/master/admin/sql/CreateIndexes.sql"

psql --no-psqlrc -p $PGPORT -h $PGHOST -d $DBNAME -U $PGUSER -a -c "CREATE INDEX IF NOT EXISTS idx_artist_credit_name_artist ON musicbrainz.artist_credit_name (artist);"

psql --no-psqlrc -p $PGPORT -h $PGHOST -d $DBNAME -U $PGUSER -a -c "CREATE INDEX IF NOT EXISTS idx_artist_credit_name_artist_credit ON musicbrainz.artist_credit_name (artist_credit);"

psql --no-psqlrc -p $PGPORT -h $PGHOST -d $DBNAME -U $PGUSER -a <<EOF
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION immutable_unaccent(text) RETURNS text AS \$\$
SELECT unaccent(\$1);
\$\$ LANGUAGE sql IMMUTABLE;

CREATE INDEX IF NOT EXISTS idx_artist_name_trgm ON musicbrainz.artist USING gin (immutable_unaccent(lower(name)) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_acn_name_trgm ON musicbrainz.artist_credit_name USING gin (immutable_unaccent(lower(name)) gin_trgm_ops);
EOF

echo "Database initialization complete!"
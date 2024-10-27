#!/bin/bash
# heavily based on https://github.com/arey/musicbrainz-database/blob/master/create-database.sh

export PGHOST=localhost
export PGPORT=15432
export PGPASSWORD=postgres
export DB=musicbrainz
export PGUSER=postgres

# Define an array of tables to import
tables=("artist" "artist_credit_name" "artist_credit" "track")

# Construct a list of files to extract
files_to_extract=()
for table in "${tables[@]}"; do
  files_to_extract+=("mbdump/${table}")
done

psql -p $PGPORT -h $PGHOST -d $DB -U $PGUSER -a -c "CREATE SCHEMA musicbrainz;";
# not sure why this doesn't work so we create a different way
# wget https://raw.githubusercontent.com/metabrainz/musicbrainz-server/master/admin/sql/CreateCollations.sql
# psql -p $PGPORT -h $PGHOST -d $DB -U $PGUSER -a -f CreateCollations.sql
# rm CreateCollations.sql
psql -p $PGPORT -h $PGHOST -d $DB -U $PGUSER -a -c "CREATE COLLATION musicbrainz (LOCALE = 'C');"

wget https://raw.githubusercontent.com/metabrainz/musicbrainz-server/master/admin/sql/Extensions.sql
psql -p $PGPORT -h $PGHOST -d $DB -U $PGUSER -a -f Extensions.sql
rm Extensions.sql

wget https://raw.githubusercontent.com/metabrainz/musicbrainz-server/master/admin/sql/CreateFunctions.sql
psql -p $PGPORT -h $PGHOST -d $DB -U $PGUSER -a -f CreateFunctions.sql
rm CreateFunctions.sql

wget https://raw.githubusercontent.com/metabrainz/musicbrainz-server/master/admin/sql/CreateTypes.sql
psql -p $PGPORT -h $PGHOST -d $DB -U $PGUSER -a -f CreateTypes.sql
rm CreateTypes.sql

wget https://raw.githubusercontent.com/metabrainz/musicbrainz-server/master/admin/sql/CreateTables.sql
psql -p $PGPORT -h $PGHOST -d $DB -U $PGUSER -a -f CreateTables.sql
rm CreateTables.sql

echo "decompressing Musicbrainz dump"
# Extract only the selected files
tar xjvf mbdump.tar.bz2 "${files_to_extract[@]}"

for f in "${files_to_extract[@]}"
do
  tablename="${f:7}"
  echo "importing $tablename table"
  chmod a+rX "$f"
  (echo "SET search_path TO musicbrainz, public;" && echo "\COPY $tablename FROM '$f'") | psql -p $PGPORT -h $PGHOST -d $DB -U $PGUSER -a
done

rm -rf mbdump

echo "creating indexes and primary Keys"

wget https://raw.githubusercontent.com/metabrainz/musicbrainz-server/master/admin/sql/CreatePrimaryKeys.sql
psql -p $PGPORT -h $PGHOST -d $DB -U $PGUSER -a -f CreatePrimaryKeys.sql
rm CreatePrimaryKeys.sql

wget https://raw.githubusercontent.com/metabrainz/musicbrainz-server/master/admin/sql/CreateIndexes.sql
psql -p $PGPORT -h $PGHOST -d $DB -U $PGUSER -a -f CreateIndexes.sql
rm CreateIndexes.sql

psql -p $PGPORT -h $PGHOST -d $DB -U $PGUSER -a -c "CREATE INDEX idx_artist_credit_name_artist ON artist_credit_name (artist);"

psql -p $PGPORT -h $PGHOST -d $DB -U $PGUSER -a -c "CREATE INDEX idx_artist_credit_name_artist_credit ON artist_credit_name (artist_credit);"

psql -p $PGPORT -h $PGHOST -d $DB -U $PGUSER -a -c "CREATE EXTENSION IF NOT EXISTS pg_trgm; CREATE INDEX idx_artist_name_trgm ON artist USING gin (name gin_trgm_ops); CREATE INDEX idx_acn_name_trgm ON artist_credit_name USING gin (name gin_trgm_ops);";


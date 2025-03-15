#!/bin/bash

# Load environment variables
set -o allexport
source "$(dirname "$0")/../.env"
set +o allexport

mkdir -p "$EXPORT_DIR"

IFS=',' read -r -a TABLE_ARRAY <<< "$TABLES"

TABLE_NAMES=()
PRIMARY_KEYS=()

IFS=',' read -r -a MAPPING_ARRAY <<< "$TABLE_PRIMARY_KEYS"
for mapping in "${MAPPING_ARRAY[@]}"; do
    table_name="${mapping%:*}"  # Extract table name
    primary_key="${mapping##*:}"  # Extract primary key
    TABLE_NAMES+=("$table_name")
    PRIMARY_KEYS+=("$primary_key")
done

for TABLE in "${TABLE_ARRAY[@]}"; do
    PRIMARY_KEY=""

    for i in "${!TABLE_NAMES[@]}"; do
        if [[ "${TABLE_NAMES[$i]}" == "$TABLE" ]]; then
            PRIMARY_KEY="${PRIMARY_KEYS[$i]}"
            break
        fi
    done

    if [ -z "$PRIMARY_KEY" ]; then
        echo "Error: No primary key mapping found for table '$TABLE'. Check TABLE_PRIMARY_KEYS in .env."
        continue
    fi

    echo "Syncing table: $TABLE (Primary key: $PRIMARY_KEY)"

    LAST_ID=$(PGPASSWORD="$REPLICA_DB_PASSWORD" psql -h "$REPLICA_DB_HOST" -U "$REPLICA_DB_USER" -d "$REPLICA_DB_NAME" -p "$REPLICA_DB_PORT" -t -c "SELECT COALESCE(MAX(\"$PRIMARY_KEY\"), 0) FROM $TABLE;" | tr -d ' ')

    echo "Last synced ID for $TABLE: $LAST_ID"

    EXPORT_FILE="$EXPORT_DIR/$TABLE.csv"
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -p "$DB_PORT" -c "\copy (SELECT * FROM $TABLE WHERE \"$PRIMARY_KEY\" > $LAST_ID) TO '$EXPORT_FILE' WITH CSV HEADER;"

    PGPASSWORD="$REPLICA_DB_PASSWORD" psql -h "$REPLICA_DB_HOST" -U "$REPLICA_DB_USER" -d "$REPLICA_DB_NAME" -p "$REPLICA_DB_PORT" -c "\copy $TABLE FROM '$EXPORT_FILE' CSV HEADER;"
    echo "Sync for $TABLE complete."
done

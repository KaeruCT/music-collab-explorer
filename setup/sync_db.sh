#!/bin/bash
set -e

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

    LAST_ID=$(PGPASSWORD="$REPLICA_DB_PASSWORD" psql --no-psqlrc -h "$REPLICA_DB_HOST" -U "$REPLICA_DB_USER" -d "$REPLICA_DB_NAME" -p "$REPLICA_DB_PORT" -t -c "SELECT COALESCE(MAX(\"$PRIMARY_KEY\"), 0) FROM $TABLE;" | tr -d ' ')

    echo "Last synced ID for $TABLE: $LAST_ID"

    EXPORT_FILE="$EXPORT_DIR/$TABLE.csv"
    PGPASSWORD="$DB_PASSWORD" psql --no-psqlrc -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -p "$DB_PORT" -c "\copy (SELECT * FROM $TABLE WHERE \"$PRIMARY_KEY\" > $LAST_ID) TO '$EXPORT_FILE' WITH CSV HEADER;"

    # Use staging table approach to handle conflicts - each table in separate transaction
    DATE_STAMP=$(date +%Y%m%d)
    STAGING_TABLE="sync_staging_$(echo "$TABLE" | sed 's/.*\.//')_$DATE_STAMP"

    # Step 1: Create staging table
    PGPASSWORD="$REPLICA_DB_PASSWORD" psql --no-psqlrc -h "$REPLICA_DB_HOST" -U "$REPLICA_DB_USER" -d "$REPLICA_DB_NAME" -p "$REPLICA_DB_PORT" -c "DROP TABLE IF EXISTS $STAGING_TABLE; CREATE TABLE $STAGING_TABLE (LIKE $TABLE INCLUDING DEFAULTS);"

    # Step 2: Copy data into staging table
    PGPASSWORD="$REPLICA_DB_PASSWORD" psql --no-psqlrc -h "$REPLICA_DB_HOST" -U "$REPLICA_DB_USER" -d "$REPLICA_DB_NAME" -p "$REPLICA_DB_PORT" -c "\copy $STAGING_TABLE FROM '$EXPORT_FILE' CSV HEADER"

    # Step 3: Get row count for batching
    echo "Checking row count in staging table $STAGING_TABLE..."
    TOTAL_ROWS=$(PGPASSWORD="$REPLICA_DB_PASSWORD" psql --no-psqlrc -h "$REPLICA_DB_HOST" -U "$REPLICA_DB_USER" -d "$REPLICA_DB_NAME" -p "$REPLICA_DB_PORT" -t -c "SELECT COUNT(*) FROM $STAGING_TABLE;" | tr -d ' ')
    echo "Found $TOTAL_ROWS rows in staging table"

    if [ -z "$TOTAL_ROWS" ] || [ "$TOTAL_ROWS" -eq 0 ]; then
        echo "No new records to sync for $TABLE (TOTAL_ROWS='$TOTAL_ROWS')"
    else
        echo "Inserting $TOTAL_ROWS records in batches..."
        BATCH_SIZE=50000
        BATCH_NUM=1

        for ((offset=0; offset<TOTAL_ROWS; offset+=BATCH_SIZE)); do
            echo "Processing batch $BATCH_NUM (records $((offset+1))-$((offset+BATCH_SIZE > TOTAL_ROWS ? TOTAL_ROWS : offset+BATCH_SIZE)))"

            PGPASSWORD="$REPLICA_DB_PASSWORD" psql --no-psqlrc -h "$REPLICA_DB_HOST" -U "$REPLICA_DB_USER" -d "$REPLICA_DB_NAME" -p "$REPLICA_DB_PORT" -c "
                SET statement_timeout = 0;
                INSERT INTO $TABLE
                SELECT * FROM $STAGING_TABLE
                ORDER BY \"$PRIMARY_KEY\"
                OFFSET $offset LIMIT $BATCH_SIZE
                ON CONFLICT DO NOTHING;
            "

            BATCH_NUM=$((BATCH_NUM + 1))
        done
        echo "All batches completed for $TABLE"
    fi

    # Step 4: Clean up staging table
    PGPASSWORD="$REPLICA_DB_PASSWORD" psql --no-psqlrc -h "$REPLICA_DB_HOST" -U "$REPLICA_DB_USER" -d "$REPLICA_DB_NAME" -p "$REPLICA_DB_PORT" -c "DROP TABLE $STAGING_TABLE;"
    
    echo "Sync for $TABLE complete."
done

rm -f "$EXPORT_DIR"/*.csv

echo "Database synchronization complete!"
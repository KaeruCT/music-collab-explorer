#!/bin/bash
set -e

# Load environment variables
set -o allexport
source "$(dirname "$0")/../.env"
set +o allexport

echo "=== Database Sync Debug Information ==="
echo

IFS=',' read -r -a TABLE_ARRAY <<< "$TABLES"
IFS=',' read -r -a MAPPING_ARRAY <<< "$TABLE_PRIMARY_KEYS"

TABLE_NAMES=()
PRIMARY_KEYS=()

for mapping in "${MAPPING_ARRAY[@]}"; do
    table_name="${mapping%:*}"
    primary_key="${mapping##*:}"
    TABLE_NAMES+=("$table_name")
    PRIMARY_KEYS+=("$primary_key")
done

echo "Local Database Connection:"
echo "  Host: $DB_HOST"
echo "  Port: $DB_PORT"
echo "  Database: $DB_NAME"
echo "  User: $DB_USER"
echo

echo "Remote Database Connection:"
echo "  Host: $REPLICA_DB_HOST"
echo "  Port: $REPLICA_DB_PORT"
echo "  Database: $REPLICA_DB_NAME"
echo "  User: $REPLICA_DB_USER"
echo

echo "Tables to sync: ${TABLE_ARRAY[*]}"
echo "Primary key mappings: ${MAPPING_ARRAY[*]}"
echo

for TABLE in "${TABLE_ARRAY[@]}"; do
    PRIMARY_KEY=""

    for i in "${!TABLE_NAMES[@]}"; do
        if [[ "${TABLE_NAMES[$i]}" == "$TABLE" ]]; then
            PRIMARY_KEY="${PRIMARY_KEYS[$i]}"
            break
        fi
    done

    if [ -z "$PRIMARY_KEY" ]; then
        echo "❌ Error: No primary key mapping found for table '$TABLE'"
        continue
    fi

    echo "=== Analyzing table: $TABLE (Primary key: $PRIMARY_KEY) ==="

    # Test local database connection
    echo "Testing local database connection..."
    LOCAL_CONNECTION_TEST=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -p "$DB_PORT" -t -c "SELECT 1;" 2>&1 || echo "CONNECTION_FAILED")
    if [[ "$LOCAL_CONNECTION_TEST" == *"CONNECTION_FAILED"* ]]; then
        echo "❌ Local database connection failed: $LOCAL_CONNECTION_TEST"
        continue
    else
        echo "✅ Local database connection successful"
    fi

    # Test remote database connection
    echo "Testing remote database connection..."
    REMOTE_CONNECTION_TEST=$(PGPASSWORD="$REPLICA_DB_PASSWORD" psql -h "$REPLICA_DB_HOST" -U "$REPLICA_DB_USER" -d "$REPLICA_DB_NAME" -p "$REPLICA_DB_PORT" -t -c "SELECT 1;" 2>&1 || echo "CONNECTION_FAILED")
    if [[ "$REMOTE_CONNECTION_TEST" == *"CONNECTION_FAILED"* ]]; then
        echo "❌ Remote database connection failed: $REMOTE_CONNECTION_TEST"
        continue
    else
        echo "✅ Remote database connection successful"
    fi

    # Parse schema and table name
    if [[ "$TABLE" == *.* ]]; then
        SCHEMA_NAME="${TABLE%.*}"
        TABLE_NAME="${TABLE#*.}"
    else
        SCHEMA_NAME="public"
        TABLE_NAME="$TABLE"
    fi

    echo "Parsed schema: '$SCHEMA_NAME', table: '$TABLE_NAME'"

    # Check if table exists in local database
    echo "Checking if table exists in local database..."
    LOCAL_TABLE_EXISTS=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -p "$DB_PORT" -t -c "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = '$TABLE_NAME' AND table_schema = '$SCHEMA_NAME');")
    if [[ "$LOCAL_TABLE_EXISTS" == *"t"* ]]; then
        echo "✅ Table exists in local database"
    else
        echo "❌ Table does not exist in local database"
        continue
    fi

    # Check if table exists in remote database
    echo "Checking if table exists in remote database..."
    REMOTE_TABLE_EXISTS=$(PGPASSWORD="$REPLICA_DB_PASSWORD" psql -h "$REPLICA_DB_HOST" -U "$REPLICA_DB_USER" -d "$REPLICA_DB_NAME" -p "$REPLICA_DB_PORT" -t -c "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = '$TABLE_NAME' AND table_schema = '$SCHEMA_NAME');")
    if [[ "$REMOTE_TABLE_EXISTS" == *"t"* ]]; then
        echo "✅ Table exists in remote database"
    else
        echo "❌ Table does not exist in remote database"
        continue
    fi

    # Get local table stats
    echo "Local table statistics:"
    LOCAL_COUNT=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -p "$DB_PORT" -t -c "SELECT COUNT(*) FROM $TABLE;" | tr -d ' ')
    LOCAL_MAX_ID=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -p "$DB_PORT" -t -c "SELECT COALESCE(MAX(\"$PRIMARY_KEY\"), 0) FROM $TABLE;" | tr -d ' ')
    LOCAL_MIN_ID=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -p "$DB_PORT" -t -c "SELECT COALESCE(MIN(\"$PRIMARY_KEY\"), 0) FROM $TABLE;" | tr -d ' ')
    echo "  Row count: $LOCAL_COUNT"
    echo "  Min $PRIMARY_KEY: $LOCAL_MIN_ID"
    echo "  Max $PRIMARY_KEY: $LOCAL_MAX_ID"

    # Get remote table stats
    echo "Remote table statistics:"
    REMOTE_COUNT=$(PGPASSWORD="$REPLICA_DB_PASSWORD" psql -h "$REPLICA_DB_HOST" -U "$REPLICA_DB_USER" -d "$REPLICA_DB_NAME" -p "$REPLICA_DB_PORT" -t -c "SELECT COUNT(*) FROM $TABLE;" | tr -d ' ')
    REMOTE_MAX_ID=$(PGPASSWORD="$REPLICA_DB_PASSWORD" psql -h "$REPLICA_DB_HOST" -U "$REPLICA_DB_USER" -d "$REPLICA_DB_NAME" -p "$REPLICA_DB_PORT" -t -c "SELECT COALESCE(MAX(\"$PRIMARY_KEY\"), 0) FROM $TABLE;" | tr -d ' ')
    REMOTE_MIN_ID=$(PGPASSWORD="$REPLICA_DB_PASSWORD" psql -h "$REPLICA_DB_HOST" -U "$REPLICA_DB_USER" -d "$REPLICA_DB_NAME" -p "$REPLICA_DB_PORT" -t -c "SELECT COALESCE(MIN(\"$PRIMARY_KEY\"), 0) FROM $TABLE;" | tr -d ' ')
    echo "  Row count: $REMOTE_COUNT"
    echo "  Min $PRIMARY_KEY: $REMOTE_MIN_ID"
    echo "  Max $PRIMARY_KEY: $REMOTE_MAX_ID"

    # Calculate sync potential
    SYNCABLE_COUNT=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -p "$DB_PORT" -t -c "SELECT COUNT(*) FROM $TABLE WHERE \"$PRIMARY_KEY\" > $REMOTE_MAX_ID;" | tr -d ' ')
    echo "Potential records to sync: $SYNCABLE_COUNT (local records with $PRIMARY_KEY > $REMOTE_MAX_ID)"

    if [[ "$SYNCABLE_COUNT" -gt 0 ]]; then
        echo "✅ Found $SYNCABLE_COUNT records that should sync"
        # Show a sample of records that would sync
        echo "Sample records to sync:"
        PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -p "$DB_PORT" -c "SELECT \"$PRIMARY_KEY\" FROM $TABLE WHERE \"$PRIMARY_KEY\" > $REMOTE_MAX_ID ORDER BY \"$PRIMARY_KEY\" LIMIT 5;"
    else
        echo "❌ No records found to sync"
    fi

    echo
done

echo "=== Debug complete ==="
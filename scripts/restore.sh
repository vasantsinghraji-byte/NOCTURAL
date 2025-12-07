#!/bin/bash

###############################################################################
# Nocturnal Restore Script
# Restores MongoDB database and uploads from backup
# Usage: ./scripts/restore.sh [backup_date] [environment]
###############################################################################

set -e

# Configuration
BACKUP_DATE=${1}
ENVIRONMENT=${2:-production}
BACKUP_DIR="/backups/nocturnal"
S3_BUCKET="nocturnal-backups-${ENVIRONMENT}"

# MongoDB configuration
MONGODB_URI=${MONGODB_URI:-"mongodb://localhost:27017/nocturnal"}
MONGODB_DATABASE="nocturnal"

# Directories
UPLOADS_DIR="./uploads"
LOGS_DIR="./logs"

# Validate parameters
if [ -z "$BACKUP_DATE" ]; then
    echo "Usage: $0 <backup_date> [environment]"
    echo "Example: $0 20250101_020000 production"
    echo ""
    echo "Available backups:"
    ls -1 "${BACKUP_DIR}" | grep ".tar.gz" | sort -r | head -10
    exit 1
fi

echo "========================================="
echo "Nocturnal Restore Script"
echo "Backup Date: ${BACKUP_DATE}"
echo "Environment: ${ENVIRONMENT}"
echo "Date: $(date)"
echo "========================================="

# Function to download from S3
download_from_s3() {
    echo "Downloading backups from S3..."

    if command -v aws &> /dev/null; then
        mkdir -p "${BACKUP_DIR}"

        aws s3 cp "s3://${S3_BUCKET}/backups/mongo_${BACKUP_DATE}.tar.gz" "${BACKUP_DIR}/" || true
        aws s3 cp "s3://${S3_BUCKET}/backups/uploads_${BACKUP_DATE}.tar.gz" "${BACKUP_DIR}/" || true
        aws s3 cp "s3://${S3_BUCKET}/backups/logs_${BACKUP_DATE}.tar.gz" "${BACKUP_DIR}/" || true

        echo "✅ Backups downloaded from S3"
    else
        echo "⚠️  AWS CLI not found, using local backups only"
    fi
}

# Function to restore MongoDB
restore_mongodb() {
    echo "Restoring MongoDB..."

    MONGO_BACKUP="${BACKUP_DIR}/mongo_${BACKUP_DATE}.tar.gz"

    if [ ! -f "${MONGO_BACKUP}" ]; then
        echo "❌ MongoDB backup not found: ${MONGO_BACKUP}"
        exit 1
    fi

    # Extract backup
    TEMP_DIR=$(mktemp -d)
    tar -xzf "${MONGO_BACKUP}" -C "${TEMP_DIR}"

    # Confirm restore
    read -p "⚠️  This will overwrite the database. Continue? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        echo "Restore cancelled"
        rm -rf "${TEMP_DIR}"
        exit 0
    fi

    # Restore database
    mongorestore \
        --uri="${MONGODB_URI}" \
        --db="${MONGODB_DATABASE}" \
        --dir="${TEMP_DIR}/mongo_${BACKUP_DATE}/${MONGODB_DATABASE}" \
        --gzip \
        --drop

    if [ $? -eq 0 ]; then
        echo "✅ MongoDB restored successfully"
        rm -rf "${TEMP_DIR}"
    else
        echo "❌ MongoDB restore failed"
        rm -rf "${TEMP_DIR}"
        exit 1
    fi
}

# Function to restore uploads
restore_uploads() {
    echo "Restoring uploads..."

    UPLOADS_BACKUP="${BACKUP_DIR}/uploads_${BACKUP_DATE}.tar.gz"

    if [ ! -f "${UPLOADS_BACKUP}" ]; then
        echo "⚠️  Uploads backup not found: ${UPLOADS_BACKUP}"
        return
    fi

    # Backup current uploads
    if [ -d "${UPLOADS_DIR}" ]; then
        TEMP_BACKUP="${UPLOADS_DIR}.backup_$(date +%Y%m%d_%H%M%S)"
        mv "${UPLOADS_DIR}" "${TEMP_BACKUP}"
        echo "📦 Current uploads backed up to: ${TEMP_BACKUP}"
    fi

    # Extract uploads
    tar -xzf "${UPLOADS_BACKUP}"

    if [ $? -eq 0 ]; then
        echo "✅ Uploads restored successfully"
    else
        echo "❌ Uploads restore failed"
        if [ -d "${TEMP_BACKUP}" ]; then
            mv "${TEMP_BACKUP}" "${UPLOADS_DIR}"
            echo "Rolled back to previous uploads"
        fi
        exit 1
    fi
}

# Function to restore logs
restore_logs() {
    echo "Restoring logs..."

    LOGS_BACKUP="${BACKUP_DIR}/logs_${BACKUP_DATE}.tar.gz"

    if [ ! -f "${LOGS_BACKUP}" ]; then
        echo "⚠️  Logs backup not found: ${LOGS_BACKUP}"
        return
    fi

    # Backup current logs
    if [ -d "${LOGS_DIR}" ]; then
        TEMP_BACKUP="${LOGS_DIR}.backup_$(date +%Y%m%d_%H%M%S)"
        mv "${LOGS_DIR}" "${TEMP_BACKUP}"
        echo "📦 Current logs backed up to: ${TEMP_BACKUP}"
    fi

    # Extract logs
    tar -xzf "${LOGS_BACKUP}"

    if [ $? -eq 0 ]; then
        echo "✅ Logs restored successfully"
    else
        echo "❌ Logs restore failed"
        if [ -d "${TEMP_BACKUP}" ]; then
            mv "${TEMP_BACKUP}" "${LOGS_DIR}"
            echo "Rolled back to previous logs"
        fi
    fi
}

# Function to verify restore
verify_restore() {
    echo "Verifying restore..."

    # Check if MongoDB is accessible
    if mongosh "${MONGODB_URI}" --eval "db.stats()" > /dev/null; then
        echo "✅ MongoDB is accessible"

        # Get collection counts
        echo "Collection counts:"
        mongosh "${MONGODB_URI}" --eval "
            db.users.countDocuments();
            db.duties.countDocuments();
            db.applications.countDocuments();
        " --quiet
    else
        echo "❌ MongoDB verification failed"
        exit 1
    fi

    # Check if uploads directory exists
    if [ -d "${UPLOADS_DIR}" ]; then
        FILE_COUNT=$(find "${UPLOADS_DIR}" -type f | wc -l)
        echo "✅ Uploads directory exists with ${FILE_COUNT} files"
    fi
}

# Main execution
main() {
    download_from_s3
    restore_mongodb
    restore_uploads
    restore_logs
    verify_restore

    echo "========================================="
    echo "Restore completed successfully!"
    echo "========================================="
}

# Run main function
main

# Exit successfully
exit 0

#!/bin/bash

###############################################################################
# Nocturnal Backup Script
# Backs up MongoDB database and uploads directory
# Usage: ./scripts/backup.sh [environment]
###############################################################################

set -e

# Configuration
ENVIRONMENT=${1:-production}
BACKUP_DIR="/backups/nocturnal"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=7
S3_BUCKET="nocturnal-backups-${ENVIRONMENT}"

# MongoDB configuration
MONGODB_URI=${MONGODB_URI:-"mongodb://localhost:27017/nocturnal"}
MONGODB_DATABASE="nocturnal"

# Directories to backup
UPLOADS_DIR="./uploads"
LOGS_DIR="./logs"

# Create backup directory
mkdir -p "${BACKUP_DIR}"

echo "========================================="
echo "Nocturnal Backup Script"
echo "Environment: ${ENVIRONMENT}"
echo "Date: $(date)"
echo "========================================="

# Function to backup MongoDB
backup_mongodb() {
    echo "Starting MongoDB backup..."

    MONGO_BACKUP_DIR="${BACKUP_DIR}/mongo_${DATE}"
    mkdir -p "${MONGO_BACKUP_DIR}"

    mongodump \
        --uri="${MONGODB_URI}" \
        --db="${MONGODB_DATABASE}" \
        --out="${MONGO_BACKUP_DIR}" \
        --gzip

    if [ $? -eq 0 ]; then
        echo "✅ MongoDB backup completed: ${MONGO_BACKUP_DIR}"

        # Create tarball
        tar -czf "${BACKUP_DIR}/mongo_${DATE}.tar.gz" -C "${BACKUP_DIR}" "mongo_${DATE}"
        rm -rf "${MONGO_BACKUP_DIR}"

        echo "✅ MongoDB backup compressed"
    else
        echo "❌ MongoDB backup failed"
        exit 1
    fi
}

# Function to backup uploads directory
backup_uploads() {
    echo "Starting uploads backup..."

    if [ -d "${UPLOADS_DIR}" ]; then
        UPLOADS_BACKUP="${BACKUP_DIR}/uploads_${DATE}.tar.gz"

        tar -czf "${UPLOADS_BACKUP}" "${UPLOADS_DIR}"

        if [ $? -eq 0 ]; then
            echo "✅ Uploads backup completed: ${UPLOADS_BACKUP}"
        else
            echo "❌ Uploads backup failed"
            exit 1
        fi
    else
        echo "⚠️  Uploads directory not found, skipping"
    fi
}

# Function to backup logs
backup_logs() {
    echo "Starting logs backup..."

    if [ -d "${LOGS_DIR}" ]; then
        LOGS_BACKUP="${BACKUP_DIR}/logs_${DATE}.tar.gz"

        tar -czf "${LOGS_BACKUP}" "${LOGS_DIR}"

        if [ $? -eq 0 ]; then
            echo "✅ Logs backup completed: ${LOGS_BACKUP}"
        else
            echo "❌ Logs backup failed"
            exit 1
        fi
    else
        echo "⚠️  Logs directory not found, skipping"
    fi
}

# Function to upload to S3
upload_to_s3() {
    echo "Uploading backups to S3..."

    if command -v aws &> /dev/null; then
        aws s3 sync "${BACKUP_DIR}" "s3://${S3_BUCKET}/backups/" \
            --exclude "*" \
            --include "*_${DATE}.tar.gz"

        if [ $? -eq 0 ]; then
            echo "✅ Backups uploaded to S3: s3://${S3_BUCKET}/backups/"
        else
            echo "❌ S3 upload failed"
            exit 1
        fi
    else
        echo "⚠️  AWS CLI not found, skipping S3 upload"
    fi
}

# Function to cleanup old backups
cleanup_old_backups() {
    echo "Cleaning up old backups (older than ${RETENTION_DAYS} days)..."

    find "${BACKUP_DIR}" -name "*.tar.gz" -mtime +${RETENTION_DAYS} -delete

    echo "✅ Old backups cleaned up"

    # Also cleanup old backups in S3
    if command -v aws &> /dev/null; then
        CUTOFF_DATE=$(date -d "${RETENTION_DAYS} days ago" +%Y-%m-%d)

        aws s3 ls "s3://${S3_BUCKET}/backups/" | while read -r line; do
            FILE_DATE=$(echo "$line" | awk '{print $1}')
            FILE_NAME=$(echo "$line" | awk '{print $4}')

            if [[ "$FILE_DATE" < "$CUTOFF_DATE" ]]; then
                aws s3 rm "s3://${S3_BUCKET}/backups/${FILE_NAME}"
                echo "Deleted old S3 backup: ${FILE_NAME}"
            fi
        done
    fi
}

# Function to verify backup
verify_backup() {
    echo "Verifying backups..."

    for backup in "${BACKUP_DIR}"/*_${DATE}.tar.gz; do
        if [ -f "$backup" ]; then
            if tar -tzf "$backup" > /dev/null; then
                echo "✅ Backup verified: $(basename $backup)"
            else
                echo "❌ Backup verification failed: $(basename $backup)"
                exit 1
            fi
        fi
    done
}

# Main execution
main() {
    backup_mongodb
    backup_uploads
    backup_logs
    verify_backup
    upload_to_s3
    cleanup_old_backups

    echo "========================================="
    echo "Backup completed successfully!"
    echo "Backup location: ${BACKUP_DIR}"
    echo "S3 location: s3://${S3_BUCKET}/backups/"
    echo "========================================="
}

# Run main function
main

# Exit successfully
exit 0

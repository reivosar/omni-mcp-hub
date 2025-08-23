#!/bin/bash

# Nightly backup script for Omni MCP Hub
# Backs up configuration files, logs, and important data

set -euo pipefail

# Configuration
BACKUP_DIR=${BACKUP_DIR:-"./backups"}
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_NAME="omni-mcp-hub_${TIMESTAMP}"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_NAME}"

# Retention policy (keep backups for 30 days)
RETENTION_DAYS=${RETENTION_DAYS:-30}

echo "Starting nightly backup: ${BACKUP_NAME}"

# Create backup directory
mkdir -p "${BACKUP_PATH}"

# Backup configuration files
echo "Backing up configuration files..."
cp -r local-resources/ "${BACKUP_PATH}/" 2>/dev/null || echo "WARNING: No local-resources directory found"
cp omni-config.yaml "${BACKUP_PATH}/" 2>/dev/null || echo "WARNING: No omni-config.yaml found"
cp package.json "${BACKUP_PATH}/"
cp package-lock.json "${BACKUP_PATH}/" 2>/dev/null || echo "WARNING: No package-lock.json found"

# Backup logs if they exist
echo "Backing up logs..."
if [ -d "logs" ]; then
    cp -r logs/ "${BACKUP_PATH}/"
else
    echo "WARNING: No logs directory found"
fi

# Backup any generated reports
echo "Backing up reports..."
cp secrets-report.json "${BACKUP_PATH}/" 2>/dev/null || echo "WARNING: No secrets-report.json found"

# Create backup manifest
echo "Creating backup manifest..."
cat > "${BACKUP_PATH}/MANIFEST.txt" << EOF
Omni MCP Hub Backup
Generated: $(date)
Hostname: $(hostname)
Git Commit: $(git rev-parse HEAD 2>/dev/null || echo "Not a git repository")
Node Version: $(node --version)
NPM Version: $(npm --version)

Contents:
$(find "${BACKUP_PATH}" -type f -exec basename {} \; | sort)
EOF

# Compress backup
echo "Compressing backup..."
cd "${BACKUP_DIR}"
tar -czf "${BACKUP_NAME}.tar.gz" "${BACKUP_NAME}/"
rm -rf "${BACKUP_NAME}/"

# Calculate backup size
BACKUP_SIZE=$(du -h "${BACKUP_NAME}.tar.gz" | cut -f1)
echo "Backup completed: ${BACKUP_NAME}.tar.gz (${BACKUP_SIZE})"

# Cleanup old backups
echo "Cleaning up old backups (older than ${RETENTION_DAYS} days)..."
find "${BACKUP_DIR}" -name "omni-mcp-hub_*.tar.gz" -mtime +${RETENTION_DAYS} -delete 2>/dev/null || true

# List current backups
echo "Current backups:"
ls -lh "${BACKUP_DIR}"/omni-mcp-hub_*.tar.gz 2>/dev/null || echo "No backups found"

echo "Nightly backup process completed successfully"
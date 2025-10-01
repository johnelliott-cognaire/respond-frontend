#!/bin/bash
# Rollback script for token updates

echo "This script will restore all .bak files to their original locations"
read -p "Are you sure you want to proceed? (y/N): " confirm

if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
  echo "Rollback cancelled."
  exit 0
fi

# Find all backup files and restore them
find . -name "*.bak" | while read backup_file; do
  original_file="${backup_file%.bak}"
  echo "Restoring: $original_file"
  cp "$backup_file" "$original_file"
done

echo "Rollback complete. Original files have been restored."

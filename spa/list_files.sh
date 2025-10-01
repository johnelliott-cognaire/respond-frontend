#!/bin/bash

# List Files Script
# List Files Script - Collects contents of all .js, .html, .css files
# Recurses DOWN, UP, or BOTH based on input parameters.
# Usage: ./list_files.sh <relative_path> <target_file> <recurse_option>
#
# Example commands:
# ./list_files.sh ui temp.txt DOWN_ONLY
# ./list_files.sh state output.txt NONE
# ./list_files.sh api combined.txt UP_ONLY
# ./list_files.sh . all_files.txt UP_AND_DOWN

set -e  # Exit on error

# Ensure the script's base directory is the highest we traverse UP
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Temporary file to track written files
TEMP_TRACK_FILE=$(mktemp)

# Function to list files in a directory
list_files() {
  local search_dir="$1"
  local recurse_mode="$2"
  local target_file="$3"

  echo "[INFO] Searching in directory: $search_dir"
  echo "[INFO] Recursion mode: $recurse_mode"

  # Clear the target file before writing
  echo "[INFO] Writing output to $target_file"
  > "$target_file"

  case "$recurse_mode" in
    "DOWN_ONLY")
      find "$search_dir" -type f \( -name "*.js" -o -name "*.html" -o -name "*.css" \) | while read -r file; do
        write_file_content "$file" "$target_file"
      done
      ;;

    "UP_ONLY")
      traverse_up "$search_dir" "$target_file"
      ;;

    "UP_AND_DOWN")
      traverse_up "$search_dir" "$target_file"
      find "$search_dir" -type f \( -name "*.js" -o -name "*.html" -o -name "*.css" \) | while read -r file; do
        write_file_content "$file" "$target_file"
      done
      ;;

    "NONE")
      find "$search_dir" -maxdepth 1 -type f \( -name "*.js" -o -name "*.html" -o -name "*.css" \) | while read -r file; do
        write_file_content "$file" "$target_file"
      done
      ;;

    *)
      echo "[ERROR] Invalid recursion option: $recurse_mode"
      exit 1
      ;;
  esac
}

# Function to traverse upwards (until we reach the script execution directory)
traverse_up() {
  local dir="$1"
  local target_file="$2"

  while [[ "$dir" != "$SCRIPT_DIR" && "$dir" != "/" ]]; do
    find "$dir" -maxdepth 1 -type f \( -name "*.js" -o -name "*.html" -o -name "*.css" \) | while read -r file; do
      write_file_content "$file" "$target_file"
    done
    dir=$(dirname "$dir")  # Move one level up
  done

  # Ensure we capture files in the script execution directory as well
  if [[ "$dir" == "$SCRIPT_DIR" ]]; then
    find "$SCRIPT_DIR" -maxdepth 1 -type f \( -name "*.js" -o -name "*.html" -o -name "*.css" \) | while read -r file; do
      write_file_content "$file" "$target_file"
    done
  fi
}

# Function to write file content to target file (with deduplication using a temporary file)
write_file_content() {
  local file_path="$1"
  local target_file="$2"
  local relative_path="${file_path#$SCRIPT_DIR/}"

  # Prevent writing the same file twice by checking the temp file
  if grep -Fxq "$file_path" "$TEMP_TRACK_FILE"; then
    echo "[SKIP] Already written: $relative_path"
    return
  fi
  echo "$file_path" >> "$TEMP_TRACK_FILE"  # Track file as written

  echo "[INFO] Writing file: $relative_path"
  echo -e "\n# File: $relative_path\n" >> "$target_file"
  cat "$file_path" >> "$target_file"
  echo -e "\n# End of $relative_path\n" >> "$target_file"
}

# Main Execution
if [[ "$#" -ne 3 ]]; then
  echo "Usage: ./list_files.sh <relative_path> <target_file> <recurse_option>"
  echo "Recursion options: DOWN_ONLY | UP_ONLY | UP_AND_DOWN | NONE"
  exit 1
fi

RELATIVE_PATH="$1"
TARGET_FILE="$2"
RECURSE_OPTION="$3"

ABSOLUTE_PATH="$(cd "$RELATIVE_PATH" && pwd)"
list_files "$ABSOLUTE_PATH" "$RECURSE_OPTION" "$TARGET_FILE"

# Cleanup temp file
rm -f "$TEMP_TRACK_FILE"

echo "[INFO] Script execution completed."

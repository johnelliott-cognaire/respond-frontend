#!/bin/bash

# process_llm_output.sh
# Shell wrapper for process_llm_output.py

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "Error: Python 3 is required but not found"
    exit 1
fi

# Check if the input file was provided
if [ $# -ne 1 ]; then
    echo "Usage: $0 <llm-output-file>"
    exit 1
fi

# Check if the input file exists
if [ ! -f "$1" ]; then
    echo "Error: File '$1' not found"
    exit 1
fi

# Get the directory of this script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

# Run the Python script
python3 "${SCRIPT_DIR}/process_llm_output.py" "$1"
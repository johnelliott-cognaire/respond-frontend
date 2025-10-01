#!/usr/bin/env python3
"""
Script to find all JS files in the web2 project directory structure
"""

import os
import glob
import argparse

def main():
    parser = argparse.ArgumentParser(description='Find all JS/HTML files in the project')
    parser.add_argument('--base-dir', required=True, help='Project base directory')
    args = parser.parse_args()
    
    # Define all relevant directories to search
    search_dirs = [
        os.path.join(args.base_dir, 'ui'),
        os.path.join(args.base_dir, 'utils'),
        os.path.join(args.base_dir, 'modules'),
        os.path.join(args.base_dir, 'api'),
        os.path.join(args.base_dir, 'state')
    ]
    
    all_files = []
    
    # Find all JS and HTML files in each directory
    for directory in search_dirs:
        if os.path.exists(directory):
            js_files = glob.glob(os.path.join(directory, '**', '*.js'), recursive=True)
            html_files = glob.glob(os.path.join(directory, '**', '*.html'), recursive=True)
            all_files.extend(js_files)
            all_files.extend(html_files)
            print(f"Found {len(js_files)} JS and {len(html_files)} HTML files in {directory}")
    
    # Print total count
    print(f"\nTotal: {len(all_files)} files found")
    
    # Print command to use
    command = "python css-audit/scripts/css_audit.py --css styles/styles.css styles/tabs.css styles/modal.css styles/menu.css styles/document.css styles/analysis-lm.css"
    
    # Add files to command (split into manageable chunks)
    chunk_size = 20
    chunks = [all_files[i:i+chunk_size] for i in range(0, len(all_files), chunk_size)]
    
    for i, chunk in enumerate(chunks):
        file_args = " ".join([f'"{f}"' for f in chunk])
        if i == 0:
            command += f" --html {file_args}"
        else:
            command = f"{command} {file_args}"
    
    command += " --output css-audit/output"
    
    # Split and print command in chunks for easier copying
    print("\nCommand to use (in chunks for easier copying):")
    command_parts = [command[i:i+1000] for i in range(0, len(command), 1000)]
    for i, part in enumerate(command_parts):
        print(f"\n--- Part {i+1}/{len(command_parts)} ---")
        print(part)

if __name__ == "__main__":
    main()
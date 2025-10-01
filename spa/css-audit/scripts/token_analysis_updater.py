#!/usr/bin/env python3
"""
Improved Token Analysis and Update Script for Respond SPA
--------------------------------------------------------
1. Analyzes CSS and JS files for token usage
2. Updates tokens based on mapping from old to new rationalized tokens
3. Produces a usage report for tokens
4. Identifies orphaned tokens (used but not defined)
5. Shows file diffs between original and updated versions
"""

import os
import re
import json
import difflib
import argparse
import cssutils
from collections import defaultdict, Counter
from pathlib import Path

# Suppress cssutils parsing warnings
cssutils.log.setLevel(40)  # ERROR level only

# Key mappings for rationalized tokens - ONLY include tokens that need migration
TOKEN_MAPPINGS = {
    # Theme surfaces - heavily used so keep these
    "--theme-background": "--surface-background",
    "--theme-surface": "--surface-default",
    "--theme-surface-alt": "--surface-alt",
    "--theme-surface-raised": "--surface-default",
    "--theme-surface-hover": "--surface-dropdown-hover",
    "--theme-primary": "--color-primary",
    "--theme-primary-light": "--color-primary-light",
    "--theme-text-muted": "--text-muted",
    "--theme-border": "--border-subtle",
    
    # Table header mappings
    "--table-header-cell-bg": "--table-header-bg",
    "--table-header-cell-text": "--table-header-text",
    
    # Input mappings
    "--input-background": "--input-bg",
    
    # Overlay mappings
    "--overlay-background": "--overlay-bg",
    
    # Button hover states
    "--button-secondary-hover": "#0f4c65",
    "--button-negative-hover": "#bb242f",
    
    # Make text-on-accent consistent with text-on-primary
    "--text-on-accent": "--text-on-primary",
    
    # Background content mapping
    "--background-color-content": "--background-subtle"
}

def extract_defined_tokens(css_file):
    """Extract all tokens defined in a CSS file"""
    defined_tokens = set()
    
    with open(css_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Find all CSS variable declarations in :root
    root_blocks = re.findall(r':root\s*{([^}]+)}', content, re.DOTALL)
    for block in root_blocks:
        # Extract variable declarations
        var_matches = re.findall(r'(--[a-zA-Z0-9_-]+)\s*:', block)
        defined_tokens.update(var_matches)
    
    return defined_tokens

def analyze_token_usage(files):
    """Analyze token usage patterns in CSS and JS files"""
    token_usage = defaultdict(lambda: {"count": 0, "files": set()})
    token_pattern = r'var\(\s*(--[a-zA-Z0-9_-]+)\s*\)'
    
    for file_path in files:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
            
        # Find all CSS variable usages
        matches = re.findall(token_pattern, content)
        for token in matches:
            token_usage[token]["count"] += 1
            token_usage[token]["files"].add(file_path)
    
    return token_usage

def update_tokens_in_file(file_path, token_mappings, dry_run=False, show_diff=False):
    """Update token references in a file"""
    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
    
    updated_content = content
    changes_made = False
    
    # Process each token mapping
    for old_token, new_token in token_mappings.items():
        # Handle direct color values (hex codes) vs CSS variables differently
        if new_token.startswith('#'):
            # Direct color value - no var() wrapper needed
            old_pattern = r'var\(\s*' + re.escape(old_token) + r'\s*\)'
            new_value = new_token  # Use direct value without var()
            if re.search(old_pattern, updated_content):
                updated_content = re.sub(old_pattern, new_value, updated_content)
                changes_made = True
        else:
            # CSS variable - needs var() wrapper
            old_pattern = r'var\(\s*' + re.escape(old_token) + r'\s*\)'
            new_value = f'var({new_token})'
            if re.search(old_pattern, updated_content):
                updated_content = re.sub(old_pattern, new_value, updated_content)
                changes_made = True
        
        # Replace direct property assignments for variables in CSS files
        if file_path.endswith('.css'):
            old_property_pattern = r':\s*' + re.escape(old_token) + r'\s*;'
            if new_token.startswith('#'):
                # Direct value
                new_property_value = f': {new_token};'
            else:
                # CSS variable
                new_property_value = f': {new_token};'
            
            if re.search(old_property_pattern, updated_content):
                updated_content = re.sub(old_property_pattern, new_property_value, updated_content)
                changes_made = True
    
    # Show diff if requested
    if show_diff and changes_made:
        print(f"\nDiff for {file_path}:")
        diff = difflib.unified_diff(
            content.splitlines(keepends=True),
            updated_content.splitlines(keepends=True),
            fromfile=f"{file_path} (original)",
            tofile=f"{file_path} (updated)"
        )
        for line in diff:
            if line.startswith('+'):
                print(f"\033[92m{line}\033[0m", end='')  # Green for additions
            elif line.startswith('-'):
                print(f"\033[91m{line}\033[0m", end='')  # Red for removals
            else:
                print(line, end='')
    
    # Only write if changes were made and not in dry run mode
    if changes_made and not dry_run:
        # Create backup
        backup_file = f"{file_path}.bak"
        with open(backup_file, 'w', encoding='utf-8') as f:
            f.write(content)
        
        # Write updated content
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(updated_content)
    
    return changes_made

def generate_usage_report(token_usage, defined_tokens, component_mapping=None):
    """Generate a detailed usage report for tokens"""
    report = {
        "most_used_tokens": [],
        "unused_mapped_tokens": [],
        "orphaned_tokens": [],  # Used but not defined
        "component_usage": defaultdict(list),
        "file_token_counts": defaultdict(int),
        "token_counts": {}
    }
    
    # Count total usage per token
    for token, data in token_usage.items():
        report["token_counts"][token] = data["count"]
    
    # Sort tokens by usage
    sorted_tokens = sorted(token_usage.items(), key=lambda x: x[1]["count"], reverse=True)
    
    # Most used tokens (top 20)
    report["most_used_tokens"] = [{"token": token, "count": data["count"]} 
                                  for token, data in sorted_tokens[:20]]
    
    # Unused tokens from our mapping
    all_found_tokens = set(token_usage.keys())
    mapped_tokens = set(TOKEN_MAPPINGS.keys())
    report["unused_mapped_tokens"] = list(mapped_tokens - all_found_tokens)
    
    # Orphaned tokens (used but not defined)
    report["orphaned_tokens"] = list(all_found_tokens - defined_tokens)
    
    # Count tokens per file
    for token, data in token_usage.items():
        for file_path in data["files"]:
            report["file_token_counts"][file_path] += 1
    
    # Group by component if mapping provided
    if component_mapping:
        for token, data in token_usage.items():
            for file_path in data["files"]:
                component = component_mapping.get(file_path, "Unknown")
                if token not in report["component_usage"][component]:
                    report["component_usage"][component].append(token)
    
    # Count usage by file type
    report["usage_by_filetype"] = {
        "css": sum(1 for f, c in report["file_token_counts"].items() if f.endswith('.css')),
        "js": sum(1 for f, c in report["file_token_counts"].items() if f.endswith('.js')),
        "other": sum(1 for f, c in report["file_token_counts"].items() 
                     if not (f.endswith('.css') or f.endswith('.js')))
    }
    
    return report

def main():
    parser = argparse.ArgumentParser(description='Token Analyzer and Updater for Respond SPA')
    parser.add_argument('--css', nargs='+', help='CSS files to analyze/update')
    parser.add_argument('--js', nargs='+', help='JS files to analyze/update')
    parser.add_argument('--tokens-css', required=True, help='Path to tokens CSS file')
    parser.add_argument('--analyze-only', action='store_true', help='Only analyze, don\'t update files')
    parser.add_argument('--update-css-only', action='store_true', help='Only update CSS files, not JS')
    parser.add_argument('--update-js-only', action='store_true', help='Only update JS files, not CSS')
    parser.add_argument('--output-report', default='css-audit/tokens/usage-report.json', help='Path for output report')
    parser.add_argument('--output-tokens', default='styles/tokens.css', help='Path for the new tokens file')
    parser.add_argument('--show-diff', action='store_true', help='Show diff between original and updated files')
    parser.add_argument('--rationalized-tokens', help='Path to rationalized tokens CSS file')
    args = parser.parse_args()
    
    # Collect all files to process
    all_files = []
    css_files = args.css or []
    js_files = args.js or []
    
    all_files.extend(css_files)
    all_files.extend(js_files)
    
    if not all_files:
        print("Error: No files specified for analysis. Use --css and/or --js arguments.")
        return
    
    # Extract tokens defined in tokens.css
    defined_tokens = extract_defined_tokens(args.tokens_css)
    print(f"Found {len(defined_tokens)} defined tokens in {args.tokens_css}")
    
    # Analyze token usage
    print(f"Analyzing token usage in {len(all_files)} files...")
    token_usage = analyze_token_usage(all_files)
    
    # Generate a simple component mapping based on file paths
    component_mapping = {}
    for file_path in all_files:
        if "modals" in file_path:
            component_mapping[file_path] = "Modal"
        elif "stages" in file_path:
            component_mapping[file_path] = "Stage"
        elif "framework" in file_path:
            component_mapping[file_path] = "Framework"
        elif "components" in file_path:
            component_mapping[file_path] = "Component"
        else:
            component_mapping[file_path] = "Other"
    
    # Generate usage report
    report = generate_usage_report(token_usage, defined_tokens, component_mapping)
    
    # Create directory for report if it doesn't exist
    os.makedirs(os.path.dirname(args.output_report), exist_ok=True)
    
    # Write report
    with open(args.output_report, 'w', encoding='utf-8') as f:
        json.dump(report, f, indent=2, default=str)
    
    print(f"Token usage report generated: {args.output_report}")
    print(f"Found {len(token_usage)} unique tokens across all files")
    print(f"Top 5 most used tokens:")
    for i, token_data in enumerate(report["most_used_tokens"][:5]):
        print(f"  {i+1}. {token_data['token']} - {token_data['count']} uses")
    
    if len(report["unused_mapped_tokens"]) > 0:
        print(f"\nFound {len(report['unused_mapped_tokens'])} mapped tokens that are unused in the codebase")
        print("First 5 unused mapped tokens:")
        for token in report["unused_mapped_tokens"][:5]:
            print(f"  {token}")
    
    if len(report["orphaned_tokens"]) > 0:
        print(f"\n⚠️ WARNING: Found {len(report['orphaned_tokens'])} tokens used but not defined in tokens.css")
        print("These tokens should be added to your tokens.css file:")
        for token in report["orphaned_tokens"]:
            print(f"  {token}")
    
    # Copy the rationalized tokens file if provided
    if args.rationalized_tokens and not args.analyze_only:
        print(f"\nCopying rationalized tokens to {args.output_tokens}")
        os.makedirs(os.path.dirname(args.output_tokens), exist_ok=True)
        with open(args.rationalized_tokens, 'r', encoding='utf-8') as src:
            with open(args.output_tokens, 'w', encoding='utf-8') as dst:
                dst.write(src.read())
    
    # Update tokens in files if not analyze-only
    if not args.analyze_only:
        print("\nUpdating token references in files...")
        files_updated = 0
        
        # Determine which files to update based on flags
        files_to_update = []
        if args.update_css_only:
            files_to_update = css_files
            print("Updating CSS files only")
        elif args.update_js_only:
            files_to_update = js_files
            print("Updating JS files only")
        else:
            files_to_update = all_files
            print("Updating all files")
        
        for file_path in files_to_update:
            if update_tokens_in_file(file_path, TOKEN_MAPPINGS, 
                                      dry_run=False, show_diff=args.show_diff):
                files_updated += 1
                if not args.show_diff:  # Only print if we didn't show the diff
                    print(f"Updated: {file_path}")
        
        print(f"\nToken update complete. Updated {files_updated} out of {len(files_to_update)} files.")
        print("Backup files created with .bak extension")
    else:
        print("\nAnalysis complete. No files were modified (--analyze-only flag used).")

if __name__ == "__main__":
    main()
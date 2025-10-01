#!/usr/bin/env python3
"""
rename_css_classes.py
---------------------

Walks one or more code roots, finds every occurrence of the *old* CSS class
names inside JavaScript/TypeScript files, and offers an interactive
yes / no / skip-file prompt before rewriting in-place (or --dry-run).

• Mapping is supplied either via --map FILE.json  **or**
  via one or more OLD:NEW pairs on the CLI.

• Creates *.bak* alongside each modified file unless --no-backup is given.

Typical usage (interactive):
    python rename_css_classes.py src ui --map phase1_buttons.json

Non-interactive batch (CI):
    python rename_css_classes.py src --map all_mappings.json --all-yes --no-backup
"""

import argparse
import json
import pathlib
import re
import sys
from shutil import copy2

# For single-key input without Enter
try:
    # Windows
    import msvcrt
    def getch():
        return msvcrt.getch().decode()
except ImportError:
    # Unix-like
    import termios
    import tty
    def getch():
        fd = sys.stdin.fileno()
        old_settings = termios.tcgetattr(fd)
        try:
            tty.setraw(fd)
            ch = sys.stdin.read(1)
        finally:
            termios.tcsetattr(fd, termios.TCSADRAIN, old_settings)
        return ch

ANSI_YELLOW = "\033[33m"
ANSI_GREEN = "\033[32m"
ANSI_RED = "\033[31m"
ANSI_RESET = "\033[0m"

JS_FILE_GLOB = ["*.js", "*.jsx", "*.ts", "*.tsx"]


def load_mapping(args: argparse.Namespace) -> dict[str, str]:
    mapping: dict[str, str] = {}
    if args.map:
        mapping = json.loads(pathlib.Path(args.map).read_text(encoding="utf-8"))
    for pair in args.pairs:
        try:
            old, new = pair.split(":", 1)
        except ValueError:
            sys.exit(f"Invalid mapping pair '{pair}' (should be OLD:NEW)")
        mapping[old] = new
    if not mapping:
        sys.exit("No mappings supplied.  Use --map or OLD:NEW pairs.")
    
    # Filter out comment entries (keys that start with /*)
    return {k: v for k, v in mapping.items() if not k.startswith("/*")}


def prompt(question: str) -> str:
    """Ask until user presses y / n / s / a (without requiring Enter)"""
    sys.stdout.write(question + " [y/n/s/a]: ")
    sys.stdout.flush()
    
    while True:
        key = getch().lower()
        if key in {'y', 'n', 's', 'a'}:
            print(key)  # Echo the key
            return key


def find_class_references(content: str, class_name: str) -> list[tuple]:
    """
    Find precise references to CSS class names in JavaScript/JSX.
    Returns a list of (start, end, match_type, context) tuples.
    """
    results = []
    
    # Define patterns that specifically target CSS class references
    patterns = [
        # class="..." or className="..." in JSX/HTML with word boundaries
        (r'(class|className)\s*=\s*[\'"](?:[^\'"]*\s+)?' + r'\b(' + re.escape(class_name) + r')\b' + r'(?:\s+[^\'"]*)?[\'"]', 'JSX attribute'),
        
        # class={...} or className={...} in JSX with template literals
        (r'(class|className)\s*=\s*\{\s*[\'"`](?:[^\'"]*\s+)?' + r'\b(' + re.escape(class_name) + r')\b' + r'(?:\s+[^\'"]*)?[\'"`]', 'JSX expression'),
        
        # classList.add/remove/toggle/contains/replace("...") with word boundaries
        (r'classList\.(add|remove|toggle|contains|replace)\(\s*[\'"](?:[^\'"]*\s+)?' + r'\b(' + re.escape(class_name) + r')\b' + r'(?:\s+[^\'"]*)?[\'"]', 'classList method'),
        
        # querySelector/querySelectorAll with class selector
        (r'querySelector(?:All)?\(\s*[\'"]\.(' + re.escape(class_name) + r')[\'"\s)]', 'querySelector'),
        
        # getElementsByClassName direct match
        (r'getElementsByClassName\(\s*[\'"](' + re.escape(class_name) + r')[\'"]', 'getElementsByClassName'),
        
        # Direct string assignments that look like they're for class names
        (r'(?:className|cssClass|klass|cls)\s*=\s*[\'"](?:[^\'"]*\s+)?' + r'\b(' + re.escape(class_name) + r')\b' + r'(?:\s+[^\'"]*)?[\'"]', 'class assignment'),
        
        # matchesSelector and closest methods
        (r'(?:matchesSelector|matches|closest)\(\s*[\'"]\.(' + re.escape(class_name) + r')[\'"\s)]', 'matches method'),
        
        # Element creation with class direct assignment
        (r'\.className\s*=\s*[\'"](?:[^\'"]*\s+)?' + r'\b(' + re.escape(class_name) + r')\b' + r'(?:\s+[^\'"]*)?[\'"]', 'className property'),
        
        # String literals for class name in common operations
        (r'[\'"]\.(' + re.escape(class_name) + r')[\'"]', 'class selector string'),
    ]
    
    for pattern_str, match_type in patterns:
        pattern = re.compile(pattern_str)
        for match in pattern.finditer(content):
            # Find which capturing group has the actual class name
            class_name_group = 2 if match.lastindex >= 2 else 1
            
            if class_name_group <= match.lastindex:
                class_start = match.start(class_name_group)
                class_end = match.end(class_name_group)
                context = match.group(0)
                
                # Store the match info
                results.append((class_start, class_end, match_type, context))
    
    return results


def process_file(path: pathlib.Path, mapping: dict[str, str],
                 args: argparse.Namespace, global_yes: bool) -> bool:
    try:
        content = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        print(f"Skipping {path} - not a text file or uses unknown encoding")
        return False
        
    original_content = content
    changed = False
    
    # Collect all changes to make
    all_changes = []
    
    for old_class, new_class in mapping.items():
        # Find references to this class name
        references = find_class_references(content, old_class)
        
        for class_start, class_end, match_type, context in references:
            # Get the line number for display
            line_num = content.count('\n', 0, class_start) + 1
            
            # Extract the full line for context
            line_start = content.rfind('\n', 0, class_start) + 1
            line_end = content.find('\n', class_start)
            if line_end == -1:
                line_end = len(content)
            
            line = content[line_start:line_end]
            
            # Create highlighted line with the class name highlighted
            highlight_pos = class_start - line_start
            highlight_line = (
                line[:highlight_pos] +
                f"{ANSI_YELLOW}" + line[highlight_pos:highlight_pos + (class_end - class_start)] + f"{ANSI_RESET}" +
                line[highlight_pos + (class_end - class_start):]
            )
            
            print(f"\n{path}:{line_num} [{match_type}]")
            print(f"  {highlight_line}")
            
            if args.all_yes or global_yes:
                choice = "y"
            elif args.dry_run:
                choice = "n"
            else:
                choice = prompt(f"Replace '{old_class}' → '{new_class}'?")
            
            if choice == "a":
                global_yes = True
                choice = "y"
            if choice == "s":
                return changed
            if choice == "y":
                all_changes.append((class_start, class_end, new_class))
                changed = True
    
    # Apply all changes from end to start to avoid position shifts
    if changed and not args.dry_run:
        # Sort changes in reverse order by start position
        all_changes.sort(reverse=True)
        
        # Apply the changes
        for start, end, replacement in all_changes:
            content = content[:start] + replacement + content[end:]
        
        # Save the modified content
        if not args.no_backup:
            copy2(path, str(path) + ".bak")
        path.write_text(content, encoding="utf-8")
        print(f"{ANSI_GREEN}» wrote {path}{ANSI_RESET}")
    
    return changed


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(description="Interactive CSS class renamer for JS sources")
    p.add_argument("roots", nargs="+",
                   help="Directories or files to scan (recursively)")
    p.add_argument("--map", help="JSON file with {old: new} mapping")
    p.add_argument("pairs", nargs="*",
                   help="Additional mapping pairs OLD:NEW (space separated)")
    p.add_argument("--dry-run", action="store_true",
                   help="Scan and report but do not write")
    p.add_argument("--all-yes", action="store_true",
                   help="Automatically answer 'yes' to every prompt")
    p.add_argument("--no-backup", action="store_true",
                   help="Do NOT write .bak files beside modified sources")
    args = p.parse_args(argv)

    mapping = load_mapping(args)

    any_changes = False
    global_yes = False
    for root in args.roots:
        path_root = pathlib.Path(root)
        files = [path_root] if path_root.is_file() else [
            p for g in JS_FILE_GLOB for p in path_root.rglob(g)
        ]
        for file_path in files:
            if file_path.is_file():
                if process_file(file_path, mapping, args, global_yes):
                    any_changes = True
    if args.dry_run and any_changes:
        sys.exit(1)   # non-zero to signal "changes would be made"


if __name__ == "__main__":
    main()
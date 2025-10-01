#!/usr/bin/env python3
"""
CSS Class Replacer for Respond SPA
----------------------------------
Replace CSS class names in HTML/JS files based on a mapping file.
Also generates a deprecated-classes.css file for backward compatibility.
"""

import os
import re
import json
import argparse
from bs4 import BeautifulSoup, Comment

def load_class_mapping(mapping_file):
    """Load class name mapping from JSON file"""
    with open(mapping_file, 'r', encoding='utf-8') as f:
        return json.load(f)

def replace_class_in_html(file_path, class_mapping):
    """Replace class names in HTML file"""
    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
    
    soup = BeautifulSoup(content, 'html.parser')
    changes_made = False
    
    # Process elements with class attributes
    for tag in soup.find_all(class_=True):
        original_classes = set(tag['class'])
        new_classes = set()
        
        for cls in original_classes:
            if cls in class_mapping:
                new_classes.add(class_mapping[cls])
                changes_made = True
            else:
                new_classes.add(cls)
        
        if changes_made:
            tag['class'] = list(new_classes)
    
    if changes_made:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(str(soup))
            
        return True
    return False

def replace_class_in_js(file_path, class_mapping):
    """Replace className values in JS/JSX/TS/TSX files"""
    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
    
    changes_made = False
    new_content = content
    
    # Find className patterns
    className_patterns = [
        r'className=[\'"]([^\'"]*)[\'"]',  # className="..."
        r'className={[\'"]([^\'"]*)[\'"]}'  # className={"..."}
    ]
    
    for pattern in className_patterns:
        matches = re.findall(pattern, content)
        
        for class_str in matches:
            classes = class_str.split()
            new_classes = []
            class_changed = False
            
            for cls in classes:
                if cls in class_mapping:
                    new_classes.append(class_mapping[cls])
                    class_changed = True
                else:
                    new_classes.append(cls)
            
            if class_changed:
                new_class_str = ' '.join(new_classes)
                # Replace only the exact class string to avoid partial matches
                pattern_instance = pattern.replace('([^\'\"]*)', re.escape(class_str))
                replacement = pattern.replace('([^\'\"]*)', new_class_str)
                new_content = re.sub(pattern_instance, replacement, new_content)
                changes_made = True
    
    if changes_made:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
            
        return True
    return False

def generate_deprecated_css(class_mapping, original_audit, output_file):
    """Generate a CSS file with deprecated class forwarding"""
    # Load the original audit to get declarations
    with open(original_audit, 'r', encoding='utf-8') as f:
        audit_data = json.load(f)
    
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write('/* Respond SPA Deprecated Classes - Auto-generated */\n')
        f.write('/* This file maintains backward compatibility */\n\n')
        
        for old_class, new_class in class_mapping.items():
            # Get original declarations if available
            declarations = []
            if old_class in audit_data:
                declarations = audit_data[old_class].get('declarations', [])
            
            f.write(f'/* {old_class} → {new_class} */\n')
            f.write(f'.{old_class} {{\n')
            
            if declarations:
                for decl in declarations:
                    f.write(f'  {decl};\n')
                f.write('  /* Original declarations above, forwarding below */\n')
            
            # Add a comment noting this is a deprecated class
            f.write(f'  /* @deprecated Use .{new_class} instead */\n')
            f.write('}\n\n')

def main():
    parser = argparse.ArgumentParser(description='CSS Class Replacer for Respond SPA')
    parser.add_argument('--mapping', required=True, help='JSON file with class mapping (old->new)')
    parser.add_argument('--audit', required=True, help='Original CSS audit JSON file')
    parser.add_argument('--files', nargs='+', help='HTML/JS files to process')
    parser.add_argument('--deprecated-css', default='styles/deprecated-classes.css', 
                        help='Output file for deprecated classes')
    args = parser.parse_args()
    
    # Ensure output directory exists
    os.makedirs(os.path.dirname(args.deprecated_css), exist_ok=True)
    
    # Load the class mapping
    class_mapping = load_class_mapping(args.mapping)
    
    # Process each file
    files_changed = 0
    for file_path in args.files:
        file_changed = False
        
        if file_path.endswith(('.html', '.htm')):
            file_changed = replace_class_in_html(file_path, class_mapping)
        elif file_path.endswith(('.js', '.jsx', '.ts', '.tsx')):
            file_changed = replace_class_in_js(file_path, class_mapping)
        
        if file_changed:
            files_changed += 1
    
    # Generate deprecated CSS file for backward compatibility
    generate_deprecated_css(class_mapping, args.audit, args.deprecated_css)
    
    print(f"CSS class replacement complete!")
    print(f"Modified {files_changed} out of {len(args.files)} files")
    print(f"Deprecated classes CSS file generated: {args.deprecated_css}")

if __name__ == "__main__":
    main()
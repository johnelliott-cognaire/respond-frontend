#!/usr/bin/env python3
"""
Design Token Extractor for Respond SPA
--------------------------------------
Extracts color variables, typography, spacing, and other design tokens from CSS files.
Creates a _tokens.css file with consolidated design tokens.
"""

import os
import re
import cssutils
import argparse
from collections import defaultdict

# Suppress cssutils parsing warnings
cssutils.log.setLevel(40)  # ERROR level only

def extract_color_values(css_content):
    """Extract all color values from CSS content"""
    # Look for hex colors, rgb/rgba, hsl/hsla
    color_patterns = [
        r'#([0-9a-fA-F]{3,8})\b',  # Hex colors
        r'rgba?\([^)]+\)',  # RGB/RGBA
        r'hsla?\([^)]+\)'   # HSL/HSLA
    ]
    
    colors = set()
    for pattern in color_patterns:
        matches = re.findall(pattern, css_content)
        if pattern.startswith('#'):
            colors.update(f"#{m}" for m in matches)
        else:
            colors.update(matches)
    
    return colors

def extract_css_variables(css_file):
    """Extract CSS variables from a file"""
    with open(css_file, 'r', encoding='utf-8') as f:
        css_content = f.read()
    
    # Find all :root declarations
    root_blocks = re.findall(r':root\s*{([^}]+)}', css_content)
    
    variables = {}
    for block in root_blocks:
        # Extract variable declarations
        var_matches = re.findall(r'(--[a-zA-Z0-9_-]+)\s*:\s*([^;]+);', block)
        for var_name, var_value in var_matches:
            variables[var_name] = var_value.strip()
    
    return variables

def extract_typography_values(css_content):
    """Extract typography-related declarations"""
    typography = {
        'font-family': set(),
        'font-size': set(),
        'font-weight': set(),
        'line-height': set(),
        'letter-spacing': set()
    }
    
    # Parse the CSS
    stylesheet = cssutils.parseString(css_content)
    
    for rule in stylesheet:
        if rule.type == rule.STYLE_RULE:
            style = rule.style
            for prop in style:
                if prop.name in typography:
                    typography[prop.name].add(prop.value.strip())
    
    return typography

def extract_spacing_values(css_content):
    """Extract spacing values (margin, padding)"""
    spacing_props = ['margin', 'padding']
    spacing_values = set()
    
    # Find values for margin/padding properties
    for prop in spacing_props:
        # Match both the property and directional variants
        patterns = [
            rf'{prop}\s*:\s*([^;]+);',
            rf'{prop}-(top|right|bottom|left|inline|block|inline-start|inline-end|block-start|block-end)\s*:\s*([^;]+);'
        ]
        
        for pattern in patterns:
            matches = re.findall(pattern, css_content)
            if len(re.findall(r'-', pattern)) > 0:  # Directional properties
                for match in matches:
                    spacing_values.add(match[1].strip())
            else:  # Base property
                spacing_values.update(match.strip() for match in matches)
    
    # Filter out non-standard values and variables
    standard_values = set()
    for value in spacing_values:
        # Keep only px, rem, em units and var() references
        if re.match(r'^(\d+(\.\d+)?(px|rem|em)|var\([^)]+\))$', value):
            standard_values.add(value)
    
    return standard_values

def generate_token_file(variables, colors, typography, spacing, output_file):
    """Generate a CSS design token file"""
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write('/* Respond SPA Design Tokens - Auto-generated */\n\n')
        
        # Write existing variables
        if variables:
            f.write(':root {\n')
            for var_name, var_value in variables.items():
                f.write(f'  {var_name}: {var_value};\n')
            f.write('}\n\n')
        
        # Write color tokens that aren't already variables
        color_vars = {}
        existing_colors = set(variables.values())
        new_colors = [c for c in colors if c not in existing_colors]
        
        if new_colors:
            f.write('/* Color Tokens */\n:root {\n')
            for i, color in enumerate(sorted(new_colors)):
                var_name = f'--color-token-{i}'
                color_vars[color] = var_name
                f.write(f'  {var_name}: {color};\n')
            f.write('}\n\n')
        
        # Write typography tokens
        if any(typography.values()):
            f.write('/* Typography Tokens */\n:root {\n')
            for prop, values in typography.items():
                if values:
                    for i, value in enumerate(sorted(values)):
                        var_name = f'--{prop}-{i}'
                        f.write(f'  {var_name}: {value};\n')
            f.write('}\n\n')
        
        # Write spacing tokens
        if spacing:
            f.write('/* Spacing Tokens */\n:root {\n')
            spacing_map = {}
            for i, value in enumerate(sorted(spacing, key=lambda x: float(re.findall(r'[\d.]+', x)[0]) if re.findall(r'[\d.]+', x) else 0)):
                if 'var' not in value:  # Skip variables
                    var_name = f'--space-{i}'
                    spacing_map[value] = var_name
                    f.write(f'  {var_name}: {value};\n')
            f.write('}\n\n')
        
        # Add usage examples and documentation
        f.write('/* Usage Examples\n')
        f.write(' * Colors: var(--color-token-0)\n')
        f.write(' * Typography: var(--font-size-0), var(--font-weight-1)\n')
        f.write(' * Spacing: var(--space-0), var(--space-1)\n')
        f.write(' */\n')

def main():
    parser = argparse.ArgumentParser(description='Design Token Extractor for Respond SPA')
    parser.add_argument('--css', nargs='+', help='CSS files to analyze')
    parser.add_argument('--output', default='styles/_tokens.css', help='Output token file')
    args = parser.parse_args()
    
    # Ensure output directory exists
    os.makedirs(os.path.dirname(args.output), exist_ok=True)
    
    all_variables = {}
    all_colors = set()
    all_typography = {
        'font-family': set(),
        'font-size': set(),
        'font-weight': set(),
        'line-height': set(),
        'letter-spacing': set()
    }
    all_spacing = set()
    
    # Process each CSS file
    for css_file in args.css:
        # Extract variables
        variables = extract_css_variables(css_file)
        all_variables.update(variables)
        
        # Read file content for other extractions
        with open(css_file, 'r', encoding='utf-8') as f:
            css_content = f.read()
        
        # Extract colors
        colors = extract_color_values(css_content)
        all_colors.update(colors)
        
        # Extract typography
        typography = extract_typography_values(css_content)
        for prop, values in typography.items():
            all_typography[prop].update(values)
        
        # Extract spacing
        spacing = extract_spacing_values(css_content)
        all_spacing.update(spacing)
    
    # Generate the token file
    generate_token_file(all_variables, all_colors, all_typography, all_spacing, args.output)
    
    print(f"Design token extraction complete!")
    print(f"Found {len(all_variables)} existing CSS variables")
    print(f"Found {len(all_colors)} color values")
    print(f"Found {sum(len(values) for values in all_typography.values())} typography values")
    print(f"Found {len(all_spacing)} spacing values")
    print(f"Tokens saved to {args.output}")

if __name__ == "__main__":
    main()
# process_llm_output.py

import argparse
import os
import re
import sys
from dataclasses import dataclass
from typing import List, Optional

@dataclass
class CodeBlock:
    filename: str
    content: str
    line_count: int

def extract_filename(text: str, check_first_lines: bool = False) -> Optional[str]:
    """Extract filename from text using various patterns."""
    # Common patterns for file paths
    patterns = [
        r'(?:File:|//\s*File:|#\s*File:)\s*([\w\-./]+\.\w+)',  # File: or // File: or # File:
        r'//\s*([\w\-./]+\.\w+)',  # // path/to/file.ext
        r'#\s*([\w\-./]+\.\w+)',   # # path/to/file.ext
    ]
    
    print("Searching for filename in text...")
    
    if check_first_lines:
        # For code blocks, check only first few lines
        lines = text.split('\n')[:3]  # Check first 3 lines
        text_to_check = '\n'.join(lines)
    else:
        text_to_check = text

    print("Checking text:")
    print("-" * 40)
    print(text_to_check[:200] + "..." if len(text_to_check) > 200 else text_to_check)
    print("-" * 40)
    
    for pattern in patterns:
        print(f"Trying pattern: {pattern}")
        match = re.search(pattern, text_to_check)
        if match:
            filename = match.group(1)
            print(f"Found filename: {filename}")
            return filename
    
    print("No filename found in this text segment")
    return None

def extract_code_blocks(content: str) -> List[CodeBlock]:
    """Extract code blocks and their associated filenames from the content."""
    print("\nSearching for code blocks...")
    print(f"Total content length: {len(content)} characters")
    
    # First, let's see if we can find any ``` markers at all
    all_backticks = re.findall(r'```', content)
    print(f"Found {len(all_backticks)} ``` markers in total")
    
    # Find all code blocks marked with ```
    code_blocks = []
    # Modified pattern to be more permissive and print what it finds
    code_pattern = re.compile(r'```(?:js|javascript|python)?\n(.*?)```', re.DOTALL)
    
    matches = code_pattern.finditer(content)
    match_count = 0
    
    for match in matches:
        match_count += 1
        print(f"\nFound code block #{match_count}:")
        block_content = match.group(1)
        print(f"Code block length: {len(block_content)} characters")
        print(f"First few lines of code block:")
        print("-" * 40)
        print('\n'.join(block_content.splitlines()[:5]))
        print("...")
        
        # First try to find filename in the code block itself
        filename = extract_filename(block_content, check_first_lines=True)
        
        # If not found, try looking in preceding text
        if not filename:
            start_pos = max(0, match.start() - 500)
            preceding_text = content[start_pos:match.start()]
            print(f"\nNo filename found in code block, searching preceding text (length: {len(preceding_text)} chars)")
            filename = extract_filename(preceding_text)
        
        if filename:
            code_block = CodeBlock(
                filename=filename,
                content=block_content,
                line_count=len(block_content.splitlines())
            )
            code_blocks.append(code_block)
            print(f"Added code block with filename: {filename} ({code_block.line_count} lines)")
        else:
            print("Warning: No filename found for this code block")
    
    if match_count == 0:
        print("\nNo code blocks found with pattern ```...```")
        # Let's examine the content more closely
        print("\nFirst 500 characters of content:")
        print("-" * 40)
        print(content[:500])
        print("-" * 40)
    
    print(f"\nTotal code blocks found with filenames: {len(code_blocks)}")
    return code_blocks

def get_local_file_line_count(filepath: str) -> Optional[int]:
    """Get line count of local file if it exists."""
    if os.path.exists(filepath):
        with open(filepath, 'r') as f:
            return len(f.readlines())
    return None

def write_file(filepath: str, content: str):
    """Write content to file, creating directories if needed."""
    if not filepath or not filepath.strip():
        raise ValueError("Filepath cannot be empty")
        
    # Normalize the filepath
    filepath = os.path.normpath(filepath)
    
    # Get the directory path
    dirpath = os.path.dirname(filepath)
    
    # If the filepath is just a filename (no directory part),
    # use the current directory
    if not dirpath:
        filepath = os.path.join('.', filepath)
        dirpath = '.'
        
    print(f"Creating directory: {dirpath}")
    print(f"Writing to file: {filepath}")
    
    # Create directory if it doesn't exist
    if dirpath != '.':
        os.makedirs(dirpath, exist_ok=True)
        
    # Write the file
    with open(filepath, 'w') as f:
        f.write(content)

def main():
    parser = argparse.ArgumentParser(description='Process LLM output and update local files.')
    parser.add_argument('llm_output_file', help='Path to LLM output file')
    parser.add_argument('--debug', action='store_true', help='Enable debug mode')
    args = parser.parse_args()

    print(f"Processing file: {args.llm_output_file}")
    
    # Read LLM output file
    try:
        with open(args.llm_output_file, 'r') as f:
            content = f.read()
            print(f"Successfully read file. Content length: {len(content)} characters")
    except FileNotFoundError:
        print(f"Error: File {args.llm_output_file} not found")
        sys.exit(1)
    except Exception as e:
        print(f"Error reading file: {str(e)}")
        sys.exit(1)

    # Extract code blocks
    code_blocks = extract_code_blocks(content)
    
    if not code_blocks:
        print("\nNo code blocks found in the file.")
        sys.exit(0)

    # Display found code blocks and their info
    print("\nFound code blocks:")
    print("-" * 60)
    for i, block in enumerate(code_blocks, 1):
        local_lines = get_local_file_line_count(block.filename)
        print(f"{i}. {block.filename}")
        print(f"   LLM code lines: {block.line_count}")
        print(f"   Local file lines: {local_lines if local_lines is not None else 'File not found'}")
        print()

    # Ask user to proceed
    response = input("\nProceed with updating local files? (yes/no): ").lower()
    if response != 'yes':
        print("Operation cancelled.")
        sys.exit(0)

    # Process each code block
    for block in code_blocks:
        local_lines = get_local_file_line_count(block.filename)
        print(f"\nProcessing: {block.filename}")
        print(f"LLM code lines: {block.line_count}")
        print(f"Local file lines: {local_lines if local_lines is not None else 'File not found'}")
        
        key = input("Press Enter to update this file (any other key to exit): ")
        if key:
            print("Operation cancelled.")
            sys.exit(0)
        
        try:
            write_file(block.filename, block.content)
            print(f"Updated: {block.filename}")
        except Exception as e:
            print(f"Error updating {block.filename}: {str(e)}")
            sys.exit(1)

    print("\nAll files updated successfully!")

if __name__ == "__main__":
    main()
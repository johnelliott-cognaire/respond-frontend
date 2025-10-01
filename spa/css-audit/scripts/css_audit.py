#!/usr/bin/env python3
"""
CSS Audit Script for Respond SPA
--------------------------------
Analyzes CSS files and HTML/JS templates to identify:
- Class usage and declarations
- Duplicate rule sets
- Risk classification
"""

import glob
import os
import re
import json
import hashlib
import argparse
import cssutils
import pandas as pd
from pathlib import Path
from collections import defaultdict
from bs4 import BeautifulSoup

# Suppress cssutils parsing warnings
cssutils.log.setLevel(40)  # ERROR level only

# Risk classification properties
HIGH_RISK_PROPS = {
    'display', 'position', 'float', 'flex', 'flex-direction', 'flex-wrap', 
    'flex-flow', 'flex-grow', 'flex-shrink', 'flex-basis', 'grid', 'grid-template',
    'grid-template-columns', 'grid-template-rows', 'grid-column', 'grid-row',
    'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
    'overflow', 'overflow-x', 'overflow-y', 'margin', 'padding'
}

MED_RISK_PROPS = {
    'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'margin-inline', 'margin-block', 'padding-inline', 'padding-block'
}

# Component mapping - adjust based on your actual component names
COMPONENT_MAP = {
    # Modal components
    'modal': 'Modal',
    'simple-modal': 'SimpleModal',
    'form-modal': 'FormModal',
    'app-modal': 'AppModal',
    'wide-modal': 'WideModal',
    'narrow-modal': 'NarrowModal',
    'error-modal': 'ErrorModal',
    'message-modal': 'MessageModal',
    'account-modal': 'AccountModal',
    'accounts-modal': 'AccountsModal',
    'project-modal': 'ProjectModal',
    'projects-modal': 'ProjectsModal',
    'user-modal': 'UserModal',
    'users-modal': 'UsersModal',
    'login-modal': 'LoginModal',
    'register-modal': 'RegisterModal',
    'text-prompt-modal': 'TextPromptModal',
    'yesno-modal': 'YesNoModal',
    'jobs-modal': 'JobsModal',
    'documents-modal': 'DocumentsModal',
    'history-modal': 'HistoryModal',
    'document-item-history-modal': 'DocumentItemHistoryModal',
    'password-reset-modal': 'PasswordResetModal',
    'corpus-filter-modal': 'CorpusFilterModal',
    'choose-content-modal': 'ChooseContentForAIModal',
    'import-wizard-modal': 'QuestionImportModal',
    'duplicate-permissions-modal': 'DuplicatePermissionsModal',
    'add-corpus-permission-modal': 'AddCorpusPermissionModal',
    'add-docchain-permission-modal': 'AddDocchainPermissionModal',
    
    # Button and control elements
    'btn': 'Button',
    'btn-primary': 'PrimaryButton',
    'btn-secondary': 'SecondaryButton',
    'btn-danger': 'DangerButton',
    'btn-negative': 'NegativeButton',
    'btn-back': 'BackButton',
    'btn-cancel': 'CancelButton',
    'btn-sm': 'SmallButton',
    'btn-label': 'ButtonLabel',
    'button-group': 'ButtonGroup',
    'toggle-button': 'ToggleButton',
    'toggle-button-group': 'ToggleButtonGroup',
    
    # Form elements 
    'form-group': 'FormGroup',
    'doc-input': 'DocInput',
    'async-form': 'AsyncForm',
    'filter-select': 'FilterSelect',
    'checkbox-container': 'CheckboxContainer',
    'checkbox-item': 'CheckboxItem',
    'checkbox-grid': 'CheckboxGrid',
    'mapping-field-select': 'MappingFieldSelect',
    'mapping-field-label': 'MappingFieldLabel',
    'mapping-field-group': 'MappingFieldGroup',
    
    # Modal structure elements
    'modal-header': 'ModalHeader',
    'modal-content': 'ModalContent',
    'modal-footer': 'ModalFooter',
    'modal-close': 'ModalClose',
    'modal-overlay': 'ModalOverlay',
    'overlay': 'Overlay',
    
    # Status and loading indicators
    'status-indicator': 'StatusIndicator',
    'status-container': 'StatusContainer',
    'status-icon': 'StatusIcon',
    'loading-indicator': 'LoadingIndicator',
    'loading-placeholder': 'LoadingPlaceholder',
    'error-placeholder': 'ErrorPlaceholder',
    'progress-bar': 'ProgressBar',
    'progress-container': 'ProgressContainer',
    'progress-stats': 'ProgressStats',
    'manual-loading-overlay': 'ManualLoadingOverlay',
    
    # Icons & UI elements
    'fas': 'FontAwesomeIcon',
    'fa-spinner': 'LoadingSpinner',
    'fa-spin': 'SpinAnimation',
    'info-icon': 'InfoIcon',
    'warning-icon': 'WarningIcon',
    'success-icon': 'SuccessIcon',
    
    # Dropdown components
    'dropdown': 'Dropdown',
    'dropdown-header': 'DropdownHeader',
    'dropdown-content': 'DropdownContent',
    'dropdown-footer': 'DropdownFooter',
    'jobs-dropdown': 'JobsDropdown',
    'notifications-dropdown': 'NotificationsDropdown',
    
    # Stage components
    'stage-form': 'StageForm',
    'stage-form-rfp-question-import': 'StageFormRfpQuestionImport',
    'stage-form-rfp-answer-questions': 'StageFormRfpAnswerQuestions',
    'stage-form-rfp-initial-review': 'StageFormAnalysisLMInitialReview',
    
    # Stage UI patterns
    'stage-title': 'StageTitle',
    'stage-description': 'StageDescription',
    'stage-number': 'StageNumber',
    'stage-separator': 'StageSeparator',
    
    # Grid components
    'questions-grid': 'QuestionsGrid',
    'ag-overlay-loading-center': 'AgGridLoadingOverlay',
    'ag-overlay-no-rows-center': 'AgGridNoRowsOverlay',
    
    # Tab components
    'topic-tabs': 'TopicTabs',
    'tab-loading-indicator': 'TabLoadingIndicator', 
    'worksheet-tabs-container': 'WorksheetTabsContainer',
    
    # Pane components
    'control-pane': 'ControlPane',
    'filter-pane': 'FilterPane',
    'sub-pane': 'SubPane',
    
    # Document components
    'doc-container': 'DocumentContainer',
    'doc-stage-breadcrumb': 'DocumentStageBreadcrumb',
    'doc-stage-content-wrapper': 'DocumentStageContentWrapper',
    'doc-title': 'DocumentTitle',
    'doc-header': 'DocumentHeader',
    'doc-footer': 'DocumentFooter',
    'doc-main-content': 'DocumentMainContent',
    'breadcrumb-label': 'BreadcrumbLabel',
    
    # Import wizard components
    'import-step': 'ImportStep',
    'import-step-select-file': 'ImportStepSelectFile',
    'import-step-map-columns': 'ImportStepMapColumns',
    'import-step-preview': 'ImportStepPreview',
    'import-step-results': 'ImportStepResults',
    'import-step-confirm': 'ImportStepConfirm',
    'import-grid-container': 'ImportGridContainer',
    'import-wizard-content': 'ImportWizardContent',
    'import-status-container': 'ImportStatusContainer',
    'import-progress-section': 'ImportProgressSection',
    'import-note': 'ImportNote',
    'drag-drop-area': 'DragDropArea',
    
    # Mapping and fields
    'mapping-container': 'MappingContainer',
    'mapping-section': 'MappingSection',
    'mapping-instructions': 'MappingInstructions',
    'mapping-form': 'MappingForm',
    'mapping-item': 'MappingItem',
    'mappings-list': 'MappingsList',
    'include-exclude-toggle': 'IncludeExcludeToggle',
    
    # Sheet and data components
    'worksheet-item': 'WorksheetItem',
    'worksheet-list': 'WorksheetList',
    'worksheet-header': 'WorksheetHeader',
    'worksheet-result-item': 'WorksheetResultItem',
    'worksheet-results-list': 'WorksheetResultsList',
    'worksheet-results-section': 'WorksheetResultsSection',
    
    # Preview components
    'preview-container': 'PreviewContainer',
    'preview-section': 'PreviewSection',
    'preview-note': 'PreviewNote',
    'preview-summary-section': 'PreviewSummarySection',
    'preview-summary-label': 'PreviewSummaryLabel',
    'preview-summary-info': 'PreviewSummaryInfo',
    'no-data-message': 'NoDataMessage',
    'no-sheets-message': 'NoSheetsMessage',
    
    # Stats and summary components
    'summary-section': 'SummarySection',
    'summary-details': 'SummaryDetails',
    'summary-message': 'SummaryMessage',
    'results-summary-panel': 'ResultsSummaryPanel',
    'stat-item': 'StatItem',
    'stat-label': 'StatLabel',
    'stat-value': 'StatValue',
    'stats-container': 'StatsContainer',
    'success-stat': 'SuccessStat',
    'warning-stat': 'WarningStat',
    'failure-stat': 'FailureStat',
    'percentage-stat': 'PercentageStat',
    
    # Framework components
    'selectable-list': 'SelectableList',
    'selectable-list-container': 'SelectableListContainer',
    'selectable-list-item': 'SelectableListItem',
    'analysis-lm-results': 'AnalysisLMResults',
    'custom-tooltip': 'CustomTooltip',
    'cell-tooltip': 'CellTooltip',
    
    # Table components
    'users-table': 'UsersTable',
    'jobs-table': 'JobsTable',
    'accounts-table': 'AccountsTable',
    'projects-table': 'ProjectsTable',
    'files-table': 'FilesTable',
    
    # Top bar components
    'top-bar': 'TopBar'
}

def extract_classes_from_css(css_file):
    """Extract CSS classes and their declarations from a CSS file"""
    with open(css_file, 'r', encoding='utf-8') as f:
        css_content = f.read()
    
    # Parse the CSS
    try:
        stylesheet = cssutils.parseString(css_content)
        
        class_map = {}
        source_file = os.path.basename(css_file)
        
        for rule in stylesheet:
            # Check if it's a style rule (not @media, @import, etc.)
            if rule.type == cssutils.css.CSSRule.STYLE_RULE:
                for selector in rule.selectorList:
                    selector_text = selector.selectorText
                    
                    # Extract class name (handle multiple classes and pseudo-classes)
                    class_matches = re.findall(r'\.([a-zA-Z0-9_-]+)(?:::?[a-zA-Z-]+)?', selector_text)
                    
                    if not class_matches:
                        continue
                        
                    # Get declarations as a set of strings
                    declarations = set()
                    for prop in rule.style:
                        # Changed this line to avoid the 'type' attribute error
                        if not isinstance(prop, cssutils.css.CSSComment):
                            declarations.add(f"{prop.name}: {prop.value}")
                    
                    # Add each class to the map
                    for class_name in class_matches:
                        if class_name not in class_map:
                            class_map[class_name] = {
                                'declarations': declarations,
                                'files': {source_file},
                                'count': 0,
                                'selectors': {selector_text}
                            }
                        else:
                            class_map[class_name]['declarations'].update(declarations)
                            class_map[class_name]['files'].add(source_file)
                            class_map[class_name]['selectors'].add(selector_text)
    except Exception as e:
        print(f"Error parsing CSS file {css_file}: {e}")
        return {}
    
    return class_map

def extract_classes_from_html_js(file_path):
    """Extract classes used in HTML files and className in JS files"""
    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
    
    js_classes = set()
    
    # Match patterns for JS class assignments:
    
    # 1. Match className = "class1 class2"
    className_matches = re.findall(r'className\s*=\s*[\'"]([^\'"]*)[\'"]', content)
    for match in className_matches:
        js_classes.update(match.split())
    
    # 2. Match this.modalEl.className = "class1 class2"
    obj_className_matches = re.findall(r'\.className\s*=\s*[\'"]([^\'"]*)[\'"]', content)
    for match in obj_className_matches:
        js_classes.update(match.split())
    
    # 3. Match template strings with class="${var} class1 class2"
    template_class_matches = re.findall(r'class=[\'"](.*?)[\'"]', content)
    for match in template_class_matches:
        # Skip if it contains ${...} template expressions
        plain_parts = re.sub(r'\${.*?}', '', match).strip()
        if plain_parts:
            js_classes.update(plain_parts.split())
    
    # 4. Match .classList.add("class1") or classList.toggle("class1")
    classList_matches = re.findall(r'\.classList\.(add|toggle|replace)\([\'"]([^\'"]+)[\'"]', content)
    for _, class_name in classList_matches:
        js_classes.add(class_name)
    
    # 5. Process HTML within JS template literals
    # Find template literals with HTML content
    template_literals = re.findall(r'`(.*?)`', content, re.DOTALL)
    for template in template_literals:
        if '<' in template and '>' in template:  # Simple check if it might contain HTML
            # Find class attributes in the HTML-like content
            html_classes = re.findall(r'class=[\'"]([^\'"]*)[\'"]', template)
            for match in html_classes:
                # Remove template expressions ${...} and split by whitespace
                clean_match = re.sub(r'\${[^}]*}', '', match).strip()
                if clean_match:
                    js_classes.update(clean_match.split())
    
    # 6. Look for element creation with className assignment (your specific case)
    element_classname_matches = re.findall(r'createElement\(.*?\);\s*.*?\.className\s*=\s*[\'"]([^\'"]*)[\'"]', content, re.DOTALL)
    for match in element_classname_matches:
        js_classes.update(match.split())
    
    # 7. Look for any variable assignment with className value
    var_classname_matches = re.findall(r'(?:var|let|const)\s+\w+\s*=\s*[\'"]([^\'"]*)[\'"];\s*.*?\.className', content)
    for match in var_classname_matches:
        js_classes.update(match.split())
    
    # 8. Expanded createElement pattern
    create_el_matches = re.findall(r'createElement\([\'"][a-zA-Z0-9]+[\'"]\)[^;]*?className\s*=\s*[\'"]([^\'"]*)[\'"]', content)
    for match in create_el_matches:
        js_classes.update(match.split())
        
    # 9. Direct string assignments that look like class names
    class_var_assignments = re.findall(r'[\'"]([a-zA-Z0-9_-]+(?:-[a-zA-Z0-9_-]+)*)[\'"]', content)
    for potential_class in class_var_assignments:
        # Check if it matches typical CSS class naming pattern (kebab-case)
        if re.match(r'^[a-zA-Z0-9]+-[a-zA-Z0-9-]+$', potential_class):
            js_classes.add(potential_class)
    
    # For HTML files with class="..."
    if file_path.endswith(('.html', '.htm')):
        try:
            soup = BeautifulSoup(content, 'html.parser')
            for tag in soup.find_all(attrs={"class": True}):
                if isinstance(tag['class'], list):
                    js_classes.update(tag['class'])
                else:
                    js_classes.update(tag['class'].split())
        except Exception as e:
            print(f"Error parsing HTML in {file_path}: {e}")
    
    return js_classes

def debug_extract_from_file(file_path, sample_size=5):
    """Debug function to extract and print classes from a specific file"""
    print(f"\nDebugging class extraction from: {file_path}")
    
    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
    
    # Print a small sample of the file content
    print(f"File content sample (first {sample_size} lines):")
    lines = content.split('\n')[:sample_size]
    for i, line in enumerate(lines):
        print(f"{i+1}: {line[:100]}{'...' if len(line) > 100 else ''}")
    
    # Extract classes using our function
    classes = extract_classes_from_html_js(file_path)
    
    print(f"Extracted {len(classes)} classes:")
    print(", ".join(sorted(classes)))
    return classes

def classify_risk(declarations):
    """Classify the risk level of a set of declarations"""
    for decl in declarations:
        prop = decl.split(':')[0].strip()
        if prop in HIGH_RISK_PROPS or any(prop.startswith(p+'-') for p in HIGH_RISK_PROPS):
            return "HIGH"
        if prop in MED_RISK_PROPS or any(prop.startswith(p+'-') for p in MED_RISK_PROPS):
            return "MEDIUM"
    return "LOW"

def guess_component(class_name, selectors):
    """Guess which component the class belongs to based on name and selectors"""
    # First try direct matches from component map
    for key, component in COMPONENT_MAP.items():
        if key == class_name.lower():
            return component
    
    # JavaScript component pattern matching for modal classes
    if 'modal' in class_name.lower():
        # Check for specific modal types
        modal_types = [
            'account', 'accounts', 'user', 'users', 'project', 'projects', 
            'document', 'documents', 'error', 'message', 'login', 'register',
            'password', 'corpus', 'choose-content', 'text-prompt', 'yesno', 
            'import', 'jobs', 'history'
        ]
        for modal_type in modal_types:
            if modal_type in class_name.lower():
                modal_class = modal_type.capitalize() + 'Modal'
                if modal_type == 'choose-content':
                    return 'ChooseContentForAIModal'
                if modal_type == 'accounts':
                    return 'AccountsModal'
                if modal_type == 'users':
                    return 'UsersModal'
                if modal_type == 'projects':
                    return 'ProjectsModal'
                if modal_type == 'documents':
                    return 'DocumentsModal'
                if modal_type == 'yesno':
                    return 'YesNoModal'
                if modal_type == 'text-prompt':
                    return 'TextPromptModal'
                if modal_type == 'password':
                    return 'PasswordResetModal'
                return modal_class
        return 'Modal'
    
    # Import wizard step components
    if 'import-step' in class_name.lower():
        if 'select-file' in class_name.lower():
            return 'ImportStepSelectFile'
        if 'map-columns' in class_name.lower():
            return 'ImportStepMapColumns'
        if 'preview' in class_name.lower():
            return 'ImportStepPreview'
        if 'confirm' in class_name.lower():
            return 'ImportStepConfirm'
        if 'results' in class_name.lower():
            return 'ImportStepResults'
        return 'ImportStep'
        
    # Stage components
    if 'stage-form' in class_name.lower():
        if 'rfp-answer-questions' in class_name.lower():
            return 'StageFormRfpAnswerQuestions'
        if 'rfp-initial-review' in class_name.lower():
            return 'StageFormAnalysisLMInitialReview'
        if 'rfp-question-import' in class_name.lower():
            return 'StageFormRfpQuestionImport'
        return 'StageForm'
    
    # Button patterns
    if class_name.startswith('btn'):
        if class_name == 'btn-primary':
            return 'PrimaryButton'
        if class_name == 'btn-secondary':
            return 'SecondaryButton'
        if class_name == 'btn-danger': 
            return 'DangerButton'
        if class_name == 'btn-negative':
            return 'NegativeButton'
        if class_name == 'btn-label':
            return 'ButtonLabel'
        return 'Button'
    
    # Try broader substring matches
    for key, component in COMPONENT_MAP.items():
        if key in class_name.lower():
            return component
    
    # Common patterns by word
    patterns = {
        'grid': 'Grid',
        'pane': 'Pane',
        'tab': 'Tab',
        'form': 'Form',
        'stat': 'Stat',
        'indicator': 'Indicator',
        'dropdown': 'Dropdown',
        'list': 'List',
        'section': 'Section',
        'container': 'Container',
        'item': 'Item',
        'header': 'Header',
        'footer': 'Footer',
        'panel': 'Panel',
        'label': 'Label',
        'message': 'Message',
        'wizard': 'Wizard',
        'loading': 'Loading',
        'progress': 'Progress',
        'overlay': 'Overlay',
        'doc': 'Document',
        'status': 'Status'
    }
    
    for pattern, component_type in patterns.items():
        if pattern in class_name.lower():
            # Create a camelCase component name based on the class name
            words = class_name.replace('-', ' ').split()
            if len(words) > 1:
                # Convert to CamelCase
                component_name = ''.join(word.capitalize() for word in words)
                return component_name
            return class_name.capitalize() + component_type
    
    # Try to guess from selectors
    for selector in selectors:
        for key, component in COMPONENT_MAP.items():
            if key in selector.lower():
                return component
    
    # Check if this is a file-specific class
    file_patterns = {
        'modals/': 'Modal',
        'stages/': 'Stage',
        'components/docitemimport/': 'Import',
        'framework/': 'Framework',
        'top-bar/': 'TopBar',
        'tabs/': 'Tab'
    }
    
    for selector in selectors:
        for file_pattern, component_type in file_patterns.items():
            if file_pattern in selector:
                return component_type
    
    return "Unknown"

def hash_declarations(declarations):
    """Create a hash of declarations for detecting duplicates"""
    sorted_decls = sorted(list(declarations))
    return hashlib.md5(''.join(sorted_decls).encode()).hexdigest()

def find_duplicate_rules(class_map):
    """Find duplicate rule sets with different class names"""
    hash_to_classes = defaultdict(list)
    
    for class_name, data in class_map.items():
        hash_value = hash_declarations(data['declarations'])
        hash_to_classes[hash_value].append(class_name)
    
    # Return only duplicates (more than one class with same declarations)
    return {hash_val: classes for hash_val, classes in hash_to_classes.items() if len(classes) > 1}

def main():
    parser = argparse.ArgumentParser(description='CSS Audit Tool for Respond SPA')
    parser.add_argument('--css', nargs='+', help='CSS files to analyze')
    parser.add_argument('--html', nargs='+', help='HTML/JS files pattern to analyze')
    parser.add_argument('--output', default='css-audit/output', help='Output directory')
    args = parser.parse_args()
    
    # Ensure output directory exists
    os.makedirs(args.output, exist_ok=True)
    
    # Process CSS files
    class_map = {}
    for css_file in args.css:
        file_class_map = extract_classes_from_css(css_file)
        for class_name, data in file_class_map.items():
            if class_name in class_map:
                class_map[class_name]['declarations'].update(data['declarations'])
                class_map[class_name]['files'].update(data['files'])
                class_map[class_name]['selectors'].update(data['selectors'])
            else:
                class_map[class_name] = data
    
    # Process HTML/JS files for usage counting
    # Use glob to expand patterns like /path/**/*.js
    processed_files = []
    for pattern in args.html:
        # Remove quotes if they exist
        pattern = pattern.strip("'\"")
        # Expand the glob pattern to get actual files
        matching_files = glob.glob(pattern, recursive=True)
        processed_files.extend(matching_files)
        
    # After processing all files
    if not processed_files:
        print("WARNING: No HTML/JS files were found matching the patterns. Check your paths.")
    else:
        print(f"Found {len(processed_files)} HTML/JS files to process")
        
        # Debug the first few files to verify class extraction
        sample_files = processed_files[:3]  # Show first 3 files
        all_found_classes = set()
        
        for sample_file in sample_files:
            found_classes = debug_extract_from_file(sample_file)
            all_found_classes.update(found_classes)
        
        print(f"\nTotal unique classes found in sample files: {len(all_found_classes)}")
        print(f"Sample of found classes: {', '.join(sorted(list(all_found_classes)[:20]))}")
    
    print(f"Found {len(processed_files)} HTML/JS files to process")
    
    for file_path in processed_files:
        try:
            used_classes = extract_classes_from_html_js(file_path)
            for class_name in used_classes:
                if class_name in class_map:
                    class_map[class_name]['count'] += 1
        except Exception as e:
            print(f"Error processing file {file_path}: {e}")
    
    # Add risk classification and component guessing
    for class_name, data in class_map.items():
        data['risk'] = classify_risk(data['declarations'])
        data['component'] = guess_component(class_name, data['selectors'])
        # Convert sets to lists for JSON serialization
        data['files'] = list(data['files'])
        data['declarations'] = list(data['declarations'])
        data['selectors'] = list(data['selectors'])
    
    # Find duplicates
    duplicates = find_duplicate_rules(class_map)
    
    # Convert to serializable format for duplicates
    serializable_duplicates = {k: v for k, v in duplicates.items()}
    
    # Save the full audit data
    with open(f"{args.output}/css-audit-full.json", 'w') as f:
        json.dump(class_map, f, indent=2)
    
    # Save duplicates separately
    with open(f"{args.output}/css-duplicates.json", 'w') as f:
        json.dump(serializable_duplicates, f, indent=2)
    
    # Create CSV for easy viewing
    csv_data = []
    for class_name, data in class_map.items():
        row = {
            'class': class_name,
            'risk': data['risk'],
            'usage_count': data['count'],
            'component': data['component'],
            'files': ', '.join(data['files']),
            'duplicate_group': None
        }
        
        # Add duplicate group if applicable
        for hash_val, classes in duplicates.items():
            if class_name in classes:
                row['duplicate_group'] = hash_val[:8]  # Short version of hash
                row['merge_candidates'] = ', '.join([c for c in classes if c != class_name])
                break
        
        csv_data.append(row)
    
    # Write to CSV sorted by usage count descending
    df = pd.DataFrame(csv_data)
    df = df.sort_values('usage_count', ascending=False)
    df.to_csv(f"{args.output}/css-audit.csv", index=False)
    
    # Print summary
    print(f"CSS Audit Complete!")
    print(f"Found {len(class_map)} unique CSS classes across {len(args.css)} CSS files")
    print(f"Identified {sum(1 for _, classes in duplicates.items() if len(classes) > 1)} duplicate rule sets")
    print(f"Risk breakdown:")
    risk_counts = df['risk'].value_counts()
    for risk, count in risk_counts.items():
        print(f"  {risk}: {count} classes")
    print(f"Output saved to {args.output}/")

if __name__ == "__main__":
    main()
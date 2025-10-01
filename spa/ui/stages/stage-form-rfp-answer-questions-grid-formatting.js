import formatHumanReadableDate from "../../utils/date-utils.js";

/**
 * QuestionsGridFormatting
 * Handles all column definitions, cell rendering, and visual formatting for the QuestionsGrid
 */
export class QuestionsGridFormatting {
    constructor({ currentUsername, isCompactMode = false }) {
        this.currentUsername = currentUsername;
        this.isCompactMode = isCompactMode;
        this.icons = this.getIcons();
    }

    /**
     * Get optimized icons for the grid
     */
    getIcons() {
        return {
            filter: '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 10V6L1 2V1H11V2L7 6V10L5 10Z" fill="currentColor"/></svg>',
            menu: '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 3H11M1 6H11M1 9H11" stroke="currentColor" stroke-width="1.2"/></svg>',
            asc: '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 3L9 7H3L6 3Z" fill="currentColor"/></svg>',
            desc: '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 9L3 5H9L6 9Z" fill="currentColor"/></svg>',
            small_down: '<svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 4L5 7L8 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
            selectOpen: '<svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 4L5 7L8 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>'
        };
    }

    /**
     * Set compact mode state
     */
    setCompactMode(isCompact) {
        this.isCompactMode = isCompact;
    }

    /**
     * Simple text formatter that converts newlines to HTML breaks
     * Only applied for display - doesn't modify the underlying data
     */
    formatTextWithLineBreaks(value) {
        if (!value || typeof value !== 'string') return value;

        // Convert \n to <br> for display
        return value.replace(/\n/g, '<br>');
    }

    /**
     * Get cell style for text fields based on compact mode
     */
    getTextCellStyle() {
        if (this.isCompactMode) {
            return {
                whiteSpace: 'nowrap',      // No wrapping in compact mode
                overflow: 'hidden',        // Hide overflow
                textOverflow: 'ellipsis',  // Show ellipsis for truncated text
                lineHeight: '1.1',         // Tighter line height in compact mode
                fontSize: 'var(--grid-font-size, 13px)',  // Use CSS variable for dynamic font size
                padding: '2px 4px'
            };
        } else {
            return {
                lineHeight: '1.3',
                padding: '4px',
                whiteSpace: 'normal',
                wordWrap: 'break-word',
                overflow: 'visible',        // Explicitly allow overflow in non-compact mode
                textOverflow: 'unset',     // Explicitly remove ellipsis in non-compact mode
                fontSize: 'var(--grid-font-size, 14px)'  // Use CSS variable for dynamic font size
            };
        }
    }

    /**
     * Get column definitions for the grid
     */
    getColumnDefs() {
        return [
            {
                headerName: "",
                field: "selection",
                checkboxSelection: true,
                headerCheckboxSelection: true,
                width: 50,
                sortable: false,
                filter: false,
                pinned: "left",
                lockPosition: true,
                suppressSizeToFit: true
            },
            {
                headerName: "ID",
                field: "question_id",
                minWidth: 80,
                width: 90,
                sortable: true,
                editable: true,
                filter: true,
                filterParams: {
                    buttons: ['apply', 'reset'],
                    closeOnApply: true
                }
            },
            {
                headerName: "Question",
                field: "question_text",
                minWidth: 300,
                flex: 3,
                sortable: true,
                editable: true,
                filter: true,
                wrapText: true,  // Always enable text wrapping
                autoHeight: !this.isCompactMode,  // Auto height only in expanded mode
                cellEditor: 'agLargeTextCellEditor',
                cellEditorParams: {
                    maxLength: 5000,
                    rows: this.isCompactMode ? 2 : 6,
                    cols: 60
                },
                cellRenderer: (params) => {
                    if (!this.isCompactMode && params.value) {
                        return this.formatTextWithLineBreaks(params.value);
                    }
                    return params.value;
                },
                cellStyle: () => this.getTextCellStyle(),
                filterParams: {
                    buttons: ['apply', 'reset'],
                    closeOnApply: true
                }
            },
            {
                headerName: "Guidance",
                field: "guidance",
                minWidth: 200,
                flex: 2,
                sortable: true,
                editable: true,
                filter: true,
                wrapText: true,  // Always enable text wrapping
                autoHeight: !this.isCompactMode,
                cellEditor: 'agLargeTextCellEditor',
                cellEditorParams: {
                    maxLength: 3000,
                    rows: this.isCompactMode ? 2 : 4,
                    cols: 60
                },
                cellRenderer: (params) => {
                    if (!this.isCompactMode && params.value) {
                        return this.formatTextWithLineBreaks(params.value);
                    }
                    return params.value;
                },
                cellStyle: () => this.getTextCellStyle(),
                filterParams: {
                    buttons: ['apply', 'reset'],
                    closeOnApply: true
                }
            },
            {
                headerName: "Answer",
                field: "answer_text",
                minWidth: 360,
                flex: 3.6,
                sortable: true,
                editable: true,
                filter: true,
                wrapText: true,  // Always enable text wrapping
                autoHeight: !this.isCompactMode,
                cellEditor: 'agLargeTextCellEditor',
                cellEditorParams: {
                    maxLength: 10000,
                    rows: this.isCompactMode ? 3 : 8,
                    cols: 60
                },
                cellRenderer: (params) => {
                    return this.renderAnswerTextCell(params);
                },
                cellStyle: () => this.getTextCellStyle(),
                filterParams: {
                    buttons: ['apply', 'reset'],
                    closeOnApply: true
                }
            },
            {
                headerName: "AI Answer",
                field: "ai_answer_text",
                minWidth: 250,
                flex: 2,
                sortable: true,
                editable: false,
                filter: true,
                hide: true,  // Hide the AI Answer column
                wrapText: true,  // Always enable text wrapping
                autoHeight: !this.isCompactMode,
                valueGetter: (params) => {
                    return params.data?.ai_answer_text ||
                        params.data?.original_answer ||
                        '';
                },
                cellRenderer: (params) => {
                    const value = params.data?.ai_answer_text || params.data?.original_answer || '';
                    if (!this.isCompactMode && value) {
                        return this.formatTextWithLineBreaks(value);
                    }
                    return value;
                },
                cellStyle: () => {
                    const baseStyle = this.getTextCellStyle();
                    return {
                        ...baseStyle,
                        backgroundColor: '#f8f9fa'
                    };
                },
                filterParams: {
                    buttons: ['apply', 'reset'],
                    closeOnApply: true
                },
                headerTooltip: "AI-generated answer (read-only reference)"
            },
            {
                headerName: "Risk Rating",
                field: "risk_rating",
                minWidth: 120,
                width: 150,
                sortable: true,
                editable: false,
                filter: true,
                valueFormatter: (params) => {
                    if (params.value === undefined || params.value === null) return '';
                    return params.value + '%';
                },
                cellStyle: (params) => {
                    if (params.value === undefined || params.value === null) return {};

                    const styles = { fontWeight: 'bold' };
                    if (this.isCompactMode) {
                        styles.fontSize = '13px';
                        styles.lineHeight = '1.1';
                    }

                    if (params.value < 30) {
                        styles.color = '#1a9641';
                    } else if (params.value < 70) {
                        styles.color = '#fdae61';
                    } else {
                        styles.color = '#d7191c';
                    }
                    return styles;
                },
                filterParams: {
                    buttons: ['apply', 'reset'],
                    closeOnApply: true
                }
            },
            {
                headerName: "Compliance",
                field: "answer_complies",
                minWidth: 120,
                width: 140,
                sortable: true,
                editable: true,
                filter: true,
                cellEditor: 'agSelectCellEditor',
                cellEditorParams: {
                    values: ['Yes', 'No', 'Partial', 'N/A'],
                    icons: {
                        selectOpen: this.icons.selectOpen
                    }
                },
                comparator: (valueA, valueB) => {
                    const complianceOrder = {
                        'Yes': 1,
                        'Partial': 2,
                        'No': 3,
                        'N/A': 4
                    };
                    return (complianceOrder[valueA] || 999) - (complianceOrder[valueB] || 999);
                },
                cellStyle: (params) => {
                    if (params.value === undefined || params.value === null) return {};

                    const styles = { fontWeight: 'bold' };
                    if (this.isCompactMode) {
                        styles.fontSize = '13px';
                        styles.lineHeight = '1.1';
                    }

                    switch (params.value) {
                        case 'Yes':
                            styles.color = '#1a9641';  // Green
                            break;
                        case 'Partial':
                            styles.color = '#fdae61';  // Orange
                            break;
                        case 'No':
                            styles.color = '#d7191c';  // Red
                            break;
                        case 'N/A':
                            styles.color = '#666666';  // Gray
                            break;
                        default:
                            styles.color = '#999999';  // Light gray for empty/unknown
                    }
                    return styles;
                },
                filterParams: {
                    buttons: ['apply', 'reset'],
                    closeOnApply: true
                }
            },
            {
                headerName: "Completeness",
                field: "completeness",
                minWidth: 120,
                width: 150,
                sortable: true,
                editable: false,
                filter: true,
                valueFormatter: (params) => {
                    if (params.value === undefined || params.value === null) return '';
                    return params.value + '%';
                },
                cellStyle: (params) => {
                    if (params.value === undefined || params.value === null) return {};

                    const styles = { fontWeight: 'bold' };
                    if (this.isCompactMode) {
                        styles.fontSize = '13px';
                        styles.lineHeight = '1.1';
                    }

                    if (params.value < 30) {
                        styles.color = '#d7191c';
                    } else if (params.value < 70) {
                        styles.color = '#fdae61';
                    } else {
                        styles.color = '#1a9641';
                    }
                    return styles;
                },
                filterParams: {
                    buttons: ['apply', 'reset'],
                    closeOnApply: true
                }
            },
            {
                headerName: "AI Answer Date",
                field: "ai_answer_date",
                minWidth: 165,
                width: 200,
                sortable: true,
                editable: false,
                filter: 'agDateColumnFilter',
                valueGetter: (params) => {
                    return params.data?.ai_answer_date ||
                        params.data?.answer_generation_datetime ||
                        '';
                },
                valueFormatter: (params) => {
                    if (!params.value) return '';
                    return formatHumanReadableDate(params.value);
                },
                cellStyle: () => this.isCompactMode ? { fontSize: '13px', lineHeight: '1.1' } : {},
                filterParams: {
                    buttons: ['apply', 'reset'],
                    closeOnApply: true
                }
            },
            {
                headerName: "Corpus Content",
                field: "content",
                minWidth: 200,
                flex: 1,
                sortable: true,
                editable: false,
                filter: true,
                wrapText: true,  // Enable wrapping for content field too
                cellRenderer: (params) => this.renderContentCell(params),
                cellStyle: () => this.isCompactMode ? {
                    fontSize: '13px',
                    lineHeight: '1.1',
                    whiteSpace: 'normal',
                    wordWrap: 'break-word'
                } : {},
                filterParams: {
                    buttons: ['apply', 'reset'],
                    closeOnApply: true
                }
            },
            {
                headerName: "Owner",
                field: "owner_username",
                minWidth: 120,
                width: 150,
                sortable: true,
                editable: true,
                filter: true,
                cellEditor: 'agSelectCellEditor',
                cellEditorParams: {
                    values: ['', this.currentUsername],
                    icons: {
                        selectOpen: this.icons.selectOpen
                    }
                },
                cellStyle: () => this.isCompactMode ? { fontSize: '13px', lineHeight: '1.1' } : {},
                filterParams: {
                    buttons: ['apply', 'reset'],
                    closeOnApply: true
                }
            },
            {
                headerName: "Status",
                field: "status",
                minWidth: 120,
                width: 150,
                sortable: true,
                editable: true,
                filter: true,
                cellEditor: 'agSelectCellEditor',
                cellEditorParams: {
                    values: ['NEW', 'ANSWER_GENERATED', 'IN_PROGRESS', 'PENDING_REVIEW', 'NEEDS_REVISION', 'READY', 'APPROVED'],
                    icons: {
                        selectOpen: this.icons.selectOpen
                    }
                },
                comparator: (valueA, valueB) => {
                    const statusOrder = {
                        'NEW': 1,
                        'ANSWER_GENERATED': 2,
                        'IN_PROGRESS': 3,
                        'PENDING_REVIEW': 4,
                        'NEEDS_REVISION': 5,
                        'READY': 6,
                        'APPROVED': 7
                    };
                    return (statusOrder[valueA] || 0) - (statusOrder[valueB] || 0);
                },
                cellRenderer: (params) => {
                    const status = params.value || 'NEW';
                    const statusClass = status.toLowerCase().replace('_', '-');
                    const fontSize = this.isCompactMode ? 'font-size: 12px;' : '';
                    return `<span class="status-${statusClass}" style="${fontSize}">${status.replace('_', ' ')}</span>`;
                },
                filterParams: {
                    buttons: ['apply', 'reset'],
                    closeOnApply: true
                }
            },
            {
                headerName: "Locked By",
                field: "locked_by",
                minWidth: 120,
                width: 150,
                sortable: true,
                editable: false,
                filter: true,
                cellStyle: (params) => {
                    const baseStyle = this.isCompactMode ? { fontSize: '13px', lineHeight: '1.1' } : {};
                    if (params.value && params.value !== this.currentUsername) {
                        return { ...baseStyle, backgroundColor: '#fff3cd', color: '#856404' };
                    }
                    return baseStyle;
                },
                filterParams: {
                    buttons: ['apply', 'reset'],
                    closeOnApply: true
                }
            },
            {
                headerName: "Modified By",
                field: "modified_by",
                minWidth: 120,
                width: 150,
                sortable: true,
                editable: false,
                filter: true,
                cellStyle: () => this.isCompactMode ? { fontSize: '13px', lineHeight: '1.1' } : {},
                filterParams: {
                    buttons: ['apply', 'reset'],
                    closeOnApply: true
                }
            },
            {
                headerName: "Modified Date",
                field: "modified_datetime",
                minWidth: 165,
                width: 200,
                sortable: true,
                editable: false,
                filter: 'agDateColumnFilter',
                valueFormatter: (params) => {
                    if (!params.value) return '';
                    return formatHumanReadableDate(params.value);
                },
                cellStyle: () => this.isCompactMode ? { fontSize: '13px', lineHeight: '1.1' } : {},
                filterParams: {
                    buttons: ['apply', 'reset'],
                    closeOnApply: true
                }
            },
            {
                headerName: "Notes",
                field: "notes",
                minWidth: 200,
                flex: 2,
                sortable: true,
                editable: true,
                filter: true,
                wrapText: true,  // Always enable text wrapping
                autoHeight: !this.isCompactMode,
                cellEditor: 'agLargeTextCellEditor',
                cellEditorParams: {
                    maxLength: 5000,
                    rows: this.isCompactMode ? 2 : 4,
                    cols: 50
                },
                cellRenderer: (params) => {
                    if (!this.isCompactMode && params.value) {
                        return this.formatTextWithLineBreaks(params.value);
                    }
                    return params.value;
                },
                cellStyle: () => this.getTextCellStyle(),
                filterParams: {
                    buttons: ['apply', 'reset'],
                    closeOnApply: true
                }
            }
        ];
    }

    /**
     * Enhanced answer text cell renderer with processing indicators
     */
    renderAnswerTextCell(params) {
        // Check for processing state first (Phase 2 enhancement)
        if (params.data?._isProcessing) {
            return `
                <div class="answer-processing-indicator">
                    <span class="processing-text">AI Processing</span>
                    <span class="processing-dots"></span>
                </div>
            `;
        }

        // Check for processing error state
        if (params.data?._processingError) {
            return `
                <div class="answer-processing-error">
                    <span class="error-text">Processing failed</span>
                    <span class="retry-hint">(Click to retry)</span>
                </div>
            `;
        }

        // Normal answer display
        if (!this.isCompactMode && params.value) {
            return this.formatTextWithLineBreaks(params.value);
        }

        return params.value || '';
    }

    /**
     * Render content cell with improved formatting
     */
    renderContentCell(params) {
        if (!params.value) {
            const fontSize = this.isCompactMode ? 'font-size: 12px;' : '';
            return `<span style="color: #999; font-style: italic; ${fontSize}">No content assigned</span>`;
        }

        try {
            let contentData;

            if (typeof params.value === 'string') {
                try {
                    contentData = JSON.parse(params.value);
                } catch (parseErr) {
                    const fontSize = this.isCompactMode ? 'font-size: 12px;' : '';
                    return `<span style="color: #999; font-style: italic; ${fontSize}">Invalid content data</span>`;
                }
            } else if (typeof params.value === 'object') {
                contentData = params.value;
            } else {
                const fontSize = this.isCompactMode ? 'font-size: 12px;' : '';
                return `<span style="color: #999; font-style: italic; ${fontSize}">Invalid content format</span>`;
            }

            const corpus = contentData.corpus || 'default';
            const domain = contentData.domain || '';
            const unit = contentData.unit || '';
            const topics = contentData.document_topics || [];
            const types = contentData.document_types || [];

            let html = '<div style="padding: 2px 0;">';

            if (corpus || domain || unit) {
                const headerFontSize = this.isCompactMode ? 'font-size: 11px;' : 'font-size: 12px;';
                html += `<div style="${headerFontSize} font-weight: 500; margin-bottom: 2px;">`;

                const pathParts = [];
                if (corpus) pathParts.push(corpus);
                if (domain) pathParts.push(domain);
                if (unit) pathParts.push(unit);

                html += pathParts.join(' > ');
                html += '</div>';
            }

            const detailsParts = [];

            if (topics.length > 0) {
                const topicsText = Array.isArray(topics) ? topics.join(', ') : topics;
                detailsParts.push(`Topics: ${topicsText}`);
            }

            if (types.length > 0) {
                const typesText = Array.isArray(types) ? types.join(', ') : types;
                detailsParts.push(`Types: ${typesText}`);
            }

            if (detailsParts.length > 0) {
                const detailsFontSize = this.isCompactMode ? 'font-size: 10px;' : 'font-size: 11px;';
                html += `<div style="${detailsFontSize} color: #666;">`;
                html += detailsParts.join(' | ');
                html += '</div>';
            }

            html += '</div>';
            return html;

        } catch (err) {
            console.error('Error formatting content cell:', err);
            const fontSize = this.isCompactMode ? 'font-size: 12px;' : '';
            return `<span style="color: #999; font-style: italic; ${fontSize}">Error displaying content</span>`;
        }
    }

    /**
     * Get row style based on data
     */
    getRowStyle(params) {
        const styles = {};

        if (params.data?.locked_by && params.data.locked_by !== this.currentUsername) {
            styles.backgroundColor = 'rgba(255, 193, 7, 0.1)';
        }

        if (params.data?.status === 'NEEDS_REVISION' || params.data?.status === 'PENDING_REVIEW') {
            styles.borderLeft = '3px solid #dc3545';
        }

        return styles;
    }

    /**
     * Get row class based on data
     */
    getRowClass(params) {
        const classes = [];

        // Add compact mode class
        if (this.isCompactMode) {
            classes.push('compact-mode');
        }

        if (params.data?.locked_by && params.data.locked_by !== this.currentUsername) {
            classes.push('locked-row');
        }

        if (params.data?.status === 'NEEDS_REVISION' || params.data?.status === 'PENDING_REVIEW') {
            classes.push('needs-attention');
        }

        // Enhanced processing state classes for Phase 2 visual indicators
        if (params.data?._isProcessing) {
            classes.push('question-processing');
        }

        if (params.data?._justCompleted) {
            classes.push('question-completed');
        }

        if (params.data?._processingError) {
            classes.push('question-processing-error');
        }

        // DIAGNOSTIC: Log when getRowClass is called to understand refresh behavior
        const itemId = params.data?.project_document_stage_group_id_item_id;
        if (itemId && (params.data?._isProcessing !== undefined || params.data?._justCompleted !== undefined)) {
            console.log(`[QuestionsGridFormatting] 🎨 DIAGNOSTIC: getRowClass called for ${itemId?.slice(-12)}:`, {
                _isProcessing: params.data?._isProcessing,
                _justCompleted: params.data?._justCompleted,
                resultingClasses: classes.join(' ')
            });
        }

        return classes.join(' ');
    }

    /**
     * Skip navigation to locked cells
     */
    navigateToNextCell(params, currentUsername) {
        const nextCellPosition = params.nextCellPosition;

        if (nextCellPosition) {
            const gridApi = params.api;
            const nextRowData = gridApi.getDisplayedRowAtIndex(nextCellPosition.rowIndex)?.data;

            if (nextRowData?.locked_by && nextRowData.locked_by !== currentUsername) {
                const nextRowIndex = nextCellPosition.rowIndex + 1;
                if (nextRowIndex < gridApi.getDisplayedRowCount()) {
                    return {
                        ...nextCellPosition,
                        rowIndex: nextRowIndex
                    };
                }
            }
        }

        return nextCellPosition;
    }

    /**
     * Add required CSS styles for formatting
     */
    addFormattingStyles() {
        if (document.getElementById('questions-grid-formatting-styles')) return;

        const style = document.createElement('style');
        style.id = 'questions-grid-formatting-styles';
        style.textContent = `
            .locked-row {
                background-color: rgba(255, 193, 7, 0.1) !important;
            }
            
            .status-new { 
                color: var(--text-muted); 
                font-weight: var(--font-weight-normal);
                background-color: var(--surface-background);
                padding: 2px 6px;
                border-radius: 3px;
            }
            .status-answer-generated { 
                color: var(--color-info); 
                font-weight: var(--font-weight-medium);
                background-color: var(--surface-background);
                padding: 2px 6px;
                border-radius: 3px;
            }
            .status-in-progress { 
                color: var(--text-primary);
                font-weight: var(--font-weight-medium);
                background-color: var(--color-warning);
                padding: 2px 6px;
                border-radius: 3px;
            }
            .status-pending-review { 
                color: var(--text-primary);
                font-weight: var(--font-weight-semibold);
                background-color: var(--color-warning);
                padding: 2px 6px;
                border-radius: 3px;
            }
            .status-needs-revision { 
                color: var(--text-on-primary);
                font-weight: var(--font-weight-semibold);
                background-color: var(--status-error);
                padding: 2px 6px;
                border-radius: 3px;
            }
            .status-ready { 
                color: var(--text-primary);
                font-weight: var(--font-weight-medium);
                background-color: var(--status-success);
                padding: 2px 6px;
                border-radius: 3px;
            }
            .status-approved { 
                color: var(--text-on-primary);
                font-weight: var(--font-weight-bold);
                background-color: var(--status-success);
                padding: 2px 6px;
                border-radius: 3px;
            }
            
            .validation-toast {
                position: fixed;
                top: 20px;
                right: 20px;
                background: #dc3545;
                color: white;
                padding: 12px 16px;
                border-radius: 4px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                z-index: 10000;
                opacity: 0;
                transition: opacity 0.3s ease;
            }
            
            /* Loading overlay styles */
            .grid-loading-overlay {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(255, 255, 255, 0.9);
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                z-index: 1000;
            }
            
            .grid-loading-spinner {
                width: 40px;
                height: 40px;
                border: 4px solid #f3f3f3;
                border-top: 4px solid #3498db;
                border-radius: 50%;
                animation: grid-spin 1s linear infinite;
            }
            
            .grid-loading-text {
                margin-top: 10px;
                font-size: 14px;
                color: #333;
                text-align: center;
            }
            
            @keyframes grid-spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            
            /* Tighter line spacing for text cells */
            .ag-cell {
                line-height: 1.3 !important;
            }
            
            .ag-cell-wrapper {
                line-height: 1.3 !important;
            }
            
            /* Enhanced compact mode styles */
            .ag-row.compact-mode .ag-cell {
                padding: 2px 4px !important;
                line-height: 1.1 !important;
                font-size: var(--grid-font-size, 13px) !important;
                height: auto !important; /* Natural height based on content */
                min-height: 20px !important; /* Minimum height for single line of text */
            }
            
            /* Ensure text truncation works in compact mode */
            .ag-row.compact-mode .ag-cell {
                white-space: nowrap !important;
                overflow: hidden !important;
                text-overflow: ellipsis !important;
            }
            
            /* Specific styling for text fields in compact mode */
            .ag-row.compact-mode .ag-cell[col-id="question_text"],
            .ag-row.compact-mode .ag-cell[col-id="guidance"],
            .ag-row.compact-mode .ag-cell[col-id="answer_text"],
            .ag-row.compact-mode .ag-cell[col-id="ai_answer_text"],
            .ag-row.compact-mode .ag-cell[col-id="notes"] {
                white-space: nowrap !important;
                overflow: hidden !important;
                text-overflow: ellipsis !important;
                line-height: 1.1 !important;
                font-size: var(--grid-font-size, 13px) !important;
            }
            
            /* Grid font size variable for dynamic sizing */
            .ag-theme-alpine {
                --grid-font-size: 14px;
            }
            .ag-theme-alpine .ag-cell {
                font-size: var(--grid-font-size, 14px) !important;
            }
            
            /* ============================
             * PHASE 2: Processing State Styles
             * AG-Grid compatible visual indicators
             * ============================ */
            
            /* Processing row state - using minimal CSS, no dimension changes */
            .ag-row.question-processing {
                background-color: var(--surface-muted, #f8f9fa) !important;
                opacity: 0.85;
                transition: opacity 0.3s ease;
            }
            
            .ag-row.question-processing .ag-cell {
                color: var(--text-disabled, #6c757d);
            }
            
            /* Completion highlight animation */
            .ag-row.question-completed {
                animation: question-completion-glow 2s ease-out;
            }
            
            @keyframes question-completion-glow {
                0% { background-color: var(--status-success-subtle, #d4edda); }
                50% { background-color: var(--status-success-subtle, #d4edda); }
                100% { background-color: transparent; }
            }
            
            /* Processing error state */
            .ag-row.question-processing-error {
                background-color: var(--status-error-subtle, #f8d7da) !important;
            }
            
            /* Processing indicator components */
            .answer-processing-indicator {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                color: var(--interactive-primary, #0e3048);
                font-weight: 500;
                font-size: 13px;
                padding: 2px 0;
            }
            
            .processing-text {
                font-style: italic;
            }
            
            /* Animated processing dots */
            .processing-dots::after {
                content: '';
                animation: processing-dots-pulse 1.4s infinite;
                color: var(--interactive-primary, #0e3048);
                font-weight: bold;
            }
            
            @keyframes processing-dots-pulse {
                0% { content: ''; }
                25% { content: '.'; }
                50% { content: '..'; }
                75% { content: '...'; }
                100% { content: ''; }
            }
            
            /* Processing error indicator */
            .answer-processing-error {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                color: var(--status-error, #dc3545);
                font-size: 12px;
            }
            
            .error-text {
                font-weight: 500;
            }
            
            .retry-hint {
                font-style: italic;
                color: var(--text-secondary, #666666);
            }
            
            /* Accessibility: Respect reduced motion preferences */
            @media (prefers-reduced-motion: reduce) {
                .processing-dots::after {
                    animation: none;
                    content: '...' !important;
                }
                
                .ag-row.question-completed {
                    animation: none;
                    background-color: var(--status-success-subtle, #d4edda);
                }
                
                .ag-row.question-processing {
                    transition: none;
                }
            }
        `;

        document.head.appendChild(style);
    }

    /**
     * Clean up formatting resources
     */
    destroy() {
        const styles = document.getElementById('questions-grid-formatting-styles');
        if (styles && styles.parentNode) {
            styles.parentNode.removeChild(styles);
        }
    }
}
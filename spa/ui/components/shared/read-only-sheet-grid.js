// ui/components/shared/read-only-sheet-grid.js

/**
 * A lightweight read-only grid for displaying spreadsheet data
 * Used across multiple steps of the import wizard for previewing data
 */
export class ReadOnlySheetGrid {
    /**
     * Create a new read-only sheet grid
     * @param {Object} options - Configuration options
     * @param {Array} options.data - 2D array of data (rows/columns)
     * @param {boolean} options.hasHeader - Whether the first row is a header
     * @param {number} options.startRow - Index of the first data row (0-based)
     * @param {number} options.maxVisibleRows - Maximum number of rows to display
     * @param {number} options.maxVisibleCols - Maximum number of columns to display
     * @param {Function} options.onSelectStartRow - Callback when a row is selected as start row
     * @param {Array} options.columnMappings - Array of objects mapping source columns to destination fields
     * @param {boolean} options.disableRowSelection - Whether to disable row selection functionality
     * @param {Array} options.customHeaders - Optional array of custom header labels to use instead of data[0]
     * @param {boolean} options.disableCellTooltips - Whether to disable cell click tooltips
     */
    constructor(options = {}) {
        this.data = options.data || [[]];
        this.hasHeader = options.hasHeader !== false; // Default to true
        this.startRow = options.startRow || (this.hasHeader ? 1 : 0);
        this.maxVisibleRows = options.maxVisibleRows || 15;
        this.maxVisibleCols = options.maxVisibleCols || 15;
        this.onSelectStartRow = options.onSelectStartRow || (() => { });
        this.columnMappings = options.columnMappings || [];
        this.disableRowSelection = options.disableRowSelection || false;
        this.customHeaders = options.customHeaders || null; // Store custom headers if provided
        this.disableCellTooltips = options.disableCellTooltips || false;
    }

    /**
     * Render the grid
     * @param {HTMLElement} container - Container element
     */
    render(container) {
        if (!container) {
            console.error("No container provided for grid rendering");
            return;
        }
    
        try {
            container.innerHTML = '';
    
            // Create grid container
            const gridContainer = document.createElement('div');
            gridContainer.classList.add('ro-grid-container');
            this.gridContainer = gridContainer;
    
            // If no data, show a message
            if (!this.data || !this.data.length) {
                console.warn("No data available for grid");
                const message = document.createElement('div');
                message.classList.add('overlay-message');
                message.textContent = 'No data available';
                gridContainer.appendChild(message);
                container.appendChild(gridContainer);
                return;
            }
    
            // Create table
            const table = document.createElement('table');
            table.classList.add('ro-grid-table');
            
            // If row selection is disabled, add a specific class
            if (this.disableRowSelection) {
                table.classList.add('no-row-selection');
            }
    
            // Determine the number of columns
            const firstRowLength = Array.isArray(this.data[0]) ? this.data[0].length : 0;
            const numCols = Math.min(firstRowLength, this.maxVisibleCols);
    
            // If we don't have any columns, show error
            if (numCols === 0) {
                const message = document.createElement('div');
                message.classList.add('overlay-message');
                message.textContent = 'Data structure is invalid - no columns detected';
                gridContainer.appendChild(message);
                container.appendChild(gridContainer);
                return;
            }
    
            // Calculate optimized column widths
            const columnWidths = this._optimizeColumnWidths();
    
            // Create column headers row (A, B, C, etc.)
            const colHeaderRow = document.createElement('tr');
    
            // Add corner cell
            const cornerCell = document.createElement('th');
            cornerCell.classList.add('row-header', 'col-header', 'corner-header');
            
            // Only show table icon if not in read-only preview mode
            if (!this.disableRowSelection) {
                cornerCell.innerHTML = '<i class="fas fa-table"></i>';
            }
            
            colHeaderRow.appendChild(cornerCell);
    
            // Add column headers
            for (let i = 0; i < numCols; i++) {
                const th = document.createElement('th');
                th.classList.add('col-header');
            
                // Apply calculated width
                if (columnWidths[i]) {
                    th.style.width = `${columnWidths[i]}%`;
                }
            
                // CRITICAL FIX: Use custom headers if provided
                if (this.disableRowSelection && this.customHeaders && i < this.customHeaders.length) {
                    // Use custom header value if available
                    th.textContent = this.customHeaders[i] || (i + 1).toString();
                } else if (this.disableRowSelection && this.hasHeader && this.data[0] && i < this.data[0].length) {
                    // Fallback to first row if custom headers not provided
                    th.textContent = this.data[0][i] || (i + 1).toString();
                } else {
                    // Convert column index to Excel-style column reference for mapping mode
                    th.textContent = this.indexToColumnLetter(i);
                }
            
                // Add mapped header class if this column is mapped
                if (this.columnMappings.some(mapping => mapping.sourceColumn === i)) {
                    th.classList.add('mapped-header');
                }
            
                colHeaderRow.appendChild(th);
            }
    
            table.appendChild(colHeaderRow);
    
            // Limit visible rows
            const numDataRows = Math.min(this.data.length, this.maxVisibleRows);
    
            // CRITICAL FIX: Skip the first row if it's a header AND we're using custom headers
            // This ensures we don't show headers as data row
            const startIndex = (this.hasHeader && this.customHeaders && this.disableRowSelection) ? 0 : 0;
    
            // Create data rows with row-level error handling
            for (let i = startIndex; i < numDataRows; i++) {
                try {
                    const isHeader = this.hasHeader && i === 0 && !this.customHeaders;
                    const isBeforeStartRow = !this.disableRowSelection && i < this.startRow;
                    const isStartRow = !this.disableRowSelection && i === this.startRow;
    
                    const row = document.createElement('tr');
                    row.classList.add('data-row');
    
                    // Only add these classes if row selection is enabled
                    if (!this.disableRowSelection) {
                        if (isBeforeStartRow) {
                            row.classList.add('above-start');
                        }
    
                        if (isStartRow) {
                            row.classList.add('start-row');
                        }
                    }
    
                    // Add row header (row number)
                    const rowHeader = document.createElement('td');
                    rowHeader.classList.add('row-header');
                    rowHeader.textContent = (i + 1).toString();
    
                    // Only add checkmarks and selection functionality if not disabled
                    if (!this.disableRowSelection) {
                        // Add a checkmark to the start row
                        if (isStartRow) {
                            const checkMark = document.createElement('span');
                            checkMark.classList.add('row-number-check');
                            checkMark.innerHTML = '<i class="fas fa-check-circle"></i>';
                            rowHeader.appendChild(checkMark);
                        }
    
                        // Make row headers selectable if not the header row
                        if (!isHeader && this.onSelectStartRow) {
                            rowHeader.classList.add('selectable');
    
                            if (isStartRow) {
                                rowHeader.classList.add('selected');
                            }
    
                            rowHeader.addEventListener('click', () => {
                                this.selectStartRow(i);
                            });
                        }
                    }
    
                    row.appendChild(rowHeader);
    
                    // Add data cells
                    for (let j = 0; j < numCols; j++) {
                        const cell = document.createElement('td');
    
                        // Get cell content safely
                        let cellContent = '';
                        if (Array.isArray(this.data[i]) && j < this.data[i].length) {
                            cellContent = this.data[i][j];
                        }
                        
                        // Ensure cell content is a string
                        if (cellContent === null || cellContent === undefined) {
                            cellContent = '';
                        } else if (typeof cellContent !== 'string') {
                            cellContent = String(cellContent);
                        }
                        
                        cell.textContent = cellContent;
    
                        // Add mapped column class if this column is mapped
                        if (this.columnMappings.some(mapping => mapping.sourceColumn === j)) {
                            cell.classList.add('mapped-column');
                        }
    
                        // Add empty cell class if cell is empty (not in header row)
                        if (!isHeader && (!cellContent || cellContent.trim() === '')) {
                            cell.classList.add('empty-cell');
                        }
    
                        row.appendChild(cell);
                    }
    
                    table.appendChild(row);
                } catch (rowError) {
                    console.error(`Error rendering row ${i}:`, rowError);
                    // Continue to next row instead of failing entire grid
                }
            }
    
            gridContainer.appendChild(table);
            container.appendChild(gridContainer);
    
            // Only add legend if row selection is enabled
            if (!this.disableRowSelection) {
                // Add legend with proper colors
                const legend = document.createElement('div');
                legend.classList.add('ro-grid-legend');
    
                // Mapped columns legend
                if (this.columnMappings.length > 0) {
                    const mappedItem = document.createElement('div');
                    mappedItem.classList.add('legend-item');
    
                    const mappedColor = document.createElement('div');
                    mappedColor.classList.add('legend-color', 'legend-mapped');
                    mappedItem.appendChild(mappedColor);
    
                    const mappedLabel = document.createElement('span');
                    mappedLabel.textContent = 'Mapped columns';
                    mappedItem.appendChild(mappedLabel);
    
                    legend.appendChild(mappedItem);
                }
    
                // Start row legend
                const selectedItem = document.createElement('div');
                selectedItem.classList.add('legend-item');
    
                const selectedColor = document.createElement('div');
                selectedColor.classList.add('legend-color', 'legend-selected');
                selectedItem.appendChild(selectedColor);
    
                const selectedLabel = document.createElement('span');
                selectedLabel.textContent = 'Data start row';
                selectedItem.appendChild(selectedLabel);
    
                legend.appendChild(selectedItem);
    
                // Empty cells legend
                const emptyItem = document.createElement('div');
                emptyItem.classList.add('legend-item');
    
                const emptyColor = document.createElement('div');
                emptyColor.classList.add('legend-color', 'legend-empty');
                emptyItem.appendChild(emptyColor);
    
                const emptyLabel = document.createElement('span');
                emptyLabel.textContent = 'Empty cells';
                emptyItem.appendChild(emptyLabel);
    
                legend.appendChild(emptyItem);
    
                // Grayed out rows legend (rows above start)
                const grayedItem = document.createElement('div');
                grayedItem.classList.add('legend-item');
    
                const grayedColor = document.createElement('div');
                grayedColor.classList.add('legend-color', 'legend-grayed');
                grayedItem.appendChild(grayedColor);
    
                const grayedLabel = document.createElement('span');
                grayedLabel.textContent = 'Rows above start (excluded)';
                grayedItem.appendChild(grayedLabel);
    
                legend.appendChild(grayedItem);
    
                container.appendChild(legend);
            }
    
            // Setup cell tooltips
            this._setupCellTooltips();
        } catch (error) {
            console.error("Fatal error rendering grid:", error);
            if (container) {
                container.innerHTML = `
                    <div class="error-message">
                        <strong>Error rendering preview grid:</strong> ${error.message}<br>
                        You can still proceed with column mapping using the dropdowns below.
                    </div>
                `;
            }
        }
    }

    /**
     * Convert column index to Excel-style column letter (A, B, C, ... Z, AA, AB, etc.)
     * @param {number} index - 0-based column index
     * @returns {string} - Excel-style column reference
     */
    indexToColumnLetter(index) {
        let letter = '';
        index++;

        while (index > 0) {
            const remainder = (index - 1) % 26;
            letter = String.fromCharCode(65 + remainder) + letter;
            index = Math.floor((index - 1) / 26);
        }

        return letter;
    }

    /**
     * Convert Excel-style column letter to zero-based index
     * @param {string} letter - Excel-style column reference (A, B, C, ... Z, AA, AB, etc.)
     * @returns {number} - 0-based column index
     */
    columnLetterToIndex(letter) {
        letter = letter.toUpperCase();
        let index = 0;

        for (let i = 0; i < letter.length; i++) {
            index = index * 26 + (letter.charCodeAt(i) - 64);
        }

        return index - 1;
    }

    /**
     * Select a row as the start row
     * @param {number} rowIndex - 0-based row index
     */
    selectStartRow(rowIndex) {
        if (this.hasHeader && rowIndex === 0) {
            return; // Can't select header row as start row
        }

        this.startRow = rowIndex;

        // Notify callback
        if (this.onSelectStartRow) {
            this.onSelectStartRow(rowIndex);
        }

        // If already rendered, update the UI
        const container = document.querySelector('.ro-grid-container')?.parentElement;
        if (container) {
            this.render(container);
        }
    }

    /**
     * Update the grid data
     * @param {Array} data - New 2D array of data
     * @param {boolean} rerender - Whether to re-render the grid immediately
     */
    updateData(data, rerender = true) {
        this.data = data || [[]];

        if (rerender) {
            const container = document.querySelector('.ro-grid-container')?.parentElement;
            if (container) {
                this.render(container);
            }
        }
    }

    /**
     * Update column mappings
     * @param {Array} mappings - Array of objects with sourceColumn and destinationField
     * @param {boolean} rerender - Whether to re-render the grid immediately
     */
    updateColumnMappings(mappings, rerender = true) {
        this.columnMappings = mappings || [];

        if (rerender) {
            const container = document.querySelector('.ro-grid-container')?.parentElement;
            if (container) {
                this.render(container);
            }
        }
    }

    /**
     * Update the start row
     * @param {number} startRow - New start row index
     * @param {boolean} rerender - Whether to re-render the grid immediately
     */
    updateStartRow(startRow, rerender = true) {
        this.startRow = startRow;

        if (rerender) {
            const container = document.querySelector('.ro-grid-container')?.parentElement;
            if (container) {
                this.render(container);
            }
        }
    }

    /**
     * Get data rows starting from the start row
     * @returns {Array} - 2D array of data starting from the start row
     */
    getDataFromStartRow() {
        if (!this.data || this.data.length <= this.startRow) {
            return [];
        }

        return this.data.slice(this.startRow);
    }

    /**
     * Optimize column widths based on content
     * @private
     */
    _optimizeColumnWidths() {
        if (!this.data || this.data.length === 0) return [];
    
        const colCount = Math.min(this.data[0].length, this.maxVisibleCols);
        const widths = [];
    
        // Analyze content in each column
        for (let col = 0; col < colCount; col++) {
            let hasContent = false;
            let maxContentLength = 0;
            let contentDensity = 0;
            let nonEmptyCount = 0;
    
            // Check content in each row for this column
            for (let row = 0; row < Math.min(this.data.length, this.maxVisibleRows); row++) {
                if (this.data[row] && col < this.data[row].length) {
                    const cellContent = this.data[row][col];
                    if (cellContent !== null && cellContent !== undefined && String(cellContent).trim() !== '') {
                        hasContent = true;
                        nonEmptyCount++;
                        maxContentLength = Math.max(maxContentLength, String(cellContent).length);
                    }
                }
            }
    
            // Calculate content density (% of rows with content)
            contentDensity = nonEmptyCount / Math.min(this.data.length, this.maxVisibleRows);
    
            // Assign width percentage based on content
            if (!hasContent) {
                widths.push(2); // Minimum width for empty columns (%) - made even tighter
            } else if (contentDensity < 0.2) {
                // Sparse columns get narrower width
                widths.push(3);
            } else if (maxContentLength < 5) {
                widths.push(5); // Narrow width for short content
            } else if (maxContentLength < 15) {
                widths.push(10); // Medium width
            } else if (maxContentLength < 30) {
                widths.push(15); // Wide width
            } else {
                widths.push(20); // Very wide for long content
            }
        }
    
        // Normalize widths to ensure they sum to 100%
        const totalWidth = widths.reduce((sum, width) => sum + width, 0);
        return widths.map(width => (width / totalWidth) * 100);
    }

    /**
     * Add cell tooltip for non-empty cells
     * @private
     */
    _setupCellTooltips() {
        if (!this.gridContainer || this.disableCellTooltips) return;

        // Create tooltip element
        const tooltip = document.createElement('div');
        tooltip.className = 'cell-tooltip';
        tooltip.style.display = 'none';
        this.gridContainer.appendChild(tooltip);

        // Add click event listeners to all cells
        const tableCells = this.gridContainer.querySelectorAll('td:not(.row-header)');
        tableCells.forEach(cell => {
            const content = cell.textContent;
            if (content && content.trim() !== '') {
                cell.style.cursor = 'pointer';

                cell.addEventListener('click', (e) => {
                    const cellRect = cell.getBoundingClientRect();
                    tooltip.textContent = content;
                    tooltip.style.display = 'block';

                    // Position tooltip near the cell
                    const tooltipX = e.clientX + 10;
                    const tooltipY = e.clientY + 10;

                    tooltip.style.left = `${tooltipX - this.gridContainer.getBoundingClientRect().left}px`;
                    tooltip.style.top = `${tooltipY - this.gridContainer.getBoundingClientRect().top}px`;

                    // Hide tooltip when clicking elsewhere
                    const hideTooltip = () => {
                        tooltip.style.display = 'none';
                        document.removeEventListener('click', hideTooltip);
                    };

                    setTimeout(() => {
                        document.addEventListener('click', hideTooltip);
                    }, 10);
                });
            }
        });
    }
}

export default ReadOnlySheetGrid;
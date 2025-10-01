// ui/components/docitemimport/step-map-columns.js

import ImportConfig from '../../../config/import-config.js';
import ModalTabs from '../shared/modal-tabs.js';
import ReadOnlySheetGrid from '../shared/read-only-sheet-grid.js';

/**
 * Second step of the import wizard - column mapping
 * Allows users to select worksheets to import and map columns to destination fields
 */
export class StepMapColumns {
    /**
     * Create a new column mapping step
     * @param {Object} options - Configuration options
     * @param {Object} options.fileData - File data from previous step
     * @param {Object} options.metadata - File metadata (worksheets, preview)
     * @param {Function} options.onNext - Callback when step is completed
     * @param {Function} options.onError - Callback to display errors
     */
    constructor(options = {}) {
        this.parentModal = options.parentModal || 'default';
        console.log(`StepMapColumns initialized with parentModal: ${this.parentModal}`);
    
        this.fileData = options.fileData || {};
        this.metadata = options.metadata || { worksheets: [], preview: {} };
        this.onNext = options.onNext || (() => { });
        this.onError = options.onError || console.error;

        // Determine which required mappings to use
        this.requiredMappings = this.parentModal === 'corpus' 
            ? ImportConfig.corpusRequiredMappings 
            : ImportConfig.requiredMappings;

        // Initialize tab data
        this.worksheetTabs = [];
        this.currentTabId = null;

        // Add validation guard flags
        this._isValidating = false;
        this._isUpdatingNextButton = false;

        // Initialize mapping data
        this.worksheetConfigs = {};

        // UI components
        this.domContainer = null;
        this.tabsContainer = null;
        this.gridContainer = null;
        this.mappingContainer = null;
        this.tabs = null;
        this.grid = null;

        // Process metadata to build tabs
        this._processMetadata();
    }

    updateMetadata(metadata) {
        if (!metadata) return;

        console.log('StepMapColumns: updateMetadata called with:', metadata);

        console.log('🟢 StepMapColumns.updateMetadata(): worksheets=',
            metadata.worksheets?.length || 0,
            ' previewKeys=', Object.keys(metadata.preview || {}).length);

        // dump a concise view of worksheets & first preview row
        if (metadata?.worksheets) {
            console.table(metadata.worksheets.map(w => ({
                sheet: w.name,
                rows: w.row_count,
                cols: w.col_count
            })));
        }
        if (metadata?.preview) {
            const firstSheet = Object.keys(metadata.preview)[0];
            console.log('[StepMapColumns] Preview first sheet:', firstSheet,
                metadata.preview[firstSheet]?.slice(0, 3));   // first 3 rows
        }

        // Update metadata
        this.metadata = metadata;

        // Re-process metadata
        this._processMetadata();

        // Re-render if already rendered
        if (this.domContainer) {
            console.log('StepMapColumns: Re-rendering with updated metadata');
            this.render(this.domContainer);
        }
    }

    /**
     * Process file metadata to build tabs and initial configs
     */
    _processMetadata() {
        if (!this.metadata || !this.metadata.worksheets || !this.metadata.preview) {
            this.worksheetTabs = [];
            return;
        }

        console.log('Processing metadata:', this.metadata);

        // Build tab objects
        this.worksheetTabs = this.metadata.worksheets.map(sheetName => {
            // Trim sheet name to handle trailing spaces
            const trimmedName = sheetName.trim();

            // Determine if a tab should be excluded by default
            const shouldExclude = ImportConfig.excludeWorksheetPatterns.some(pattern =>
                trimmedName.toLowerCase().includes(pattern.toLowerCase())
            );

            return {
                id: sheetName, // Keep original ID for lookups
                name: trimmedName, // Trimmed name for display
                excluded: shouldExclude
            };
        });

        // Create initial config for each worksheet
        this.metadata.worksheets.forEach(sheetName => {
            // Get preview data
            const previewData = this.metadata.preview[sheetName] || [];

            console.log(`Processing worksheet "${sheetName}":`, previewData);

            // Detect header row using the intelligent algorithm
            let headerRow = this._detectHeaderRow(previewData);

            // Data start row is header row + 1 by default
            let startRow = headerRow + 1;

            // Ensure there's at least one non-empty row in the data
            const hasData = previewData.some(row =>
                row && row.some(cell => cell !== null && cell !== undefined && cell.toString().trim() !== '')
            );

            if (!hasData) {
                console.log(`Worksheet "${sheetName}" appears to be empty`);
            }

            // Try to auto-detect column mappings
            const mappings = this._autoDetectMappings(previewData);

            // Store config
            this.worksheetConfigs[sheetName] = {
                headerRow,
                startRow,
                mappings,
                // Keep reference to preview data
                previewData
            };

            console.log(`Worksheet "${sheetName}" mappings:`, mappings);
        });

        // Set first non-excluded tab as current
        const firstVisibleTab = this.worksheetTabs.find(tab => !tab.excluded);
        if (firstVisibleTab) {
            this.currentTabId = firstVisibleTab.id;
        } else if (this.worksheetTabs.length > 0) {
            this.currentTabId = this.worksheetTabs[0].id;
        }

        console.log(`Selected active tab: ${this.currentTabId}`);
    }


    /**
     * Detect the most likely header row in the data
     * @param {Array} previewData - 2D array of data (rows/columns)
     * @returns {number} - The most likely header row index (0-based)
     */
    _detectHeaderRow(previewData) {
        if (!previewData || previewData.length < 2) {
            return 0; // Default to first row if not enough data
        }

        // Maximum rows to check - all rows if fewer than 10
        const maxRowsToCheck = Math.min(previewData.length, 10);
        const rowScores = [];

        // Common header terms to look for
        const headerTerms = [
            'reference', 'heading', 'sub', 'clause', 'page', 'no', 'question', 'description',
            'category', 'date', 'status', 'response', 'owner', 'username', 'assigned', 'id',
            'title', 'name', 'type', 'section', 'priority'
        ];

        // Check each row
        for (let rowIndex = 0; rowIndex < maxRowsToCheck; rowIndex++) {
            const row = previewData[rowIndex] || [];
            let score = 0;
            const maxScore = 10;

            // Factor 1: Distance from top (closer to top is better)
            // Start with 3 points for row 0, decrease by 0.3 for each row down
            const distancePoints = Math.max(0, 3 - (rowIndex * 0.3));
            score += distancePoints;

            // Factor 2: Data completeness - penalize empty cells
            const cellCount = row.length;
            const nonEmptyCells = row.filter(cell =>
                cell !== null && cell !== undefined && String(cell).trim() !== ''
            ).length;

            // If row is mostly populated, add points
            if (cellCount > 0) {
                const completenessRatio = nonEmptyCells / cellCount;
                score += completenessRatio * 2; // Up to 2 points
            }

            // Factor 3: Check for header-like text content
            let headerTermMatches = 0;
            let longTextCount = 0;
            let wordCountInRange = 0;

            for (let cellIndex = 0; cellIndex < row.length; cellIndex++) {
                const cellValue = row[cellIndex];
                if (cellValue === null || cellValue === undefined) continue;

                const cellText = String(cellValue).trim().toLowerCase();

                // Check if cell contains any header terms
                if (headerTerms.some(term => cellText.includes(term))) {
                    headerTermMatches++;
                }

                // Check text length (headers are usually not very long)
                if (cellText.length > 50) {
                    longTextCount++; // Penalize long text
                }

                // Check word count (headers typically have 1-8 words)
                const wordCount = cellText.split(/\s+/).filter(Boolean).length;
                if (wordCount >= 1 && wordCount <= 8) {
                    wordCountInRange++;
                }
            }

            // Add points for header term matches
            if (cellCount > 0) {
                score += (headerTermMatches / cellCount) * 3; // Up to 3 points

                // Subtract points for long text (likely not headers)
                score -= (longTextCount / cellCount) * 2;

                // Add points for appropriate word counts
                score += (wordCountInRange / cellCount) * 2; // Up to 2 points
            }

            // Bonus points if row looks different from rows immediately after it
            // (Headers often have a different structure than data rows)
            if (rowIndex < previewData.length - 1) {
                const nextRow = previewData[rowIndex + 1] || [];
                let differenceCount = 0;

                // Compare cell types and patterns with next row
                for (let i = 0; i < Math.min(row.length, nextRow.length); i++) {
                    const currentCell = row[i];
                    const nextCell = nextRow[i];

                    // Check for type differences (e.g., string header vs. numeric data)
                    if (typeof currentCell !== typeof nextCell) {
                        differenceCount++;
                        continue;
                    }

                    // Check for formatting differences
                    const currentStr = String(currentCell || '');
                    const nextStr = String(nextCell || '');

                    // If current is all-caps or title case but next isn't, good sign of header
                    if (currentStr.toUpperCase() === currentStr && nextStr.toUpperCase() !== nextStr) {
                        differenceCount++;
                    }
                    // If current is short but next is long, likely header
                    if (currentStr.length < 20 && nextStr.length > 30) {
                        differenceCount++;
                    }
                }

                // Add points based on differences
                if (row.length > 0) {
                    score += (differenceCount / row.length) * 2; // Up to 2 points
                }
            }

            // Cap score at max score
            score = Math.min(score, maxScore);

            // Store score for this row
            rowScores.push({
                rowIndex,
                score
            });
        }

        // Sort rows by score (descending)
        rowScores.sort((a, b) => b.score - a.score);

        // Return the row index with highest score
        return rowScores.length > 0 ? rowScores[0].rowIndex : 0;
    }

    /**
     * Analyze a column for ID characteristics and return a score (0-1)
     * @param {Array} columnData - Array of values from the column
     * @param {number} columnIndex - Zero-based index of the column
     * @param {Array} headers - Array of header values if available
     * @param {number} headerRowIndex - Index of the detected header row
     * @returns {number} - Score from 0-1 indicating likelihood of being an ID column
     */
    _detectIdColumn(columnData, columnIndex, headers, headerRowIndex) {
        if (!columnData || columnData.length === 0) {
            return 0;
        }

        let points = 0;
        const maxScore = 10;  // Total possible points

        // Column index weight (left columns more likely to be IDs)
        // Use a scaled value based on inverse of column index
        const columnScale = Math.max(0, 3 - (columnIndex * 0.5));
        points += columnScale;

        // Check header name for ID-related terms
        const headerValue = headers ? String(headers).toLowerCase().trim() : '';

        if (headerValue) {
            // Positive header indicators
            if (/\bid\b|\bcode\b|\bref\b|\breference\b|\bnumber\b|\bno\.?\b/i.test(headerValue)) {
                points += 3;  // Strong indicator in header
            }

            // Specific check for # character in header (strong ID indicator)
            if (headerValue.includes('#')) {
                points += 2;
            }

            // Negative header indicators
            if (/\bamount\b|\bcost\b|\bprice\b|\bvalue\b|\btotal\b/i.test(headerValue)) {
                points -= 2;  // Negative indicator (financial data, not IDs)
            }

            // Check for currency symbols (negative indicator)
            if (/[$€£¥₹]/.test(headerValue)) {
                points -= 2;
            }
        }

        // Determine data rows (skip header row if known)
        const dataStartIndex = headerRowIndex !== undefined ? headerRowIndex + 1 : 1;

        // Sample all available data rows up to 15
        const maxSampleSize = 15;
        const dataToSample = columnData.slice(dataStartIndex, Math.min(columnData.length, dataStartIndex + maxSampleSize));

        // Check data characteristics
        let integerCount = 0;
        let alphanumericCount = 0;
        let shortValueCount = 0;
        let hasPattern = true;  // Track if values follow a consistent pattern
        let previousNumericPart = null;
        let currencySymbolCount = 0;

        for (const value of dataToSample) {
            if (value === null || value === undefined || value === '') {
                continue;  // Skip empty values
            }

            const strValue = String(value).trim();

            // Check for integers or numeric patterns
            if (/^\d+$/.test(strValue)) {
                integerCount++;
            }

            // Check for alphanumeric format typical of IDs
            if (/^[A-Za-z0-9\-_\.]+$/.test(strValue)) {
                alphanumericCount++;
            }

            // Check for short values (IDs tend to be shorter)
            if (strValue.length < 20) {
                shortValueCount++;
            }

            // Look for sequential patterns (e.g., ID-001, ID-002)
            if (/^[A-Za-z\-_\.]*(\d+)$/.test(strValue)) {
                const matches = strValue.match(/^[A-Za-z\-_\.]*(\d+)$/);
                const currentNumeric = parseInt(matches[1], 10);

                if (previousNumericPart !== null && currentNumeric !== previousNumericPart + 1) {
                    hasPattern = false;
                }
                previousNumericPart = currentNumeric;
            }

            // Check for currency symbols (negative indicator)
            if (/[$€£¥₹]/.test(strValue)) {
                currencySymbolCount++;
            }
        }

        // Calculate points based on data characteristics
        const nonEmptyCount = dataToSample.filter(v => v !== null && v !== undefined && v !== '').length;
        if (nonEmptyCount > 0) {
            // If majority of values are integers -> strong ID indicator
            if (integerCount / nonEmptyCount > 0.7) {
                points += 3;
            }

            // If majority of values are alphanumeric -> moderate ID indicator
            if (alphanumericCount / nonEmptyCount > 0.8) {
                points += 2;
            }

            // If majority of values are short -> moderate ID indicator
            if (shortValueCount / nonEmptyCount > 0.8) {
                points += 1;
            }

            // If values follow a pattern -> strong ID indicator
            if (hasPattern && previousNumericPart !== null) {
                points += 2;
            }

            // Penalize for currency symbols
            if (currencySymbolCount / nonEmptyCount > 0.3) {
                points -= 3;
            }
        }

        // Ensure points don't go below zero
        points = Math.max(0, points);

        // Return normalized score (0-1)
        return Math.min(points / maxScore, 1);
    }

    /**
     * Analyze a column for Question characteristics and return a score (0-1)
     * @param {Array} columnData - Array of values from the column
     * @param {number} columnIndex - Zero-based index of the column
     * @param {number} idColumnIndex - Zero-based index of the identified ID column (or -1)
     * @param {Array} headers - Array of header values if available
     * @param {number} headerRowIndex - Index of the detected header row
     * @returns {number} - Score from 0-1 indicating likelihood of being a Question column
     */
    _detectQuestionColumn(columnData, columnIndex, idColumnIndex, headers, headerRowIndex) {
        if (!columnData || columnData.length === 0) {
            return 0;
        }

        let points = 0;
        const maxScore = 10;  // Total possible points

        // Check header name for question-related terms
        const headerValue = headers ? String(headers).toLowerCase().trim() : '';

        if (headerValue) {
            // Check for question-related terms in header
            if (/\bquestion\b|\brequirement\b|\bquery\b|\bask\b|\btext\b/i.test(headerValue)) {
                points += 3;  // Strong indicator in header
            }

            // Add additional check for 'description' as suggested
            if (/\bdescription\b/i.test(headerValue)) {
                points += 2;  // Positive factor for 'description'
            }
        }

        // Proximity to ID column if identified (next column is common pattern)
        if (idColumnIndex >= 0) {
            // More points for being right after ID column, fewer points if further away
            const distance = Math.abs(columnIndex - idColumnIndex);
            if (distance === 1) {
                points += 2;
            } else if (distance === 2) {
                points += 1;
            }
        }

        // Determine data rows (skip header row if known)
        const dataStartIndex = headerRowIndex !== undefined ? headerRowIndex + 1 : 1;

        // Sample all available data rows up to 15
        const maxSampleSize = 15;
        const dataToSample = columnData.slice(dataStartIndex, Math.min(columnData.length, dataStartIndex + maxSampleSize));

        // Check data characteristics
        let questionMarkCount = 0;
        let longTextCount = 0;
        let uniqueValueCount = 0;
        let sentenceCount = 0;  // Count cells that look like sentences
        const uniqueValues = new Set();

        for (const value of dataToSample) {
            if (value === null || value === undefined || value === '') {
                continue;  // Skip empty values
            }

            const strValue = String(value).trim();

            // Check for question marks (strong indicator)
            if (strValue.includes('?')) {
                questionMarkCount++;
            }

            // Check for longer text (questions tend to be longer)
            if (strValue.length > 30) {
                longTextCount++;
            }

            // Check for sentence-like structure
            if (/[A-Z][^.!?]*[.!?]/.test(strValue)) {
                sentenceCount++;
            }

            // Track unique values (questions are typically unique)
            uniqueValues.add(strValue);
        }

        // Add uniqueness as a factor
        uniqueValueCount = uniqueValues.size;

        // Calculate points based on data characteristics
        const nonEmptyCount = dataToSample.filter(v => v !== null && v !== undefined && v !== '').length;
        if (nonEmptyCount > 0) {
            // If some values have question marks -> very strong indicator
            if (questionMarkCount > 0) {
                points += Math.min(3, questionMarkCount / nonEmptyCount * 4);
            }

            // If majority of values are long text -> strong indicator
            if (longTextCount / nonEmptyCount > 0.5) {
                points += 2;
            }

            // If values are mostly unique -> moderate indicator (questions should be unique)
            if (uniqueValueCount / nonEmptyCount > 0.8) {
                points += 1.5;
            }

            // If values are sentence-like -> moderate indicator
            if (sentenceCount / nonEmptyCount > 0.5) {
                points += 1.5;
            }
        }

        // Ensure points don't go below zero
        points = Math.max(0, points);

        // Return normalized score (0-1)
        return Math.min(points / maxScore, 1);
    }

    /**
     * Analyze a column for Answer characteristics and return a score (0-1)
     * @param {Array} columnData - Array of values from the column
     * @param {number} columnIndex - Zero-based index of the column
     * @param {number} idColumnIndex - Zero-based index of the identified ID column
     * @param {number} questionColumnIndex - Zero-based index of the identified Question column
     * @param {Array} headers - Array of header values if available
     * @param {number} headerRowIndex - Index of the detected header row
     * @returns {number} - Score from 0-1 indicating likelihood of being an Answer column
     */
    _detectAnswerColumn(columnData, columnIndex, idColumnIndex, questionColumnIndex, headers, headerRowIndex) {
        if (!columnData || columnData.length === 0) {
            return 0;
        }
    
        let points = 0;
        const maxScore = 10;  // Total possible points
    
        // Check header name for answer-related terms
        const headerValue = headers ? String(headers).toLowerCase().trim() : '';
    
        if (headerValue) {
            // positive indicators – strong (3‑pt) and moderate (2‑pt)
            const strongPosRe = /\b(answer|response|reply|feedback)\b/i;
            const moderatePosRe = /\b(details|explanation|capability|comment|describe|solution)\b/i;
        
            // negative indicators
            const negativeRe = /\b(question|requirement|query|ask)\b/i;
        
            if (strongPosRe.test(headerValue)) {
              points += 3;
            }
            if (moderatePosRe.test(headerValue)) {
              points += 2; // worth 2 pts now
            }
        
            // penalise ONLY if a negative term exists AND *no* positive term exists
            if (
              !strongPosRe.test(headerValue) &&
              !moderatePosRe.test(headerValue) &&
              negativeRe.test(headerValue)
            ) {
              points -= 2;
            }
        }
    
        // Add more points for column immediately after Question column
        if (questionColumnIndex >= 0) {
            const distance = Math.abs(columnIndex - questionColumnIndex);
            if (distance === 1) {
                points += 3; // Increase from 2 to 3 points - answers often follow questions
            } else if (distance === 2) {
                points += 1.5; // Slightly more than before
            }
        }

        // Determine data rows (skip header row if known)
        const dataStartIndex = headerRowIndex !== undefined ? headerRowIndex + 1 : 1;

        // Sample all available data rows up to 15
        const maxSampleSize = 15;
        const dataToSample = columnData.slice(dataStartIndex, Math.min(columnData.length, dataStartIndex + maxSampleSize));

        // Check data characteristics
        let longTextCount = 0;
        let uniqueValueCount = 0;
        let sentenceCount = 0;  // Count cells that look like sentences
        const uniqueValues = new Set();

        for (const value of dataToSample) {
            if (value === null || value === undefined || value === '') {
                continue;  // Skip empty values
            }

            const strValue = String(value).trim();

            // Check for longer text (answers tend to be longer than questions)
            if (strValue.length > 50) {
                longTextCount++;
            }

            // Check for sentence-like structure
            if (/[A-Z][^.!?]*[.!?]/.test(strValue)) {
                sentenceCount++;
            }

            // Track unique values (answers are typically unique)
            uniqueValues.add(strValue);
        }

        // Add uniqueness as a factor
        uniqueValueCount = uniqueValues.size;

        // Calculate points based on data characteristics
        const nonEmptyCount = dataToSample.filter(v => v !== null && v !== undefined && v !== '').length;
        if (nonEmptyCount > 0) {
            // If majority of values are long text -> strong indicator
            if (longTextCount / nonEmptyCount > 0.5) {
                points += 3;
            }

            // If values are mostly unique -> moderate indicator
            if (uniqueValueCount / nonEmptyCount > 0.8) {
                points += 1.5;
            }

            // If values are sentence-like -> moderate indicator
            if (sentenceCount / nonEmptyCount > 0.5) {
                points += 1.5;
            }
        }

        // Ensure points don't go below zero
        points = Math.max(0, points);

        // Lower the final threshold by returning a slightly higher normalized score
        const score = Math.min(points / maxScore, 1);
        console.log(`Column ${this._indexToColumnLetter(columnIndex)} answer score: ${(score * 100).toFixed(1)}% (${points}/${maxScore} points)`);
        return score;
    }

    /**
     * This uses intelligent column detection algorithms
     */
    _autoDetectMappings(previewData) {
        if (!previewData || previewData.length === 0) {
            return [];
        }
    
        // First detect the header row
        const headerRowIndex = this._detectHeaderRow(previewData);
        console.log(`Detected header row at index ${headerRowIndex}`);
    
        // Extract headers from detected header row
        const headers = previewData[headerRowIndex] || [];
        const mappings = [];
        const columnCount = headers.length;
    
        // Extract columns for analysis
        const columns = [];
        for (let colIndex = 0; colIndex < columnCount; colIndex++) {
            const column = previewData.map(row => row[colIndex]);
            columns.push(column);
        }
    
        // First, detect ID column
        const idScores = columns.map((col, idx) => ({
            index: idx,
            score: this._detectIdColumn(col, idx, headers[idx], headerRowIndex),
            originalIndex: idx
        }));
    
        // Sort by score and use column index as tiebreaker
        idScores.sort((a, b) => {
            if (Math.abs(b.score - a.score) < 0.0001) {
                return a.originalIndex - b.originalIndex;
            }
            return b.score - a.score;
        });
    
        console.log("ID Column Scores:", idScores.map(item =>
            `Column ${this._indexToColumnLetter(item.index)}: ${(item.score * 100).toFixed(1)}%`
        ).join(", "));
    
        const bestIdColumn = idScores[0].score > 0.3 ? idScores[0].index : -1;
    
        if (bestIdColumn >= 0) {
            // Add the ID column mapping
            mappings.push({
                sourceColumn: bestIdColumn,
                destinationField: 'question_id'
            });
        }
    
        // Next, detect Question column
        const questionScores = columns.map((col, idx) => ({
            index: idx,
            score: this._detectQuestionColumn(col, idx, bestIdColumn, headers[idx], headerRowIndex),
            originalIndex: idx
        }));
    
        // Sort by score and use column index as tiebreaker
        questionScores.sort((a, b) => {
            if (Math.abs(b.score - a.score) < 0.0001) {
                return a.originalIndex - b.originalIndex;
            }
            return b.score - a.score;
        });
    
        console.log("Question Column Scores:", questionScores.map(item =>
            `Column ${this._indexToColumnLetter(item.index)}: ${(item.score * 100).toFixed(1)}%`
        ).join(", "));
    
        const bestQuestionColumn = questionScores[0].score > 0.3 ? questionScores[0].index : -1;
    
        if (bestQuestionColumn >= 0 && bestQuestionColumn !== bestIdColumn) {
            // Add the Question column mapping
            mappings.push({
                sourceColumn: bestQuestionColumn,
                destinationField: 'question_text'
            });
        }
    
        // For corpus imports, also detect Answer column
        if (this.parentModal === 'corpus') {
            const answerScores = columns.map((col, idx) => ({
                index: idx,
                score: this._detectAnswerColumn(col, idx, bestIdColumn, bestQuestionColumn, headers[idx], headerRowIndex),
                originalIndex: idx
            }));
    
            // Sort by score and use column index as tiebreaker
            answerScores.sort((a, b) => {
                if (Math.abs(b.score - a.score) < 0.0001) {
                    return a.originalIndex - b.originalIndex;
                }
                return b.score - a.score;
            });
    
            console.log("Answer Column Scores:", answerScores.map(item =>
                `Column ${this._indexToColumnLetter(item.index)}: ${(item.score * 100).toFixed(1)}%`
            ).join(", "));
    
            const bestAnswerColumn = answerScores[0].score > 0.2 ? answerScores[0].index : -1;

            if (bestAnswerColumn >= 0 && 
                bestAnswerColumn !== bestIdColumn && 
                bestAnswerColumn !== bestQuestionColumn) {
                // Add the Answer column mapping
                mappings.push({
                    sourceColumn: bestAnswerColumn,
                    destinationField: 'answer_text'
                });
            }
        }

        // Try to detect other columns (guidance, notes, etc.)
        // Map headers to destination fields with regex patterns
        const fieldPatterns = {
            'guidance': /\bguidance\b|\binstructions?\b|\bhelp\b|\bhint\b/i,
            'notes': /\bnotes?\b|\bcomments?\b|\badditional\b/i,
            'question_prefix': /\bcategory\b|\btopic\b|\bdomain\b/i,
        };

        // Check each header for matches with destination fields
        headers.forEach((header, colIndex) => {
            // Skip if this column is already mapped
            if (mappings.some(m => m.sourceColumn === colIndex)) {
                return;
            }

            if (!header) return;
            const headerText = String(header).toLowerCase().trim();

            // Check each field pattern
            for (const [field, pattern] of Object.entries(fieldPatterns)) {
                if (pattern.test(headerText)) {
                    mappings.push({
                        sourceColumn: colIndex,
                        destinationField: field
                    });
                    break;  // Stop after first match for this column
                }
            }
        });

        this._notifyWizard();

        return mappings;
    }

    /**
     * Render the step
     * @param {HTMLElement} container - The container element
     */
    render(container) {
        this.domContainer = container;
        container.innerHTML = '';

        // Create step content
        const stepContent = document.createElement('div');
        stepContent.className = 'import-step import-step-map-columns';

        // Add step title and description
        const titleEl = document.createElement('h3');
        titleEl.textContent = 'Configure';
        stepContent.appendChild(titleEl);

        const descriptionEl = document.createElement('p');
        descriptionEl.textContent = 'Select which sheets to import and map columns to the appropriate fields. Each sheet will appear as a separate group in the question list.';
        stepContent.appendChild(descriptionEl);

        // Create worksheet tabs section
        this.tabsContainer = document.createElement('div');
        this.tabsContainer.className = 'worksheet-tabs-container';
        stepContent.appendChild(this.tabsContainer);

        // Create configuration area with include/exclude toggle
        const configContainer = document.createElement('div');
        configContainer.className = 'sheet-config-container';

        // Create include/exclude toggle
        const toggleContainer = document.createElement('div');
        toggleContainer.className = 'include-exclude-toggle';

        const toggleLabel = document.createElement('label');
        toggleLabel.textContent = 'Include this worksheet:';
        toggleContainer.appendChild(toggleLabel);

        const toggleButtonGroup = document.createElement('div');
        toggleButtonGroup.className = 'toggle-button-group';
        toggleButtonGroup.innerHTML = `
            <button class="toggle-button exclude-button" data-action="exclude">Exclude</button>
            <button class="toggle-button include-button active" data-action="include">Include</button>
        `;
        toggleContainer.appendChild(toggleButtonGroup);

        // Add event listeners to toggle buttons
        toggleButtonGroup.querySelectorAll('.toggle-button').forEach(button => {
            button.addEventListener('click', () => {
                const action = button.getAttribute('data-action');
                this._toggleCurrentWorksheet(action === 'include');

                // Update active button
                toggleButtonGroup.querySelectorAll('.toggle-button').forEach(btn => {
                    btn.classList.remove('active');
                });
                button.classList.add('active');
            });
        });

        configContainer.appendChild(toggleContainer);

        // Create data preview section
        const previewSection = document.createElement('div');
        previewSection.className = 'preview-section';

        const previewHeader = document.createElement('h4');
        previewHeader.textContent = 'Data Preview';
        previewSection.appendChild(previewHeader);

        const startRowLabel = document.createElement('div');
        startRowLabel.className = 'start-row-label';
        startRowLabel.textContent = 'Click a row number to set the data start row:';
        previewSection.appendChild(startRowLabel);

        this.gridContainer = document.createElement('div');
        this.gridContainer.className = 'import-grid-container';
        previewSection.appendChild(this.gridContainer);

        configContainer.appendChild(previewSection);

        // Create column mapping section
        const mappingSection = document.createElement('div');
        mappingSection.className = 'mapping-section';

        const mappingHeader = document.createElement('h4');
        mappingHeader.textContent = 'Column Mapping';
        mappingSection.appendChild(mappingHeader);

        const mappingInstructions = document.createElement('p');
        mappingInstructions.className = 'mapping-instructions';
        mappingInstructions.innerHTML = `
            Select which source column corresponds to each destination field. 
            <span class="required-field-note">* Required fields</span>
        `;
        mappingSection.appendChild(mappingInstructions);

        this.mappingContainer = document.createElement('div');
        this.mappingContainer.className = 'mapping-container';
        mappingSection.appendChild(this.mappingContainer);

        configContainer.appendChild(mappingSection);
        stepContent.appendChild(configContainer);

        container.appendChild(stepContent);

        // Initialize tabs
        this._initializeTabs();

        // Initialize with the current tab
        if (this.currentTabId) {
            this._loadWorksheetTab(this.currentTabId);
        }

        // Perform initial validation after everything is rendered
        setTimeout(() => {
            if (this.currentTabId) {
                // Validate initial mappings without recursive notification
                this._validateInitialState();
            }
        }, 0);
    }

    /**
     * Validate initial state and notify wizard without recursion
     * This is called once after rendering to set initial button state
     */
    _validateInitialState() {
        // Skip if already validating
        if (this._isValidating) return;
    
        this._isValidating = true;
    
        try {
            // Check if any worksheets have required mappings
            let isValid = false;
    
            // Validate each tab that's not excluded
            this.worksheetTabs.forEach(tab => {
                if (!tab.excluded) {
                    const config = this.worksheetConfigs[tab.id] || {};
                    const mappings = config.mappings || [];
    
                    // Check if all required fields are mapped
                    const allRequiredFieldsMapped = this.requiredMappings.every(field =>
                        mappings.some(m => m.destinationField === field)
                    );
    
                    if (allRequiredFieldsMapped) {
                        isValid = true;
                    }
                }
            });
    
            // Log validation result
            console.log(`Initial validation result: ${isValid ? 'valid' : 'invalid'}, requiredMappings:`, this.requiredMappings);
    
            // Force update the button state with the validated result
            if (window.currentImportWizard &&
                typeof window.currentImportWizard._updateNextButtonState === 'function') {
                window.currentImportWizard._updateNextButtonState();
            }
        } finally {
            this._isValidating = false;
        }
    }

    /**
     * Initialize the tab component
     */
    _initializeTabs() {
        if (!this.tabsContainer || this.worksheetTabs.length === 0) return;

        // Setup tabs
        this.tabs = new ModalTabs({
            tabs: this.worksheetTabs,
            currentTabId: this.currentTabId,
            onTabSelected: (tabId) => {
                this.currentTabId = tabId;
                this._loadWorksheetTab(tabId);
            }
        });

        this.tabs.render(this.tabsContainer);
    }

    /**
     * Load worksheet tab content
     * @param {string} worksheetId - The worksheet ID
     */
    _loadWorksheetTab(worksheetId) {
        if (!this.gridContainer || !this.mappingContainer) return;

        console.log(`🟢 _loadWorksheetTab(${worksheetId}) – preview rows =`,
            (this.worksheetConfigs[worksheetId]?.previewData || []).length);

        // Clear containers to force complete re-render
        this.gridContainer.innerHTML = '';
        this.mappingContainer.innerHTML = '';

        const config = this.worksheetConfigs[worksheetId] || {};
        const isExcluded = this.worksheetTabs.find(tab => tab.id === worksheetId)?.excluded;

        // Update include/exclude toggle
        const toggleButtons = this.domContainer.querySelectorAll('.toggle-button');
        toggleButtons.forEach(button => {
            button.classList.remove('active');
        });

        const activeButton = isExcluded ?
            this.domContainer.querySelector('.exclude-button') :
            this.domContainer.querySelector('.include-button');

        if (activeButton) {
            activeButton.classList.add('active');
        }

        // Update sheet config UI - IMPORTANT: Only apply content-excluded to the content areas
        const configContainer = this.domContainer.querySelector('.sheet-config-container');
        if (configContainer) {
            // Always remove 'excluded' class from the container itself to keep toggle controls enabled
            configContainer.classList.remove('excluded');

            // Add content-excluded class to content areas if the tab is excluded
            const contentAreas = configContainer.querySelectorAll('.preview-section, .mapping-section');
            contentAreas.forEach(area => {
                if (isExcluded) {
                    area.classList.add('content-excluded');
                } else {
                    area.classList.remove('content-excluded');
                }
            });
        }

        // Force recreate grid instead of updating existing one
        this.grid = null;

        // Initialize grid with fresh instance
        this._renderGrid(worksheetId);

        // Initialize column mappings
        this._renderMappings(worksheetId);

        this._notifyWizard();
    }

    /**
     * Render the data preview grid
     * @param {string} worksheetId - The worksheet ID
     */
    _renderGrid(worksheetId) {
        if (!this.gridContainer) {
            console.error("Grid container is missing");
            return;
        }

        try {
            const config = this.worksheetConfigs[worksheetId] || {};
            const previewData = config.previewData || [];

            console.log(`Rendering grid for worksheet "${worksheetId}":`,
                previewData.length > 0 ? `${previewData.length} rows` : "empty data");

            // Handle empty data
            if (!previewData.length) {
                this.gridContainer.innerHTML = '<div class="no-data-message">No data available for this worksheet.</div>';
                return;
            }

            // Ensure we have at least some data to display
            let hasCells = false;
            let nonEmptyRowCount = 0;

            for (const row of previewData) {
                if (row && row.some(cell => cell !== null && cell !== undefined && String(cell).trim() !== '')) {
                    hasCells = true;
                    nonEmptyRowCount++;
                }
            }

            console.log(`Grid data analysis: hasCells=${hasCells}, nonEmptyRowCount=${nonEmptyRowCount}`);

            if (!hasCells) {
                this.gridContainer.innerHTML = '<div class="no-data-message">This worksheet appears to be empty.</div>';
                return;
            }

            // Create column mapping objects for the grid
            const gridMappings = (config.mappings || []).map(mapping => ({
                sourceColumn: mapping.sourceColumn,
                destinationField: mapping.destinationField
            }));

            // Initialize or update grid with safe data
            const safeData = this._sanitizeDataForGrid(previewData);

            if (!this.grid) {
                console.log(`Creating new grid with startRow=${config.startRow}`);
                this.grid = new ReadOnlySheetGrid({
                    data: safeData,
                    hasHeader: true,
                    startRow: config.startRow,
                    maxVisibleRows: ImportConfig.previewRows,
                    maxVisibleCols: ImportConfig.previewCols,
                    columnMappings: gridMappings,
                    onSelectStartRow: (rowIndex) => {
                        this._updateStartRow(worksheetId, rowIndex);
                    }
                });

                this.grid.render(this.gridContainer);
            } else {
                console.log(`Updating existing grid to startRow=${config.startRow}`);
                this.grid.updateData(safeData, false);
                this.grid.updateStartRow(config.startRow, false);
                this.grid.updateColumnMappings(gridMappings, true);
            }
        } catch (error) {
            console.error("Error rendering grid:", error);
            this.gridContainer.innerHTML = `<div class="error-message">Error rendering grid: ${error.message}. Please continue with column mapping using the dropdowns below.</div>`;
        }
    }

    /**
     * Sanitize data for grid rendering to handle complex Excel structures
     * @param {Array} data - Raw preview data
     * @returns {Array} - Sanitized data safe for grid rendering
     */
    _sanitizeDataForGrid(data) {
        if (!Array.isArray(data)) return [];

        try {
            // Make a deep copy to avoid modifying original data
            const result = [];

            // Process each row
            for (let i = 0; i < data.length; i++) {
                const row = data[i];
                if (!Array.isArray(row)) {
                    // Replace non-array rows with empty arrays
                    result.push([]);
                    continue;
                }

                // Process each cell in the row
                const processedRow = [];
                for (let j = 0; j < row.length; j++) {
                    let cellValue = row[j];

                    // Convert null/undefined to empty string
                    if (cellValue === null || cellValue === undefined) {
                        cellValue = '';
                    }

                    // Convert objects to strings to prevent rendering issues
                    if (typeof cellValue === 'object') {
                        try {
                            cellValue = JSON.stringify(cellValue);
                        } catch (e) {
                            cellValue = '[Complex Object]';
                        }
                    }

                    // Limit string length for display
                    if (typeof cellValue === 'string' && cellValue.length > 1000) {
                        cellValue = cellValue.substring(0, 997) + '...';
                    }

                    processedRow.push(cellValue);
                }

                result.push(processedRow);
            }

            return result;
        } catch (error) {
            console.error("Error sanitizing data:", error);
            return data; // Return original if sanitization fails
        }
    }

    /**
     * Render the column mapping UI
     * @param {string} worksheetId - The worksheet ID
     */
    _renderMappings(worksheetId) {
        if (!this.mappingContainer) return;
    
        this.mappingContainer.innerHTML = '';
        
        const config = this.worksheetConfigs[worksheetId] || {};
        const previewData = config.previewData || [];
        const mappings = config.mappings || [];
        
        // If no preview data, show message
        if (!previewData || previewData.length === 0) {
            const noDataMessage = document.createElement('div');
            noDataMessage.className = 'no-data-message';
            noDataMessage.textContent = 'No data available for mapping.';
            this.mappingContainer.appendChild(noDataMessage);
            return;
        }
        
        // Get headers from the detected header row
        const headerRowIndex = config.headerRow || 0;
        const headers = headerRowIndex < previewData.length ? previewData[headerRowIndex] : [];
        
        console.log(`Using header row index ${headerRowIndex} for worksheet ${worksheetId}`);
        console.log('Headers found:', headers);
        
        // Create mapping form with all possible destination fields
        const form = document.createElement('form');
        form.className = 'mapping-form';
        
        // Define destination fields - include "answer_text" field for corpus imports
        const destinationFields = [
            { id: 'question_id', name: 'ID', required: true, description: 'Unique identifier for the question' },
            { id: 'question_text', name: 'Question', required: true, description: 'The actual question text' }
        ];
        
        // Add "answer_text" field for corpus imports
        if (this.parentModal === 'corpus') {
            destinationFields.push({ 
                id: 'answer_text', 
                name: 'Answer', 
                required: true, 
                description: 'The answer to the question (required for corpus imports)' 
            });
        }
        
        // Add other optional fields
        destinationFields.push(
            { id: 'question_prefix', name: 'Question Prefix', required: false, description: 'Prefix added before the question (e.g., "Security:")' },
            { id: 'guidance', name: 'Guidance', required: false, description: 'Instructions or guidance for answering' },
            { id: 'notes', name: 'Notes', required: false, description: 'Additional notes or comments' },
            { id: 'module', name: 'Module', required: false, description: 'Module or category the question belongs to' },
            { id: 'owner_username', name: 'Owner', required: false, description: 'Username of the question owner' }
        );

        // Create a dropdown for each destination field
        destinationFields.forEach(field => {
            const fieldGroup = document.createElement('div');
            fieldGroup.className = 'mapping-field-group';

            // Field label
            const label = document.createElement('label');
            label.htmlFor = `mapping-${field.id}`;
            label.className = 'mapping-field-label';
            label.innerHTML = field.required ?
                `${field.name} <span class="required-mark">*</span>` :
                field.name;
            fieldGroup.appendChild(label);

            // Field description
            const description = document.createElement('div');
            description.className = 'mapping-field-description';
            description.textContent = field.description;
            fieldGroup.appendChild(description);

            // Source column dropdown
            const select = document.createElement('select');
            select.id = `mapping-${field.id}`;
            select.className = 'mapping-field-select';
            select.dataset.destinationField = field.id;

            // Add empty option
            const emptyOption = document.createElement('option');
            emptyOption.value = '';
            emptyOption.textContent = '-- Select source column --';
            select.appendChild(emptyOption);

            // Add column options with previews
            headers.forEach((header, index) => {
                // Create preview from data
                let preview = '';
                if (previewData.length > headerRowIndex + 1 &&
                    previewData[headerRowIndex + 1] &&
                    index < previewData[headerRowIndex + 1].length) {
                    const previewValue = previewData[headerRowIndex + 1][index];
                    preview = previewValue !== null && previewValue !== undefined ?
                        String(previewValue).substring(0, 30) : '';
                    if (preview.length === 30) preview += '...';
                }

                const option = document.createElement('option');
                option.value = index;

                // Use the actual header value from the detected header row
                const headerValue = header !== null && header !== undefined ? String(header).trim() : '';
                const displayHeader = headerValue || '(No header)';

                // Display column letter, actual header, and preview
                const columnLetter = this._indexToColumnLetter(index);
                option.textContent = `${columnLetter}: ${displayHeader} ${preview ? `- "${preview}"` : ''}`;

                select.appendChild(option);
            });

            // Set selected option based on current mapping
            const mapping = mappings.find(m => m.destinationField === field.id);
            if (mapping) {
                select.value = mapping.sourceColumn;
            }

            // Add change listener
            select.addEventListener('change', () => {
                this._updateMapping(worksheetId, field.id, select.value === '' ? null : parseInt(select.value));
            });

            fieldGroup.appendChild(select);

            // Add validation message container
            const validationMessage = document.createElement('div');
            validationMessage.className = 'mapping-validation-message';
            validationMessage.id = `validation-${field.id}`;
            fieldGroup.appendChild(validationMessage);

            form.appendChild(fieldGroup);
        });

        this.mappingContainer.appendChild(form);

        // Validate initial mappings
        this._validateMappings(worksheetId);
    }

    /**
     * Toggle worksheet inclusion/exclusion
     * @param {boolean} include - Whether to include the worksheet
     */
    _toggleCurrentWorksheet(include) {
        if (!this.currentTabId) return;

        // Update tab data
        const tab = this.worksheetTabs.find(tab => tab.id === this.currentTabId);
        if (tab) {
            tab.excluded = !include;

            // Update tabs UI
            if (this.tabs) {
                this.tabs.setTabExcluded(this.currentTabId, !include);
            }

            // Find the configuration container and controls
            const configContainer = this.domContainer.querySelector('.sheet-config-container');
            if (configContainer) {
                // Always keep the toggle controls enabled by NOT applying the excluded class to the container
                configContainer.classList.remove('excluded');

                // Instead, selectively apply a 'content-excluded' class to the content areas only
                const contentAreas = configContainer.querySelectorAll('.preview-section, .mapping-section');
                contentAreas.forEach(area => {
                    if (!include) {
                        area.classList.add('content-excluded');
                    } else {
                        area.classList.remove('content-excluded');
                    }
                });

                // Update the toggle buttons to reflect the correct state
                const includeButton = configContainer.querySelector('.include-button');
                const excludeButton = configContainer.querySelector('.exclude-button');

                if (includeButton && excludeButton) {
                    if (include) {
                        includeButton.classList.add('active');
                        excludeButton.classList.remove('active');
                    } else {
                        includeButton.classList.remove('active');
                        excludeButton.classList.add('active');
                    }
                }
            }

            this._notifyWizard();
        }
    }

    /**
     * Update the start row for a worksheet
     * @param {string} worksheetId - The worksheet ID
     * @param {number} rowIndex - The new start row index
     */
    _updateStartRow(worksheetId, rowIndex) {
        if (!this.worksheetConfigs[worksheetId]) {
            this.worksheetConfigs[worksheetId] = { startRow: 0, mappings: [] };
        }

        this.worksheetConfigs[worksheetId].startRow = rowIndex;
    }

    /**
     * Update a column mapping
     * @param {string} worksheetId - The worksheet ID
     * @param {string} destinationField - The destination field
     * @param {number|null} sourceColumn - The source column index (or null to remove mapping)
     */
    _updateMapping(worksheetId, destinationField, sourceColumn) {
        if (!this.worksheetConfigs[worksheetId]) {
            this.worksheetConfigs[worksheetId] = { startRow: 1, mappings: [] };
        }

        const config = this.worksheetConfigs[worksheetId];

        // Find existing mapping
        const existingIndex = config.mappings.findIndex(m => m.destinationField === destinationField);

        if (sourceColumn === null || sourceColumn === undefined) {
            // Remove mapping if source column is null
            if (existingIndex !== -1) {
                config.mappings.splice(existingIndex, 1);
            }
        } else {
            // Remove any other mapping to the same source column (one-to-one constraint)
            const duplicateIndex = config.mappings.findIndex(m =>
                m.sourceColumn === sourceColumn && m.destinationField !== destinationField
            );

            if (duplicateIndex !== -1) {
                // Clear the dropdown that points to this source column
                const duplicateField = config.mappings[duplicateIndex].destinationField;
                const duplicateSelect = this.mappingContainer.querySelector(`select[data-destination-field="${duplicateField}"]`);
                if (duplicateSelect) {
                    duplicateSelect.value = '';
                }

                // Remove the duplicate mapping
                config.mappings.splice(duplicateIndex, 1);
            }

            // Update or add mapping
            if (existingIndex !== -1) {
                config.mappings[existingIndex].sourceColumn = sourceColumn;
            } else {
                config.mappings.push({
                    sourceColumn,
                    destinationField
                });
            }
        }

        // Update grid display
        if (this.grid) {
            const gridMappings = config.mappings.map(mapping => ({
                sourceColumn: mapping.sourceColumn,
                destinationField: mapping.destinationField
            }));

            this.grid.updateColumnMappings(gridMappings);
        }

        // Validate mappings
        this._validateMappings(worksheetId);
        this._notifyWizard();
    }

    _notifyWizard() {
        // Prevent recursive calls
        if (this._isUpdatingNextButton) {
            return;
        }

        this._isUpdatingNextButton = true;
        try {
            if (window.currentImportWizard &&
                typeof window.currentImportWizard._updateNextButtonState === 'function') {
                window.currentImportWizard._updateNextButtonState();
            }
        } finally {
            this._isUpdatingNextButton = false;
        }
    }

    /**
     * Validate mappings for a worksheet
     * @param {string} worksheetId - The worksheet ID
     * @returns {boolean} - Whether the mappings are valid
     */
    _validateMappings(worksheetId) {
        // Prevent recursive validation
        if (this._isValidating) {
            return true; // Return current validation state to avoid stack overflow
        }
        
        this._isValidating = true;
        
        try {
            const config = this.worksheetConfigs[worksheetId] || {};
            const mappings = config.mappings || [];
    
            let isValid = true;
    
            // Skip DOM validation if elements aren't ready yet
            if (!this.domContainer || !this.mappingContainer) {
                // Just check if required mappings exist
                this.requiredMappings.forEach(requiredField => {
                    const hasMapping = mappings.some(m => m.destinationField === requiredField);
                    if (!hasMapping) {
                        isValid = false;
                    }
                });
                return isValid;
            }
    
            // Regular validation with UI updates when DOM is ready
            this.requiredMappings.forEach(requiredField => {
                const hasMapping = mappings.some(m => m.destinationField === requiredField);
                const validationEl = this.mappingContainer.querySelector(`#validation-${requiredField}`);
    
                if (!hasMapping) {
                    isValid = false;
                    if (validationEl) {
                        validationEl.textContent = 'This field is required';
                        validationEl.style.display = 'block';
                    }
                } else {
                    if (validationEl) {
                        validationEl.textContent = '';
                        validationEl.style.display = 'none';
                    }
                }
            });
            
            // Only call _notifyWizard if we're not already in an update cycle
            if (!this._isUpdatingNextButton) {
                this._notifyWizard();
            }
            
            return isValid;
        } finally {
            this._isValidating = false;
        }
    }

    /**
     * Convert column index to Excel-style column letter (A, B, C, ... Z, AA, AB, etc.)
     * @param {number} index - 0-based column index
     * @returns {string} - Excel-style column reference
     */
    _indexToColumnLetter(index) {
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
     * Get the mapping configuration for all worksheets
     * @returns {Object} - The mapping configuration
     */
    getMappingConfig() {
        const config = {
            worksheets: [],
            mappingsBySheet: {}
        };

        // Filter to only included worksheets
        const includedWorksheets = this.worksheetTabs.filter(tab => !tab.excluded).map(tab => tab.id);
        config.worksheets = includedWorksheets;

        // Add mappings for each included worksheet
        includedWorksheets.forEach(worksheetId => {
            const worksheetConfig = this.worksheetConfigs[worksheetId] || {};

            config.mappingsBySheet[worksheetId] = {
                startRow: worksheetConfig.startRow || 1,
                mappings: worksheetConfig.mappings || []
            };
        });

        return config;
    }

    /**
     * Check if step can proceed to next
     * @returns {boolean} - Whether the step can proceed
     */
    canProceed(showErrors = false) {
        // Avoid recursive validation if already validating
        if (this._isValidating) {
            console.log("Avoiding recursive validation in canProceed");
            return true; // Assume valid during recursion to break the loop
        }
        
        // Check if at least one worksheet is included
        const hasIncludedWorksheet = this.worksheetTabs.some(tab => !tab.excluded);
        if (!hasIncludedWorksheet) {
            if (showErrors) {
                this.onError('Please include at least one worksheet for import.');
            }
            return false;
        }

        // Validate mappings for each included worksheet - avoid recursion
        let isValid = true;
        
        // Set flag to prevent recursion
        this._isValidating = true;
        
        try {
            this.worksheetTabs.forEach(tab => {
                if (!tab.excluded) {
                    // Get current config to check mappings
                    const config = this.worksheetConfigs[tab.id] || {};
                    const mappings = config.mappings || [];
                    
                    // Check if required fields are mapped based on parent modal type
                    this.requiredMappings.forEach(requiredField => {
                        const hasMapping = mappings.some(m => m.destinationField === requiredField);
                        if (!hasMapping) {
                            isValid = false;
                            
                            // Only update UI when showErrors is true
                            if (showErrors && this.mappingContainer) {
                                const validationEl = this.mappingContainer.querySelector(`#validation-${requiredField}`);
                                if (validationEl) {
                                    validationEl.textContent = 'This field is required';
                                    validationEl.style.display = 'block';
                                }
                            }
                        }
                    });
                }
            });
        } finally {
            this._isValidating = false;
        }

        if (!isValid && showErrors) {
            this.onError(`Please map all required fields (${this.requiredMappings.join(', ')}) for each included worksheet.`);
        }

        return isValid;
    }

    proceed() {
        if (!this.canProceed(true)) return;

        // Get mapping configuration
        const mappingConfig = this.getMappingConfig();

        // Call next step
        this.onNext(mappingConfig);
    }

    reset() {
        // Reset tab data
        this.worksheetTabs = [];
        this.currentTabId = null;

        // Reset mapping data
        this.worksheetConfigs = {};

        // Reset UI components
        this.grid = null;

        // Reprocess metadata if available
        if (this.metadata) {
            this._processMetadata();
        }

        this._notifyWizard();
    }
}

export default StepMapColumns;
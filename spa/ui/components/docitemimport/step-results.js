// ui/components/docitemimport/step-results.js

import documentImportService from '../../../api/document-import-service.js';
import ReadOnlySheetGrid from '../shared/read-only-sheet-grid.js';

/**
 * Fifth and final step of the import wizard - display results
 * Shows success counts, skipped rows, and provides a download link for skipped row details
 */
export class StepResults {
    /**
     * Create a new results step
     * @param {Object} options - Configuration options
     * @param {Object} options.importResults - Results of the import process
     * @param {Object} options.fileData - Original file data
     * @param {Function} options.onComplete - Callback when step is completed
     * @param {Object} options.docTaskInstance - Document task instance
     * @param {String} options.stageId - Current stage ID
     */
    constructor(options = {}) {
        this.importResults = options.importResults || {
            successCount: 0,
            failureCount: 0,
            warningCount: 0,
            failureRows: [],
            warningRows: [],
            worksheetResults: {}
        };
        this.fileData = options.fileData || {};
        this.onComplete = options.onComplete || (() => { });
        this.docTaskInstance = options.docTaskInstance || {};
        this.stageId = options.stageId || '';

        // Ensure worksheetResults exists to prevent null reference errors
        if (!this.importResults.worksheetResults) {
            this.importResults.worksheetResults = {};
        }

        this.hasSkippedRows = (this.importResults.failureCount > 0) ||
            (this.importResults.failureRows && this.importResults.failureRows.length > 0);

        this.skippedRowsDownloadUrl = null;
        this.domContainer = null;
    }

    /**
     * Set import method 
     * @param {string} method - Import method ('excel' or 'text')
     */
    setImportMethod(method) {
        this.importMethod = method;
    }

    /**
     * Set extraction result from text import
     * @param {Object} result - Extraction result
     */
    setExtractionResult(result) {
        this.extractionResult = result;
    }

    /**
     * Set the importing state
     * @param {boolean} isImporting - Whether import is in progress
     */
    setImportingState(isImporting) {
        this.isImporting = isImporting;
        this._notifyWizard();
    }

    /**
     * Enhance the existing render method to handle text import results
     * @param {HTMLElement} container - Container element
     */
    async render(container) {
        this.domContainer = container;

        // If currently importing, show progress state instead
        if (this.isImporting) {
            this._createProgressSection({
                totalBatches: 0,
                completedBatches: 0,
                successCount: 0,
                failureCount: 0,
                warningCount: 0
            });
            return;
        }

        container.innerHTML = '';

        // Ensure importResults and worksheetResults exist for Excel path
        if (!this.importResults) {
            this.importResults = {
                successCount: 0,
                failureCount: 0,
                warningCount: 0,
                failureRows: [],
                warningRows: [],
                worksheetResults: {}
            };
        }

        // Create step content
        const stepContent = document.createElement('div');
        stepContent.className = 'import-step import-step-results';

        // Add step title
        const titleEl = document.createElement('h3');
        titleEl.textContent = 'Import Complete';
        stepContent.appendChild(titleEl);

        // Add description based on import path
        const descriptionEl = document.createElement('p');

        if (this.importMethod === 'text' && this.extractionResult) {
            // Text import path description
            if (this.extractionResult.importedCount > 0) {
                descriptionEl.textContent = 'Questions were successfully extracted and imported from your text.';
            } else if (this.extractionResult.totalQuestions > 0) {
                descriptionEl.textContent = 'Questions were found but could not be imported. Please check the skipped row details.';
            } else {
                descriptionEl.textContent = 'No questions could be identified in the text. Please try with more clearly formatted questions.';
            }
        } else {
            // Excel import path description (positive messaging)
            if (this.importResults.successCount > 0) {
                if (this.importResults.failureCount > 0) {
                    descriptionEl.textContent = `Import completed successfully. ${this.importResults.successCount} questions were imported. ${this.importResults.failureCount} rows were skipped due to invalid or incomplete data.`;
                } else {
                    descriptionEl.textContent = 'Import completed successfully. All questions have been imported.';
                }
            } else if (this.importResults.failureCount > 0) {
                descriptionEl.textContent = 'Import completed. No questions were imported as all rows were skipped due to invalid or incomplete data.';
            } else {
                descriptionEl.textContent = 'Import completed. No questions were found to import.';
            }
        }

        stepContent.appendChild(descriptionEl);

        // Choose which content to display based on import method
        if (this.importMethod === 'text' && this.extractionResult) {
            this._renderTextImportResults(stepContent);
        } else {
            // Use the existing Excel import results rendering
            this._renderExcelImportResults(stepContent);
        }

        container.appendChild(stepContent);

        // Trigger event to update the Cancel button and footer button state based on import results
        const hasSuccessfulImport = (this.importResults && this.importResults.success);
        if (window.currentImportWizard) {
            window.currentImportWizard._updateButtonStatesForResults(hasSuccessfulImport);
        }

    }

    /**
     * Render text import results section
     * @param {HTMLElement} container - Container element to append content to
     */
    _renderTextImportResults(container) {
        const extractionResult = this.extractionResult || {
            totalQuestions: 0,
            importedCount: 0,
            questions: []
        };

        // Summary panel with stats
        const summaryPanel = document.createElement('div');
        summaryPanel.className = 'results-summary-panel';

        // Add status icon
        const statusIcon = document.createElement('div');
        statusIcon.className = 'status-icon';

        if (extractionResult.importedCount > 0) {
            statusIcon.innerHTML = '<i class="fas fa-check-circle success-icon"></i>';
            statusIcon.classList.add('all-success');
        } else if (extractionResult.totalQuestions > 0) {
            statusIcon.innerHTML = '<i class="fas fa-exclamation-triangle warning-icon"></i>';
            statusIcon.classList.add('has-warnings');
        } else {
            statusIcon.innerHTML = '<i class="fas fa-info-circle info-icon"></i>';
            statusIcon.classList.add('no-data');
        }

        summaryPanel.appendChild(statusIcon);

        // Stats container
        const statsContainer = document.createElement('div');
        statsContainer.className = 'stats-container';

        // Extracted questions stat
        const extractedStat = document.createElement('div');
        extractedStat.className = 'stat-item';
        extractedStat.innerHTML = `
        <div class="stat-value">${extractionResult.totalQuestions || 0}</div>
        <div class="stat-label">Questions Found</div>
    `;
        statsContainer.appendChild(extractedStat);

        // Imported questions stat
        const importedStat = document.createElement('div');
        importedStat.className = 'stat-item success-stat';
        importedStat.innerHTML = `
        <div class="stat-value">${extractionResult.importedCount || 0}</div>
        <div class="stat-label">Questions Imported</div>
    `;
        statsContainer.appendChild(importedStat);

        // Remove success rate stat per UX guidelines

        summaryPanel.appendChild(statsContainer);
        container.appendChild(summaryPanel);

        // Show extracted questions if available
        if (extractionResult.questions && extractionResult.questions.length > 0) {
            const questionsSection = document.createElement('div');
            questionsSection.className = 'questions-section';

            const questionsTitle = document.createElement('h4');
            questionsTitle.textContent = 'Extracted Questions';
            questionsSection.appendChild(questionsTitle);

            // Create table for questions
            const questionsTable = document.createElement('table');
            questionsTable.className = 'questions-table';

            // Table header
            const tableHeader = document.createElement('thead');
            tableHeader.innerHTML = `
            <tr>
                <th class="question-id-col">ID</th>
                <th class="question-text-col">Question</th>
                <th class="question-status-col">Status</th>
            </tr>
        `;
            questionsTable.appendChild(tableHeader);

            // Table body
            const tableBody = document.createElement('tbody');

            // Limit display to 10 questions max with a "show more" option
            const displayLimit = 10;
            const questions = extractionResult.questions;
            const displayQuestions = questions.slice(0, displayLimit);

            // Add question rows
            displayQuestions.forEach((question, index) => {
                const row = document.createElement('tr');

                // ID cell
                const idCell = document.createElement('td');
                idCell.textContent = question.id || `Q${index + 1}`;
                row.appendChild(idCell);

                // Text cell
                const textCell = document.createElement('td');
                textCell.textContent = question.text || '';
                row.appendChild(textCell);

                // Status cell
                const statusCell = document.createElement('td');
                if (question.imported) {
                    statusCell.innerHTML = '<span class="status-chip status-success">Imported</span>';
                } else {
                    statusCell.innerHTML = '<span class="status-chip status-skipped">Skipped</span>';

                    // Add tooltip if available
                    if (question.error) {
                        statusCell.innerHTML += `<span class="skip-tooltip" title="${question.error}"><i class="fas fa-info-circle"></i></span>`;
                    }
                }
                row.appendChild(statusCell);

                tableBody.appendChild(row);
            });

            questionsTable.appendChild(tableBody);
            questionsSection.appendChild(questionsTable);

            // Show count message if more questions exist
            if (questions.length > displayLimit) {
                const moreMessage = document.createElement('div');
                moreMessage.className = 'more-questions-message';
                moreMessage.textContent = `Showing ${displayLimit} of ${questions.length} questions`;
                questionsSection.appendChild(moreMessage);
            }

            container.appendChild(questionsSection);
        }

        // Next Steps section removed per UX guidelines
    }

    /**
     * Creates a progress section to show importing state
     * When called from text import path, use the appropriate labels
     * @param {Object} progress - Progress data
     */
    _createProgressSection(progress) {
        if (!this.domContainer) return;
        this.domContainer.innerHTML = '';

        // Create step content
        const stepContent = document.createElement('div');
        stepContent.className = 'import-step import-step-results';

        // Add step title
        const titleEl = document.createElement('h3');
        titleEl.textContent = this.importMethod === 'text' ? 'Extracting Questions...' : 'Importing...';
        stepContent.appendChild(titleEl);

        const descriptionEl = document.createElement('p');
        if (this.importMethod === 'text') {
            descriptionEl.textContent = 'Please wait while our AI extracts questions from your text...';
        } else {
            descriptionEl.textContent = 'Please wait while your questions are being imported. This may take a few minutes for large files.';
        }
        stepContent.appendChild(descriptionEl);

        // Create progress section
        const progressSection = document.createElement('div');
        progressSection.className = 'import-progress-section';

        // Add spinner and status
        const statusContainer = document.createElement('div');
        statusContainer.className = 'import-status-container';
        statusContainer.innerHTML = `
        <div class="status-spinner">
            <i class="fas fa-spinner fa-spin"></i>
        </div>
        <div class="status-text">${this.importMethod === 'text' ? 'Extracting questions...' : 'Importing questions...'}</div>
    `;
        progressSection.appendChild(statusContainer);

        // Only show progress bar for Excel imports (batch operations)
        if (this.importMethod !== 'text') {
            const progressBar = document.createElement('div');
            progressBar.className = 'progress-bar-container';
            progressBar.innerHTML = `
            <div class="progress-bar-outer">
                <div class="progress-bar-inner" style="width: 0%"></div>
            </div>
            <div class="progress-percent">0%</div>
        `;
            progressSection.appendChild(progressBar);

            // Progress stats (only for Excel imports)
            const progressStats = document.createElement('div');
            progressStats.className = 'progress-stats';
            progressStats.innerHTML = `
            <div class="progress-stat">
                <div class="stat-label">Batches Processed:</div>
                <div class="stat-value batch-progress-value">0/${progress.totalBatches || 0}</div>
            </div>
            <div class="progress-stat">
                <div class="stat-label">Questions Imported:</div>
                <div class="stat-value success-count-value">${progress.successCount || 0}</div>
            </div>
            <div class="progress-stat">
                <div class="stat-label">Rows Skipped:</div>
                <div class="stat-value failure-count-value">${progress.failureCount || 0}</div>
            </div>
            <div class="progress-stat">
                <div class="stat-label">Warnings:</div>
                <div class="stat-value warning-count-value">${progress.warningCount || 0}</div>
            </div>
        `;
            progressSection.appendChild(progressStats);
        } else {
            // For text imports, show a simpler progress indicator
            const textProgressInfo = document.createElement('div');
            textProgressInfo.className = 'text-import-progress-info';
            textProgressInfo.innerHTML = `
            <div class="progress-text">
                <p>Our AI is analyzing your text to extract questions.</p>
                <p>This usually takes less than 30 seconds...</p>
            </div>
        `;
            progressSection.appendChild(textProgressInfo);
        }

        stepContent.appendChild(progressSection);
        this.domContainer.appendChild(stepContent);
    }

    /**
     * Render Excel import results (existing functionality)
     * Split from render method to preserve existing logic
     * @param {HTMLElement} container - Container element 
     */
    async _renderExcelImportResults(container) {
        // Create results summary panel
        const summaryPanel = document.createElement('div');
        summaryPanel.className = 'results-summary-panel';

        // Add status icon
        const statusIcon = document.createElement('div');
        statusIcon.className = 'status-icon';

        if (this.importResults.successCount > 0) {
            // Show success icon when questions were imported, regardless of skipped rows
            statusIcon.innerHTML = '<i class="fas fa-check-circle success-icon"></i>';
            statusIcon.classList.add('all-success');
        } else if (this.importResults.failureCount > 0) {
            // Show info icon when only skipped rows (not an error condition)
            statusIcon.innerHTML = '<i class="fas fa-info-circle info-icon"></i>';
            statusIcon.classList.add('has-skipped');
        } else {
            statusIcon.innerHTML = '<i class="fas fa-info-circle info-icon"></i>';
            statusIcon.classList.add('no-data');
        }

        summaryPanel.appendChild(statusIcon);

        // Add summary message
        const summaryMessage = document.createElement('div');
        summaryMessage.className = 'summary-message';

        if (this.importResults.failureCount > 0) {
            if (this.importResults.successCount > 0) {
                summaryMessage.innerHTML = `
            <h4>Import completed successfully</h4>
            <p>${this.importResults.successCount} questions imported. ${this.importResults.failureCount} rows were skipped due to invalid data.</p>
        `;
            } else {
                summaryMessage.innerHTML = `
            <h4>Import completed</h4>
            <p>All rows were skipped due to invalid or incomplete data. See details below.</p>
        `;
            }
        } else if (this.importResults.successCount > 0) {
            summaryMessage.innerHTML = `
        <h4>Import completed successfully</h4>
        <p>All selected data was imported successfully.</p>
    `;
        } else {
            summaryMessage.innerHTML = `
        <h4>Import completed</h4>
        <p>No questions were found to import.</p>
    `;
        }

        summaryPanel.appendChild(summaryMessage);

        // Add statistics
        const statsContainer = document.createElement('div');
        statsContainer.className = 'stats-container';

        // Success stats
        const successStats = document.createElement('div');
        successStats.className = 'stat-item success-stat';
        successStats.innerHTML = `
    <div class="stat-value">${this.importResults?.successCount || 0}</div>
    <div class="stat-label">Questions imported</div>
`;
        statsContainer.appendChild(successStats);

        // Warning stats
        const warningStats = document.createElement('div');
        warningStats.className = 'stat-item warning-stat';
        warningStats.innerHTML = `
    <div class="stat-value">${this.importResults?.warningCount || 0}</div>
    <div class="stat-label">Warnings</div>
`;
        statsContainer.appendChild(warningStats);

        // This section was already updated above to show skipped rows

        // Remove success rate stat per UX guidelines

        summaryPanel.appendChild(statsContainer);
        container.appendChild(summaryPanel);

        // Add click handler for skipped count to scroll to details
        const skippedClickable = container.querySelector('.skipped-count-clickable');
        if (skippedClickable) {
            skippedClickable.style.cursor = 'pointer';
            skippedClickable.style.textDecoration = 'underline';
            skippedClickable.addEventListener('click', () => {
                const targetElement = document.getElementById('rows-skipped-details');
                if (targetElement) {
                    targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });
        }

        // Add worksheet summary first
        if (Object.keys(this.importResults.worksheetResults || {}).length > 0) {
            const worksheetSection = document.createElement('div');
            worksheetSection.className = 'worksheet-results-section';

            const worksheetTitle = document.createElement('h4');
            worksheetTitle.textContent = 'Worksheet Results';
            worksheetSection.appendChild(worksheetTitle);

            const worksheetList = document.createElement('div');
            worksheetList.className = 'worksheet-results-list';

            // Use safe object reference with fallback
            const safeWorksheetResults = this.importResults.worksheetResults || {};

            Object.entries(safeWorksheetResults).forEach(([worksheet, results]) => {
                // Ensure results object exists
                const safeResults = results || { successCount: 0, failureCount: 0, warningCount: 0 };

                const worksheetItem = document.createElement('div');
                worksheetItem.className = 'worksheet-result-item';

                const hasSkipped = safeResults.failureCount > 0;
                if (hasSkipped) {
                    worksheetItem.classList.add('has-skipped');
                }

                worksheetItem.innerHTML = `
                <div class="worksheet-result-header">
                    <div class="worksheet-result-name">${worksheet}</div>
                    <div class="worksheet-result-stats">
                        <span class="success-count">${safeResults.successCount || 0} imported</span>
                        ${hasSkipped ?
                        `<span class="skipped-count">${safeResults.failureCount || 0} skipped</span>` :
                        ''}
                    </div>
                </div>
            `;

                worksheetList.appendChild(worksheetItem);
            });

            worksheetSection.appendChild(worksheetList);
            container.appendChild(worksheetSection);
        }

        // If there are skipped rows, display them
        if (this.importResults.failureCount > 0 && this.importResults.failureRows && this.importResults.failureRows.length > 0) {
            const failureSection = document.createElement('div');
            failureSection.className = 'skipped-rows-section';

            const failureTitle = document.createElement('h4');
            failureTitle.textContent = 'Rows Skipped Details';
            failureSection.appendChild(failureTitle);

            // Show up to 10 skipped rows in a grid
            const skippedCount = this.importResults.failureRows?.length || 0;
            const displayCount = Math.min(skippedCount, 10);

            const skippedInfo = document.createElement('div');
            skippedInfo.className = 'skipped-info';
            skippedInfo.textContent = `Previewing ${displayCount} of ${skippedCount} skipped rows:`;
            failureSection.appendChild(skippedInfo);

            // Create skipped rows grid container
            const gridContainer = document.createElement('div');
            gridContainer.className = 'skipped-rows-grid-container';

            // Transform skipped rows to grid format
            const gridData = this._prepareSkippedRowsGridData(this.importResults.failureRows.slice(0, 10));

            // Create grid
            const grid = new ReadOnlySheetGrid({
                data: gridData,
                hasHeader: true,
                maxVisibleRows: gridData.length,
                maxVisibleCols: gridData[0]?.length || 5,
                disableRowSelection: true,
                disableCellTooltips: true
            });

            grid.render(gridContainer);
            failureSection.appendChild(gridContainer);

            // Add download link for all skipped rows
            if (skippedCount > 0) {
                // Create skipped rows download container
                const downloadContainer = document.createElement('div');
                downloadContainer.className = 'skipped-download-container';

                const downloadButton = document.createElement('button');
                downloadButton.className = 'btn btn-secondary download-skipped-btn'; // Use secondary button class
                downloadButton.innerHTML = '<i class="fas fa-download"></i> Download Skipped Rows Report';
                downloadButton.disabled = true;

                // Generate download link
                try {
                    downloadButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Preparing download...';

                    const projectId = this.docTaskInstance.project_id || this.docTaskInstance.projectId;
                    const documentId = this.docTaskInstance.document_id || this.docTaskInstance.documentId;

                    const failureData = await documentImportService.getFailuresCsvUrl({
                        project_id: projectId,
                        document_id: documentId,
                        failure_data: this.importResults.failureRows,
                        filename_prefix: `import_skipped_rows_${new Date().toISOString().split('T')[0]}`
                    });

                    this.skippedRowsDownloadUrl = failureData.download_url;
                    downloadButton.innerHTML = '<i class="fas fa-download"></i> Download Skipped Rows Report';
                    downloadButton.disabled = false;

                    downloadButton.addEventListener('click', () => {
                        if (this.skippedRowsDownloadUrl) {
                            window.open(this.skippedRowsDownloadUrl, '_blank');
                        }
                    });
                } catch (error) {
                    console.error('Error generating skipped rows download URL:', error);
                    downloadButton.innerHTML = '<i class="fas fa-exclamation-circle"></i> Error preparing download';
                    downloadButton.disabled = true;

                    // Show error using ErrorModal if available
                    if (window.ErrorModal) {
                        const errorModal = new window.ErrorModal();
                        errorModal.show({
                            title: 'Download Error',
                            message: `Error generating skipped rows report download: ${error.message || 'Unknown error'}`
                        });
                    }
                }

                downloadContainer.appendChild(downloadButton);
                failureSection.appendChild(downloadContainer);
            }

            container.appendChild(failureSection);
        }

        // Worksheet summary moved above to appear before skipped rows

        // Next Steps section removed per UX guidelines

        // Trigger event to update the Cancel button and footer button state based on import results
        const hasSuccessfulImport = (this.importResults.successCount > 0);
        if (window.currentImportWizard) {
            window.currentImportWizard._updateButtonStatesForResults(hasSuccessfulImport);
        }
    }

    /**
     * Update import progress in the UI
     * @param {Object} progress - Progress information
     */
    updateImportProgress_OLD(progress) {
        if (!this.domContainer || !progress) return;

        // Find progress elements if they exist
        const progressSection = this.domContainer.querySelector('.import-progress-section');
        if (!progressSection) {
            // If progress section doesn't exist yet, we need to create it
            this._createProgressSection(progress);
            return;
        }

        // Update existing progress elements
        const batchProgress = progressSection.querySelector('.batch-progress-value');
        if (batchProgress) {
            batchProgress.textContent = `${progress.completedBatches}/${progress.totalBatches}`;
        }

        const successCount = progressSection.querySelector('.success-count-value');
        if (successCount) {
            successCount.textContent = progress.successCount;
        }

        const skippedCountEl = progressSection.querySelector('.failure-count-value');
        if (skippedCountEl) {
            skippedCountEl.textContent = progress.failureCount;
        }

        const warningCount = progressSection.querySelector('.warning-count-value');
        if (warningCount) {
            warningCount.textContent = progress.warningCount;
        }

        // Update progress percentage
        if (progress.totalBatches > 0) {
            const percent = Math.min(100, Math.floor((progress.completedBatches / progress.totalBatches) * 100));
            const progressBar = progressSection.querySelector('.progress-bar-inner');
            if (progressBar) {
                progressBar.style.width = `${percent}%`;
            }

            const percentText = progressSection.querySelector('.progress-percent');
            if (percentText) {
                percentText.textContent = `${percent}%`;
            }
        }

        this._notifyWizard();
    }

    /**
     * Update import progress in the UI
     * @param {Object} progress – {
     *   totalBatches: Number,
     *   completedBatches: Number,
     *   successCount: Number,
     *   failureCount: Number,
     *   warningCount: Number
     * }
     */
    updateImportProgress(progress) {
        if (!this.domContainer || !progress) return;

        /* ------------------------------------------------------------
        1. Normalise and sanity‑check the incoming numbers
        ------------------------------------------------------------ */
        let totalBatches = Number(progress.totalBatches) || 0;
        let completedBatches = Number(progress.completedBatches) || 0;
        let successCount = Number(progress.successCount) || 0;
        let failureCount = Number(progress.failureCount) || 0;
        let warningCount = Number(progress.warningCount) || 0;

        // If the back‑end reports more completed than planned, stretch the total
        if (completedBatches > totalBatches) {
            totalBatches = completedBatches;
        }

        /* ------------------------------------------------------------
        2. Make sure the progress section exists
        ------------------------------------------------------------ */
        let progressSection = this.domContainer.querySelector('.import-progress-section');
        if (!progressSection) {
            // Create it on‑the‑fly if necessary
            this._createProgressSection({
                totalBatches,
                completedBatches,
                successCount,
                failureCount,
                warningCount
            });
            progressSection = this.domContainer.querySelector('.import-progress-section');
        }

        /* ------------------------------------------------------------
        3. Update the visible counters
        ------------------------------------------------------------ */
        const batchEl = progressSection.querySelector('.batch-progress-value');
        const successEl = progressSection.querySelector('.success-count-value');
        const skippedEl = progressSection.querySelector('.failure-count-value');
        const warningEl = progressSection.querySelector('.warning-count-value');

        if (batchEl) batchEl.textContent = `${completedBatches}/${totalBatches}`;
        if (successEl) successEl.textContent = successCount;
        if (skippedEl) skippedEl.textContent = failureCount;
        if (warningEl) warningEl.textContent = warningCount;

        /* ------------------------------------------------------------
        4. Update the percentage bar
        ------------------------------------------------------------ */
        if (totalBatches > 0) {
            const percent = Math.floor((completedBatches / totalBatches) * 100);

            const barInner = progressSection.querySelector('.progress-bar-inner');
            const percentEl = progressSection.querySelector('.progress-percent');

            if (barInner) barInner.style.width = `${percent}%`;
            if (percentEl) percentEl.textContent = `${percent}%`;
        }

        /* ------------------------------------------------------------
        5. Notify the wizard so the footer buttons stay in sync
        ------------------------------------------------------------ */
        this._notifyWizard();
    }

    /**
     * Create the progress section in the UI
     * @param {Object} progress - Initial progress information
     */
    _createProgressSection(progress) {
        if (!this.domContainer) return;

        // Clear existing content if importing
        if (this.isImporting) {
            this.domContainer.innerHTML = '';
        }

        // Create step content
        const stepContent = document.createElement('div');
        stepContent.className = 'import-step import-step-results';

        // Add step title
        const titleEl = document.createElement('h3');
        titleEl.textContent = 'Import In Progress';
        stepContent.appendChild(titleEl);

        const descriptionEl = document.createElement('p');
        descriptionEl.textContent = 'Please wait while your questions are being imported. This may take a few minutes for large files.';
        stepContent.appendChild(descriptionEl);

        // Create progress section
        const progressSection = document.createElement('div');
        progressSection.className = 'import-progress-section';

        // Add spinner and status
        const statusContainer = document.createElement('div');
        statusContainer.className = 'import-status-container';
        statusContainer.innerHTML = `
        <div class="status-spinner">
            <i class="fas fa-spinner fa-spin"></i>
        </div>
        <div class="status-text">Importing questions...</div>
    `;
        progressSection.appendChild(statusContainer);

        // Add progress bar
        const progressBar = document.createElement('div');
        progressBar.className = 'progress-bar-container';
        progressBar.innerHTML = `
        <div class="progress-bar-outer">
            <div class="progress-bar-inner" style="width: 0%"></div>
        </div>
        <div class="progress-percent">0%</div>
    `;
        progressSection.appendChild(progressBar);

        // Add progress stats
        const progressStats = document.createElement('div');
        progressStats.className = 'progress-stats';
        progressStats.innerHTML = `
        <div class="progress-stat">
            <div class="stat-label">Batches Processed:</div>
            <div class="stat-value batch-progress-value">0/${progress.totalBatches || 0}</div>
        </div>
        <div class="progress-stat">
            <div class="stat-label">Questions Imported:</div>
            <div class="stat-value success-count-value">${progress.successCount || 0}</div>
        </div>
        <div class="progress-stat">
            <div class="stat-label">Rows Skipped:</div>
            <div class="stat-value failure-count-value">${progress.failureCount || 0}</div>
        </div>
        <div class="progress-stat">
            <div class="stat-label">Warnings:</div>
            <div class="stat-value warning-count-value">${progress.warningCount || 0}</div>
        </div>
    `;
        progressSection.appendChild(progressStats);

        stepContent.appendChild(progressSection);
        this.domContainer.appendChild(stepContent);
    }

    /**
     * Handle import completion - make sure this actually closes the modal
     */
    _handleImportComplete(results) {
        console.log('Handling import completion in StepResults');
        try {
            // Store file data in docTaskInstance
            if (this.wizardData?.fileData) {
                importStageData.addUploadedFile(this.docTaskInstance, this.stageId, {
                    // existing file data storage
                });
            }
        } catch (error) {
            console.error('Error storing upload info:', error);
        }

        // CRITICAL FIX: Force close the modal using the direct DOM method
        console.log('Closing modal from handleImportComplete');
        this._forceCloseModal();
    }

    /**
     * Prepare skipped row data for grid display
     * @param {Array} skippedRows - Array of skipped row objects
     * @returns {Array} - 2D array for grid display
     */
    _prepareSkippedRowsGridData(skippedRows) {
        if (!skippedRows || skippedRows.length === 0) {
            return [['No skipped rows available']];
        }

        // Define the columns we want to display
        const columns = ['Row', 'Reason', 'Preview'];

        // Create the header row
        const gridData = [columns];

        // Add each skipped row
        skippedRows.forEach(skippedRow => {
            const rowIndex = skippedRow.row_index !== undefined ? skippedRow.row_index + 1 : 'N/A';
            const reason = skippedRow.error || 'Unknown reason';

            // Create a preview string from the row data
            let preview = '';
            if (skippedRow.row_preview) {
                if (typeof skippedRow.row_preview === 'object') {
                    // Convert object to string representation
                    const previewParts = [];
                    for (const [key, value] of Object.entries(skippedRow.row_preview)) {
                        previewParts.push(`${key}: ${value}`);
                    }
                    preview = previewParts.join(', ');
                } else {
                    preview = String(skippedRow.row_preview);
                }

                // Truncate if too long
                if (preview.length > 100) {
                    preview = preview.substring(0, 100) + '...';
                }
            } else {
                preview = 'No preview available';
            }

            gridData.push([rowIndex, reason, preview]);
        });

        return gridData;
    }

    _notifyWizard() {
        if (window.currentImportWizard &&
            typeof window.currentImportWizard._updateNextButtonState === 'function') {
            window.currentImportWizard._updateNextButtonState();
        }
    }

    canProceed(showWarnings = false) {
        // This is the final step, can always proceed to close/finish
        return true;
    }

    proceed() {
        // This is typically connected to the "Finish" button
        if (this.canProceed(true)) {
            // Just call onComplete with the results
            if (typeof this.onComplete === 'function') {
                this.onComplete(this.importResults);
            }
        }
    }

    reset() {
        // Reset import results
        this.importResults = {
            successCount: 0,
            failureCount: 0,
            warningCount: 0,
            failureRows: [],
            warningRows: [],
            worksheetResults: {}
        };

        // Reset file data
        this.fileData = null;

        // Reset importing state
        this.isImporting = false;

        // Reset extraction result if it exists
        this.extractionResult = null;

        this._notifyWizard();
    }
}

export default StepResults;
// File: ui/modals/export-modal.js
import { exportQuestionsAnswers } from "../../api/document-export.js";
import { AsyncFormModal } from "./async-form-modal.js";
import { ErrorModal } from "./error-modal.js";
import { MessageModal } from "./message-modal.js";

/**
 * ExportModal - Modern responsive modal for exporting questions and answers
 * Supports 10 different export formats across 3 categories:
 * - Tools (4 formats): SAP Ariba, Coupa, SIG Standard, Workiva ESG
 * - Universal (4 formats): Generic RFP, SASB ESG, GRI Standards, ISO Compliance
 * - Open (2 formats): CSV Universal, Markdown Documentation
 */
export class ExportModal extends AsyncFormModal {
    constructor(options = {}) {
        super(options);

        this.documentId = null;
        this.projectId = null;
        this.currentGroupId = null;
        this.selectedRows = [];

        this.messageModal = new MessageModal();
        this.errorModal = new ErrorModal();

        // Current filter state
        this.currentFilter = 'all';

        // Export format configurations
        this.exportFormats = this.getExportFormats();

        // Track selected format
        this.selectedFormat = null;

        // Build the DOM elements
        this._buildDOM();
    }

    /**
     * Show the export modal with document context
     */
    async show(context = {}) {
        this.documentId = context.documentId;
        this.projectId = context.projectId;
        this.currentGroupId = context.currentGroupId;
        this.selectedRows = context.selectedRows || [];

        try {
            // Render the modal content
            this.modalEl.innerHTML = this.buildModalContent();

            // Set up additional event listeners after content is rendered
            this._setupContentEventListeners();

            // Call parent show method
            super.show();
        } catch (error) {
            console.error('[ExportModal] Error in super.show():', error);
            throw error;
        }
    }

    /**
     * Build the modal content with proper header/content/footer structure
     */
    buildModalContent() {
        return `
            <!-- Fixed Header -->
            <button class="modal__close" aria-label="Close export modal">&times;</button>
            <h2>Export Questions & Answers</h2>
            
            <!-- Scrollable Content Area -->
            <div class="export-modal__content">
                <div class="export-modal__info">
                    <p>Choose an export format to download your questions and answers:</p>
                    ${this.selectedRows.length > 0
                    ? `<div class="export-modal__selection-info">
                             <i class="fas fa-info-circle"></i>
                             Exporting ${this.selectedRows.length} selected questions
                           </div>`
                    : `<div class="export-modal__selection-info">
                             <i class="fas fa-info-circle"></i>
                             Exporting all questions from current topic
                           </div>`
                }
                </div>
                
                <!-- Category Filters -->
                <div class="export-modal__filters">
                    <button type="button" class="export-modal__filter-btn export-modal__filter-btn--active" data-filter="all">
                        All Formats (${this.getFormatCount('all')})
                    </button>
                    <button type="button" class="export-modal__filter-btn" data-filter="tools_portals">
                        Tools (${this.getFormatCount('tools_portals')})
                    </button>
                    <button type="button" class="export-modal__filter-btn" data-filter="universal">
                        Standards (${this.getFormatCount('universal')})
                    </button>
                    <button type="button" class="export-modal__filter-btn" data-filter="open">
                        Open (${this.getFormatCount('open')})
                    </button>
                </div>
                
                <!-- Export Formats Grid -->
                <div class="export-modal__formats-grid" id="exportFormatsGrid">
                    ${this.renderFormatCards()}
                </div>
            </div>
            
            <!-- Fixed Footer -->
            <div class="button-group">
                <button type="button" class="btn" id="exportCancelBtn">Cancel</button>
                <button type="button" class="btn btn-primary" id="exportDownloadBtn" disabled>
                    <i class="fas fa-download"></i>
                    Export Selected Format
                </button>
            </div>
        `;
    }

    /**
     * Get export format configurations
     */
    getExportFormats() {
        return {
            // Tools Category
            sap_ariba: {
                name: 'SAP Ariba',
                description: 'Compatible with SAP Ariba procurement platform',
                category: 'tools_portals',
                categoryColor: '#ff6b6b',
                categoryLabel: 'Tools',
                icon: 'fas fa-file-excel',
                format: 'Excel (.xlsx)',
                features: ['Multi-worksheet format', 'Instructions sheet', 'Line items support']
            },
            coupa: {
                name: 'Coupa',
                description: 'Standardized format for Coupa procurement',
                category: 'tools_portals',
                categoryColor: '#ff6b6b',
                categoryLabel: 'Tools',
                icon: 'fas fa-file-excel',
                format: 'Excel (.xlsx)',
                features: ['Form responses format', 'Required field highlighting', 'Pricing sheet']
            },
            sig_standard: {
                name: 'SIG Standard',
                description: 'Shared Assessments Program standard format',
                category: 'tools_portals',
                categoryColor: '#ff6b6b',
                categoryLabel: 'Tools',
                icon: 'fas fa-shield-alt',
                format: 'Excel (.xlsx)',
                features: ['Risk domain organization', 'Security focus', 'Compliance tracking']
            },
            workiva_esg: {
                name: 'Workiva ESG',
                description: 'ESG reporting with Workiva compatibility',
                category: 'tools_portals',
                categoryColor: '#ff6b6b',
                categoryLabel: 'Tools',
                icon: 'fas fa-leaf',
                format: 'Excel (.xlsx)',
                features: ['ESG metrics format', 'Sustainability focus', 'Framework alignment']
            },

            // Universal Category
            generic_rfp: {
                name: 'Generic RFP',
                description: 'Standard RFP response format for any platform',
                category: 'universal',
                categoryColor: '#4ecdc4',
                categoryLabel: 'Standards',
                icon: 'fas fa-file-alt',
                format: 'Excel (.xlsx)',
                features: ['Section-based organization', 'Universal compatibility', 'Page limit tracking']
            },
            sasb_esg: {
                name: 'SASB ESG',
                description: 'SASB-aligned sustainability metrics',
                category: 'universal',
                categoryColor: '#4ecdc4',
                categoryLabel: 'Standards',
                icon: 'fas fa-chart-line',
                format: 'Excel (.xlsx)',
                features: ['Industry-specific metrics', 'SASB alignment', 'Sustainability focus']
            },
            gri_standards: {
                name: 'GRI Standards',
                description: 'GRI sustainability reporting standards',
                category: 'universal',
                categoryColor: '#4ecdc4',
                categoryLabel: 'Standards',
                icon: 'fas fa-globe',
                format: 'Excel (.xlsx)',
                features: ['GRI disclosure index', 'Content tracking', 'Omission management']
            },
            iso_compliance: {
                name: 'ISO Compliance',
                description: 'Multi-standard ISO compliance framework',
                category: 'universal',
                categoryColor: '#4ecdc4',
                categoryLabel: 'Standards',
                icon: 'fas fa-certificate',
                format: 'Excel (.xlsx)',
                features: ['Multi-ISO support', 'Clause tracking', 'Evidence management']
            },

            // Open Category
            csv_universal: {
                name: 'CSV Universal',
                description: 'Universal CSV format for maximum compatibility',
                category: 'open',
                categoryColor: '#45b7d1',
                categoryLabel: 'Open',
                icon: 'fas fa-table',
                format: 'CSV (.csv)',
                features: ['Maximum compatibility', 'Flat file structure', 'Import anywhere']
            },
            markdown_docs: {
                name: 'Markdown Docs',
                description: 'Human-readable documentation format',
                category: 'open',
                categoryColor: '#45b7d1',
                categoryLabel: 'Open',
                icon: 'fas fa-file-code',
                format: 'Markdown (.md)',
                features: ['Version control friendly', 'Readable format', 'Collaborative editing']
            }
        };
    }

    /**
     * Render format cards based on current filter
     */
    renderFormatCards() {
        const filteredFormats = this.getFilteredFormats();

        return Object.entries(filteredFormats).map(([key, format]) => `
            <div class="export-modal__format-card" data-format="${key}" data-category="${format.category}">
                <div class="export-modal__category-indicator export-modal__category-indicator--${format.category === 'tools_portals' ? 'tools' : format.category}">
                    ${format.categoryLabel}
                </div>
                <div class="export-modal__format-header">
                    <i class="${format.icon}"></i>
                    <h3>${format.name}</h3>
                    <span class="export-modal__format-type">${format.format}</span>
                </div>
                <div class="export-modal__format-body">
                    <p class="export-modal__format-description">${format.description}</p>
                    <ul class="export-modal__format-features">
                        ${format.features.map(feature => `<li>${feature}</li>`).join('')}
                    </ul>
                </div>
                <div class="export-modal__format-footer">
                    <button type="button" class="btn btn-secondary export-modal__select-btn" data-format="${key}">
                        Select Format
                    </button>
                </div>
            </div>
        `).join('');
    }

    /**
     * Get formats filtered by current category
     */
    getFilteredFormats() {
        if (this.currentFilter === 'all') {
            return this.exportFormats;
        }

        const filtered = {};
        Object.entries(this.exportFormats).forEach(([key, format]) => {
            if (format.category === this.currentFilter) {
                filtered[key] = format;
            }
        });

        return filtered;
    }

    /**
     * Get count of formats in a category
     */
    getFormatCount(category) {
        if (category === 'all') {
            return Object.keys(this.exportFormats).length;
        }

        return Object.values(this.exportFormats).filter(format => format.category === category).length;
    }

    /**
     * Add event listeners after DOM is built
     */
    addEventListeners() {
        super.addEventListeners();

        // Filter buttons
        const filterBtns = this.modalEl.querySelectorAll('.export-modal__filter-btn');
        filterBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.handleFilterChange(e.target.dataset.filter);
            });
        });

        // Format selection
        this.modalEl.addEventListener('click', (e) => {
            if (e.target.classList.contains('export-modal__select-btn')) {
                this.handleFormatSelection(e.target.dataset.format);
            }
        });

        // Action buttons
        const cancelBtn = this.modalEl.querySelector('#exportCancelBtn');
        const downloadBtn = this.modalEl.querySelector('#exportDownloadBtn');

        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => this.hide());
        }

        if (downloadBtn) {
            downloadBtn.addEventListener('click', () => this.handleExport());
        }
    }

    /**
     * Handle filter change
     */
    handleFilterChange(filter) {
        this.currentFilter = filter;

        // Update filter button states
        const filterBtns = this.modalEl.querySelectorAll('.export-modal__filter-btn');
        filterBtns.forEach(btn => {
            if (btn.dataset.filter === filter) {
                btn.classList.add('export-modal__filter-btn--active');
            } else {
                btn.classList.remove('export-modal__filter-btn--active');
            }
        });

        // Re-render format cards
        const formatsGrid = this.modalEl.querySelector('#exportFormatsGrid');
        if (formatsGrid) {
            formatsGrid.innerHTML = this.renderFormatCards();
        }

        // Clear current selection
        this.selectedFormat = null;
        this.updateDownloadButton();
    }

    /**
     * Handle format selection
     */
    handleFormatSelection(formatKey) {
        this.selectedFormat = formatKey;

        // Update card selection states
        const cards = this.modalEl.querySelectorAll('.export-modal__format-card');
        cards.forEach(card => {
            if (card.dataset.format === formatKey) {
                card.classList.add('export-modal__format-card--selected');
            } else {
                card.classList.remove('export-modal__format-card--selected');
            }
        });

        this.updateDownloadButton();
    }

    /**
     * Set the current filter and update display
     */
    setFilter(filter) {
        this.currentFilter = filter;

        // Update filter button states
        const filterButtons = this.modalEl.querySelectorAll('.export-modal__filter-btn');
        filterButtons.forEach(btn => {
            if (btn.dataset.filter === filter) {
                btn.classList.add('export-modal__filter-btn--active');
            } else {
                btn.classList.remove('export-modal__filter-btn--active');
            }
        });

        // Re-render format cards
        const formatsGrid = this.modalEl.querySelector('#exportFormatsGrid');
        if (formatsGrid) {
            formatsGrid.innerHTML = this.renderFormatCards();

            // Re-attach event listeners to new cards
            this._attachFormatCardListeners();
        }

        // Reset selection if current format not in filtered list
        const filteredFormats = this.getFilteredFormats();
        if (this.selectedFormat && !filteredFormats[this.selectedFormat]) {
            this.selectedFormat = null;
            this.updateDownloadButton();
        }
    }

    /**
     * Select a format
     */
    selectFormat(formatId) {
        this.selectedFormat = formatId;

        // Update visual selection state
        const formatCards = this.modalEl.querySelectorAll('.export-modal__format-card');
        formatCards.forEach(card => {
            if (card.dataset.format === formatId) {
                card.classList.add('export-modal__format-card--selected');
                const selectBtn = card.querySelector('.export-modal__select-btn');
                if (selectBtn) {
                    selectBtn.textContent = 'Selected';
                }
            } else {
                card.classList.remove('export-modal__format-card--selected');
                const selectBtn = card.querySelector('.export-modal__select-btn');
                if (selectBtn) {
                    selectBtn.textContent = 'Select Format';
                }
            }
        });

        this.updateDownloadButton();
    }

    /**
     * Attach event listeners to format cards (used after re-rendering)
     */
    _attachFormatCardListeners() {
        const formatCards = this.modalEl.querySelectorAll('.export-modal__format-card');
        formatCards.forEach(card => {
            card.addEventListener('click', () => {
                const formatId = card.dataset.format;
                this.selectFormat(formatId);
            });
        });
    }

    /**
     * Update download button state
     */
    updateDownloadButton() {
        const downloadBtn = this.modalEl.querySelector('#exportDownloadBtn');
        if (downloadBtn) {
            downloadBtn.disabled = !this.selectedFormat;

            if (this.selectedFormat) {
                const format = this.exportFormats[this.selectedFormat];
                downloadBtn.innerHTML = `
                    <i class="fas fa-download"></i>
                    Export as ${format.name}
                `;
            } else {
                downloadBtn.innerHTML = `
                    <i class="fas fa-download"></i>
                    Export Selected Format
                `;
            }
        }
    }

    /**
     * Handle export action
     */
    async handleExport() {
        if (!this.selectedFormat) {
            this.errorModal.show({
                title: "No Format Selected",
                message: "Please select an export format before proceeding."
            });
            return;
        }

        try {
            this.lockButtons();
            this.showLoadingState();

            // Prepare export parameters
            const exportParams = {
                document_id: this.documentId,
                project_id: this.projectId,
                format_type: this.selectedFormat,
                export_name: `Questions_Export_${new Date().toISOString().split('T')[0]}`
            };

            // Include group_id if we're exporting from a specific topic
            if (this.currentGroupId) {
                exportParams.group_id = this.currentGroupId;
            }

            console.log('[ExportModal] Starting export with params:', exportParams);

            // Call export API
            const result = await exportQuestionsAnswers(exportParams);

            console.log('[ExportModal] Export successful:', result);

            // Open download URL in new tab
            if (result.download_url) {
                window.open(result.download_url, '_blank');
            }

            // Show success message
            const format = this.exportFormats[this.selectedFormat];
            this.messageModal.show({
                title: "Export Successful",
                message: `Your questions have been exported as ${format.name}. The download should start automatically.`
            });

            // Close the modal
            this.hide();

        } catch (error) {
            console.error('[ExportModal] Export failed:', error);

            this.errorModal.show({
                title: "Export Failed",
                message: error.message || "An error occurred while exporting your data. Please try again."
            });
        } finally {
            this.unlockButtons();
            this.hideLoadingState();
        }
    }

    /**
     * Show loading state during export
     */
    showLoadingState() {
        const downloadBtn = this.modalEl.querySelector('#exportDownloadBtn');
        if (downloadBtn) {
            downloadBtn.innerHTML = `
                <i class="fas fa-spinner fa-spin"></i>
                Generating Export...
            `;
        }

        // Disable format selection during export
        const cards = this.modalEl.querySelectorAll('.export-modal__format-card');
        cards.forEach(card => {
            card.style.pointerEvents = 'none';
            card.style.opacity = '0.6';
        });
    }

    /**
     * Hide loading state
     */
    hideLoadingState() {
        // Re-enable format selection
        const cards = this.modalEl.querySelectorAll('.export-modal__format-card');
        cards.forEach(card => {
            card.style.pointerEvents = '';
            card.style.opacity = '';
        });

        this.updateDownloadButton();
    }

    /**
     * Build the DOM elements for the modal
     */
    _buildDOM() {
        // Create overlay if it doesn't exist
        if (!this.overlayEl) {
            this._buildOverlay();
        }

        // Create the modal element
        this.modalEl = document.createElement("div");
        this.modalEl.className = "modal modal--form export-modal";
        this.modalEl.style.display = "none";

        // Add the modal to the DOM
        document.body.appendChild(this.modalEl);

        // Set up event listeners
        this._setupEventListeners();
    }

    /**
     * Set up event listeners for the modal
     */
    _setupEventListeners() {
        // Close button and cancel button event listeners
        this.modalEl.addEventListener('click', (event) => {
            if (event.target.classList.contains('modal__close') || event.target.id === 'exportCancelBtn') {
                this.hide();
            }
        });

        // Overlay click to close
        if (this.overlayEl) {
            this.overlayEl.addEventListener('click', () => this.hide());
        }

        // Escape key to close
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && this.modalEl && this.modalEl.style.display === 'block') {
                this.hide();
            }
        });
    }

    /**
     * Set up event listeners for content after it's rendered
     */
    _setupContentEventListeners() {
        // Filter button listeners
        const filterButtons = this.modalEl.querySelectorAll('.export-modal__filter-btn');
        filterButtons.forEach(btn => {
            btn.addEventListener('click', (event) => {
                const filter = event.target.dataset.filter;
                this.setFilter(filter);
            });
        });

        // Format card listeners
        this._attachFormatCardListeners();

        // Download button listener
        const downloadBtn = this.modalEl.querySelector('#exportDownloadBtn');
        if (downloadBtn) {
            downloadBtn.addEventListener('click', () => {
                if (!downloadBtn.disabled && this.selectedFormat) {
                    this.handleExport();
                }
            });
        }
    }

    /**
     * Clean up when modal is hidden
     */
    hide() {
        // Reset state
        this.selectedFormat = null;
        this.currentFilter = 'all';

        super.hide();
    }
}
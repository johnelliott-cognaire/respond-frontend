// ui/components/docitemimport/step-select-method.js

// Define constant event names
const EVENTS = {
    ENABLE_NEXT: 'import-wizard:enable-next',
    UPLOAD_PROGRESS: 'import-wizard:upload-progress',
    IMPORT_COMPLETE: 'import-wizard:import-complete'
};

/**
 * First step of the question import wizard - method selection
 * Allows the user to choose between Excel import or text paste
 */
export class StepSelectMethod {
    /**
     * Create a new method selection step
     * @param {Object} options - Configuration options
     * @param {Function} options.onNext - Callback when step is completed
     * @param {Function} options.onError - Callback to display errors
     */
    constructor(options = {}) {
        this.onNext = options.onNext || (() => {});
        this.onError = options.onError || console.error;
        this.messageModal = options.messageModal || (window.MessageModal ? new window.MessageModal() : null);
        
        this.domContainer = null;
        this.selectedMethod = 'excel'; // Default to Excel import
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
        stepContent.className = 'import-step import-step-select-method';
        
        // Add step title and description
        const titleEl = document.createElement('h3');
        titleEl.textContent = 'Select Import Method';
        stepContent.appendChild(titleEl);
        
        const descriptionEl = document.createElement('p');
        descriptionEl.textContent = 'Choose how you want to import questions into your document.';
        stepContent.appendChild(descriptionEl);
        
        // Create method options
        const methodsContainer = document.createElement('div');
        methodsContainer.className = 'import-methods-container';
        
        // Excel import option
        const excelOption = this._createMethodOption({
            icon: 'fas fa-file-excel',
            title: 'Import from Excel',
            description: 'Upload an Excel spreadsheet or CSV file containing questions',
            method: 'excel'
        });
        methodsContainer.appendChild(excelOption);
        
        // Paste text option
        const textOption = this._createMethodOption({
            icon: 'fas fa-paste',
            title: 'Paste Text',
            description: 'Paste a block of text containing questions to be extracted',
            method: 'text'
        });
        methodsContainer.appendChild(textOption);
        
        stepContent.appendChild(methodsContainer);
        container.appendChild(stepContent);
        
        // Set default selection
        this._handleMethodSelection('excel');
    }
    
    /**
     * Create a method option element
     * @param {Object} options - Option configuration
     * @returns {HTMLElement} - The option element
     */
    _createMethodOption(options) {
        const option = document.createElement('div');
        option.className = `import-method-option ${this.selectedMethod === options.method ? 'selected' : ''}`;
        option.dataset.method = options.method;
        
        const iconEl = document.createElement('div');
        iconEl.className = 'method-icon';
        iconEl.innerHTML = `<i class="${options.icon}"></i>`;
        option.appendChild(iconEl);
        
        const contentEl = document.createElement('div');
        contentEl.className = 'method-content';
        
        const titleEl = document.createElement('div');
        titleEl.className = 'method-title';
        titleEl.textContent = options.title;
        contentEl.appendChild(titleEl);
        
        const descriptionEl = document.createElement('div');
        descriptionEl.className = 'method-description';
        descriptionEl.textContent = options.description;
        contentEl.appendChild(descriptionEl);
        
        option.appendChild(contentEl);
        
        // Make entire option clickable
        option.addEventListener('click', () => {
            this._handleMethodSelection(options.method);
        });
        
        return option;
    }
    
    /**
     * Handle method selection
     * @param {string} method - The selected method
     */
    _handleMethodSelection(method) {
        this.selectedMethod = method;
        
        // Update UI to show selected method
        const options = this.domContainer.querySelectorAll('.import-method-option');
        options.forEach(option => {
            if (option.dataset.method === method) {
                option.classList.add('selected');
            } else {
                option.classList.remove('selected');
            }
        });
        
        // Enable Next button
        const enableNextEvent = new CustomEvent(EVENTS.ENABLE_NEXT, {
            bubbles: true,
            detail: { enabled: true }
        });
        this.domContainer.dispatchEvent(enableNextEvent);
    }
    
    /**
     * Check if step can proceed
     * @returns {boolean} - Whether the step can proceed
     */
    canProceed() {
        return this.selectedMethod !== null;
    }
    
    /**
     * Handle proceeding to next step
     */
    proceed() {
        if (!this.canProceed()) return;
        
        // Call onNext with the selected method
        this.onNext({
            method: this.selectedMethod
        });
    }
}

export default StepSelectMethod;
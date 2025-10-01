// ui/components/corpusimport/step-select-method.js

// Define constant event names
const EVENTS = {
    ENABLE_NEXT: 'import-wizard:enable-next',
    UPLOAD_PROGRESS: 'import-wizard:upload-progress',
    IMPORT_COMPLETE: 'import-wizard:import-complete'
};


/**
 * First step of the import wizard - method selection
 * Allows the user to choose between text entry, file upload, or AI read (disabled)
 */
export class StepSelectMethod {
    constructor(options = {}) {
        this.onNext = options.onNext || (() => {});
        this.onError = options.onError || console.error;
        this.messageModal = options.messageModal || (window.MessageModal ? new window.MessageModal() : null);
        
        this.domContainer = null;
        this.selectedMethod = 'excel'; // Default to Excel import
    }
    
    render(container) {
        this.domContainer = container;
        container.innerHTML = '';
        
        const stepContent = document.createElement('div');
        stepContent.className = 'import-step import-step-select-method';
        
        const titleEl = document.createElement('h3');
        titleEl.textContent = 'Select Import Method';
        stepContent.appendChild(titleEl);
        
        const descriptionEl = document.createElement('p');
        descriptionEl.textContent = 'Choose how you want to add content to the corpus.';
        stepContent.appendChild(descriptionEl);
        
        const methodsContainer = document.createElement('div');
        methodsContainer.className = 'import-methods-container';
        
        // Text entry option
        const textMethodOption = this._createMethodOption({
            icon: 'fas fa-pen-alt',
            title: 'Enter Text',
            description: 'Write or paste text content directly',
            method: 'text'
        });
        methodsContainer.appendChild(textMethodOption);
        
        // File upload option
        const fileMethodOption = this._createMethodOption({
            icon: 'fas fa-file-upload',
            title: 'Upload File',
            description: 'Upload a document from your computer',
            method: 'file'
        });
        methodsContainer.appendChild(fileMethodOption);
        
        // AI Read option has been removed
        
        stepContent.appendChild(methodsContainer);
        container.appendChild(stepContent);
    }
    
    _createMethodOption(options) {
        const option = document.createElement('div');
        option.className = `import-method-option ${this.selectedMethod === options.method ? 'selected' : ''}`;
        option.dataset.method = options.method;
        
        const iconEl = document.createElement('div');
        iconEl.className = 'method-icon';
        iconEl.innerHTML = `<i class="${options.icon}"></i>`;
        option.appendChild(iconEl);
        
        const titleEl = document.createElement('div');
        titleEl.className = 'method-title';
        titleEl.textContent = options.title;
        option.appendChild(titleEl);
        
        const descriptionEl = document.createElement('div');
        descriptionEl.className = 'method-description';
        descriptionEl.textContent = options.description;
        option.appendChild(descriptionEl);
        
        // Make entire option clickable (no Select button)
        option.addEventListener('click', () => this._handleMethodSelection(options.method));
        
        return option;
    }
    
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
        
        // Notify wizard to update Next button state
        this._notifyWizard();
    }

    _notifyWizard() {
        if (window.currentImportWizard && 
            typeof window.currentImportWizard._updateNextButtonState === 'function') {
            window.currentImportWizard._updateNextButtonState();
        }
    }

    canProceed(showErrors = false) {
        if (this.selectedMethod === null) {
            if (showErrors) {
                this.onError('Please select an import method to continue.');
            }
            return false;
        }
        return true;
    }
    
    proceed() {
        if (!this.canProceed(true)) return;
        
        // Call onNext with the selected method
        this.onNext({
            method: this.selectedMethod
        });
    }
    
    reset() {
        this.selectedMethod = null;
        
        // Update UI if already rendered
        if (this.domContainer) {
            const methodOptions = this.domContainer.querySelectorAll('.import-method-option');
            methodOptions.forEach(opt => {
                opt.classList.remove('selected');
            });
        }
        
        this._notifyWizard();
    }
}

export default StepSelectMethod;
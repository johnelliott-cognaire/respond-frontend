// ui/components/analysis-lm-form-generator.js
import { ErrorModal } from "../modals/error-modal.js";
import { MessageModal } from "../modals/message-modal.js";
import { uploadFile } from "../../api/files.js";
import { StatusIndicator } from "./status-indicator.js";
import {
  renderAnalysisResults,
  getAnalysisLMResultsContainerId
} from "../../utils/analysis-lm-utils.js";

/**
 * AnalysisLM Form Generator
 * 
 * Responsible for generating and handling forms based on AnalysisLM process configurations.
 * This module replicates all legacy DocChain form-generation capabilities.
 */
export class AnalysisLMFormGenerator {
  /**
   * Constructor
   * @param {object} framework - The parent AnalysisLM framework instance.
   */
  constructor(framework) {
    console.log("[AnalysisLMFormGenerator] constructor called");
    this.framework = framework;
    this.formContainer = null;
    this.errorModal = new ErrorModal();
    this.messageModal = new MessageModal();
    this.inputFields = [];
    this.runButton = null;
    this.disabledReason = null;
    this.uploadedFiles = {}; // Track uploaded files by input name
    this.inputTimeouts = new Map(); // Track timeouts per input element
    this.fieldsDirtyFlags = new Map(); // Track which fields have been modified during current editing session

    // Bind methods so that 'this' is preserved in callbacks
    this._handleFormSubmit = this._handleFormSubmit.bind(this);
    this.setFormState = this.setFormState.bind(this);
    this.updateStatusIndicator = this.updateStatusIndicator.bind(this);
    this._handleFileSelection = this._handleFileSelection.bind(this);
    this.markDirty = this.markDirty.bind(this);
    this._handleFileDrop = this._handleFileDrop.bind(this);
    this._handleDragOver = this._handleDragOver.bind(this);
    this._handleDragLeave = this._handleDragLeave.bind(this);
  }

  /**
   * Render the form based on the provided configuration.
   * The generated form is wrapped in a container with class "analysis-lm-form-container" for styling.
   * @param {HTMLElement} container - The container element to render the form in.
   * @param {object} config - The process configuration.
   */
  renderForm(container, config) {
    console.log("[AnalysisLMFormGenerator] renderForm() called");
    
    // Clean up any existing timeouts from previous renders
    this.inputTimeouts.forEach((timeout, element) => {
      clearTimeout(timeout);
    });
    this.inputTimeouts.clear();
    
    this.formContainer = container;
    this.processConfig = config;
    this._buildDOM();
    this._attachEventListeners();
    this._initializeUILibraries();
  }

  /**
   * Build the DOM structure for the form.
   * @private
   */
  _buildDOM() {
    if (!this.formContainer || !this.processConfig) {
      console.error("[AnalysisLMFormGenerator] Cannot build DOM without container or config");
      return;
    }

    let containerHtml = `<div class="analysis-lm-form-container">`;
    let formHtml = `<form id="analysis-lm-form" class="analysis-lm-form" novalidate>`;

    // --- External Parameters ---
    if (this.processConfig.external_parameters && Object.keys(this.processConfig.external_parameters).length > 0) {
      formHtml += '<h3>External Parameters</h3>';
      formHtml += '<div class="external-parameters-section">';
      for (const [key, value] of Object.entries(this.processConfig.external_parameters)) {
        const description = this._regexToDescription(value);
        const isMandatory = value.startsWith('^') && value.endsWith('$');
        
        // Check if we have saved data for this parameter first
        const stageId = this.framework.stageId;
        const savedValue = this.framework.docTaskInstance?.stageData?.[stageId]?.external_inputs?.[key];
        const defaultValue = savedValue || this.processConfig.external_default_values?.[key] || '';
        formHtml += `
        <div class="form-group parameter-input">
          <label for="${key}">
            ${this.framework.prettifyInputName(key)}${isMandatory ? ' <span class="required-asterisk">*</span>' : ''} (${description}):
          </label>
      `;
        if (value === '^\\d{4}-\\d{2}-\\d{2}$') {
          const initialValue = defaultValue || new Date().toISOString().split('T')[0];
          formHtml += `<input type="text" id="${key}" name="${key}" class="flatpickr-input" data-regex="${value}" value="${initialValue}" ${isMandatory ? 'required' : ''}>`;
        } else if (value === '^\\d{4}$') {
          const currentYear = new Date().getFullYear();
          const startYear = currentYear - 13;
          const endYear = currentYear + 2;
          formHtml += `
          <select id="${key}" name="${key}" ${isMandatory ? 'required' : ''}>
            ${Array.from({ length: endYear - startYear + 1 }, (_, i) => endYear - i)
              .map(year =>
                `<option value="${year}"${(defaultValue && defaultValue === year.toString()) || (!defaultValue && year === currentYear) ? ' selected' : ''}>${year}</option>`
              ).join('')}
          </select>
        `;
        } else {
          formHtml += `<input type="text" id="${key}" name="${key}" pattern="${value}" value="${defaultValue}" ${isMandatory ? 'required' : ''}>`;
        }
        formHtml += `</div>`;
      }
      formHtml += '</div>';
    }

    // --- External Inputs (Textareas) ---
    formHtml += '<h3>External Context and Information</h3>';
    const uniqueExternalInputs = this._getUniqueExternalInputs();
    
    uniqueExternalInputs.forEach(input => {
      const mapping = this.processConfig.corpus_question_population_mapping?.[input];
      const hasMapping = !!mapping;
      
      // Check if we have saved data for this input first
      const stageId = this.framework.stageId;
      const savedValue = this.framework.docTaskInstance?.stageData?.[stageId]?.external_inputs?.[input];
      const defaultValue = savedValue || this.processConfig.external_default_values?.[input] || '';
      
      let minRows = 3;
      if (defaultValue) {
        const newlineCount = (defaultValue.match(/\n/g) || []).length + 1;
        minRows = Math.max(minRows, newlineCount);
      }
      const pixelsPerRow = 14 * 1.2;
      const baseHeight = hasMapping ? 200 : 100;
      const calculatedHeight = Math.max(baseHeight, minRows * pixelsPerRow + 25);
      const textareaHeight = `${calculatedHeight}px`;
      formHtml += `
      <div class="form-group">
        <div class="input-label-container">
          <label for="${input}">${this.framework.prettifyInputName(input)}:</label>
          ${hasMapping ? `
            <span class="collapsible-label filter-trigger" data-input-key="${input}">
              ${mapping.label_for_action}
              <i class="fas fa-chevron-down"></i>
            </span>
          ` : ''}
        </div>
        <textarea id="${input}" name="${input}" required style="height: ${textareaHeight};">${defaultValue}</textarea>
      </div>
    `;
    });

    // --- File Upload Fields with Enhanced UI ---
    // Now use the stageId consistently via this.framework.stageId.
    const stageId = this.framework.stageId;
    const existingUploadedFiles = this.framework.docTaskInstance?.stageData?.[stageId]?.uploadedFiles || {};

    if (this.processConfig.process_steps && this.processConfig.process_steps.length > 0) {
      const s3Objects = this.processConfig.process_steps.flatMap(step => step.external_inputs_s3_objects || []);
      const uniqueS3Objects = [...new Set(s3Objects)];
      if (uniqueS3Objects.length > 0) {
        formHtml += '<h3>File Uploads</h3>';
        formHtml += '<div class="file-uploads-section">';
        uniqueS3Objects.forEach(s3Object => {
          const isMultiSelect = s3Object.endsWith('*');
          const inputName = isMultiSelect ? s3Object.slice(0, -1) : s3Object;
          const hasExistingFiles = existingUploadedFiles[inputName] &&
            existingUploadedFiles[inputName].length > 0 &&
            existingUploadedFiles[inputName].some(f => f.s3_uri);
          formHtml += `
          <div class="form-group">
            <label for="${inputName}">${this.framework.prettifyInputName(inputName)}:</label>
            <div id="${inputName}-upload-area" class="file-upload-area ${hasExistingFiles ? 'has-files' : ''}" 
                 data-input-name="${inputName}" data-multi="${isMultiSelect ? 'true' : 'false'}">
              <div class="upload-instructions">
                <i class="fas fa-cloud-upload-alt"></i>
                <p>${hasExistingFiles ?
              `${existingUploadedFiles[inputName].length} file(s) already uploaded. Drag & drop to replace or click browse.` :
              'Drag & drop files here or <span class="browse-text">browse</span>'}</p>
                <p class="file-requirements">
                  ${isMultiSelect ? 'You can select multiple files' : 'Select a file'} 
                  ${this._getFileTypeHint(inputName)}
                </p>
              </div>
              <input type="file" id="${inputName}" name="${inputName}" class="file-input-hidden" 
                     ${isMultiSelect ? 'multiple' : ''} ${hasExistingFiles ? '' : 'required'} 
                     data-has-existing-files="${hasExistingFiles}">
            </div>
            <div class="selected-files-container">
              <ul id="${inputName}-list" class="file-list"></ul>
            </div>
          </div>
        `;
        });

        formHtml += '</div>';
      }
    }

    // --- Add Status and Controls section separately, after the form fields ---
    formHtml += `
    <div class="status-and-controls">
      <div class="note-text">
        <!-- The StatusIndicator component will be inserted here -->
        <div id="status-indicator-placeholder"></div>
      </div>
      <div class="button-group">
        <button type="submit" class="btn primary" id="run-analysis-btn">Run Analysis</button>
      </div>
      <div class="disabled-reason" id="disabled-reason-text" style="display: none; color: #888; font-style: italic; margin-top: 5px;"></div>
    </div>
  `;

    formHtml += `</form>`;
    containerHtml += formHtml + `</div>`;

    this.formContainer.innerHTML = containerHtml;
    this.form = this.formContainer.querySelector('#analysis-lm-form');

    // Always create our own StatusIndicator for job progress
    // This ensures we have the progress bar and job status display
    this.statusIndicator = new StatusIndicator();
    const placeholderEl = this.form.querySelector('#status-indicator-placeholder');
    if (placeholderEl) {
      placeholderEl.replaceWith(this.statusIndicator.getElement());
    }
    console.log('[AnalysisLMFormGenerator] Created status indicator with progress bar');

    this.runButton = this.form.querySelector('#run-analysis-btn');
    this.disabledReasonText = this.form.querySelector('#disabled-reason-text');
    this.inputFields = Array.from(this.form.querySelectorAll('input, select, textarea'));

    if (this.framework.docTaskInstance && !this.framework.docTaskInstance.isSaved) {
      this.disableRunButton("Save document first before running analysis");
    } else if (this.framework.docTaskInstance && this.framework.docTaskInstance.isSaved) {
      this.enableRunButton();
    }

    this._restoreUploadedFiles();

    this._restoreFormValuesFromStageData();
  }

  /**
   * Auto-aggregate unique external inputs from process steps if not explicitly defined
   * @returns {Array} - Array of unique external input names
   * @private
   */
  _getUniqueExternalInputs() {
    // If explicitly defined, use that
    if (this.processConfig.unique_external_inputs && Array.isArray(this.processConfig.unique_external_inputs)) {
      return this.processConfig.unique_external_inputs;
    }

    // Otherwise, aggregate from process steps
    const allExternalInputs = new Set();

    if (this.processConfig.process_steps && Array.isArray(this.processConfig.process_steps)) {
      this.processConfig.process_steps.forEach(step => {
        if (step.external_inputs && Array.isArray(step.external_inputs)) {
          step.external_inputs.forEach(input => {
            if (typeof input === 'string' && input.trim()) {
              allExternalInputs.add(input.trim());
            }
          });
        }
      });
    }

    const uniqueInputs = Array.from(allExternalInputs);

    if (uniqueInputs.length === 0) {
      console.warn("[AnalysisLMFormGenerator] No external_inputs found in process steps");
    } else {
      console.log("[AnalysisLMFormGenerator] Auto-aggregated external inputs from process steps:", uniqueInputs);
    }

    return uniqueInputs;
  }

  /**
   * Restore any uploaded files from document storage.
   * @private
   */
  _restoreUploadedFiles() {
    if (!this.framework.docTaskInstance || !this.framework.docTaskInstance.stageData) {
      return;
    }
    const stageId = this.framework.stageId;
    if (this.framework.docTaskInstance.stageData[stageId] &&
      this.framework.docTaskInstance.stageData[stageId].uploadedFiles) {

      const savedFiles = this.framework.docTaskInstance.stageData[stageId].uploadedFiles;

      Object.entries(savedFiles).forEach(([inputName, fileInfoList]) => {
        const fileList = this.form.querySelector(`#${inputName}-list`);
        if (!fileList) return;
        const fileInput = this.form.querySelector(`input[name="${inputName}"]`);

        if (fileInput && fileInfoList && fileInfoList.length > 0) {
          fileInput.removeAttribute('required');
          fileInput.dataset.hasExistingFiles = "true";

          const uploadArea = fileInput.closest('.file-upload-area');
          if (uploadArea) {
            uploadArea.classList.add('has-files');
          }
        }

        if (!this.uploadedFiles[inputName]) {
          this.uploadedFiles[inputName] = [];
        }

        fileInfoList.forEach(fileInfo => {
          const existingFileIndex = this.uploadedFiles[inputName].findIndex(f =>
            f.name === fileInfo.name && f.size === fileInfo.size);

          if (existingFileIndex === -1) {
            this.uploadedFiles[inputName].push({
              name: fileInfo.name,
              size: fileInfo.size,
              type: fileInfo.type,
              s3_uri: fileInfo.s3_uri || null
            });
            this._renderFileListItem(fileList, inputName, fileInfo);
          }
        });

        if (fileInput && fileInfoList.length > 0) {
          const uploadArea = fileInput.closest('.file-upload-area');
          if (uploadArea) {
            uploadArea.classList.add('has-files');
            const instructions = uploadArea.querySelector('.upload-instructions p:first-child');
            if (instructions) {
              instructions.textContent = `${fileInfoList.length} file(s) selected. Drag & drop to replace or click browse.`;
            }
          }
        }
      });

      console.log(`[AnalysisLMFormGenerator] Restored uploaded files for stage ${stageId}:`, this.uploadedFiles);
    }
  }

  /**
   * Handle form submission with improved validation for files.
   * @param {Event} event - The submit event.
   * @private
   */
  async _handleFormSubmit(event) {
    console.log('[AnalysisLMFormGenerator] Form submitted');
    event.preventDefault();

    if (this.runButton && this.runButton.disabled) {
      this.messageModal.show({
        title: "Action Not Available",
        message: this.disabledReason || "Please save the document before running analysis."
      });
      return;
    }

    if (!localStorage.getItem('authToken')) {
      this.messageModal.show({
        title: "Login Required",
        message: "Please log in to run the analysis."
      });
      return;
    }

    try {
      if (this.framework.docTaskInstance && this.framework.docTaskInstance.jobId) {
        const continueWithNewJob = await this.framework.checkForExistingJob();
        if (!continueWithNewJob) {
          console.log('[AnalysisLMFormGenerator] Using existing job results, skipping upload');
          return;
        }
      }

      const externalInputs = {};
      const externalParameters = {};

      if (this.processConfig.external_parameters) {
        for (const [key, pattern] of Object.entries(this.processConfig.external_parameters)) {
          const element = this.form.elements[key];
          if (element) {
            const value = element.value.trim();
            const regex = new RegExp(pattern);
            if (!regex.test(value)) {
              this.messageModal.show({
                title: "Validation Error",
                message: `Invalid value for ${this.framework.prettifyInputName(key)}. Please check the input and try again.`
              });
              return;
            }
            externalParameters[key] = value;
          }
        }
      }

      const uniqueExternalInputs = this.processConfig.unique_external_inputs || [];
      uniqueExternalInputs.forEach(input => {
        const element = this.form.elements[input];
        if (element && element.tagName === 'TEXTAREA') {
          const value = element.value.trim();
          if (!value) {
            this.messageModal.show({
              title: "Validation Error",
              message: `Please fill in the ${this.framework.prettifyInputName(input)} field.`
            });
            return;
          }
          externalInputs[input] = value;
        }
      });

      const stageId = this.framework.stageId; // Use the consistent stageId
      const storedStageData = this.framework.docTaskInstance.stageData?.[stageId] || {};
      const storedFiles = storedStageData.uploadedFiles || {};

      const fileInputs = this.form.querySelectorAll('input[type="file"]');
      const externalInputsS3Objects = {};
      const existingS3Uris = {};

      if (fileInputs.length > 0) {
        let validationError = false;

        for (const input of fileInputs) {
          const inputName = input.name;
          const isRequired = input.hasAttribute('required');

          const hasInputFiles = input.files && input.files.length > 0;
          const hasTrackedFiles = this.uploadedFiles[inputName] && this.uploadedFiles[inputName].length > 0;
          const hasStoredFiles = storedFiles[inputName] && storedFiles[inputName].length > 0;

          console.log(`[AnalysisLMFormGenerator] Checking files for ${inputName}: inputFiles=${hasInputFiles}, tracked=${hasTrackedFiles}, stored=${hasStoredFiles}, required=${isRequired}`);

          if (hasInputFiles) {
            const filesToUpload = Array.from(input.files);
            externalInputsS3Objects[inputName] = filesToUpload;
            console.log(`[AnalysisLMFormGenerator] Will upload ${filesToUpload.length} new files for ${inputName}`);
          }

          if (hasTrackedFiles) {
            const filesToUpload = this.uploadedFiles[inputName]
              .filter(fileInfo => fileInfo.file && !fileInfo.s3_uri)
              .map(fileInfo => fileInfo.file);

            const existingUris = this.uploadedFiles[inputName]
              .filter(fileInfo => fileInfo.s3_uri)
              .map(fileInfo => fileInfo.s3_uri);

            if (filesToUpload.length > 0) {
              if (!externalInputsS3Objects[inputName]) {
                externalInputsS3Objects[inputName] = [];
              }
              externalInputsS3Objects[inputName].push(...filesToUpload);
            }

            if (existingUris.length > 0) {
              existingS3Uris[inputName] = existingUris;
            }
          }

          if (hasStoredFiles) {
            const storedFilesWithoutUri = storedFiles[inputName].filter(f => !f.s3_uri);
            const storedFilesWithUri = storedFiles[inputName].filter(f => f.s3_uri);

            if (storedFilesWithUri.length > 0) {
              if (!existingS3Uris[inputName]) {
                existingS3Uris[inputName] = [];
              }
              existingS3Uris[inputName].push(...storedFilesWithUri.map(f => f.s3_uri));
            }

            if (storedFilesWithoutUri.length > 0 &&
              !hasInputFiles &&
              !externalInputsS3Objects[inputName] &&
              !existingS3Uris[inputName]) {

              const filenamesWithoutUri = storedFilesWithoutUri.map(f => f.name).join(", ");

              this.messageModal.show({
                title: "File Upload Required",
                message: `Due to browser security restrictions, the file(s) '${filenamesWithoutUri}' need to be uploaded again for ${this.framework.prettifyInputName(inputName)}. Please reselect the file(s).`
              });
              validationError = true;
              break;
            }
          }

          if (isRequired &&
            !externalInputsS3Objects[inputName]?.length &&
            !existingS3Uris[inputName]?.length) {
            this.messageModal.show({
              title: "Validation Error",
              message: `Please select at least one file for ${this.framework.prettifyInputName(inputName)}.`
            });
            validationError = true;
            break;
          }
        }

        if (validationError) {
          return;
        }
      }

      let uploadedUrls = { ...existingS3Uris };

      if (Object.keys(externalInputsS3Objects).length > 0) {
        try {
          this.setFormState(true);
          this.updateStatusIndicator('PROCESSING', null, null, 'Uploading files...');

          for (const [inputName, files] of Object.entries(externalInputsS3Objects)) {
            if (!uploadedUrls[inputName]) {
              uploadedUrls[inputName] = [];
            }

            for (const file of files) {
              try {
                const { s3_uri } = await uploadFile(file);
                uploadedUrls[inputName].push(s3_uri);

                let fileInfo;

                if (this.uploadedFiles[inputName]) {
                  const existingIndex = this.uploadedFiles[inputName].findIndex(f =>
                    f.file === file || (f.name === file.name && f.size === file.size)
                  );

                  if (existingIndex !== -1) {
                    fileInfo = this.uploadedFiles[inputName][existingIndex];
                    fileInfo.s3_uri = s3_uri;
                  } else {
                    fileInfo = {
                      name: file.name,
                      size: file.size,
                      type: file.type,
                      s3_uri: s3_uri
                    };
                    this.uploadedFiles[inputName].push(fileInfo);
                  }
                } else {
                  this.uploadedFiles[inputName] = [{
                    name: file.name,
                    size: file.size,
                    type: file.type,
                    s3_uri: s3_uri
                  }];
                  fileInfo = this.uploadedFiles[inputName][0];
                }

                if (this.framework.docTaskInstance) {
                  if (!this.framework.docTaskInstance.stageData) {
                    this.framework.docTaskInstance.stageData = {};
                  }

                  if (!this.framework.docTaskInstance.stageData[stageId]) {
                    this.framework.docTaskInstance.stageData[stageId] = {};
                  }

                  if (!this.framework.docTaskInstance.stageData[stageId].uploadedFiles) {
                    this.framework.docTaskInstance.stageData[stageId].uploadedFiles = {};
                  }

                  if (!this.framework.docTaskInstance.stageData[stageId].uploadedFiles[inputName]) {
                    this.framework.docTaskInstance.stageData[stageId].uploadedFiles[inputName] = [];
                  }

                  const storedFileIndex = this.framework.docTaskInstance.stageData[stageId].uploadedFiles[inputName]
                    .findIndex(f => f.name === file.name && f.size === file.size);

                  if (storedFileIndex !== -1) {
                    this.framework.docTaskInstance.stageData[stageId].uploadedFiles[inputName][storedFileIndex].s3_uri = s3_uri;
                  } else {
                    this.framework.docTaskInstance.stageData[stageId].uploadedFiles[inputName].push({
                      name: file.name,
                      size: file.size,
                      type: file.type,
                      s3_uri: s3_uri
                    });
                  }

                  this.framework.docTaskInstance.isDirty = true;

                  if (window.tabManager) {
                    window.tabManager.persistTabs();
                  }
                }
              } catch (error) {
                console.error(`[AnalysisLMFormGenerator] Failed to upload ${file.name}:`, error);
                throw new Error(`Failed to upload ${file.name}: ${error.message}`);
              }
            }
          }
        } catch (error) {
          console.error('[AnalysisLMFormGenerator] Error uploading files:', error);
          this.setFormState(false);
          this.updateStatusIndicator('FAILED');
          this.messageModal.show({
            title: "Upload Error",
            message: error.message || "Failed to upload files. Please try again."
          });
          return;
        }
      }

      // Use the consistent stageId when starting the process
      const jobParentStageId = this.framework.stageId;

      console.log(`[AnalysisLMFormGenerator] Starting process with ${Object.keys(uploadedUrls).length} file inputs:`, uploadedUrls);
      await this.framework.startProcess({
        externalInputs,
        uploadedUrls,
        externalParameters,
        jobParentStageId
      });

    } catch (error) {
      console.error('[AnalysisLMFormGenerator] Error submitting form:', error);
      this.messageModal.show({
        title: "Error",
        message: error.message || "An error occurred while processing your request."
      });
      this.updateStatusIndicator('FAILED');
      this.setFormState(false);
    }
  }

  /**
   * Helper method to get file type hint.
   * @param {string} inputName - The input name.
   * @returns {string} - A hint about file types.
   * @private
   */
  _getFileTypeHint(inputName) {
    if (inputName.toLowerCase().includes('csv')) {
      return '(CSV files recommended)';
    } else if (inputName.toLowerCase().includes('excel') || inputName.toLowerCase().includes('xls')) {
      return '(Excel files recommended)';
    } else if (inputName.toLowerCase().includes('image') || inputName.toLowerCase().includes('photo')) {
      return '(Images only)';
    } else if (inputName.toLowerCase().includes('pdf')) {
      return '(PDF files only)';
    }
    return '';
  }

  /**
   * Disable the Run Analysis button with a reason.
   * @param {string} reason - Reason for disabling.
   */
  disableRunButton(reason) {
    if (this.runButton) {
      this.runButton.disabled = true;
      this.disabledReason = reason;

      if (this.disabledReasonText) {
        this.disabledReasonText.textContent = reason;
        this.disabledReasonText.style.display = "block";
      }

      console.log(`[AnalysisLMFormGenerator] Run Analysis button disabled: ${reason}`);
    }
  }

  /**
   * Enable the Run Analysis button.
   */
  enableRunButton() {
    if (this.runButton) {
      this.runButton.disabled = false;
      this.disabledReason = null;

      if (this.disabledReasonText) {
        this.disabledReasonText.style.display = "none";
      }

      console.log("[AnalysisLMFormGenerator] Run Analysis button enabled");
    }
  }

  /**
   * Event handler for document save completion.
   */
  handleDocumentSaved() {
    console.log("[AnalysisLMFormGenerator] Document saved notification received");
    if (this.runButton) {
      this.enableRunButton();
    }
  }

  /**
   * Attach event listeners to form elements.
   * @private
   */
  _attachEventListeners() {
    if (!this.form) return;
    this.form.addEventListener('submit', (event) => this._handleFormSubmit(event));

    const filterTriggers = this.form.querySelectorAll('.filter-trigger');
    filterTriggers.forEach(trigger => {
      trigger.addEventListener('click', () => {
        const inputKey = trigger.dataset.inputKey;
        if (inputKey) {
          if (this.framework.corpusFilterModal) {
            this.framework.corpusFilterModal.show(inputKey);
          } else {
            console.warn("Warning: corpusFilterModal is not defined in the framework.");
          }
        }
      });
    });

    const uploadAreas = this.form.querySelectorAll('.file-upload-area');
    uploadAreas.forEach(area => {
      area.addEventListener('dragover', this._handleDragOver);
      area.addEventListener('dragleave', this._handleDragLeave);
      area.addEventListener('drop', this._handleFileDrop);

      const fileInput = area.querySelector('input[type="file"]');
      const browseText = area.querySelector('.browse-text');

      if (fileInput) {
        fileInput.addEventListener('change', this._handleFileSelection);
      }

      if (browseText && fileInput) {
        browseText.addEventListener('click', (e) => {
          e.stopPropagation();
          fileInput.click();
        });
      }
    });

    this.inputFields.forEach(el => {
      if (el.tagName === 'TEXTAREA') {
        // For textareas, save when user stops typing (blur) or pauses typing
        el.addEventListener('blur', (event) => {
          console.log(`[AnalysisLMFormGenerator] 🔥 BLUR EVENT FIRED for ${el.name}`, {
            elementType: el.tagName,
            elementName: el.name,
            elementValue: el.value?.substring(0, 50) + '...',
            relatedTarget: event.relatedTarget?.tagName || 'none'
          });
          
          // Clear any pending timeout since we're saving immediately
          const existingTimeout = this.inputTimeouts.get(el);
          if (existingTimeout) {
            console.log(`[AnalysisLMFormGenerator] Clearing existing timeout for ${el.name}`);
            clearTimeout(existingTimeout);
            this.inputTimeouts.delete(el);
          }
          
          // Check if this field was modified during the current editing session
          const wasFieldDirty = this.fieldsDirtyFlags.get(el.name) || false;
          console.log(`[AnalysisLMFormGenerator] Field dirty flag for ${el.name}: ${wasFieldDirty}`);
          
          // Also do the value comparison for additional logging
          const hasChanged = this._saveInputValueToStageData(el);
          console.log(`[AnalysisLMFormGenerator] Value changed check result for ${el.name}: ${hasChanged}`);
          
          // Trigger auto-save if field was dirty during this session (even if value matches now)
          if (wasFieldDirty || hasChanged) {
            console.log(`[AnalysisLMFormGenerator] 🚀 TRIGGERING IMMEDIATE AUTO-SAVE from blur event for ${el.name} (wasFieldDirty: ${wasFieldDirty}, hasChanged: ${hasChanged})`);
            
            // Check if status indicator exists
            const statusEl = document.querySelector('#saveStatusIndicator');
            console.log(`[AnalysisLMFormGenerator] Status indicator element found:`, statusEl ? 'YES' : 'NO');
            if (statusEl) {
              console.log(`[AnalysisLMFormGenerator] Current status indicator content:`, {
                innerHTML: statusEl.innerHTML,
                textContent: statusEl.textContent,
                className: statusEl.className
              });
            }
            
            this.markDirty();
            // Clear the dirty flag after triggering auto-save
            this.fieldsDirtyFlags.set(el.name, false);
          } else {
            console.log(`[AnalysisLMFormGenerator] ❌ No changes detected for ${el.name}, skipping auto-save`);
          }
        });
        
        // Auto-save after user pauses typing
        el.addEventListener('input', () => {
          // Update stageData immediately for local persistence, but debounce auto-save
          const hasChanged = this._saveInputValueToStageData(el);
          
          if (hasChanged) {
            // Mark this field as dirty for the current editing session
            this.fieldsDirtyFlags.set(el.name, true);
            console.log(`[AnalysisLMFormGenerator] 🟡 Field ${el.name} marked as dirty during input`);
            
            // Clear existing timeout for this specific element
            const existingTimeout = this.inputTimeouts.get(el);
            if (existingTimeout) {
              clearTimeout(existingTimeout);
            }
            
            // Trigger auto-save after 2 seconds of no typing (reduced from 4 seconds)
            const newTimeout = setTimeout(() => {
              console.log(`[AnalysisLMFormGenerator] Auto-save triggered after typing pause for ${el.name}`);
              this.markDirty();
              this.fieldsDirtyFlags.set(el.name, false); // Clear dirty flag after auto-save
              this.inputTimeouts.delete(el);
            }, 2000);
            
            this.inputTimeouts.set(el, newTimeout);
          }
        });
        
        // Save immediately on Enter key (common editing completion)
        el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            // Ctrl+Enter or Cmd+Enter = save immediately
            const existingTimeout = this.inputTimeouts.get(el);
            if (existingTimeout) {
              clearTimeout(existingTimeout);
              this.inputTimeouts.delete(el);
            }
            const wasFieldDirty = this.fieldsDirtyFlags.get(el.name) || false;
            const hasChanged = this._saveInputValueToStageData(el);
            if (wasFieldDirty || hasChanged) {
              console.log(`[AnalysisLMFormGenerator] Ctrl+Enter triggered auto-save for ${el.name}`);
              this.markDirty();
              this.fieldsDirtyFlags.set(el.name, false);
            }
          }
        });
        
      } else if (el.tagName === 'SELECT') {
        el.addEventListener('change', () => {
          const hasChanged = this._saveInputValueToStageData(el);
          if (hasChanged) {
            this.markDirty();
          }
        });
      } else if (el.tagName === 'INPUT') {
        if (el.type === 'checkbox' || el.type === 'radio') {
          el.addEventListener('change', () => {
            const hasChanged = this._saveInputValueToStageData(el);
            if (hasChanged) {
              this.markDirty();
            }
          });
        } else {
          // For text inputs, save on blur (when user leaves field)
          el.addEventListener('blur', () => {
            const hasChanged = this._saveInputValueToStageData(el);
            if (hasChanged) {
              this.markDirty();
            }
          });
          
          // For immediate local updates (without triggering auto-save)
          el.addEventListener('input', () => {
            this._saveInputValueToStageData(el);
            // Note: input event just updates stageData but doesn't trigger auto-save
            // Auto-save only happens on blur if there was a change
          });
        }
      }
    });
  }

  /**
   * Helper method to save an input's value directly to the stageData.
   * Only marks as dirty and triggers auto-save if the value actually changed.
   * @param {HTMLElement} element - The input element with the value to save.
   * @returns {boolean} - True if the value changed, false otherwise.
   * @private
   */
  _saveInputValueToStageData(element) {
    if (!this.framework.docTaskInstance || !element.name) return false;
    const stageId = this.framework.stageId;
    if (!this.framework.docTaskInstance.stageData) {
      this.framework.docTaskInstance.stageData = {};
    }

    if (!this.framework.docTaskInstance.stageData[stageId]) {
      this.framework.docTaskInstance.stageData[stageId] = {};
    }

    if (!this.framework.docTaskInstance.stageData[stageId].external_inputs) {
      this.framework.docTaskInstance.stageData[stageId].external_inputs = {};
    }

    // Get current value from form element
    let newValue;
    if (element.type === 'checkbox') {
      newValue = element.checked;
    } else if (element.type === 'radio') {
      if (!element.checked) return false;
      newValue = element.value;
    } else {
      newValue = element.value;
    }

    // Get existing value from stageData
    const existingValue = this.framework.docTaskInstance.stageData[stageId].external_inputs[element.name];
    
    // Check if value actually changed
    const hasChanged = existingValue !== newValue;
    
    console.log(`[AnalysisLMFormGenerator] 🔍 VALUE CHANGE CHECK for ${element.name}:`, {
      existingValue: existingValue,
      newValue: newValue,
      hasChanged: hasChanged,
      valuesEqual: existingValue === newValue,
      existingType: typeof existingValue,
      newType: typeof newValue
    });
    
    if (!hasChanged) {
      console.log(`[AnalysisLMFormGenerator] ❌ No change for ${element.name} (value: "${newValue}")`);
      return false;
    }

    // Value changed - update stageData
    this.framework.docTaskInstance.stageData[stageId].external_inputs[element.name] = newValue;

    console.log(`[AnalysisLMFormGenerator] ✅ Value changed for ${element.name} from "${existingValue}" to "${newValue}"`);

    // Note: Don't mark as dirty or trigger auto-save here
    // This is handled by the event handlers that call this method
    
    return true;
  }

  /**
   * Handle drag over event for file upload areas.
   * @param {DragEvent} event - The drag event.
   * @private
   */
  _handleDragOver(event) {
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.classList.contains('file-upload-area')) {
      event.currentTarget.classList.add('drag-over');
    }
  }

  /**
   * Handle drag leave event for file upload areas.
   * @param {DragEvent} event - The drag event.
   * @private
   */
  _handleDragLeave(event) {
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.classList.contains('file-upload-area')) {
      event.currentTarget.classList.remove('drag-over');
    }
  }

  /**
   * Handle file drop event for file upload areas.
   * @param {DragEvent} event - The drop event.
   * @private
   */
  _handleFileDrop(event) {
    event.preventDefault();
    event.stopPropagation();

    const uploadArea = event.currentTarget;
    uploadArea.classList.remove('drag-over');
    const inputName = uploadArea.dataset.inputName;
    const isMultiple = uploadArea.dataset.multi === 'true';

    const fileInput = uploadArea.querySelector('input[type="file"]');
    if (!fileInput) return;

    const droppedFiles = event.dataTransfer.files;
    if (!droppedFiles || droppedFiles.length === 0) return;

    if (!isMultiple && droppedFiles.length > 1) {
      this.messageModal.show({
        title: "Multiple Files Not Allowed",
        message: `Only one file can be uploaded for ${this.framework.prettifyInputName(inputName)}. Using the first file only.`
      });
    }

    const dt = new DataTransfer();

    if (isMultiple) {
      for (let i = 0; i < droppedFiles.length; i++) {
        dt.items.add(droppedFiles[i]);
      }
    } else {
      dt.items.add(droppedFiles[0]);
    }

    fileInput.files = dt.files;

    const changeEvent = new Event('change', { bubbles: true });
    fileInput.dispatchEvent(changeEvent);
  }

  /**
   * Initialize UI libraries like flatpickr.
   * @private
   */
  _initializeUILibraries() {
    if (window.flatpickr) {
      const flatpickrInputs = this.form.querySelectorAll('.flatpickr-input');
      flatpickrInputs.forEach(input => {
        window.flatpickr(input, {
          dateFormat: "Y-m-d",
          allowInput: true,
          onClose: (selectedDates, dateStr, instance) => {
            const regex = new RegExp(instance.input.dataset.regex);
            if (!regex.test(dateStr)) {
              instance.input.value = '';
              this.messageModal.show({
                title: "Invalid Input",
                message: 'Please enter a valid date in the format YYYY-MM-DD'
              });
            }
          }
        });
      });
    } else {
      console.warn('[AnalysisLMFormGenerator] flatpickr not available, date picker will not function');
    }
  }

  /**
   * Handle file selection for file inputs.
   * @param {Event} event - The change event.
   * @private
   */
  _handleFileSelection(event) {
    const fileInput = event.target;
    const inputName = fileInput.name;
    const fileList = this.form.querySelector(`#${inputName}-list`);
    if (!fileList) return;

    fileList.innerHTML = '';
    this.uploadedFiles[inputName] = [];

    Array.from(fileInput.files).forEach(file => {
      const fileInfo = {
        name: file.name,
        size: file.size,
        type: file.type,
        file: file
      };

      this.uploadedFiles[inputName].push(fileInfo);
      this._renderFileListItem(fileList, inputName, fileInfo);
    });

    this.markDirty();

    const stageId = this.framework.stageId;
    if (this.framework.docTaskInstance) {
      if (!this.framework.docTaskInstance.stageData) {
        this.framework.docTaskInstance.stageData = {};
      }

      if (!this.framework.docTaskInstance.stageData[stageId]) {
        this.framework.docTaskInstance.stageData[stageId] = {};
      }

      const storedFiles = {};

      Object.entries(this.uploadedFiles).forEach(([name, files]) => {
        storedFiles[name] = files.map(f => ({
          name: f.name,
          size: f.size,
          type: f.type
        }));
      });

      this.framework.docTaskInstance.stageData[stageId].uploadedFiles = storedFiles;
      this.framework.docTaskInstance.isDirty = true;

      if (window.tabManager) {
        window.tabManager.persistTabs();
      }

      console.log(`[AnalysisLMFormGenerator] Stored file metadata in stageData[${stageId}]`, storedFiles);
    }
  }

  /**
   * Render a file list item with better UI.
   * @param {HTMLElement} fileList - The file list element.
   * @param {string} inputName - The input name.
   * @param {object} fileInfo - File information object.
   * @private
   */
  _renderFileListItem(fileList, inputName, fileInfo) {
    const li = document.createElement('li');
    const formattedSize = this._formatFileSize(fileInfo.size || 0);
    const fileIcon = this._getFileIcon(fileInfo.type, fileInfo.name);

    li.innerHTML = `
      <div class="file-info">
        <span class="file-icon"><i class="${fileIcon}"></i></span>
        <span class="file-name" title="${fileInfo.name}">${fileInfo.name}</span>
        <span class="file-size">(${formattedSize})</span>
      </div>
      <span class="file-remove" title="Remove file"><i class="fas fa-times"></i></span>
    `;

    const removeBtn = li.querySelector('.file-remove');
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        li.remove();

        if (this.uploadedFiles[inputName]) {
          const index = this.uploadedFiles[inputName].findIndex(f => f.name === fileInfo.name);
          if (index !== -1) {
            this.uploadedFiles[inputName].splice(index, 1);
          }
        }

        const stageId = this.framework.stageId;
        if (this.framework.docTaskInstance &&
          this.framework.docTaskInstance.stageData &&
          this.framework.docTaskInstance.stageData[stageId] &&
          this.framework.docTaskInstance.stageData[stageId].uploadedFiles &&
          this.framework.docTaskInstance.stageData[stageId].uploadedFiles[inputName]) {

          const storedIndex = this.framework.docTaskInstance.stageData[stageId].uploadedFiles[inputName]
            .findIndex(f => f.name === fileInfo.name);

          if (storedIndex !== -1) {
            this.framework.docTaskInstance.stageData[stageId].uploadedFiles[inputName].splice(storedIndex, 1);
            this.framework.docTaskInstance.isDirty = true;

            if (window.tabManager) {
              window.tabManager.persistTabs();
            }
          }
        }
      });
    }

    fileList.appendChild(li);
  }

  /**
   * Format file size in human-readable format.
   * @param {number} size - Size in bytes.
   * @returns {string} - Formatted size.
   * @private
   */
  _formatFileSize(size) {
    if (size < 1024) {
      return `${size} B`;
    } else if (size < 1024 * 1024) {
      return `${(size / 1024).toFixed(1)} KB`;
    } else if (size < 1024 * 1024 * 1024) {
      return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    } else {
      return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    }
  }

  /**
   * Get appropriate icon class based on file type.
   * @param {string} mimeType - MIME type of the file.
   * @param {string} fileName - Name of the file.
   * @returns {string} - FontAwesome icon class.
   * @private
   */
  _getFileIcon(mimeType, fileName) {
    if (!mimeType && fileName) {
      const extension = fileName.split('.').pop().toLowerCase();

      if (['csv', 'xlsx', 'xls'].includes(extension)) {
        return 'fas fa-file-excel';
      } else if (['doc', 'docx'].includes(extension)) {
        return 'fas fa-file-word';
      } else if (['pdf'].includes(extension)) {
        return 'fas fa-file-pdf';
      } else if (['jpg', 'jpeg', 'png', 'gif', 'svg'].includes(extension)) {
        return 'fas fa-file-image';
      }
    }

    if (mimeType) {
      if (mimeType.startsWith('image/')) {
        return 'fas fa-file-image';
      } else if (mimeType.includes('spreadsheet') || mimeType.includes('csv') ||
        mimeType.includes('excel') || mimeType.includes('xls')) {
        return 'fas fa-file-excel';
      } else if (mimeType.includes('word') || mimeType.includes('document')) {
        return 'fas fa-file-word';
      } else if (mimeType.includes('pdf')) {
        return 'fas fa-file-pdf';
      } else if (mimeType.includes('zip') || mimeType.includes('compressed')) {
        return 'fas fa-file-archive';
      } else if (mimeType.includes('text/')) {
        return 'fas fa-file-alt';
      }
    }

    return 'fas fa-file';
  }

  /**
   * Set the form state (enabled/disabled).
   * @param {boolean} disabled - Whether to disable the form.
   */
  setFormState(disabled) {
    const savedState = this.framework.docTaskInstance && this.framework.docTaskInstance.isSaved;

    this.inputFields.forEach(element => {
      if (element.id !== "run-analysis-btn") {
        element.disabled = disabled;
        if (disabled) {
          element.classList.add('disabled');
        } else {
          element.classList.remove('disabled');
        }
      }
    });

    if (this.runButton) {
      this.runButton.disabled = disabled || !savedState;

      if (!savedState && !disabled) {
        this.disabledReason = "Save document first before running analysis";
        if (this.disabledReasonText) {
          this.disabledReasonText.textContent = this.disabledReason;
          this.disabledReasonText.style.display = "block";
        }
      } else if (disabled) {
        if (this.disabledReasonText) {
          this.disabledReasonText.style.display = "none";
        }
      }
    }

    const uploadAreas = this.form.querySelectorAll('.file-upload-area');
    uploadAreas.forEach(area => {
      if (disabled) {
        area.classList.add('disabled');
        area.style.pointerEvents = 'none';
        area.style.opacity = '0.7';
      } else {
        area.classList.remove('disabled');
        area.style.pointerEvents = 'auto';
        area.style.opacity = '1';
      }
    });

    const fileLists = this.form.querySelectorAll('.file-list');
    fileLists.forEach(list => {
      list.style.opacity = disabled ? '0.7' : '1';
      list.style.pointerEvents = disabled ? 'none' : 'auto';
    });
  }

  /**
   * Delegate status updates to the status component.
   * @param {string} status - The status to display.
   * @param {number} stepsCompleted - Number of completed steps.
   * @param {number} stepsTotal - Total number of steps.
   * @param {string} customText - Optional custom text to display.
   */
  updateStatusIndicator(status, stepsCompleted, stepsTotal, customText = null) {
    if (this.statusIndicator) {
      this.statusIndicator.update(status, stepsCompleted, stepsTotal, customText);
    }
  }

  /**
   * Build and return an object containing the current form values.
   * @returns {object} - The current form data.
   */
  buildFormData() {
    const externalParameters = {};
    if (this.processConfig.external_parameters) {
      Object.keys(this.processConfig.external_parameters).forEach(key => {
        const el = this.form.elements[key];
        if (el) externalParameters[key] = el.value.trim();
      });
    }

    const externalInputs = {};
    const uniqueExternalInputs = this._getUniqueExternalInputs();
    uniqueExternalInputs.forEach(input => {
      const el = this.form.elements[input];
      if (el) externalInputs[input] = el.value.trim();
    });

    return {
      external_parameters: externalParameters,
      external_inputs: externalInputs,
      uploadedFiles: this.uploadedFiles
    };
  }

  /**
   * Restore form values from stageData when the form is initially rendered.
   */
  _restoreFormValuesFromStageData() {
    if (!this.framework.docTaskInstance || !this.framework.docTaskInstance.stageData) {
      console.log(`[AnalysisLMFormGenerator] No stageData available for restoration`);
      return;
    }

    const stageId = this.framework.stageId;

    if (this.framework.docTaskInstance.stageData[stageId] &&
      this.framework.docTaskInstance.stageData[stageId].external_inputs) {

      const savedInputs = this.framework.docTaskInstance.stageData[stageId].external_inputs;
      console.log(`[AnalysisLMFormGenerator] Restoring ${Object.keys(savedInputs).length} saved inputs for stage ${stageId}:`, Object.keys(savedInputs));

      Object.entries(savedInputs).forEach(([name, value]) => {
        const element = this.form.elements[name];
        if (element) {
          if (element.type === 'file') {
            console.log(`[AnalysisLMFormGenerator] Skipping file input ${name} - cannot set value programmatically`);
            return;
          }

          // Check if the value is already correct (from HTML generation)
          const currentValue = element.type === 'checkbox' ? element.checked : element.value;
          if (currentValue === value || (element.type === 'checkbox' && !!currentValue === !!value)) {
            console.log(`[AnalysisLMFormGenerator] Value for ${name} already correct from HTML generation`);
            return;
          }

          if (element.type === 'checkbox') {
            element.checked = !!value;
          } else if (element.type === 'radio') {
            if (element.value === value) {
              element.checked = true;
            }
          } else {
            element.value = value;
          }

          console.log(`[AnalysisLMFormGenerator] Restored value for ${name} from stageData (override):`, value);
        } else {
          console.warn(`[AnalysisLMFormGenerator] Could not find form element for saved input: ${name}`);
        }
      });
    } else {
      console.log(`[AnalysisLMFormGenerator] No external_inputs found in stageData[${stageId}]`);
    }

    if (this.framework.docTaskInstance.stageData[stageId]) {
      const uniqueExternalInputs = this._getUniqueExternalInputs();

      uniqueExternalInputs.forEach(input => {
        if (this.framework.docTaskInstance.stageData[stageId][input] !== undefined) {
          const element = this.form.elements[input];
          if (element) {
            if (element.type === 'file') {
              console.log(`[AnalysisLMFormGenerator] Skipping file input ${input} - cannot set value programmatically`);
              return;
            }

            element.value = this.framework.docTaskInstance.stageData[stageId][input];
            console.log(`[AnalysisLMFormGenerator] Restored value for ${input} from stageData (legacy format)`);
          }
        }
      });
    }
  }

  /**
   * Marks the form as dirty, updates the docTaskInstance stageData, and persists the changes.
   */
  markDirty() {
    console.log(`[AnalysisLMFormGenerator] markDirty() called`);
    const formData = this.buildFormData();

    if (this.framework.docTaskInstance) {
      if (!this.framework.docTaskInstance.stageData) {
        this.framework.docTaskInstance.stageData = {};
      }

      const stageId = this.framework.stageId;

      if (!this.framework.docTaskInstance.stageData[stageId]) {
        this.framework.docTaskInstance.stageData[stageId] = {};
      }

      Object.assign(this.framework.docTaskInstance.stageData[stageId], formData);
      this.framework.docTaskInstance.isDirty = true;

      // Trigger auto-save through the framework if available
      if (this.framework && typeof this.framework.triggerAutoSave === 'function') {
        console.log(`[AnalysisLMFormGenerator] Triggering auto-save via framework.triggerAutoSave()`);
        this.framework.triggerAutoSave();
      } else if (this.framework.docTaskInstance.__internalSaveHook) {
        // Fallback: use internal save hook if available
        console.log(`[AnalysisLMFormGenerator] Triggering auto-save via __internalSaveHook`);
        this.framework.docTaskInstance.__internalSaveHook();
      } else if (window.tabManager) {
        // Last resort: direct tab persistence (legacy)
        console.log(`[AnalysisLMFormGenerator] Triggering auto-save via tabManager.persistTabs() (legacy)`);
        window.tabManager.persistTabs();
      } else {
        console.warn(`[AnalysisLMFormGenerator] No auto-save method available!`);
      }

      console.log(`[AnalysisLMFormGenerator] Updated stageData for ${stageId} via markDirty():`, {
        external_parameters: Object.keys(formData.external_parameters || {}),
        external_inputs: Object.keys(formData.external_inputs || {}),
        external_inputs_values: formData.external_inputs
      });
    }
  }

  /**
   * Convert a regex pattern to a human-readable description.
   * @param {string} regex - The regex pattern.
   * @returns {string} - A human-readable description.
   * @private
   */
  _regexToDescription(regex) {
    const patterns = [
      { pattern: '^\\d{4}-\\d{2}-\\d{2}$', desc: 'Date format: YYYY-MM-DD' },
      { pattern: '^\\d{4}$', desc: 'Year: YYYY' },
      { pattern: '^\\d+(\\.\\d{1,2})?$', desc: 'a monetary amount (whole numbers or up to 2 decimal places)' },
      { pattern: '^[A-Z]{3}$', desc: 'a three-letter currency code (e.g., USD)' },
      { pattern: '^\\d+$', desc: 'any number' },
      { pattern: '\\d{5}(?:-\\d{4})?', desc: 'US ZIP code: 5 digits or optionally 5+4 digits with hyphen' },
      { pattern: '(http|https):\\/\\/\\w+\\.\\w+', desc: 'Basic URL format' },
      { pattern: '\\+\\d{1,3}\\s\\d{10}', desc: 'International phone number format' },
      { pattern: '\\d{1,3}(\\.\\d{1,3}){3}', desc: 'IP address format (e.g., 192.168.1.1)' },
      { pattern: '\\d+', desc: 'one or more digits' },
      { pattern: '\\w+', desc: 'one or more alphanumeric characters' },
      { pattern: '^.*$', desc: 'any text' },
      { pattern: '.*', desc: 'any text' }
    ];
    const match = patterns.find(p => p.pattern === regex);
    if (match) {
      return match.desc;
    }
    return 'text pattern';
  }


  /**
   * Display the analysis results.
   * @param {object} results - The results to display.
   */
  displayResults(results) {
    if (!results) {
      console.error("[AnalysisLMFormGenerator] No results to display");
      return;
    }

    // We'll unify the logic:
    console.log("[AnalysisLMFormGenerator] displayResults => calling renderAnalysisResults()");

    const docId = this.framework.docTaskInstance?.documentId || this.framework.docTaskInstance?.compositeId;
    const stageId = this.framework.stageId;

    renderAnalysisResults({
      docId,
      stageId,
      results,
      parentEl: this.formContainer, // The place we want to show them
      debugLabel: "analysis-lm-form-generator"
    });
  }

  /**
   * Clean up resources and timeouts
   */
  destroy() {
    // Clear all pending input timeouts
    this.inputTimeouts.forEach((timeout, element) => {
      clearTimeout(timeout);
    });
    this.inputTimeouts.clear();
    
    console.log('[AnalysisLMFormGenerator] Cleaned up resources and timeouts');
  }
}

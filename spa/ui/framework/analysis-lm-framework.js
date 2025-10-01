// File: ui/framework/analysis-lm-framework.js

/**
 * AnalysisLM Framework
 *
 * Orchestrates the AnalysisLM process by:
 *  - Fetching/caching the process configuration
 *  - Rendering the input form (using AnalysisLMFormGenerator)
 *  - Starting the process (sending form data to backend)
 *  - Polling for job status updates
 *  - Displaying the generated results
 */

import { AnalysisLMFormGenerator } from "../components/analysis-lm-form-generator.js";
import { fetchProcessConfig, startProcess, getJobStatus, buildStartProcessPayload, extractLambdaRuntimeParameters } from "../../api/analysis-lm.js";
import { formatAnalysisLMResults } from "../../utils/analysis-lm-utils.js";
import { syncDocumentJobHistory, formatJobHistoryEntry } from "../../api/jobs.js";
import { YesNoModal } from "../modals/yesno-modal.js";
import { ErrorModal } from "../modals/error-modal.js";
import { updateDocument } from "../../api/documents.js";
import { JOB_STATUS } from "../../utils/job-status-utils.js";
import {
    renderAnalysisResults,
    getAnalysisLMResultsContainerId
} from "../../utils/analysis-lm-utils.js";
import formatHumanReadableDate from "../../utils/date-utils.js";

// Common short words used by prettifyInputName
const commonShortWords = [
    'a', 'i',
    'to', 'of', 'in', 'it', 'is', 'on', 'at', 'an', 'as', 'be', 'by',
    'he', 'we', 'or', 'do', 'if', 'my', 'me', 'up', 'so', 'no', 'go',
    'am', 'us', 'the', 'and', 'you', 'are', 'for', 'but', 'not', 'non', 'all',
    'any', 'can', 'had', 'her', 'was', 'one', 'our', 'out', 'day', 'get',
    'has', 'him', 'his', 'how', 'man', 'new', 'now', 'old', 'see', 'two',
    'way', 'who', 'win', 'gap'
];

class AnalysisLMFramework {
    /**
     * @param {object} store - Application store for data persistence.
     * @param {object} jobController - Controller for managing process jobs.
     * @param {object} docTaskInstance - The document task instance.
     */
    constructor(store, jobController, docTaskInstance) {
        this.store = store;
        this.jobController = jobController;
        this.docTaskInstance = docTaskInstance;
        this.container = null;
        this.processDefId = null;
        this.processConfig = null;
        this.currentJobId = null;
        this.currentJobDatetime = null;
        this.pollInterval = null;
        this.formGenerator = null;
        this.yesNoModal = new YesNoModal();
        this.errorModal = new ErrorModal();
        // stageId will be passed in via initialize() and used everywhere
        this.stageId = null;
    }

    /**
     * Initializes by fetching (or caching) the process config & rendering the form.
     */
    async initialize(container, processDefId, stageId) {
        this.container = container;
        this.processDefId = processDefId;
        this.stageId = stageId; // Now using the passed in stageId consistently
        try {
            const cacheKey = "analysisLMProcessDef_" + processDefId;
            const cached = localStorage.getItem(cacheKey);
            let useCache = false;

            if (cached) {
                const parsed = JSON.parse(cached);
                const now = Date.now();
                if (now - parsed.cachedAt < 24 * 60 * 60 * 1000) {
                    useCache = true;
                    this.processConfig = parsed.data;
                    console.log("[AnalysisLMFramework] Loaded process definition from cache");
                } else {
                    console.log("[AnalysisLMFramework] Cached process definition expired");
                }
            }
            if (!useCache) {
                this.processConfig = await fetchProcessConfig(processDefId);
                localStorage.setItem(
                    cacheKey,
                    JSON.stringify({ cachedAt: Date.now(), data: this.processConfig })
                );
                console.log("[AnalysisLMFramework] Fetched process definition from API and cached it");
            }

            // Enhanced validation with Lambda support
            this._validateProcessConfig(this.processConfig);

            // Log Lambda configuration if present
            if (this.processConfig.lambda_runtime_parameters) {
                const availableLambdaParams = extractLambdaRuntimeParameters(
                    this.docTaskInstance,
                    this.processConfig,
                    this.stageId
                );

                console.log("[AnalysisLMFramework] Lambda-enhanced process initialized:", {
                    processDefId,
                    requiredLambdaParams: this.processConfig.lambda_runtime_parameters,
                    availableLambdaParams: availableLambdaParams
                });
            }

            // Create & render the AnalysisLM form
            this.formGenerator = new AnalysisLMFormGenerator(this);
            this.formGenerator.renderForm(this.container, this.processConfig);

            // Disable "Run Analysis" if doc is not yet saved
            if (this.docTaskInstance && !this.docTaskInstance.isSaved) {
                this.formGenerator.disableRunButton("Save document first before running analysis");
            }

            // Attempt to restore job status from stageData using this.stageId
            await this.restoreJobsFromHistory();
        } catch (error) {
            console.error("Error initializing AnalysisLMFramework:", error);
            throw error;
        }
    }

    /**
     * Restore job status from stageData.jobHistory during initialization.
     */
    async restoreJobsFromHistory() {
        if (!this.docTaskInstance || !this.docTaskInstance.stageData) {
            console.log("[AnalysisLMFramework] No docTaskInstance or stageData to restore jobs from");
            return;
        }

        if (!this.docTaskInstance.stageData[this.stageId]) {
            console.log(`[AnalysisLMFramework] No stage data for stage ${this.stageId}`);
            return;
        }

        // Check if we have jobHistory for the current stage
        const jobHistory = this.docTaskInstance.stageData[this.stageId].jobHistory;
        if (!jobHistory || Object.keys(jobHistory).length === 0) {
            console.log(`[AnalysisLMFramework] No jobHistory found for stage ${this.stageId}`);
            return;
        }

        // Render the job history table in the UI if jobHistory exists
        const statusWrapperEl = document.querySelector(".note-text");
        if (statusWrapperEl) {
            const existingContainer = statusWrapperEl.querySelector("#job-history-container");
            if (existingContainer) {
                existingContainer.remove();
            }
            const historyTable = this._renderJobHistoryTable(jobHistory);
            statusWrapperEl.appendChild(historyTable);
        }

        // Find the most recent "root_" job to update the UI status indicator
        let mostRecentJob = null;
        let mostRecentTime = 0;
        Object.entries(jobHistory).forEach(([key, jobInfo]) => {
            if (key.startsWith('root_')) {
                const updatedTime = new Date(jobInfo.updated || jobInfo.created || 0).getTime();
                if (updatedTime > mostRecentTime) {
                    mostRecentTime = updatedTime;
                    mostRecentJob = jobInfo;
                }
            }
        });

        if (mostRecentJob) {
            console.log(`[AnalysisLMFramework] Found most recent job: ${mostRecentJob.jobId} with status ${mostRecentJob.status}`);

            this.currentJobId = mostRecentJob.jobId;
            this.currentJobDatetime = mostRecentJob.created || mostRecentJob.metadata?.created_datetime;

            if (mostRecentJob.status === 'RUNNING') {
                console.log(`[AnalysisLMFramework] Job ${mostRecentJob.jobId} is still RUNNING, resuming poll if needed`);
                if (this.jobController) {
                    const docId = this.docTaskInstance.documentId || this.docTaskInstance.compositeId;
                    await this.jobController.registerExistingJob({
                        request_type: "docchain",
                        process_def_id: mostRecentJob.process_def_id || this.processDefId,
                        analysis_lm_jid: mostRecentJob.jobId,
                        status: "RUNNING",
                        created_datetime: mostRecentJob.created,
                        stageId: this.stageId
                    }, docId);
                }
            }

            // Reflect job status in the form UI
            if (this.formGenerator) {
                this.formGenerator.updateStatusIndicator(
                    mostRecentJob.status,
                    mostRecentJob.steps_completed,
                    mostRecentJob.steps_total
                );
            }
        }
    }

    /**
     * Render a job history table from the provided jobHistory object.
     * The table contains columns for created, progress, steps, and who created the job.
     * Sorted descending by created date.
     * @param {object} jobHistory - The jobHistory object for the current stage.
     * @returns {HTMLElement} - A table element with the formatted job history.
     * @private
     */
    _renderJobHistoryTable(jobHistory) {
        // Convert the jobHistory object into an array
        const jobsArray = Object.values(jobHistory);
        // Sort jobs descending by the "created" datetime
        jobsArray.sort((a, b) => new Date(b.created) - new Date(a.created));

        // Create container element with data-table-container class for consistent styling
        const container = document.createElement("div");
        container.id = "job-history-container";
        container.style.cssText = `
            border: 1px solid var(--border-subtle);
            margin-top: 1rem;
            margin-bottom: 1rem;
            overflow-y: auto;
            max-height: 300px;
        `;

        // Create table element
        const table = document.createElement("table");
        table.id = "job-history-table";
        table.style.cssText = `
            border-collapse: collapse;
            width: 100%;
        `;

        // Create table header
        const thead = document.createElement("thead");
        const headerRow = document.createElement("tr");
        
        const headers = [
            { text: "Created", width: "25%" },
            { text: "Progress", width: "20%" },
            { text: "Status", width: "25%" },
            { text: "Created By", width: "30%" }
        ];
        
        headers.forEach(header => {
            const th = document.createElement("th");
            th.textContent = header.text;
            th.style.cssText = `
                width: ${header.width};
                text-align: left;
                padding: 10px;
                vertical-align: middle;
                background-color: var(--table-header-bg);
                color: var(--table-header-text);
                font-weight: bold;
                border-bottom: 2px solid var(--border-subtle);
            `;
            headerRow.appendChild(th);
        });
        
        thead.appendChild(headerRow);
        table.appendChild(thead);

        // Create table body
        const tbody = document.createElement("tbody");
        
        // Check if there are any jobs
        if (jobsArray.length === 0) {
            const emptyRow = document.createElement("tr");
            const emptyCell = document.createElement("td");
            emptyCell.colSpan = 4;
            emptyCell.className = "empty-placeholder";
            emptyCell.style.cssText = `
                text-align: center;
                padding: 20px;
                color: var(--text-secondary);
            `;
            emptyCell.textContent = "No job history found for this stage. The stage may be newly created or jobs are still being processed.";
            emptyRow.appendChild(emptyCell);
            tbody.appendChild(emptyRow);
        } else {
            jobsArray.forEach(job => {
                const row = document.createElement("tr");
                const createdDate = formatHumanReadableDate(job.created);
                const progressText = (job.progress !== undefined ? job.progress + "%" : "-");
                const stepsText = (job.steps_completed !== undefined && job.steps_total !== undefined) ?
                    `${job.steps_completed}/${job.steps_total}` : "";
                const statusText = job.status || "Unknown";
                const username = job.username || "Unknown";

                // Apply status styling
                let statusStyle = "";
                switch(statusText.toUpperCase()) {
                    case "COMPLETED":
                        statusStyle = "color: var(--status-success); font-weight: 500;";
                        break;
                    case "RUNNING":
                        statusStyle = "color: var(--status-info); font-weight: 500;";
                        break;
                    case "FAILED":
                        statusStyle = "color: var(--status-error); font-weight: 500;";
                        break;
                    case "CANCELLED":
                        statusStyle = "color: var(--text-secondary); font-weight: 500;";
                        break;
                    default:
                        statusStyle = "color: var(--text-secondary);";
                }

                // Create cells with proper styling
                const cells = [
                    { content: createdDate },
                    { 
                        content: `${progressText}${stepsText ? ` <span style="color: var(--text-secondary); font-size: 0.85em;">(${stepsText})</span>` : ''}`,
                        isHtml: true 
                    },
                    { content: statusText, style: statusStyle },
                    { content: username }
                ];

                cells.forEach(cellData => {
                    const td = document.createElement("td");
                    td.style.cssText = `
                        text-align: left;
                        padding: 10px;
                        vertical-align: middle;
                        ${cellData.style || ''}
                    `;
                    
                    if (cellData.isHtml) {
                        td.innerHTML = cellData.content;
                    } else {
                        td.textContent = cellData.content;
                    }
                    
                    row.appendChild(td);
                });

                tbody.appendChild(row);
            });
        }
        
        table.appendChild(tbody);
        container.appendChild(table);

        return container;
    }

    /**
     * Checks if an existing completed job is stored for this doc; prompt user if so.
     */
    async checkForExistingJob() {
        // Check stage-specific job history instead of document-level jobId
        const stageData = this.docTaskInstance.stageData?.[this.stageId];
        const jobHistory = stageData?.jobHistory;

        if (!jobHistory || Object.keys(jobHistory).length === 0) {
            console.log(`[AnalysisLMFramework] No existing jobs found for stage ${this.stageId} => starting new job`);
            return true;
        }

        // Find the most recent completed job for this specific stage
        const completedJobs = Object.values(jobHistory).filter(job =>
            job.status === 'COMPLETED' &&
            job.stageId === this.stageId
        );

        if (completedJobs.length === 0) {
            console.log(`[AnalysisLMFramework] No completed jobs found for stage ${this.stageId} => starting new job`);
            return true;
        }

        // Sort by creation time to get the most recent
        const mostRecentJob = completedJobs.sort((a, b) =>
            new Date(b.created) - new Date(a.created)
        )[0];

        console.log(`[AnalysisLMFramework] Found existing completed job for stage ${this.stageId}: ${mostRecentJob.jobId}`);

        try {
            const jobStatus = await getJobStatus(mostRecentJob.jobId, mostRecentJob.created);
            if (jobStatus.status === "COMPLETED") {
                return new Promise((resolve) => {
                    this.yesNoModal.show({
                        title: "Existing Job Found",
                        message: "A job has already been completed for this stage. Do you want to retrieve its results? (Choose No to re-run.)",
                        onYes: async () => {
                            console.log(`[AnalysisLMFramework] Using existing completed job results for stage ${this.stageId}`);
                            if (this.formGenerator) {
                                this.formGenerator.updateStatusIndicator("COMPLETED", jobStatus.analysis_lm_steps_completed, jobStatus.analysis_lm_steps_total);
                            }
                            this.currentJobId = mostRecentJob.jobId;
                            this.currentJobDatetime = mostRecentJob.created;

                            try {
                                let parsedResults = jobStatus.results;
                                if (typeof parsedResults === 'string') {
                                    try {
                                        parsedResults = JSON.parse(parsedResults);
                                    } catch (e) {
                                        console.warn("Could not parse existing job results as JSON:", e);
                                    }
                                }

                                // Update stage-specific data
                                if (!this.docTaskInstance.stageData[this.stageId]) {
                                    this.docTaskInstance.stageData[this.stageId] = {};
                                }
                                this.docTaskInstance.stageData[this.stageId].results = parsedResults;
                                this.docTaskInstance.stageData[this.stageId].status = "COMPLETED";

                                this.docTaskInstance.isDirty = true;
                                // Trigger auto-save for results update
                                this._triggerAutoSave();
                                if (window.tabManager) {
                                    window.tabManager.persistTabs();
                                }
                                console.log(`[AnalysisLMFramework] Stored results in stageData[${this.stageId}]`);
                                this._updateStatusIndicators("COMPLETED");
                                this.displayResults(parsedResults);
                                await this._updateDocumentJobHistory(this.currentJobId, this.currentJobDatetime, "COMPLETED");
                                await this._saveResultsToServer(parsedResults);
                            } catch (error) {
                                console.error(`[AnalysisLMFramework] Error retrieving job results for stage ${this.stageId}:`, error);
                                this.errorModal.show({
                                    title: "Error",
                                    message: `Failed to retrieve job results: ${error.message}`
                                });
                            }
                            resolve(false);
                        },
                        onNo: () => {
                            console.log(`[AnalysisLMFramework] User chose re-run for stage ${this.stageId} => start new job`);
                            // Clear existing results for this stage
                            if (this.docTaskInstance.stageData?.[this.stageId]) {
                                delete this.docTaskInstance.stageData[this.stageId].results;
                                this.docTaskInstance.stageData[this.stageId].status = "NOT_STARTED";
                                this.docTaskInstance.isDirty = true;
                                // Trigger auto-save for results clearing
                                this._triggerAutoSave();
                            }
                            resolve(true);
                        }
                    });
                });
            }
            return true;
        } catch (error) {
            console.warn(`[AnalysisLMFramework] Error checking existing job for stage ${this.stageId}:`, error);
            return true;
        }
    }

    /**
     * Save job results to the doc server
     */
    async _saveResultsToServer(results) {
        if (!this.docTaskInstance.documentId || !this.docTaskInstance.projectId) {
            console.warn("[AnalysisLMFramework] Cannot save results => missing doc or project ID");
            return;
        }
        try {
            console.log("[AnalysisLMFramework] Saving job results to server...");
            this.docTaskInstance.lastSavedAt = new Date().toISOString();

            const sanitized = JSON.parse(JSON.stringify(this.docTaskInstance, (key, value) => {
                if (['__parent', '__document', '__internalSaveHook', 'headerEl', 'footerEl', 'mainContentEl', 'formInstance'].includes(key)) {
                    return undefined;
                }
                return value;
            }));

            await updateDocument({
                document_id: this.docTaskInstance.documentId,
                project_id: this.docTaskInstance.projectId,
                title: this.docTaskInstance.title,
                document_data: sanitized
            });
            console.log("[AnalysisLMFramework] Successfully saved docTaskInstance to server");
            this._updateLastSavedDate();

            if (window.tabManager) {
                window.tabManager.persistTabs();
            }
        } catch (err) {
            console.error("[AnalysisLMFramework] Failed to save results:", err);
        }
    }

    _updateLastSavedDate() {
        const lastSavedEl = document.querySelector("#docLastSaved");
        if (lastSavedEl && this.docTaskInstance?.lastSavedAt) {
            lastSavedEl.textContent = new Date(this.docTaskInstance.lastSavedAt).toLocaleString();
            console.log("[AnalysisLMFramework] Updated Last Saved display in UI");
        }
    }

    /**
     * Start the analysis process by sending form data
     */
    async startProcess({ externalInputs, uploadedUrls, externalParameters, jobParentStageId }) {
        if (this.docTaskInstance && !this.docTaskInstance.isSaved) {
            this.errorModal.show({
                title: "Document Not Saved",
                message: "Please save before running analysis."
            });
            return;
        }

        try {
            // Build enhanced payload with Lambda runtime parameters
            const payload = buildStartProcessPayload({
                processDefId: this.processDefId,
                externalInputs: externalInputs,
                uploadedUrls: uploadedUrls,
                externalParameters: externalParameters,
                docTaskInstance: this.docTaskInstance,
                processConfig: this.processConfig,
                stageId: this.stageId
            });

            // Add stageId to payload for compatibility
            payload.stageId = this.stageId;

            // Log payload for debugging (excluding sensitive data)
            console.log("[AnalysisLMFramework] Starting process with payload:", {
                process_def_id: payload.process_def_id,
                external_inputs_keys: Object.keys(payload.external_inputs || {}),
                external_parameters_keys: Object.keys(payload.external_parameters || {}),
                lambda_runtime_parameters: payload.lambda_runtime_parameters,
                stageId: payload.stageId
            });

            if (this.formGenerator) {
                this.formGenerator.updateStatusIndicator('PROCESSING', null, null, 'Starting process...');
                this.formGenerator.setFormState(true);
            }

            const result = await startProcess(payload);
            const analysisLmJid = result.analysis_lm_jid;
            const analysisLmCreatedDatetime = result.analysis_lm_created_datetime;
            if (!analysisLmJid || !analysisLmCreatedDatetime) {
                throw new Error("Invalid job start: missing analysis_lm_jid or analysis_lm_created_datetime");
            }

            // Use the username from the API result if provided; otherwise, pull from localStorage.currentUser
            let jobUsername = "Unknown";
            if (result.username) {
                jobUsername = result.username;
            } else if (localStorage.currentUser && localStorage.currentUser.trim() !== "") {
                jobUsername = localStorage.currentUser;
            }

            this.currentJobId = analysisLmJid;
            this.currentJobDatetime = analysisLmCreatedDatetime;

            // Store job info with analysis_lm prefixed fields
            const stageId = this.stageId;
            if (!this.docTaskInstance.stageData) {
                this.docTaskInstance.stageData = {};
            }
            if (!this.docTaskInstance.stageData[this.stageId]) {
                this.docTaskInstance.stageData[this.stageId] = {};
            }
            if (!this.docTaskInstance.stageData[this.stageId].jobHistory) {
                this.docTaskInstance.stageData[this.stageId].jobHistory = {};
            }

            const jobKey = `root_${analysisLmJid}`;
            this.docTaskInstance.stageData[this.stageId].jobHistory[jobKey] = {
                jobId: analysisLmJid,
                stageId,
                jobType: "analysis-lm",
                status: "RUNNING",
                progress: 0,
                created: analysisLmCreatedDatetime,
                updated: new Date().toISOString(),
                process_def_id: this.processDefId,
                metadata: {
                    analysis_lm_created_datetime: analysisLmCreatedDatetime,
                    stageId,
                    // Store Lambda runtime parameters for reference
                    lambda_runtime_parameters: payload.lambda_runtime_parameters
                },
                username: jobUsername
            };

            this.docTaskInstance.jobId = analysisLmJid;
            this.docTaskInstance.jobDatetime = analysisLmCreatedDatetime;

            if (this.jobController) {
                const docId = this.docTaskInstance.documentId || this.docTaskInstance.compositeId;
                await this.jobController.registerExistingJob({
                    request_type: "analysis-lm",
                    process_def_id: this.processDefId,
                    analysis_lm_jid: analysisLmJid,
                    analysis_lm_created_datetime: analysisLmCreatedDatetime,
                    stageId,
                    meta: {
                        stageId,
                        lambda_runtime_parameters: payload.lambda_runtime_parameters
                    },
                    metadata: {
                        stageId,
                        lambda_runtime_parameters: payload.lambda_runtime_parameters
                    }
                }, docId);
                console.log(`[AnalysisLMFramework] Registered job ${analysisLmJid} (stage=${stageId}) with JobController`);
            }

            await this._updateDocumentJobHistory(analysisLmJid, analysisLmCreatedDatetime, "RUNNING");

            if (window.tabManager) {
                window.tabManager.persistTabs();
            }

            const pollMs = (result.analysis_lm_polling_interval || 5) * 1000;
            this._pollJobStatus(analysisLmJid, analysisLmCreatedDatetime, pollMs);

        } catch (err) {
            console.error("Error starting AnalysisLM process:", err);
            if (this.formGenerator) {
                this.formGenerator.updateStatusIndicator('FAILED', null, null, err.message);
                this.formGenerator.setFormState(false);
            }
            throw err;
        }
    }

    /**
     * Enhanced process configuration validation that checks for Lambda requirements
     */
    _validateProcessConfig(processConfig) {
        if (!processConfig) {
            throw new Error("Process configuration is required");
        }

        // Check if Lambda runtime parameters are required
        if (processConfig.lambda_runtime_parameters && Array.isArray(processConfig.lambda_runtime_parameters)) {
            console.log("[AnalysisLMFramework] Process requires Lambda runtime parameters:", processConfig.lambda_runtime_parameters);

            // Use the API function to check if parameters can be extracted
            const availableParams = extractLambdaRuntimeParameters(
                this.docTaskInstance,
                processConfig,
                this.stageId
            );

            const requiredParams = processConfig.lambda_runtime_parameters;
            const missingParams = requiredParams.filter(param => !availableParams[param]);

            if (missingParams.length > 0) {
                console.warn("[AnalysisLMFramework] Missing context for Lambda parameters:", missingParams);
                // Continue anyway - parameters might be available at runtime
            } else {
                console.log("[AnalysisLMFramework] All required Lambda parameters available:", availableParams);
            }
        }

        return true;
    }

    /**
     * Update the job in stageData by reading the job’s stored stageId
     */
    _updateJobInHistory(jobId, status, result = {}) {
        if (!this.docTaskInstance?.stageData) return;

        let foundStageId = null;
        Object.keys(this.docTaskInstance.stageData).forEach((sId) => {
            const jh = this.docTaskInstance.stageData[sId]?.jobHistory || {};
            const jobKey = `root_${jobId}`;
            if (jh[jobKey]) {
                foundStageId = jh[jobKey].stageId || sId;
            }
        });
        if (!foundStageId) {
            console.warn(`[AnalysisLMFramework] No stageId found for job ${jobId}, skipping status update`);
            return;
        }

        const jobKey = `root_${jobId}`;
        const jobHistory = this.docTaskInstance.stageData[foundStageId].jobHistory;
        if (!jobHistory || !jobHistory[jobKey]) {
            console.warn(`[AnalysisLMFramework] No jobHistory entry for ${jobId} in stage ${foundStageId}`);
            return;
        }

        const jobInfo = jobHistory[jobKey];
        jobInfo.status = status;
        jobInfo.updated = new Date().toISOString();
        if (!jobInfo.metadata) jobInfo.metadata = {};
        jobInfo.metadata.stageId = foundStageId;
        if (result.progress !== undefined) {
            jobInfo.progress = result.progress;
        }
        if (result.steps_completed !== undefined) {
            jobInfo.steps_completed = result.steps_completed;
        }
        if (result.steps_total !== undefined) {
            jobInfo.steps_total = result.steps_total;
        }
        if (status === 'COMPLETED' && result.results) {
            jobInfo.results = result.results;
        }

        console.log(`[AnalysisLMFramework] Updated job ${jobId} in stage ${foundStageId}: status=${status}`);

        if (this.docTaskInstance.__document?.updateStageBreadcrumbStatus) {
            this.docTaskInstance.__document.updateStageBreadcrumbStatus(foundStageId, status);
            console.log(`[AnalysisLMFramework] Updated breadcrumb for stage ${foundStageId} => ${status}`);
        }
    }

    /**
     * Sync job data to the server's job history
     */
    async _updateDocumentJobHistory(jobId, createdDatetime, status) {
        if (!this.docTaskInstance?.documentId) {
            console.log("[AnalysisLMFramework] no doc ID => skip job history update");
            return;
        }
        try {
            const docId = this.docTaskInstance.documentId;
            const projectId = this.docTaskInstance.projectId;

            let foundStageId = null;
            Object.keys(this.docTaskInstance.stageData).forEach((sid) => {
                const jobHistory = this.docTaskInstance.stageData[sid]?.jobHistory || {};
                const jKey = `root_${jobId}`;
                if (jobHistory[jKey]) {
                    foundStageId = sid;
                }
            });
            const finalStageId = foundStageId || "default_stage";

            const jobEntry = formatJobHistoryEntry(jobId, finalStageId, status, {
                created_datetime: createdDatetime,
                process_def_id: this.processDefId,
                stageId: finalStageId,
                metadata: {
                    stageId: finalStageId
                }
            });

            console.log(`[AnalysisLMFramework] Syncing job ${jobId} => doc ${docId}, stage=${finalStageId}`);

            await syncDocumentJobHistory({
                document_id: docId,
                project_id: projectId,
                new_jobs: [jobEntry],
                updated_jobs: []
            });

            console.log("[AnalysisLMFramework] Successfully updated job history in server doc");
        } catch (error) {
            console.error("[AnalysisLMFramework] Error updating doc job history:", error);
            this.errorModal.show({
                title: "Job History Update Warning",
                message: `Failed to update doc job history: ${error.message}. The job will continue.`
            });
        }
    }

    /**
     * Update the UI status indicators (but no forced currentStageIndex updates).
     */
    _updateStatusIndicators(status) {
        console.log(`[AnalysisLMFramework] Updating UI status indicators for ${status}`);

        if (this.docTaskInstance?.__parent?.refreshDocUIIndicatorsAggregateStatus) {
            this.docTaskInstance.__parent.refreshDocUIIndicatorsAggregateStatus();
        }

        if (window.tabManager?.updateDocStatus) {
            const docInstance = this.docTaskInstance.__parent || this.docTaskInstance;
            window.tabManager.updateDocStatus(docInstance, status);
            console.log(`[AnalysisLMFramework] Updated tab status => ${status}`);
        }

        const csi = this.docTaskInstance?.currentStageIndex || 0;
        const stageLink = document.querySelector(`.doc-stage-breadcrumb .stage-link:nth-child(${(csi * 2) + 1})`);
        if (stageLink) {
            ['running', 'completed', 'failed', 'cancelled'].forEach(cls => stageLink.classList.remove(cls));
            const statusClass = status.toLowerCase();
            if (['running', 'completed', 'failed', 'cancelled'].includes(statusClass)) {
                stageLink.classList.add(statusClass);
                console.log(`[AnalysisLMFramework] Marked current stage link => ${statusClass}`);
            }
        }
    }

    /**
     * Poll job status repeatedly.
     */
    _pollJobStatus(analysisLmJid, analysisLmCreatedDatetime, pollingInterval) {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
        }

        this.pollInterval = setInterval(async () => {
            try {
                const result = await getJobStatus(analysisLmJid, analysisLmCreatedDatetime);
                const upperCaseStatus = (result.status || "").toUpperCase();

                this._updateJobInHistory(analysisLmJid, upperCaseStatus, result);

                if (this.formGenerator) {
                    this.formGenerator.updateStatusIndicator(
                        upperCaseStatus,
                        result.analysis_lm_steps_completed,
                        result.analysis_lm_steps_total
                    );
                }

                if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(upperCaseStatus)) {
                    clearInterval(this.pollInterval);
                    this.pollInterval = null;

                    await this._updateDocumentJobHistory(analysisLmJid, analysisLmCreatedDatetime, upperCaseStatus);

                    await this.restoreJobsFromHistory();

                    if (upperCaseStatus === 'COMPLETED' && result.results) {
                        let parsedResults = result.results;
                        if (typeof parsedResults === 'string') {
                            try {
                                parsedResults = JSON.parse(parsedResults);
                            } catch (e) {
                                console.warn("[AnalysisLMFramework] Could not parse results as JSON:", e);
                            }
                        }

                        const foundStageId = this.stageId || 'default_stage';

                        if (!this.docTaskInstance.stageData[foundStageId]) {
                            this.docTaskInstance.stageData[foundStageId] = {};
                        }
                        this.docTaskInstance.stageData[foundStageId].results = parsedResults;
                        this.docTaskInstance.stageData[foundStageId].status = "COMPLETED";
                        this.docTaskInstance.isDirty = true;
                        // Trigger auto-save for poll results update
                        this._triggerAutoSave();

                        const stIndex = this.docTaskInstance.stages.findIndex(s => s.stageId === foundStageId);
                        if (stIndex >= 0) {
                            this.docTaskInstance.stages[stIndex].status = "COMPLETED";
                            console.log(`[AnalysisLMFramework] Updated docTaskInstance.stages[${stIndex}] => COMPLETED`);
                        }

                        if (window.tabManager) {
                            window.tabManager.persistTabs();
                        }

                        this._displayResultsForStage(foundStageId, parsedResults);

                        this.docTaskInstance.lastSavedAt = new Date().toISOString();
                        this._saveResultsToServer(parsedResults).catch(e => {
                            console.error("[AnalysisLMFramework] Error saving results after poll:", e);
                        });
                    }
                    else if (result.error_message) {
                        if (this.formGenerator) {
                            this.formGenerator.errorModal.show({
                                title: `Process ${upperCaseStatus.charAt(0) + upperCaseStatus.slice(1).toLowerCase()}`,
                                message: this._formatErrorMessage(result.error_message)
                            });
                        }
                    }

                    this.currentJobId = null;
                    this.currentJobDatetime = null;
                    if (this.formGenerator) {
                        this.formGenerator.setFormState(false);
                    }
                }
            } catch (error) {
                console.error("[AnalysisLMFramework] Polling error:", error);
                clearInterval(this.pollInterval);
                this.pollInterval = null;
                if (this.formGenerator) {
                    this.formGenerator.updateStatusIndicator('REQUEST_ERROR', null, null, error.message);
                    this.formGenerator.errorModal.show({
                        title: "Connection Error",
                        message: error.message
                    });
                    this.formGenerator.setFormState(false);
                }
            }
        }, pollingInterval);
    }

    /**
     * Show results for a given stageId container.
     */
    _displayResultsForStage(stageId, parsedResults) {
        console.log(`[AnalysisLMFramework] _displayResultsForStage => docId=${this.docTaskInstance.documentId}, stageId=${stageId}`);

        // If we have no container (meaning the user is not currently viewing this doc?), 
        // we can safely skip or find a parent container, but let's do:
        if (!this.container) {
            console.warn("[AnalysisLMFramework] No container in the analysis-lm-framework => skip UI render");
            return;
        }

        // Use the single function
        const docId = this.docTaskInstance.documentId || this.docTaskInstance.compositeId;

        renderAnalysisResults({
            docId,
            stageId,
            results: parsedResults,
            parentEl: this.container,
            debugLabel: "_displayResultsForStage"
        });

        // If you need to do any post-render steps, do them here
        if (this.onResultsDisplayed && typeof this.onResultsDisplayed === 'function') {
            this.onResultsDisplayed(parsedResults);
        }
    }

    /**
     * Optionally reflect partial in-progress state on the active stage link.
     */
    _updateStageStatusOnly(status) {
        console.log(`[AnalysisLMFramework] _updateStageStatusOnly => ${status}`);

        if (this.docTaskInstance?.__parent?.refreshDocUIIndicatorsAggregateStatus) {
            this.docTaskInstance.__parent.refreshDocUIIndicatorsAggregateStatus();
        }

        const csi = this.docTaskInstance?.currentStageIndex || 0;
        const stageLink = document.querySelector(`.doc-stage-breadcrumb .stage-link:nth-child(${(csi * 2) + 1})`);
        if (stageLink) {
            ['running', 'completed', 'failed', 'cancelled'].forEach(cls => stageLink.classList.remove(cls));
            const statusClass = status.toLowerCase();
            if (['running', 'completed', 'failed', 'cancelled'].includes(statusClass)) {
                stageLink.classList.add(statusClass);
                console.log(`[AnalysisLMFramework] Marked active stage link => ${statusClass}`);
            }
        }
    }

    /**
     * Format an error message for display.
     */
    _formatErrorMessage(msg) {
        if (!msg) return "Unknown error occurred";
        if (msg.length > 500) {
            try {
                if (msg.includes('AccessDeniedException') || msg.includes('error_message')) {
                    const matches = msg.match(/"error_message":\s*"([^"]+)"/);
                    if (matches && matches[1]) {
                        return `${matches[1]}\n\n(See console logs)`;
                    }
                    const svcMatches = msg.match(/"service_error_message":\s*"([^"]+)"/);
                    if (svcMatches && svcMatches[1]) {
                        return `${svcMatches[1]}\n\n(See console logs)`;
                    }
                }
                const firstPart = msg.split('.')[0];
                if (firstPart && firstPart.length > 20) {
                    return `${firstPart}.\n\n(See console logs)`;
                }
                return msg.substring(0, 300) + "...\n\n(See console logs)";
            } catch (e) {
                return msg.substring(0, 300) + "...\n\n(See console logs)";
            }
        }
        return msg;
    }

    /**
     * Display results in the current stage immediately (if needed).
     */
    displayResults(results) {
        console.log("[AnalysisLMFramework] displayResults called");
        if (!results) {
            console.error("[AnalysisLMFramework] No results to display");
            return;
        }
        // Note: Don't mark as dirty or trigger auto-save for displaying existing results
        // This is just a UI display operation, not a data change
        if (window.tabManager) {
            window.tabManager.persistTabs();
        }
        if (this.docTaskInstance.__parent?.triggerAutoSave) {
            this.docTaskInstance.__parent.triggerAutoSave();
        }

        // Also unify with the new helper
        const docId = this.docTaskInstance.documentId || this.docTaskInstance.compositeId;
        const stageId = this.stageId;

        renderAnalysisResults({
            docId,
            stageId,
            results,
            parentEl: this.container,
            debugLabel: "analysis-lm-framework:displayResults"
        });
    }


    /**
     * Convert something_like_this => Something Like THIS or shorter.
     */
    prettifyInputName(inputName) {
        return inputName
            .split('_')
            .map(word => {
                const lower = word.toLowerCase();
                if (lower.length <= 3) {
                    return commonShortWords.includes(lower) ? lower : lower.toUpperCase();
                }
                return word.charAt(0).toUpperCase() + word.slice(1);
            })
            .join(' ');
    }

    /**
     * Trigger auto-save for AnalysisLM results updates
     * Delegates to the document's auto-save system if available
     * @private
     */
    /**
     * Public method to trigger auto-save (called by form generator)
     */
    triggerAutoSave() {
        this._triggerAutoSave();
    }

    _triggerAutoSave() {
        try {
            // Look for auto-save capability in the document parent
            if (this.docTaskInstance.__parent && typeof this.docTaskInstance.__parent.triggerAutoSave === 'function') {
                console.log("[AnalysisLMFramework] Triggering auto-save via document parent");
                this.docTaskInstance.__parent.triggerAutoSave();
            } else if (this.docTaskInstance.__document && typeof this.docTaskInstance.__document.triggerAutoSave === 'function') {
                console.log("[AnalysisLMFramework] Triggering auto-save via document reference");
                this.docTaskInstance.__document.triggerAutoSave();
            } else {
                console.log("[AnalysisLMFramework] No auto-save method found - changes will be saved manually");
            }
        } catch (error) {
            console.error("[AnalysisLMFramework] Error triggering auto-save:", error);
        }
    }
}

export { AnalysisLMFramework };

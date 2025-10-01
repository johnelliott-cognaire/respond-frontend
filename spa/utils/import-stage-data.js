// utils/import-stage-data.js

/**
 * Utility functions for reading and writing import-related data to the document's stageData.
 * This provides consistent access to the import state stored in the document data structure.
 */

/**
 * Get the uploadedFiles data for the specified stage
 * @param {Object} docTaskInstance - The document task instance object
 * @param {string} stageId - The stage ID
 * @returns {Object} - Object containing uploadedFiles data, or empty object if not present
 */
export function getUploadedFiles(docTaskInstance, stageId) {
    if (!docTaskInstance?.stageData?.[stageId]?.uploadedFiles) {
        return {};
    }
    
    return docTaskInstance.stageData[stageId].uploadedFiles;
}

/**
 * Get an array of uploaded file objects
 * @param {Object} docTaskInstance - The document task instance object
 * @param {string} stageId - The stage ID
 * @returns {Array} - Array of file objects with metadata
 */
export function getUploadedFilesArray(docTaskInstance, stageId) {
    const uploadedFiles = getUploadedFiles(docTaskInstance, stageId);
    
    return Object.entries(uploadedFiles).map(([key, value]) => ({
        id: key,
        ...value
    }));
}

/**
 * Add a new uploaded file to stageData
 * @param {Object} docTaskInstance - The document task instance object
 * @param {string} stageId - The stage ID
 * @param {Object} fileData - File data object with metadata
 * @returns {string} - Generated file ID
 */
export function addUploadedFile(docTaskInstance, stageId, fileData) {
    if (!docTaskInstance.stageData) {
        docTaskInstance.stageData = {};
    }
    
    if (!docTaskInstance.stageData[stageId]) {
        docTaskInstance.stageData[stageId] = {};
    }
    
    if (!docTaskInstance.stageData[stageId].uploadedFiles) {
        docTaskInstance.stageData[stageId].uploadedFiles = {};
    }
    
    // Generate a sanitized file ID based on filename and timestamp
    const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/g, '');
    const sanitizedName = sanitizeFileName(fileData.name);
    const fileId = `${sanitizedName}_${timestamp}`;
    
    // Store the file data
    docTaskInstance.stageData[stageId].uploadedFiles[fileId] = {
        ...fileData,
        upload_datetime: new Date().toISOString()
    };
    
    return fileId;
}

/**
 * Update existing uploaded file data
 * @param {Object} docTaskInstance - The document task instance object
 * @param {string} stageId - The stage ID
 * @param {string} fileId - File ID to update
 * @param {Object} updates - Object with properties to update
 * @returns {boolean} - True if file was updated, false if file not found
 */
export function updateUploadedFile(docTaskInstance, stageId, fileId, updates) {
    if (!docTaskInstance?.stageData?.[stageId]?.uploadedFiles?.[fileId]) {
        return false;
    }
    
    // Update the file data
    docTaskInstance.stageData[stageId].uploadedFiles[fileId] = {
        ...docTaskInstance.stageData[stageId].uploadedFiles[fileId],
        ...updates
    };
    
    return true;
}

/**
 * Remove an uploaded file from stageData
 * @param {Object} docTaskInstance - The document task instance object
 * @param {string} stageId - The stage ID
 * @param {string} fileId - File ID to remove
 * @returns {boolean} - True if file was removed, false if file not found
 */
export function removeUploadedFile(docTaskInstance, stageId, fileId) {
    if (!docTaskInstance?.stageData?.[stageId]?.uploadedFiles?.[fileId]) {
        return false;
    }
    
    delete docTaskInstance.stageData[stageId].uploadedFiles[fileId];
    return true;
}

/**
 * Get the imported questions summary
 * @param {Object} docTaskInstance - The document task instance object
 * @param {string} stageId - The stage ID
 * @returns {Object} - Object containing import statistics
 */
export function getImportSummary(docTaskInstance, stageId) {
    if (!docTaskInstance?.stageData?.[stageId]?.importSummary) {
        return {
            totalFiles: 0,
            totalWorksheets: 0,
            totalQuestionsImported: 0,
            totalFailures: 0,
            lastImportDate: null
        };
    }
    
    return docTaskInstance.stageData[stageId].importSummary;
}

/**
 * Update the import summary data
 * @param {Object} docTaskInstance - The document task instance object
 * @param {string} stageId - The stage ID
 * @param {Object} summaryData - Summary data to update
 */
export function updateImportSummary(docTaskInstance, stageId, summaryData) {
    if (!docTaskInstance.stageData) {
        docTaskInstance.stageData = {};
    }
    
    if (!docTaskInstance.stageData[stageId]) {
        docTaskInstance.stageData[stageId] = {};
    }
    
    // Create or update summary
    docTaskInstance.stageData[stageId].importSummary = {
        ...getImportSummary(docTaskInstance, stageId),
        ...summaryData,
        lastUpdateDate: new Date().toISOString()
    };
}

/**
 * Initialize stage data for a new document
 * @param {Object} docTaskInstance - The document task instance object
 * @param {string} stageId - The stage ID
 */
export function initializeStageData(docTaskInstance, stageId) {
    if (!docTaskInstance.stageData) {
        docTaskInstance.stageData = {};
    }
    
    if (!docTaskInstance.stageData[stageId]) {
        docTaskInstance.stageData[stageId] = {};
    }
    
    // Initialize with default values
    docTaskInstance.stageData[stageId] = {
        ...docTaskInstance.stageData[stageId],
        status: docTaskInstance.stageData[stageId].status || 'NOT_STARTED',
        uploadedFiles: docTaskInstance.stageData[stageId].uploadedFiles || {},
        importSummary: docTaskInstance.stageData[stageId].importSummary || {
            totalFiles: 0,
            totalWorksheets: 0,
            totalQuestionsImported: 0,
            totalFailures: 0,
            lastImportDate: null
        }
    };
}

/**
 * Update stage status
 * @param {Object} docTaskInstance - The document task instance object
 * @param {string} stageId - The stage ID
 * @param {string} status - New status value
 */
export function updateStageStatus(docTaskInstance, stageId, status) {
    if (!docTaskInstance.stageData) {
        docTaskInstance.stageData = {};
    }
    
    if (!docTaskInstance.stageData[stageId]) {
        docTaskInstance.stageData[stageId] = {};
    }
    
    docTaskInstance.stageData[stageId].status = status;

    // Also update in the stages array if it exists
    if (docTaskInstance.stages && Array.isArray(docTaskInstance.stages)) {
        const stageIndex = docTaskInstance.stages.findIndex(stage => stage.stageId === stageId);
        if (stageIndex >= 0) {
            docTaskInstance.stages[stageIndex].status = status;
        }
    }
}

/**
 * Sanitize a filename for use in storage keys
 * @param {string} filename - Original filename
 * @returns {string} - Sanitized filename
 */
function sanitizeFileName(filename) {
    if (!filename) return 'file';
    
    // Convert to lowercase, replace spaces with underscores
    let sanitized = filename.toLowerCase().replace(/\s+/g, '_');
    
    // Remove file extension
    sanitized = sanitized.replace(/\.[^/.]+$/, '');
    
    // Remove non-alphanumeric characters (except underscores)
    sanitized = sanitized.replace(/[^a-z0-9_]/g, '');
    
    // Ensure it's at least 3 characters long
    if (sanitized.length < 3) {
        sanitized = sanitized.padEnd(3, 'x');
    }
    
    // Limit to 30 characters maximum
    return sanitized.substring(0, 30);
}
// utils/questionnaire-grid-utils.js

/**
 * Shared utility functions for questionnaire grid management
 * Used by both RFP and Security questionnaire workflows
 */

/**
 * Initialize a questionnaire stage with proper stageData structure
 * @param {Object} docTaskInstance - Document task instance
 * @param {string} stageId - Current stage ID
 */
export function initializeQuestionnaireStage(docTaskInstance, stageId) {
    // Ensure stageData is present
    if (!docTaskInstance.stageData) {
        docTaskInstance.stageData = {};
    }
    if (!docTaskInstance.stageData[stageId]) {
        docTaskInstance.stageData[stageId] = {};
    }
}

/**
 * Get stored group ID for a stage, with fallback logic
 * @param {Object} docTaskInstance - Document task instance
 * @param {string} stageId - Current stage ID
 * @returns {string|null} - Stored group ID or null
 */
export function getStoredGroupId(docTaskInstance, stageId) {
    const stageData = docTaskInstance.stageData?.[stageId];
    return stageData?.currentGroupId || null;
}

/**
 * Store the current group ID for a stage
 * @param {Object} docTaskInstance - Document task instance
 * @param {string} stageId - Current stage ID
 * @param {string} groupId - Group ID to store
 */
export function storeGroupId(docTaskInstance, stageId, groupId) {
    if (!docTaskInstance.stageData[stageId]) {
        docTaskInstance.stageData[stageId] = {};
    }
    docTaskInstance.stageData[stageId].currentGroupId = groupId;
}

/**
 * Create the standard questionnaire grid layout structure
 * @param {Object} options - Configuration options
 * @param {string} options.title - Stage title
 * @param {string} options.description - Stage description
 * @param {string} options.className - CSS class name for the container
 * @returns {Object} - Object containing container elements
 */
export function createQuestionnaireGridLayout({ title, description, className }) {
    // Create main container
    const mainContainer = document.createElement('div');
    mainContainer.className = `stage-form ${className}`;
    
    // Add stage header
    const headerContainer = document.createElement('div');
    headerContainer.className = 'stage-header';
    
    const titleEl = document.createElement('h2');
    titleEl.className = 'stage-title';
    titleEl.textContent = title;
    headerContainer.appendChild(titleEl);
    
    const descriptionEl = document.createElement('p');
    descriptionEl.className = 'stage-description';
    descriptionEl.textContent = description;
    headerContainer.appendChild(descriptionEl);
    
    mainContainer.appendChild(headerContainer);
    
    // Create control pane container
    const controlPaneContainer = document.createElement('div');
    controlPaneContainer.className = 'control-pane-container';
    controlPaneContainer.id = 'control-pane-container';
    mainContainer.appendChild(controlPaneContainer);
    
    // Create topic tabs container
    const topicTabsContainer = document.createElement('div');
    topicTabsContainer.className = 'topic-tabs-container';
    topicTabsContainer.id = 'topic-tabs-container';
    mainContainer.appendChild(topicTabsContainer);
    
    // Create grid container
    const gridContainer = document.createElement('div');
    gridContainer.className = 'grid-container';
    gridContainer.id = 'grid-container';
    mainContainer.appendChild(gridContainer);
    
    return {
        mainContainer,
        headerContainer,
        controlPaneContainer,
        topicTabsContainer,
        gridContainer
    };
}

/**
 * Handle bulk operation results with consistent error handling and user feedback
 * @param {Array} results - Array of operation results
 * @param {string} operationType - Type of operation performed
 * @param {Object} messageModal - Message modal instance
 * @param {Object} errorModal - Error modal instance
 */
export function handleQuestionnaireGridBulkResults(results, operationType, messageModal, errorModal) {
    let successCount = 0;
    let failureCount = 0;
    let errors = [];
    
    results.forEach(result => {
        if (result.success) {
            successCount++;
        } else {
            failureCount++;
            errors.push(result.error || 'Unknown error');
        }
    });
    
    if (failureCount === 0) {
        // All operations succeeded
        messageModal.show({
            title: "Success",
            message: `${operationType} completed successfully for ${successCount} item${successCount !== 1 ? 's' : ''}.`
        });
    } else if (successCount === 0) {
        // All operations failed
        errorModal.show({
            title: `${operationType} Failed`,
            message: `All ${operationType} operations failed.`,
            details: errors.join('\n')
        });
    } else {
        // Mixed results
        errorModal.show({
            title: `${operationType} Partially Completed`,
            message: `${successCount} item${successCount !== 1 ? 's' : ''} succeeded, ${failureCount} failed.`,
            details: errors.join('\n')
        });
    }
}

/**
 * Create loading overlay for grid operations
 * @param {HTMLElement} container - Container to add loading overlay to
 * @param {string} message - Loading message to display
 * @returns {HTMLElement} - Loading overlay element
 */
export function createLoadingOverlay(container, message = 'Loading...') {
    const overlay = document.createElement('div');
    overlay.className = 'questionnaire-loading-overlay';
    
    const spinner = document.createElement('div');
    spinner.className = 'questionnaire-loading-spinner';
    
    const messageEl = document.createElement('div');
    messageEl.className = 'questionnaire-loading-message';
    messageEl.textContent = message;
    
    overlay.appendChild(spinner);
    overlay.appendChild(messageEl);
    
    container.style.position = 'relative';
    container.appendChild(overlay);
    
    return overlay;
}

/**
 * Remove loading overlay from container
 * @param {HTMLElement} overlay - Loading overlay element to remove
 */
export function removeLoadingOverlay(overlay) {
    if (overlay && overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
    }
}

/**
 * Add shared CSS styles for questionnaire grids
 * @param {string} styleId - Unique ID for the style element
 */
export function addQuestionnaireGridStyles(styleId) {
    // Check if styles already exist
    if (document.getElementById(styleId)) return;
    
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
        .stage-form {
            display: flex;
            flex-direction: column;
            height: 100%;
            padding: 20px;
        }
        
        .stage-header {
            margin-bottom: 20px;
        }
        
        .stage-title {
            font-size: 24px;
            margin-bottom: 10px;
            color: #333;
        }
        
        .stage-description {
            margin-bottom: 0;
            color: #666;
            line-height: 1.5;
        }
        
        .control-pane-container {
            margin-bottom: 15px;
            z-index: 10;
        }
        
        .topic-tabs-container {
            margin-bottom: 15px;
            z-index: 5;
        }
        
        .grid-container {
            flex: 1;
            position: relative;
            min-height: 400px;
            background-color: #fff;
            border: 1px solid #ddd;
            border-radius: 4px;
        }
        
        .questionnaire-loading-overlay {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(255, 255, 255, 0.8);
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            z-index: 1000;
        }
        
        .questionnaire-loading-spinner {
            width: 40px;
            height: 40px;
            border: 4px solid #f3f3f3;
            border-top: 4px solid #3498db;
            border-radius: 50%;
            animation: questionnaire-spin 1s linear infinite;
            margin-bottom: 10px;
        }
        
        .questionnaire-loading-message {
            color: #666;
            font-size: 14px;
        }
        
        @keyframes questionnaire-spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        /* Responsive design */
        @media (max-width: 768px) {
            .stage-form {
                padding: 10px;
            }
            
            .stage-title {
                font-size: 20px;
            }
            
            .grid-container {
                min-height: 300px;
            }
        }
    `;
    
    document.head.appendChild(style);
}

/**
 * Validate questionnaire row data before operations
 * @param {Array} selectedRows - Array of selected row data
 * @param {string} operation - Operation being performed
 * @returns {Object} - Validation result with isValid and errors
 */
export function validateQuestionnaireSelection(selectedRows, operation) {
    const errors = [];
    
    if (!selectedRows || selectedRows.length === 0) {
        errors.push(`Please select at least one question to ${operation}.`);
        return { isValid: false, errors };
    }
    
    // Validate that all selected rows have required fields
    const invalidRows = selectedRows.filter(row => !row.project_document_stage_group_id_item_id);
    if (invalidRows.length > 0) {
        errors.push(`${invalidRows.length} selected item${invalidRows.length !== 1 ? 's' : ''} missing required identifiers.`);
    }
    
    return {
        isValid: errors.length === 0,
        errors
    };
}

/**
 * Extract project document ID from composite project ID
 * @param {Object} docTaskInstance - Document task instance
 * @returns {string} - Project document ID
 */
export function getProjectDocumentId(docTaskInstance) {
    return docTaskInstance?.documentId
        ? `${docTaskInstance.projectId}#${docTaskInstance.documentId}`
        : docTaskInstance.projectId;
}

/**
 * Create topic tab configuration for questionnaire workflows
 * @param {Array} groups - Array of group objects
 * @param {string} currentGroupId - Currently selected group ID
 * @param {Function} onTabSelected - Tab selection handler
 * @param {Function} onAddNewTopic - Add new topic handler
 * @param {Function} onDeleteTopic - Delete topic handler
 * @param {string} projectDocumentId - Project document ID
 * @param {string} stageId - Stage ID
 * @param {Object} errorModal - Error modal instance
 * @returns {Object} - Topic tabs configuration
 */
export function createTopicTabsConfig(groups, currentGroupId, onTabSelected, onAddNewTopic, onDeleteTopic, projectDocumentId, stageId, errorModal) {
    return {
        groups,
        currentGroupId,
        onTabSelected,
        onAddNewTopic,
        onDeleteTopic,
        projectDocumentId,
        stageId,
        errorModal
    };
}
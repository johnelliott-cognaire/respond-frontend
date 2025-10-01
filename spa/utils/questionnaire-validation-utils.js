// utils/questionnaire-validation-utils.js

/**
 * Shared validation utilities for questionnaire workflows
 * Used by both RFP and Security questionnaire workflows
 */

/**
 * Validate questionnaire document state before proceeding
 * @param {Object} docTaskInstance - Document task instance
 * @returns {Object} - Validation result with isValid and errors
 */
export function validateDocumentState(docTaskInstance) {
    const errors = [];
    
    if (!docTaskInstance) {
        errors.push('Document task instance is required.');
        return { isValid: false, errors };
    }
    
    if (!docTaskInstance.isSaved) {
        errors.push('Document must be saved before proceeding.');
    }
    
    if (!docTaskInstance.projectId) {
        errors.push('Project ID is required.');
    }
    
    return {
        isValid: errors.length === 0,
        errors
    };
}

/**
 * Validate stage form data before transition
 * @param {Object} stageData - Stage data to validate
 * @param {string} stageType - Type of stage being validated
 * @returns {Object} - Validation result with isValid and errors
 */
export function validateStageData(stageData, stageType) {
    const errors = [];
    
    if (!stageData) {
        errors.push('Stage data is required.');
        return { isValid: false, errors };
    }
    
    switch (stageType) {
        case 'upload':
            if (!stageData.uploadedFiles || Object.keys(stageData.uploadedFiles).length === 0) {
                errors.push('At least one file must be uploaded.');
            }
            break;
            
        case 'analysis':
            if (!stageData.results) {
                errors.push('Analysis must be completed before proceeding.');
            }
            break;
            
        case 'questions':
            // For questions stage, we might want to validate that some questions have been answered
            // This is optional validation that can be customized per workflow
            break;
            
        case 'review':
            if (!stageData.results) {
                errors.push('Review analysis must be completed before proceeding.');
            }
            break;
    }
    
    return {
        isValid: errors.length === 0,
        errors
    };
}

/**
 * Validate user permissions for questionnaire operations
 * @param {Object} security - Security context
 * @param {Array} requiredPermissions - Array of required permission strings
 * @returns {Object} - Validation result with hasPermission and missingPermissions
 */
export function validateQuestionnairePermissions(security, requiredPermissions) {
    if (!security) {
        return {
            hasPermission: false,
            missingPermissions: requiredPermissions,
            errorMessage: 'Security context is required.'
        };
    }
    
    const userPermissions = security.permissions || [];
    const missingPermissions = requiredPermissions.filter(perm => !userPermissions.includes(perm));
    
    return {
        hasPermission: missingPermissions.length === 0,
        missingPermissions,
        errorMessage: missingPermissions.length > 0 
            ? `Missing required permissions: ${missingPermissions.join(', ')}`
            : null
    };
}

/**
 * Validate question data structure
 * @param {Object} questionData - Question data to validate
 * @returns {Object} - Validation result with isValid and errors
 */
export function validateQuestionData(questionData) {
    const errors = [];
    
    if (!questionData) {
        errors.push('Question data is required.');
        return { isValid: false, errors };
    }
    
    // Check required fields
    if (!questionData.question_text || questionData.question_text.trim() === '') {
        errors.push('Question text is required.');
    }
    
    if (!questionData.question_id) {
        errors.push('Question ID is required.');
    }
    
    // Validate question text length
    if (questionData.question_text && questionData.question_text.length > 5000) {
        errors.push('Question text must be less than 5000 characters.');
    }
    
    return {
        isValid: errors.length === 0,
        errors
    };
}

/**
 * Validate answer data structure
 * @param {Object} answerData - Answer data to validate
 * @returns {Object} - Validation result with isValid and errors
 */
export function validateAnswerData(answerData) {
    const errors = [];
    
    if (!answerData) {
        errors.push('Answer data is required.');
        return { isValid: false, errors };
    }
    
    // Check for answer text
    if (!answerData.answer_text || answerData.answer_text.trim() === '') {
        errors.push('Answer text is required.');
    }
    
    // Validate answer text length
    if (answerData.answer_text && answerData.answer_text.length > 50000) {
        errors.push('Answer text must be less than 50,000 characters.');
    }
    
    return {
        isValid: errors.length === 0,
        errors
    };
}

/**
 * Validate file upload data
 * @param {File} file - File to validate
 * @param {Object} options - Validation options
 * @returns {Object} - Validation result with isValid and errors
 */
export function validateUploadFile(file, options = {}) {
    const errors = [];
    const {
        maxSizeBytes = 10 * 1024 * 1024, // 10MB default
        allowedTypes = ['.xlsx', '.xls', '.csv'],
        maxFileNameLength = 255
    } = options;
    
    if (!file) {
        errors.push('File is required.');
        return { isValid: false, errors };
    }
    
    // Check file size
    if (file.size > maxSizeBytes) {
        errors.push(`File size exceeds maximum allowed size of ${Math.round(maxSizeBytes / 1024 / 1024)}MB.`);
    }
    
    // Check file type
    const fileName = file.name.toLowerCase();
    const hasValidExtension = allowedTypes.some(type => fileName.endsWith(type.toLowerCase()));
    if (!hasValidExtension) {
        errors.push(`File type not allowed. Allowed types: ${allowedTypes.join(', ')}`);
    }
    
    // Check file name length
    if (file.name.length > maxFileNameLength) {
        errors.push(`File name too long (maximum ${maxFileNameLength} characters).`);
    }
    
    return {
        isValid: errors.length === 0,
        errors
    };
}

/**
 * Validate bulk operation selection
 * @param {Array} selectedItems - Array of selected items
 * @param {string} operationType - Type of operation
 * @param {Object} options - Validation options
 * @returns {Object} - Validation result with isValid and errors
 */
export function validateBulkOperation(selectedItems, operationType, options = {}) {
    const errors = [];
    const {
        minSelection = 1,
        maxSelection = 1000,
        requireOwnership = false,
        currentUserId = null
    } = options;
    
    if (!selectedItems || selectedItems.length === 0) {
        errors.push(`Please select at least ${minSelection} item${minSelection !== 1 ? 's' : ''} for ${operationType}.`);
        return { isValid: false, errors };
    }
    
    if (selectedItems.length < minSelection) {
        errors.push(`At least ${minSelection} item${minSelection !== 1 ? 's' : ''} must be selected for ${operationType}.`);
    }
    
    if (selectedItems.length > maxSelection) {
        errors.push(`Cannot ${operationType} more than ${maxSelection} items at once.`);
    }
    
    // Check ownership if required
    if (requireOwnership && currentUserId) {
        const nonOwnedItems = selectedItems.filter(item => item.owner_username !== currentUserId);
        if (nonOwnedItems.length > 0) {
            errors.push(`You can only ${operationType} items you own. ${nonOwnedItems.length} selected item${nonOwnedItems.length !== 1 ? 's are' : ' is'} owned by others.`);
        }
    }
    
    return {
        isValid: errors.length === 0,
        errors
    };
}

/**
 * Validate stage transition readiness
 * @param {Object} docTaskInstance - Document task instance
 * @param {string} fromStageId - Current stage ID
 * @param {string} toStageId - Target stage ID
 * @returns {Object} - Validation result with canTransition and errors
 */
export function validateStageTransition(docTaskInstance, fromStageId, toStageId) {
    const errors = [];
    
    if (!docTaskInstance) {
        errors.push('Document task instance is required.');
        return { canTransition: false, errors };
    }
    
    const stageData = docTaskInstance.stageData?.[fromStageId];
    if (!stageData) {
        errors.push('Current stage data is missing.');
        return { canTransition: false, errors };
    }
    
    // Check if current stage is marked as completed
    if (stageData.status !== 'COMPLETED') {
        errors.push('Current stage must be completed before proceeding to the next stage.');
    }
    
    return {
        canTransition: errors.length === 0,
        errors
    };
}

/**
 * Sanitize user input to prevent XSS and other security issues
 * @param {string} input - User input to sanitize
 * @param {Object} options - Sanitization options
 * @returns {string} - Sanitized input
 */
export function sanitizeUserInput(input, options = {}) {
    if (typeof input !== 'string') {
        return '';
    }
    
    const {
        allowHtml = false,
        maxLength = 10000,
        stripWhitespace = true
    } = options;
    
    let sanitized = input;
    
    // Strip whitespace if requested
    if (stripWhitespace) {
        sanitized = sanitized.trim();
    }
    
    // Truncate if too long
    if (sanitized.length > maxLength) {
        sanitized = sanitized.substring(0, maxLength);
    }
    
    // Remove HTML if not allowed
    if (!allowHtml) {
        // Simple HTML tag removal - for more complex cases, use a proper library
        sanitized = sanitized.replace(/<[^>]*>/g, '');
    }
    
    return sanitized;
}

/**
 * Create validation error message for display
 * @param {Array} errors - Array of error messages
 * @param {string} title - Title for the error message
 * @returns {Object} - Error message object for modal display
 */
export function createValidationErrorMessage(errors, title = 'Validation Error') {
    if (!errors || errors.length === 0) {
        return null;
    }
    
    return {
        title: title,
        message: errors.length === 1 
            ? errors[0] 
            : `Multiple validation errors occurred:\n\n${errors.map((error, index) => `${index + 1}. ${error}`).join('\n')}`,
        details: errors.length > 1 ? errors.join('\n') : null
    };
}
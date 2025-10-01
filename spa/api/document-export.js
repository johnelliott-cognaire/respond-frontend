// File: api/document-export.js
import { getBaseUrl } from "../utils/config.js";
import { getAuthHeader } from "./auth.js";
import { fetchWithAuth } from "../utils/api-utils.js";

/**
 * Export questions and answers in various formats
 * Lambda: backend/services/lambdas/documents/export_questions_answers.py
 * Endpoint: POST /rfp/export
 * 
 * @param {Object} params Export parameters
 * @param {string} params.document_id Document ID
 * @param {string} params.project_id Project ID (composite format: "account#project")
 * @param {string} params.format_type Export format type (e.g., 'sap_ariba', 'csv_universal')
 * @param {string} [params.group_id] Optional group ID to export specific topic
 * @param {string} [params.export_name] Optional name for the export file
 * @returns {Promise<Object>} Export result with download URL
 */
export async function exportQuestionsAnswers(params) {
    console.log("[document-export] exportQuestionsAnswers() called with params:", params);
    
    // Validate required parameters
    if (!params.document_id) {
        throw new Error("document_id is required");
    }
    if (!params.project_id) {
        throw new Error("project_id is required");
    }
    if (!params.format_type) {
        throw new Error("format_type is required");
    }
    
    const baseUrl = getBaseUrl("extended");
    const url = `${baseUrl}/rfp/export`;
    
    try {
        const response = await fetchWithAuth(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...getAuthHeader()
            },
            body: JSON.stringify(params)
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Export failed: HTTP ${response.status}`);
        }
        
        const data = await response.json();
        console.log("[document-export] Export successful:", data);
        
        return data;
        
    } catch (error) {
        console.error("[document-export] Error in exportQuestionsAnswers:", error);
        throw error;
    }
}

/**
 * Get available export formats with their configurations
 * This is a client-side utility function that returns the same format
 * configurations as defined in the backend
 * 
 * @returns {Object} Available export formats organized by category
 */
export function getAvailableExportFormats() {
    return {
        tools_portals: [
            {
                key: 'sap_ariba',
                name: 'SAP Ariba Compatible',
                description: 'Multi-worksheet Excel format for SAP Ariba procurement platform',
                format: 'Excel (.xlsx)'
            },
            {
                key: 'coupa',
                name: 'Coupa Compatible',
                description: 'Standardized Excel format for Coupa procurement',
                format: 'Excel (.xlsx)'
            },
            {
                key: 'sig_standard',
                name: 'SIG (Shared Assessments) Standard',
                description: 'Domain-based Excel organization for security assessments',
                format: 'Excel (.xlsx)'
            },
            {
                key: 'workiva_esg',
                name: 'Workiva ESG Format',
                description: 'Structured Metric File format with ESG frameworks',
                format: 'Excel (.xlsx)'
            }
        ],
        universal: [
            {
                key: 'generic_rfp',
                name: 'Generic RFP Response',
                description: 'Section-based Excel organization for any RFP',
                format: 'Excel (.xlsx)'
            },
            {
                key: 'sasb_esg',
                name: 'SASB-Aligned ESG Format',
                description: 'Industry-specific sustainability metrics',
                format: 'Excel (.xlsx)'
            },
            {
                key: 'gri_standards',
                name: 'GRI Standards Content Index',
                description: 'GRI disclosure index format',
                format: 'Excel (.xlsx)'
            },
            {
                key: 'iso_compliance',
                name: 'ISO Compliance Framework',
                description: 'Multi-standard ISO compliance tracking',
                format: 'Excel (.xlsx)'
            }
        ],
        open: [
            {
                key: 'csv_universal',
                name: 'CSV Universal Export',
                description: 'Flat file with maximum compatibility',
                format: 'CSV (.csv)'
            },
            {
                key: 'markdown_docs',
                name: 'Markdown Documentation',
                description: 'Human-readable hierarchical document',
                format: 'Markdown (.md)'
            }
        ]
    };
}

/**
 * Validate export parameters before sending to backend
 * 
 * @param {Object} params Export parameters to validate
 * @returns {Object} Validation result with success flag and errors
 */
export function validateExportParams(params) {
    const errors = [];
    
    // Required fields
    if (!params.document_id || typeof params.document_id !== 'string') {
        errors.push('Document ID is required and must be a string');
    }
    
    if (!params.project_id || typeof params.project_id !== 'string') {
        errors.push('Project ID is required and must be a string');
    }
    
    if (!params.format_type || typeof params.format_type !== 'string') {
        errors.push('Format type is required and must be a string');
    }
    
    // Validate format type against available formats
    if (params.format_type) {
        const availableFormats = getAvailableExportFormats();
        const allFormats = [
            ...availableFormats.tools_portals.map(f => f.key),
            ...availableFormats.universal.map(f => f.key),
            ...availableFormats.open.map(f => f.key)
        ];
        
        if (!allFormats.includes(params.format_type)) {
            errors.push(`Invalid format type: ${params.format_type}. Must be one of: ${allFormats.join(', ')}`);
        }
    }
    
    // Optional field validation
    if (params.group_id !== undefined && typeof params.group_id !== 'string') {
        errors.push('Group ID must be a string if provided');
    }
    
    if (params.export_name !== undefined && typeof params.export_name !== 'string') {
        errors.push('Export name must be a string if provided');
    }
    
    return {
        valid: errors.length === 0,
        errors: errors
    };
}

/**
 * Get format information by key
 * 
 * @param {string} formatKey The format key (e.g., 'sap_ariba')
 * @returns {Object|null} Format information or null if not found
 */
export function getFormatInfo(formatKey) {
    const availableFormats = getAvailableExportFormats();
    
    // Search through all categories
    for (const category of Object.values(availableFormats)) {
        const format = category.find(f => f.key === formatKey);
        if (format) {
            return format;
        }
    }
    
    return null;
}

/**
 * Get formats by category
 * 
 * @param {string} category Category name ('tools_portals', 'universal', 'open')
 * @returns {Array} Array of format objects for the category
 */
export function getFormatsByCategory(category) {
    const availableFormats = getAvailableExportFormats();
    return availableFormats[category] || [];
}
// api/document-import-service.js

import ImportConfig from '../config/import-config.js';
import { getAuthHeader, logout } from "./auth.js";
import { getBaseUrl } from "../utils/config.js";

/**
 * Service for interacting with the document import API endpoints.
 * Provides methods for generating upload URLs, parsing metadata,
 * creating batches, tracking progress, and downloading failure reports.
 */
export class DocumentImportService {
    constructor() {
        // Service initialized - ready for document import operations
    }

    /**
     * Generate a presigned URL for uploading a file
     * Lambda: backend/services/lambdas/utilities/generate_presigned_temp_upload_url.py
     * @param {Object} params - Request parameters
     * @param {string} params.project_id - The project ID
     * @param {string} params.document_id - The document ID
     * @param {string} params.filename - The name of the file to upload
     * @param {string} [params.content_type] - The MIME type of the file (optional)
     * @returns {Promise<Object>} - The presigned URL response
     */
    async generatePresignedUrl(params) {
        try {

            const baseUrl = getBaseUrl("extended");
            const url = `${baseUrl}/docitemimport/presign`;
            
            console.log("[DocumentImportService] Generating presigned URL:", url);
            
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...getAuthHeader()
                },
                body: JSON.stringify(params)
            });
            
            if (response.status === 401) {
                logout();
                throw new Error("Unauthorized /docitemimport/presign => token invalid");
            }
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || errorData.message || 
                               `Failed to generate presigned URL: HTTP ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('[DocumentImportService] Error generating presigned URL:', error);
            throw error;
        }
    }
    
    /**
     * Upload a file to the presigned URL
     * @param {string} presignedUrl - The presigned URL to upload to
     * @param {File} file - The file to upload
     * @param {string} contentType - The content type of the file
     * @returns {Promise<boolean>} - True if upload succeeded
     */
    async uploadFileToPresignedUrl(presignedUrl, file, contentType) {
        try {
    
            console.log("[DocumentImportService] Uploading file to:", presignedUrl.substring(0, 60) + "...");
            
            // Use XMLHttpRequest for upload progress tracking
            return new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                
                // Track upload progress
                xhr.upload.onprogress = (event) => {
                    if (event.lengthComputable) {
                        const percentComplete = Math.round((event.loaded / event.total) * 100);
                        console.log(`Upload progress: ${percentComplete}%`);
                        
                        // Dispatch progress event that can be captured by UI
                        const progressEvent = new CustomEvent('import-upload-progress', {
                            detail: { percent: percentComplete }
                        });
                        window.dispatchEvent(progressEvent);
                    }
                };
                
                xhr.open('PUT', presignedUrl);
                xhr.setRequestHeader('Content-Type', contentType);
                
                xhr.onload = () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        resolve(true);
                    } else {
                        reject(new Error(`Failed to upload file to S3: HTTP ${xhr.status} - ${xhr.statusText}`));
                    }
                };
                
                xhr.onerror = () => {
                    reject(new Error('Network error occurred during file upload'));
                };
                
                xhr.onabort = () => {
                    reject(new Error('File upload was aborted'));
                };
                
                xhr.send(file);
            });
        } catch (error) {
            console.error('[DocumentImportService] Error uploading file:', error);
            throw error;
        }
    }
    
    /**
     * Parse the metadata from an uploaded file
     * Lambda: backend/services/lambdas/documents/parse_xlsx_metadata.py
     * @param {Object} params - Request parameters
     * @param {string} params.bucket - The S3 bucket
     * @param {string} params.key - The S3 key
     * @param {number} [params.preview_rows=15] - Number of rows to preview
     * @param {number} [params.preview_cols=15] - Number of columns to preview
     * @returns {Promise<Object>} - The parsed metadata
     */
    async parseFileMetadata(params) {
        try {
    
            // Validate required parameters
            if (!params.bucket || !params.key) {
                throw new Error("Missing required parameters: bucket and key");
            }
    
            const baseUrl = getBaseUrl("extended");
            const url = `${baseUrl}/docitemimport/parse-metadata`;
            
            console.log("[DocumentImportService] Parsing file metadata:", url);
            
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...getAuthHeader()
                },
                body: JSON.stringify({
                    bucket: params.bucket,
                    key: params.key,
                    preview_rows: params.preview_rows || ImportConfig.previewRows,
                    preview_cols: params.preview_cols || ImportConfig.previewCols
                })
            });
            
            if (response.status === 401) {
                logout();
                throw new Error("Unauthorized /docitemimport/parse-metadata => token invalid");
            }
            
            let responseBody;
            try {
                responseBody = await response.json();
            } catch (e) {
                // Handle case where response isn't JSON
                responseBody = { 
                    error: `HTTP Error ${response.status}`,
                    details: await response.text().catch(() => "No details available")
                };
            }
            
            if (!response.ok) {
                let errorMessage = responseBody.error || responseBody.message || 
                                  `Failed to parse file metadata: HTTP ${response.status}`;
                
                // Add specific error messages for common file issues
                if (responseBody.details) {
                    // Log the details for debugging
                    console.error(`API Error Details: ${responseBody.details}`);
                    
                    if (responseBody.details.includes('unsupported file type')) {
                        errorMessage = `The file format is not supported. Please use an Excel (.xlsx) or CSV file.`;
                    } else if (responseBody.details.includes('corrupt') || responseBody.details.includes('invalid')) {
                        errorMessage = `The file appears to be corrupted or invalid. Please try with a different file.`;
                    } else if (responseBody.details.includes('empty') || responseBody.details.includes('no data')) {
                        errorMessage = `The file appears to be empty or contains no usable data.`;
                    }
                }
                
                throw new Error(errorMessage);
            }
            
            // Validate response structure
            if (!responseBody.worksheets || !Array.isArray(responseBody.worksheets)) {
                throw new Error('Invalid metadata response: Missing worksheets array');
            }
            
            if (!responseBody.preview || typeof responseBody.preview !== 'object') {
                throw new Error('Invalid metadata response: Missing preview data');
            }
            
            return responseBody;
        } catch (error) {
            console.error('[DocumentImportService] Error parsing file metadata:', error);
            throw error;
        }
    }
    
    /**
     * Create a batch of document items
     * Lambda: backend/services/lambdas/documents/create_document_items_batch.py
     * @param {Object} params - Batch creation parameters
     * @returns {Promise<Object>} - The batch creation response
     */
    async createBatch(params) {
        try {
    
            const baseUrl = getBaseUrl("extended");
            const url = `${baseUrl}/docitemimport/create-batch`;
            
            console.log("[DocumentImportService] Creating document items batch:", url);
            
            // Format our payload for debugging - convert mappings to a better format for better backend handling
            const formattedParams = {...params};
            
            // Only send the request if we have the required parameters
            if (!formattedParams.project_document_id || !formattedParams.stage_id || 
                !formattedParams.group_id || !formattedParams.sheet_name) {
                throw new Error("Missing required parameters: project_document_id, stage_id, group_id, or sheet_name");
            }
            
            // Ensure mappings has at least question_id and question_text
            if (!formattedParams.mappings || 
                typeof formattedParams.mappings.question_id === 'undefined' || 
                typeof formattedParams.mappings.question_text === 'undefined') {
                throw new Error("Mappings must include 'question_id' and 'question_text' fields");
            }
            
            // Log the full request for debugging
            console.log("[DocumentImportService] Batch request data:", JSON.stringify(formattedParams, null, 2));
            
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...getAuthHeader()
                },
                body: JSON.stringify(formattedParams)
            });
            
            if (response.status === 401) {
                logout();
                throw new Error("Unauthorized /docitemimport/create-batch => token invalid");
            }
            
            let responseBody;
            try {
                responseBody = await response.json();
            } catch (e) {
                // Handle case where response isn't JSON
                responseBody = { 
                    error: `HTTP Error ${response.status}`,
                    details: await response.text().catch(() => "No details available")
                };
            }
            
            if (!response.ok) {
                // Enhance error messages for common S3 issues
                let errorMessage = responseBody.error || responseBody.message || 
                                  `Failed to create document items batch: HTTP ${response.status}`;
                
                // Check for specific S3 error patterns in the details
                if (responseBody.details) {
                    // Log the details for debugging
                    console.error(`API Error Details: ${responseBody.details}`);
                    
                    if (responseBody.details.includes('403') && responseBody.details.includes('Forbidden')) {
                        errorMessage = 'S3 Permission Denied: The system cannot access the uploaded file. This may be due to incorrect permissions or bucket configuration.';
                    } else if (responseBody.details.includes('404') && responseBody.details.includes('Not Found')) {
                        errorMessage = 'File Not Found: The uploaded file could not be found in storage. It may have been deleted or expired.';
                    } else if (responseBody.details.includes('NoSuchKey')) {
                        errorMessage = 'File Not Found: The uploaded file could not be located in storage.';
                    } else if (responseBody.details.includes('not a valid coordinate or range')) {
                        errorMessage = 'Excel Format Error: The system encountered an issue with the spreadsheet structure. Please ensure your file uses standard formatting and doesn\'t have merged cells or other special formatting at header rows.';
                    } else if (responseBody.details.includes('mappings must include')) {
                        errorMessage = 'Column Mapping Error: ' + responseBody.details;
                    }
                }
                
                throw new Error(errorMessage);
            }
            
            return responseBody;
        } catch (error) {
            console.error('[DocumentImportService] Error creating document items batch:', error);
            throw error;
        }
    }
    
    /**
     * Update job progress
     * Lambda: backend/services/lambdas/documents/update_document_job_history.py
     * @param {Object} params - Progress update parameters
     * @returns {Promise<Object>} - The progress update response
     */
    async updateJobProgress(params) {
        try {

            const baseUrl = getBaseUrl("extended");
            const url = `${baseUrl}/docitemimport/job-progress`;
            
            console.log("[DocumentImportService] Updating job progress:", url);
            
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...getAuthHeader()
                },
                body: JSON.stringify(params)
            });
            
            if (response.status === 401) {
                logout();
                throw new Error("Unauthorized /docitemimport/job-progress => token invalid");
            }
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || errorData.message || 
                               `Failed to update job progress: HTTP ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('[DocumentImportService] Error updating job progress:', error);
            throw error;
        }
    }
    
    /**
     * Generate a URL to download failures CSV
     * Lambda: backend/services/lambdas/documents/download_failures_csv.py
     * @param {Object} params - Failures parameters
     * @returns {Promise<Object>} - The failures CSV response
     */
    async getFailuresCsvUrl(params) {
        try {

            const baseUrl = getBaseUrl("extended");
            const url = `${baseUrl}/docitemimport/failures-csv`;
            
            console.log("[DocumentImportService] Generating failures CSV URL:", url);
            
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...getAuthHeader()
                },
                body: JSON.stringify(params)
            });
            
            if (response.status === 401) {
                logout();
                throw new Error("Unauthorized /docitemimport/failures-csv => token invalid");
            }
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || errorData.message || 
                               `Failed to generate failures CSV URL: HTTP ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('[DocumentImportService] Error generating failures CSV URL:', error);
            throw error;
        }
    }

    /**
     * Extract questions from pasted text using AI
     * Lambda: backend/services/lambdas/documents/extract_questions_from_text.py
     * @param {Object} params - Request parameters
     * @param {string} params.project_id - The project ID
     * @param {string} params.document_id - The document ID
     * @param {string} params.stage_id - The stage ID
     * @param {string} params.text_content - The text content to extract questions from
     * @param {string} [params.group_name] - Optional custom group name (defaults to "Extracted Questions [date]")
     * @returns {Promise<Object>} - The extraction results containing questions and import status
     */
    async extractQuestionsFromText(params) {
        try {

            // Validate required parameters
            if (!params.project_id || !params.document_id || !params.stage_id) {
                throw new Error("Missing required parameters: project_id, document_id, or stage_id");
            }

            if (!params.text_content) {
                throw new Error("No text content provided for extraction");
            }

            const baseUrl = getBaseUrl("extended");
            const url = `${baseUrl}/docitemimport/extract-from-text`;
            
            console.log("[DocumentImportService] Extracting questions from text:", url);
            
            // Log text length for debugging
            console.log(`Text length: ${params.text_content.length} characters`);
            
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...getAuthHeader()
                },
                body: JSON.stringify(params)
            });
            
            if (response.status === 401) {
                logout();
                throw new Error("Unauthorized /docitemimport/extract-from-text => token invalid");
            }
            
            let responseBody;
            try {
                responseBody = await response.json();
            } catch (e) {
                // Handle case where response isn't JSON
                responseBody = { 
                    error: `HTTP Error ${response.status}`,
                    details: await response.text().catch(() => "No details available")
                };
            }
            
            if (!response.ok) {
                let errorMessage = responseBody.error || responseBody.message || 
                                `Failed to extract questions: HTTP ${response.status}`;
                
                // Add specific error messages for common issues
                if (responseBody.details) {
                    // Log the details for debugging
                    console.error(`API Error Details: ${responseBody.details}`);
                    
                    if (responseBody.details.includes('character limit exceeded')) {
                        errorMessage = `Text exceeds the maximum character limit. Please reduce the content length.`;
                    } else if (responseBody.details.includes('no questions found')) {
                        errorMessage = `No questions could be identified in the provided text. Please ensure text contains questions.`;
                    } else if (responseBody.details.includes('service unavailable')) {
                        errorMessage = `The AI service is currently unavailable. Please try again later.`;
                    }
                }
                
                throw new Error(errorMessage);
            }
            
            // Validate response structure
            if (typeof responseBody.totalQuestions === 'undefined') {
                throw new Error('Invalid response: Missing totalQuestions count');
            }
            
            if (typeof responseBody.importedCount === 'undefined') {
                throw new Error('Invalid response: Missing importedCount');
            }
            
            if (!Array.isArray(responseBody.questions)) {
                throw new Error('Invalid response: Missing questions array');
            }
            
            console.log(`[DocumentImportService] Extraction complete: Found ${responseBody.totalQuestions} questions, imported ${responseBody.importedCount}`);
            
            return responseBody;
        } catch (error) {
            console.error('[DocumentImportService] Error extracting questions from text:', error);
            throw error;
        }
    }
}

export default new DocumentImportService();
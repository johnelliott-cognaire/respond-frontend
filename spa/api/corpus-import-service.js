// api/corpus-import-service.js

import { getAuthHeader, logout } from './auth.js';
import { getBaseUrl } from '../utils/config.js';
import documentImportService from './document-import-service.js';

/**
 * Service for corpus content import operations
 * Provides methods for generating upload URLs, parsing metadata,
 * and saving documents to the corpus
 */
export class CorpusImportService {
    constructor() {
        // Flag to determine if we should use mock responses (for development)
        this.useMocks = false;
        // Service initialized - ready for corpus import operations
    }

    /**
     * Generate a presigned URL for uploading a *corpus* document.
     * Lambda: backend/services/lambdas/corpus/management/generate_corpus_presigned_temp_upload_url.py
     * Required params:
     *   - corpus_id    : string   (e.g. "rfp")
     *   - filename     : string
     * Optional:
     *   - content_type : string   (mime; will be guessed if omitted)
     */
    async generatePresignedUrl(params) {
        try {
            // ── 0.  Mock support (unchanged) ───────────────────────────────
            if (this.useMocks) {
                return this._mockPresignedUrlResponse(params);
            }

            // ── 1.  Client‑side validation (fail fast) ─────────────────────
            const missing = ['corpus_id', 'filename']
                .filter(k => !params?.[k] || !String(params[k]).trim());
            if (missing.length) {
                throw new Error(`generatePresignedUrl → missing param(s): ${missing.join(', ')}`);
            }

            // ── 2.  Build request ──────────────────────────────────────────
            const baseUrl = getBaseUrl("extended");
            const url = `${baseUrl}/corpus/uploadpresign`;
            console.log("[CorpusImportService] Generating presigned URL:", url);

            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...getAuthHeader()
                },
                body: JSON.stringify(params)
            });

            // ── 3.  Auth / error handling – mirror DocumentImportService ───
            if (response.status === 401) {
                logout();
                throw new Error("Unauthorized /corpus/uploadpresign ⇒ token invalid");
            }
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(
                    errorData.error || errorData.message ||
                    `Failed to generate presigned URL: HTTP ${response.status}`
                );
            }

            return await response.json();
        } catch (err) {
            console.error('[CorpusImportService] Error generating presigned URL:', err);
            throw err;
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
        // Reuse existing document import service
        return documentImportService.uploadFileToPresignedUrl(presignedUrl, file, contentType);
    }

    /**
     * Parse the metadata from an uploaded file
     * @param {Object} params - Request parameters
     * @param {string} params.bucket - The S3 bucket
     * @param {string} params.key - The S3 key
     * @param {number} [params.preview_rows=15] - Number of rows to preview
     * @param {number} [params.preview_cols=15] - Number of columns to preview
     * @returns {Promise<Object>} - The parsed metadata
     */
    async parseFileMetadata(params) {
        // Reuse existing document import service
        return documentImportService.parseFileMetadata(params);
    }

    /**
     * Save a document to the corpus as a draft
     * Lambda: backend/services/lambdas/corpus/management/save_corpus_document_draft.py
     * @param {Object} params - Request parameters
     * @param {string} [params.documentKey] - Existing document key (null for new document)
     * @param {string} params.content - Document content
     * @param {Object} params.metadata - Document metadata
     * @returns {Promise<Object>} - The draft save response
     */
    async saveCorpusDocumentDraft(params) {
        try {
            if (this.useMocks) {
                return this._mockSaveDocumentDraftResponse(params);
            }

            console.log("[CorpusImportService] Saving document draft", params);

            const baseUrl = getBaseUrl("extended");
            const url = `${baseUrl}/corpus/documents/save-draft`;

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
                throw new Error("Unauthorized /corpus/documents/save-draft => token invalid");
            }

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || errorData.message ||
                    `Failed to save document draft: HTTP ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('[CorpusImportService] Error saving document draft:', error);
            throw error;
        }
    }

    /**
     * Submit a document for approval
     * Lambda: backend/services/lambdas/corpus/management/submit_corpus_document_for_approval.py
     * @param {Object} params - Request parameters
     * @param {string} params.documentKey - Document key
     * @param {string} [params.versionId] - Version ID (optional)
     * @returns {Promise<Object>} - The submission response
     */
    async submitCorpusDocumentForApproval(params) {
        try {
            if (this.useMocks) {
                return this._mockSubmitForApprovalResponse(params);
            }

            console.log("[CorpusImportService] Submitting document for approval", params);

            const baseUrl = getBaseUrl("extended");
            const url = `${baseUrl}/corpus/documents/submit-for-approval`;

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
                throw new Error("Unauthorized /corpus/documents/submit-for-approval => token invalid");
            }

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || errorData.message ||
                    `Failed to submit document for approval: HTTP ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('[CorpusImportService] Error submitting document for approval:', error);
            throw error;
        }
    }

    /**
     * Move a file from temporary storage to corpus
     * Lambda: backend/services/lambdas/corpus/management/move_file_to_corpus.py
     * @param {Object} params - Request parameters
     * @param {string} params.source_bucket - Source S3 bucket
     * @param {string} params.source_key - Source S3 key
     * @param {string} params.destination_path - Destination path in corpus
     * @param {Object} params.metadata - Document metadata
     * @returns {Promise<Object>} - The move response
     */
    async moveFileToCorpus(params) {
        try {
            if (this.useMocks) {
                return this._mockMoveFileResponse(params);
            }

            console.log("[CorpusImportService] Moving file to corpus", params);

            const required = ['source_bucket','source_key','metadata'];
            const metaRequired = ['corpus','documentTopic','documentType'];
            const missing = required.filter(k => !params[k]);
            const missingMeta = metaRequired.filter(k => !params.metadata?.[k]);
            
            if (missing.length || missingMeta.length) {
              throw new Error(
                `moveFileToCorpus → missing field(s): `
                + [...missing, ...missingMeta.map(m => `metadata.${m}`)].join(', ')
              );
            }

            const baseUrl = getBaseUrl("extended");
            const url = `${baseUrl}/corpus/documents/move-from-temp`;

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
                throw new Error("Unauthorized /corpus/documents/move-from-temp => token invalid");
            }

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || errorData.message ||
                    `Failed to move file to corpus: HTTP ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('[CorpusImportService] Error moving file to corpus:', error);
            throw error;
        }
    }

    /**
     * Convert Excel to CSV and save to corpus
     * Lambda: backend/services/lambdas/corpus/management/convert_excel_to_corpus_csv.py
     * @param {Object} params - Request parameters
     * @param {string} params.source_bucket - Source S3 bucket
     * @param {string} params.source_key - Source S3 key
     * @param {Object} params.mapping_config - Mapping configuration
     * @param {string} params.destination_path - Destination path in corpus
     * @param {Object} params.metadata - Document metadata
     * @returns {Promise<Object>} - The conversion response
     */
    async convertExcelToCorpusCSV(params) {
        try {
            if (this.useMocks) {
                return this._mockConvertExcelResponse(params);
            }

            console.log("[CorpusImportService] Converting Excel to CSV", params);

            const baseUrl = getBaseUrl("extended");
            const url = `${baseUrl}/corpus/documents/excel-to-csv`;

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
                throw new Error("Unauthorized /corpus/documents/excel-to-csv => token invalid");
            }

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || errorData.message ||
                    `Failed to convert Excel to CSV: HTTP ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('[CorpusImportService] Error converting Excel to CSV:', error);
            throw error;
        }
    }

    /**
     * Mock response for saveCorpusDocumentDraft
     * @param {Object} params - Request parameters
     * @returns {Object} - Mock response
     */
    _mockSaveDocumentDraftResponse(params) {
        console.log('[CorpusImportService] Using mock save document draft for:', params);

        // Generate a realistic looking document key based on metadata
        let documentKey = '';

        if (params.metadata && params.metadata.path) {
            documentKey += params.metadata.path + '/';
        }

        if (params.metadata && params.metadata.documentType) {
            const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const docName = params.metadata.documentName || 'unnamed-document';
            const extension = params.metadata.extension || 'txt';

            documentKey += `${params.metadata.documentType}_${date}_${docName}.${extension}`;
        } else {
            documentKey += `doc-${Date.now()}.txt`;
        }

        return {
            ok: true,
            documentKey: documentKey,
            versionId: `v-${Date.now()}`,
            status: 'DRAFT'
        };
    }

    /**
     * Mock response for submitCorpusDocumentForApproval
     * @param {Object} params - Request parameters
     * @returns {Object} - Mock response
     */
    _mockSubmitForApprovalResponse(params) {
        console.log('[CorpusImportService] Using mock submit for approval for:', params);

        return {
            ok: true,
            documentKey: params.documentKey,
            status: 'PENDING_AI'
        };
    }

    /**
     * Mock response for moveFileToCorpus
     * @param {Object} params - Request parameters
     * @returns {Object} - Mock response
     */
    _mockMoveFileResponse(params) {
        console.log('[CorpusImportService] Using mock move file to corpus for:', params);

        // Generate a realistic looking document key based on metadata
        let documentKey = '';

        if (params.destination_path) {
            documentKey += params.destination_path + '/';
        }

        if (params.metadata && params.metadata.documentType) {
            const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const docName = params.metadata.documentName || 'unnamed-document';

            // Extract file extension from source key
            const sourceKey = params.source_key || '';
            const extension = sourceKey.split('.').pop() || 'txt';

            documentKey += `${params.metadata.documentType}_${date}_${docName}.${extension}`;
        } else {
            // Extract filename from source key
            const sourceKey = params.source_key || '';
            const filename = sourceKey.split('/').pop() || `doc-${Date.now()}.txt`;

            documentKey += filename;
        }

        return {
            ok: true,
            documentKey: documentKey,
            versionId: `v-${Date.now()}`,
            status: 'DRAFT'
        };
    }

    /**
     * Mock response for convertExcelToCorpusCSV
     * @param {Object} params - Request parameters
     * @returns {Object} - Mock response
     */
    _mockConvertExcelResponse(params) {
        console.log('[CorpusImportService] Using mock Excel conversion for:', params);

        // Generate realistic output based on mapping config
        const worksheets = (params.mapping_config?.worksheets || ['Sheet1', 'Sheet2']).map((sheetName, index) => {
            // Generate realistic document key for each worksheet
            let documentKey = '';

            if (params.destination_path) {
                documentKey += params.destination_path + '/';
            }

            const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const docType = params.metadata?.documentType || 'question-list';

            documentKey += `${docType}_${date}_${sheetName.replace(/\s+/g, '-')}.csv`;

            return {
                name: sheetName,
                rows: 10 + (index * 10), // Simulate varying row counts
                documentKey: documentKey,
                versionId: `v-${Date.now()}-${index}`
            };
        });

        return {
            ok: true,
            worksheets: worksheets
        };
    }
}

export default new CorpusImportService();
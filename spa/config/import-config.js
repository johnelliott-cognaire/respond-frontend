// ui/config/import-config.js

/**
 * Configuration settings for the import process
 * All settings are centralized here for easy tuning
 */
const ImportConfig = {
    // File type settings
    supportedFileTypes: [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // XLSX
        'text/csv' // CSV
    ],
    
    // Preview settings
    previewRows: 15,     // Maximum rows to show in preview
    previewCols: 15,     // Maximum columns to show in preview
    
    // Batch processing settings
    rowsPerBatch: 20,    // Number of rows per batch
    parallelBatches: 2,  // Number of parallel batch processes
    
    // Safety limits to prevent infinite loops
    maxBatchesPerWorksheet: 500,  // Maximum batches per worksheet
    maxTotalBatchQueueSize: 2000, // Maximum size of the batch queue
    maxConsecutiveEmptyResponses: 3, // Stop after this many consecutive empty responses
    maxProcessingTimeMs: 300000,  // 5 minutes maximum processing time
    
    // Error handling
    maxBatchRetries: 3,  // Maximum retries for failed batches
    retryBaseDelayMs: 1000, // Base delay before retry (will use exponential backoff)
    
    // Memory management
    maxStoredFailures: 1000, // Maximum number of stored failure details
    maxStoredWarnings: 1000, // Maximum number of stored warning details
    
    // UI settings
    largeImportThreshold: 300, // Show warning for imports larger than this
    
    // Data validation
    // For QuestionImportModal
    requiredMappings: ['question_id', 'question_text'],
    
    // For CorpusContentImportModal
    corpusRequiredMappings: ['question_id', 'question_text', 'answer_text'],
    
    // Stage IDs
    importStageId: 'rfp_stage_1_upload_question_lists', // Stage 1 ID 
    answerStageId: 'rfp_stage_3_answer_questions',      // Stage 3 ID (for displaying questions)
    
    // Default worksheet exclusion patterns (case-insensitive substrings)
    excludeWorksheetPatterns: [
        'instructions',
        'readme',
        'help',
        'guide',
        'notes',
        'cover',
        'index'
    ]
};

export default ImportConfig;
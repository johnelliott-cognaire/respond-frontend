// utils/corpus-utils.js
/**
 * Helper utilities for working with corpus configuration and navigation
 */

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

/**
 * Convert something_like_this => Something Like THIS or shorter.
 */
export function prettifyInputName(inputName) {
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
 * Retrieves a specific corpus from corpus_config
 * @param {Object} corpusConfig - Full corpus configuration object
 * @param {string} corpusName - Name of corpus to retrieve
 * @returns {Object} The corpus configuration or null if not found
 */
export function getCorpus(corpusConfig, corpusName) {
  if (!corpusConfig?.corpora || !corpusName) return null;
  return corpusConfig.corpora[corpusName] || null;
}

/**
 * Creates a navigation helper for a specific location in the corpus
 * @param {Object} corpusConfig - Full corpus configuration object
 * @param {string} currentLocation - Current folder path (e.g., "rfp/citizen-engagement")
 * @returns {Object} Navigator object with helpful properties
 */
export function getCorpusNavigator(corpusConfig, currentLocation) {
  const parts = currentLocation ? currentLocation.split('/').filter(Boolean) : [];
  const [corpusName, maybeDomain, maybeUnit] = parts;

  // Step 1 – pull corpus
  const corpus = getCorpus(corpusConfig, corpusName);
  if (!corpus) return null;

  // Helpers
  const isDomain = (name) => corpus.domain_hierarchy && Object.hasOwn(corpus.domain_hierarchy, name);
  const isUnit = (dom, name) => corpus.domain_hierarchy?.[dom]?.includes(name);

  // Step 2 – classify each segment
  let locationType = 'corpus';
  let domainName = null;
  let unitName = null;

  if (maybeDomain) {
    if (isDomain(maybeDomain)) {
      domainName = maybeDomain;
      locationType = 'domain';

      if (maybeUnit) {
        if (isUnit(domainName, maybeUnit)) {
          unitName = maybeUnit;
          locationType = 'unit';
        } else {
          return null; // invalid unit
        }
      }
    } else {
      return null; // invalid domain
    }
  }

  // Step 3 – build breadcrumb (always include ancestors that exist)
  const breadcrumb = [];
  if (corpusName) breadcrumb.push({ name: prettifyInputName(corpusName), path: corpusName, type: 'corpus' });
  if (domainName) breadcrumb.push({ name: domainName, path: `${corpusName}/${domainName}`, type: 'domain' });
  if (unitName) breadcrumb.push({ name: unitName, path: `${corpusName}/${domainName}/${unitName}`, type: 'unit' });

  // Step 4 – children for navigator
  let childFolders = [];
  if (locationType === 'corpus') {
    childFolders = Object.keys(corpus.domain_hierarchy || {}).map(d => ({
      name: d,
      path: `${corpusName}/${d}`,
      type: 'domain'
    }));
  } else if (locationType === 'domain') {
    const units = corpus.domain_hierarchy[domainName] || [];
    childFolders = units.map(u => ({
      name: u,
      path: `${corpusName}/${domainName}/${u}`,
      type: 'unit'
    }));
  }
  // No children at unit level - we show documents directly

  return {
    corpus,
    locationType,
    currentPath: currentLocation,
    breadcrumb,
    childFolders,
    folderPath: currentLocation,
    validTopics: corpus.document_topics_choices || [],
    validTypes: corpus.document_types_choices || []
  };
}

/**
 * Gets detailed information about an entity (corpus/domain/unit)
 * @param {Object} corpusConfig - Full corpus configuration object
 * @param {string} path - Path to the entity (e.g., "rfp/domain/unit")
 * @returns {Object} Entity details object
 */
export function getEntityDetails(corpusConfig, path) {
  if (!path) return null;

  const parts = path.split('/');
  const [corpusId, domainId, unitId] = parts;

  // Get corpus
  const corpus = getCorpus(corpusConfig, corpusId);
  if (!corpus) return null;

  if (parts.length === 1) {
    // Corpus details
    return {
      type: 'corpus',
      name: prettifyInputName(corpusId),
      domains: Object.keys(corpus.domain_hierarchy || {}).length,
      topics: corpus.document_topics_choices?.length || 0,
      types: corpus.document_types_choices?.length || 0,
      source: corpus.source_location
    };
  }

  if (parts.length === 2) {
    // Domain details
    if (!corpus.domain_hierarchy?.[domainId]) return null;

    const units = corpus.domain_hierarchy[domainId] || [];
    return {
      type: 'domain',
      name: domainId,
      parent: corpus.name || corpusId,
      units: units.length,
      topics: corpus.document_topics_choices?.length || 0,
      types: corpus.document_types_choices?.length || 0
    };
  }

  if (parts.length === 3) {
    // Unit details
    if (!corpus.domain_hierarchy?.[domainId] ||
      !corpus.domain_hierarchy[domainId].includes(unitId)) {
      return null;
    }

    return {
      type: 'unit',
      name: unitId,
      parent: domainId,
      parentPath: `${corpusId}/${domainId}`,
      topics: corpus.document_topics_choices?.length || 0,
      types: corpus.document_types_choices?.length || 0
    };
  }

  return null;
}

/**
 * Determines if a name is a valid document topic for a corpus
 * @param {Object} corpus - Corpus configuration object
 * @param {string} name - Name to check
 * @returns {boolean} True if it's a document topic
 */
export function isDocumentTopic(corpus, name) {
  return corpus?.document_topics_choices?.includes(name) || false;
}

/**
 * Formats a document's icon class based on file extension
 * @param {string} fileExtension - The file extension
 * @returns {string} CSS class for the appropriate icon
 */
export function getFileIconClass(fileExtension) {
  if (!fileExtension) return 'fas fa-file';

  switch (fileExtension.toLowerCase()) {
    case 'pdf': return 'fas fa-file-pdf';
    case 'txt': return 'fas fa-file-alt';
    case 'md': return 'fas fa-file-alt';
    case 'html': return 'fas fa-file-code';
    case 'css': return 'fas fa-file-code';
    case 'js': return 'fas fa-file-code';
    case 'json': return 'fas fa-file-code';
    case 'csv': return 'fas fa-file-csv';
    case 'xls':
    case 'xlsx': return 'fas fa-file-excel';
    case 'doc':
    case 'docx': return 'fas fa-file-word';
    case 'ppt':
    case 'pptx': return 'fas fa-file-powerpoint';
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
    case 'svg': return 'fas fa-file-image';
    default: return 'fas fa-file';
  }
}

/**
 * Gets appropriate folder icon based on folder type
 * @param {string} type - Folder type ('domain', 'unit', 'corpus')
 * @returns {string} CSS class for the folder icon
 */
export function getFolderIconClass(type) {
  switch (type) {
    case 'domain': return 'fas fa-sitemap';
    case 'unit': return 'fas fa-cube';
    case 'corpus': return 'fas fa-book';
    default: return 'fas fa-folder';
  }
}

/**
 * Gets display name for a folder type
 * @param {string} type - Folder type
 * @returns {string} Human-readable type name
 */
export function getFolderTypeName(type) {
  switch (type) {
    case 'domain': return 'Domain';
    case 'unit': return 'Unit';
    case 'corpus': return 'Corpus';
    default: return type.charAt(0).toUpperCase() + type.slice(1);
  }
}

/**
 * Formats a date string for display
 * @param {string} dateString - ISO date string
 * @returns {string} Formatted date
 */
export function formatDate(dateString) {
  if (!dateString) return '-';

  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (error) {
    return dateString;
  }
}

/**
 * Formats file size for display
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted size (e.g., "2.5 MB")
 */
export function formatFileSize(bytes) {
  if (bytes === undefined || bytes === null) return 'Unknown';

  const units = ['B', 'KB', 'MB', 'GB'];
  let size = parseInt(bytes, 10) || 0;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${Math.round(size * 10) / 10} ${units[unitIndex]}`;
}

/**
 * Formats document status for display
 * @param {string} status - Status code
 * @returns {string} Human-readable status
 */
export function formatStatus(status) {
  const statusMap = {
    'DRAFT': 'Draft',
    'PENDING_AI': 'Pending AI Review',
    'PENDING_HUMAN': 'Pending Approval',
    'APPROVED': 'Approved',
    'REJECTED': 'Rejected',
    'DELETED': 'Deleted',
    'UNKNOWN': 'Unknown'
  };

  return statusMap[status] || status || 'Unknown';
}

/**
 * Escapes HTML to prevent XSS attacks
 * @param {string} text - Input text
 * @returns {string} Escaped HTML
 */
export function escapeHtml(text) {
  if (!text) return '';

  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };

  return text.replace(/[&<>"']/g, m => map[m]);
}

/**
 * Determines if a document can be edited based on type and status
 * @param {Object} document - Document object
 * @param {Object} security - Security permissions object
 * @returns {boolean} Whether document can be edited
 */
export function canEditDocument(document, security) {
  if (!document || !security) return false;

  const editableTypes = ['txt', 'md', 'html', 'csv'];
  const fileExtension = document.name.split('.').pop().toLowerCase();
  const nonEditableStatuses = ['PENDING_AI', 'PENDING_HUMAN', 'DELETED'];

  return editableTypes.includes(fileExtension) &&
    !nonEditableStatuses.includes(document.status) &&
    security.hasCorpusPermission(document.corpus || 'rfp', 'CORPUS_EDITOR');
}

/**
 * Determines if a document can be deleted
 * @param {Object} document - Document object
 * @param {Object} security - Security permissions object
 * @returns {boolean} Whether document can be deleted
 */
export function canDeleteDocument(document, security) {
  if (!document || !security) return false;

  return !['PENDING_AI', 'PENDING_HUMAN'].includes(document.status) &&
    security.hasCorpusPermission(document.corpus || 'rfp', 'CORPUS_EDITOR');
}

/**
 * Determines if a document can be submitted for approval
 * @param {Object} document - Document object
 * @param {Object} security - Security permissions object
 * @returns {boolean} Whether document can be submitted
 */
export function canSubmitForApproval(document, security) {
  if (!document || !security) return false;

  return (document.status === 'DRAFT' || document.status === 'REJECTED') &&
    security.hasCorpusPermission(document.corpus || 'rfp', 'CORPUS_EDITOR');
}

/**
* Generate a corpus-compliant filename
* @param {Object} options - Filename components
* @returns {string} - Generated filename
*/
export function generateCorpusFilename(options = {}) {
  const {
    documentType,
    documentName,
    extension,
    timestamp = new Date()
  } = options;

  // Sanitize document name
  const sanitizedName = sanitizeFilename(documentName);

  // Format date as YYYYMMDD
  const dateStr = formatDateYYYYMMDD(timestamp);

  return `${documentType}_${dateStr}_${sanitizedName}.${extension}`;
}

/**
 * Sanitize filename for corpus use
 * @param {string} name - Original filename
 * @returns {string} - Sanitized filename
 */
export function sanitizeFilename(name) {
  if (!name) return 'unnamed-document';

  // Replace spaces with hyphens
  let sanitized = name.replace(/\s+/g, '-');

  // Remove invalid characters
  sanitized = sanitized.replace(/[^\w\-\.]/g, '');

  return sanitized;
}

/**
 * Format date as YYYYMMDD
 * @param {Date} date - Date to format
 * @returns {string} - Formatted date
 */
export function formatDateYYYYMMDD(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}${month}${day}`;
}

/**
 * Build corpus path string
 * @param {Object} options - Path components
 * @returns {string} - Full path
 */
export function buildCorpusPath({ corpus, domain, unit, topic } = {}) {
  // include corpus first
  const parts = [];
  if (corpus) parts.push(corpus);
  if (domain) parts.push(domain);
  if (unit) parts.push(unit);
  if (topic) parts.push(topic);   // must exist per docs
  return parts.join('/');
}

/**
 * Check if file is Excel format
 * @param {string} fileType - MIME type or extension
 * @returns {boolean} - True if Excel format
 */
export function isExcelFile(fileType) {
  if (!fileType) return false;

  const mimeTypes = [
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv'
  ];

  const extensions = ['.xlsx', '.xls', '.csv'];

  return mimeTypes.includes(fileType) ||
    extensions.some(ext => fileType.toLowerCase().endsWith(ext));
}

/**
 * Create corpus-compatible configuration for Excel import
 * @param {Object} options - Configuration options
 * @returns {Object} - Configuration object
 */
export function createCorpusExcelConfig(options = {}) {
  const {
    documentType = 'question-list',
    documentTopic,
    corpus,
    domain,
    unit,
    timestamp = new Date()
  } = options;

  return {
    // Core configuration passed to Excel components
    baseConfig: {
      // Properties needed by Excel components
    },

    // Corpus-specific overrides
    corpusConfig: {
      documentType,
      documentTopic,
      corpus,
      domain,
      unit,
      timestamp,
      // Function to generate corpus-compliant filename for each worksheet
      generateFilename: (worksheetName) => {
        return generateCorpusFilename({
          documentType,
          documentName: `${worksheetName}-Questions`,
          extension: 'csv',
          timestamp
        });
      },
      // Build path for each CSV
      buildPath: () => buildCorpusPath({ corpus, domain, unit, topic: documentTopic })
    },

    // UI text overrides for components
    uiLabels: {
      stepTitles: {
        mapColumns: 'Map Excel Columns',
        preview: 'Preview Questions',
        confirm: 'Confirm CSV Creation'
      },
      instructions: {
        mapColumns: 'Select which columns contain question data to be imported into the corpus.',
        preview: 'Preview how your Excel data will be converted to CSV files in the corpus.',
        confirm: 'The selected worksheets will be converted to CSV files and added to the corpus.'
      }
    }
  };
}

/**
 * Extract corpus, domain, unit, and topic components from a path
 * @param {string} path - Corpus path (e.g., "rfp/domain1/unitA/topicX")
 * @param {Object} corpusConfig - Full corpus configuration object
 * @returns {Object} { corpus, domain, unit, topic }
 */
export function extractComponentsFromPath(path, corpusConfig) {
  if (!path) return { corpus: null, domain: null, unit: null, topic: null };

  const segments = path.split('/').filter(Boolean);
  if (segments.length === 0) return { corpus: null, domain: null, unit: null, topic: null };

  const corpusId = segments[0];
  let domain = null;
  let unit = null;
  let topic = null;

  // Try to get corpus config from function parameter or from store as fallback
  const config = corpusConfig.corpora ?
    corpusConfig :
    (window.appStore?.get('corpus_config') || {});

  const corpora = config.corpora || {};
  const corpus = corpora[corpusId] || {};
  const validTopics = corpus.document_topics_choices || [];
  const hierarchy = corpus.domain_hierarchy || {};

  if (segments.length === 1) {
    return { corpus: corpusId, domain: null, unit: null, topic: null };
  }

  const second = segments[1];

  if (validTopics.includes(second)) {
    topic = second;
  } else if (hierarchy.hasOwnProperty(second)) {
    domain = second;

    if (segments.length >= 3) {
      const third = segments[2];
      const domainUnits = hierarchy[domain] || [];

      if (domainUnits.includes(third)) {
        unit = third;

        if (segments.length >= 4 && validTopics.includes(segments[3])) {
          topic = segments[3];
        }
      } else if (validTopics.includes(third)) {
        topic = third;
      }
    }
  } else {
    // Fallback if invalid domain
    return { corpus: corpusId, domain: null, unit: null, topic: null };
  }

  // Handle edge case where last segment is topic but wasn't caught earlier
  if (!topic && segments.length > 1) {
    const lastSegment = segments[segments.length - 1];
    if (validTopics.includes(lastSegment)) {
      topic = lastSegment;
      if (segments.length === 3 && !domain) {
        domain = segments[1];
      } else if (segments.length === 4 && domain && !unit) {
        unit = segments[2];
      }
    }
  }

  return { corpus: corpusId, domain, unit, topic };
}

/**
 * Extracts the real filename from a prefixed metadata format.
 * 
 * Example:
 *   Input:  "rfp-questions_20250511_ACME-CEP-53F5F5A8-AI-Answers-V1.csv"
 *   Output: "ACME-CEP-53F5F5A8-AI-Answers-V1.csv"
 * 
 * Rules:
 * - First part (before first `_`) must be alphanumeric/dashes only.
 * - Second part must be a valid YYYYMMDD date.
 * - If both are valid, return the remainder of the string after the second `_`.
 * - If not, return the original filename.
 * 
 * @param {string} filename - Raw filename with potential metadata prefix
 * @returns {string} - Cleaned filename or original if validation fails
 */
export function extractRealFilename(filename) {
  if (typeof filename !== 'string') return filename;

  const underscoreIndex1 = filename.indexOf('_');
  if (underscoreIndex1 === -1) return filename;

  const part1 = filename.slice(0, underscoreIndex1);
  const rest = filename.slice(underscoreIndex1 + 1);

  const underscoreIndex2 = rest.indexOf('_');
  if (underscoreIndex2 === -1) return filename;

  const part2 = rest.slice(0, underscoreIndex2);
  const remainder = rest.slice(underscoreIndex2 + 1);

  // Validate part1: alphanumeric + dashes only
  if (!/^[a-zA-Z0-9-]+$/.test(part1)) return filename;

  // Validate part2: must be valid YYYYMMDD date
  if (!/^\d{8}$/.test(part2)) return filename;

  const year = parseInt(part2.slice(0, 4), 10);
  const month = parseInt(part2.slice(4, 6), 10);
  const day = parseInt(part2.slice(6, 8), 10);

  const dateIsValid = (
    year >= 2000 && year <= 2100 &&
    month >= 1 && month <= 12 &&
    day >= 1 && day <= 31
  );

  if (!dateIsValid) return filename;

  return remainder;
}

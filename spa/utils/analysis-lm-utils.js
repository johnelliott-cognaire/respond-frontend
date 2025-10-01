// File: utils/analysis-lm-utils.js

/**
 * Helper to format DocChain/AnalysisLM results into well-structured HTML
 * 
 * @param {object} container - DOM element where results should be displayed
 * @param {object} results - AnalysisLM job results
 * @returns {void}
 */
export function formatAnalysisLMResults(container, results) {
  if (!container || !results) {
    console.error("[formatAnalysisLMResults] Missing container or results");
    return;
  }

  // Determine if the provided container already is the results container.
  let resultsContainer;
  if (container.classList.contains('analysis-lm-results')) {
    resultsContainer = container;
    resultsContainer.innerHTML = ''; // clear previous results
  } else {
    resultsContainer = container.querySelector('.analysis-lm-results');
    if (!resultsContainer) {
      resultsContainer = document.createElement('div');
      resultsContainer.className = 'analysis-lm-results';
      container.appendChild(resultsContainer);
    } else {
      resultsContainer.innerHTML = '';
    }
  }

  // Add results header
  const headerEl = document.createElement('h3');
  headerEl.textContent = 'Analysis Results';
  headerEl.className = 'results-header';
  resultsContainer.appendChild(headerEl);

  // Handle final documents if present
  if (results.final_documents && Object.keys(results.final_documents).length > 0) {
    const documentsSection = document.createElement('div');
    documentsSection.className = 'documents-section';

    const sectionHeader = document.createElement('h4');
    sectionHeader.textContent = 'Generated Documents';
    documentsSection.appendChild(sectionHeader);

    const docsGrid = document.createElement('div');
    docsGrid.className = 'documents-grid';

    for (const [docName, urls] of Object.entries(results.final_documents)) {
      const docCard = document.createElement('div');
      docCard.className = 'document-card';

      const docTitle = document.createElement('h5');
      docTitle.textContent = docName;
      docCard.appendChild(docTitle);

      const linksDiv = document.createElement('div');
      linksDiv.className = 'document-links';

      if (urls.html_url) {
        const htmlLink = document.createElement('a');
        htmlLink.href = urls.html_url;
        htmlLink.target = '_blank';
        htmlLink.className = 'btn btn-sm';
        htmlLink.textContent = 'View HTML';
        linksDiv.appendChild(htmlLink);
      }

      if (urls.json_url) {
        const jsonLink = document.createElement('a');
        jsonLink.href = urls.json_url;
        jsonLink.target = '_blank';
        jsonLink.className = 'btn btn-sm';
        jsonLink.textContent = 'Download JSON';
        linksDiv.appendChild(jsonLink);
      }

      docCard.appendChild(linksDiv);
      docsGrid.appendChild(docCard);
    }

    documentsSection.appendChild(docsGrid);
    resultsContainer.appendChild(documentsSection);
  }

  // Handle Markdown formatter results (NEW)
  if (results.other_results?.MDFormatter) {
    const markdownSection = document.createElement('div');
    markdownSection.className = 'markdown-results-section';

    const mdHeader = document.createElement('h4');
    mdHeader.textContent = 'Analysis Results';
    markdownSection.appendChild(mdHeader);

    // Process each document within MDFormatter
    for (const [documentName, documentResults] of Object.entries(results.other_results.MDFormatter)) {
      
      // Sort steps by step_result_sequence, then by step_id as fallback
      const sortedSteps = Object.entries(documentResults).sort(([, a], [, b]) => {
        const seqA = parseInt(a.step_result_sequence) || 999;
        const seqB = parseInt(b.step_result_sequence) || 999;
        if (seqA !== seqB) return seqA - seqB;
        return (a.step_id || 0) - (b.step_id || 0);
      });

      // Create container for all steps
      const stepsContainer = document.createElement('div');
      stepsContainer.className = 'markdown-steps-container';

      sortedSteps.forEach(([sectionKey, sectionData], index) => {
        // Create step container with separation
        const stepContainer = document.createElement('div');
        stepContainer.className = 'markdown-step-container';
        
        // Add step separator (except for first step)
        if (index > 0) {
          const separator = document.createElement('hr');
          separator.className = 'step-separator';
          stepContainer.appendChild(separator);
        }

        // Add step header if name exists
        if (sectionData.name) {
          const stepHeader = document.createElement('h5');
          stepHeader.className = 'markdown-step-header';
          stepHeader.textContent = `${index + 1}. ${sectionData.name}`;
          stepContainer.appendChild(stepHeader);
        }

        // Render markdown content
        if (sectionData.content) {
          const contentDiv = document.createElement('div');
          contentDiv.className = 'markdown-step-content';
          
          // Try to render with marked.js if available, otherwise fallback to preformatted text
          try {
            if (typeof marked !== 'undefined') {
              // Configure marked for better security and rendering
              marked.setOptions({
                breaks: true,
                gfm: true,
                sanitize: false, // We trust our own content, but in production consider DOMPurify
                smartLists: true,
                smartypants: true
              });
              contentDiv.innerHTML = marked.parse(sectionData.content);
            } else if (typeof window.marked !== 'undefined') {
              // Try window.marked
              contentDiv.innerHTML = window.marked.parse(sectionData.content);
            } else {
              // Fallback: basic markdown-to-HTML conversion
              contentDiv.innerHTML = convertBasicMarkdown(sectionData.content);
            }
          } catch (error) {
            console.warn('[formatAnalysisLMResults] Error parsing markdown:', error);
            // Fallback to preformatted text
            const preElement = document.createElement('pre');
            preElement.className = 'markdown-fallback';
            preElement.textContent = sectionData.content;
            contentDiv.appendChild(preElement);
          }
          
          stepContainer.appendChild(contentDiv);
        }

        stepsContainer.appendChild(stepContainer);
      });

      markdownSection.appendChild(stepsContainer);
    }

    resultsContainer.appendChild(markdownSection);
  }

  // Handle CSV files from CSVFormatter if present
  if (results.other_results?.CSVFormatter) {
    const csvSection = document.createElement('div');
    csvSection.className = 'csv-section';

    const csvHeader = document.createElement('h4');
    csvHeader.textContent = 'CSV Downloads';
    csvSection.appendChild(csvHeader);

    const csvGrid = document.createElement('div');
    csvGrid.className = 'csv-grid';

    for (const documentResults of Object.values(results.other_results.CSVFormatter)) {
      for (const stepData of Object.values(documentResults)) {
        if (stepData.name && stepData.csv_url) {
          const csvCard = document.createElement('div');
          csvCard.className = 'csv-card';

          const csvTitle = document.createElement('h5');
          csvTitle.textContent = stepData.name;
          csvCard.appendChild(csvTitle);

          const csvLink = document.createElement('a');
          csvLink.href = stepData.csv_url;
          csvLink.target = '_blank';
          csvLink.className = 'btn btn-sm';
          csvLink.textContent = 'Download CSV';
          csvCard.appendChild(csvLink);

          csvGrid.appendChild(csvCard);
        }
      }
    }

    csvSection.appendChild(csvGrid);
    resultsContainer.appendChild(csvSection);
  }

  // Handle HTML formatter results
  if (results.other_results?.HTMLFormatter) {
    const htmlResultsSection = document.createElement('div');
    htmlResultsSection.className = 'html-results-section';

    for (const [documentName, documentResults] of Object.entries(results.other_results.HTMLFormatter)) {
      for (const [sectionKey, sectionData] of Object.entries(documentResults)) {
        const resultCard = document.createElement('div');
        resultCard.className = 'result-card';

        if (sectionData.name) {
          const resultHeader = document.createElement('h4');
          resultHeader.textContent = sectionData.name;
          resultCard.appendChild(resultHeader);
        }

        if (sectionData.content) {
          const contentDiv = document.createElement('div');
          contentDiv.className = 'result-content';
          contentDiv.innerHTML = sectionData.content; // Note: In production, sanitize this HTML
          resultCard.appendChild(contentDiv);
        }

        htmlResultsSection.appendChild(resultCard);
      }
    }

    resultsContainer.appendChild(htmlResultsSection);
  }

  // Fall back to JSON display if none of the formatters matched or for other results
  if ((!results.final_documents || Object.keys(results.final_documents).length === 0) &&
    (!results.other_results || Object.keys(results.other_results).length === 0)) {

    const jsonResultsSection = document.createElement('div');
    jsonResultsSection.className = 'json-results-section';

    const jsonHeader = document.createElement('h4');
    jsonHeader.textContent = 'Raw Results';
    jsonResultsSection.appendChild(jsonHeader);

    const preElement = document.createElement('pre');
    preElement.className = 'json-display';
    preElement.textContent = JSON.stringify(results, null, 2);
    jsonResultsSection.appendChild(preElement);

    resultsContainer.appendChild(jsonResultsSection);
  }
}

/**
 * Basic markdown to HTML conversion fallback for when marked.js is not available
 * @param {string} markdown - The markdown text to convert
 * @returns {string} - Basic HTML representation
 */
function convertBasicMarkdown(markdown) {
  if (!markdown) return '';
  
  return markdown
    // Headers
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    // Bold
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Code blocks
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    // Inline code
    .replace(/`(.*?)`/g, '<code>$1</code>')
    // Line breaks
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')
    // Wrap in paragraph tags
    .replace(/^/, '<p>')
    .replace(/$/, '</p>')
    // Clean up empty paragraphs
    .replace(/<p><\/p>/g, '');
}

/**
 * Build a unique ID for the analysis-lm results container
 * E.g. "doc_ABC123__rfp_stage_2_initial_review__analysis-lm-results"
 */
export function getAnalysisLMResultsContainerId(docId, stageId) {
  if (!docId) docId = "unsavedDoc"; // fallback
  const safeDocId = docId.replace(/#/g, "_"); // remove or replace # so it's valid in CSS selectors
  return `${safeDocId}__${stageId}__analysis-lm-results`;
}

/**
 * Build a unique ID for the stage breadcrumb indicator
 * E.g. "doc_ABC123__rfp_stage_2_initial_review__stage-breadcrumb-number-indicator"
 */
export function getStageBreadcrumbNumberId(docId, stageId) {
  if (!docId) docId = "unsavedDoc";
  const safeDocId = docId.replace(/#/g, "_");
  return `${safeDocId}__${stageId}__stage-breadcrumb-number-indicator`;
}

/**
 * Actually render results into a container with the above ID.
 * This single function replaces the multiple code paths that were each
 * creating ".analysis-lm-results" blocks.
 *
 * @param {object} params
 *  - docId: the document identifier
 *  - stageId: the stage ID
 *  - results: the final or partial analysis-lm results object
 *  - parentEl: the DOM parent container in which to put our results sub-container
 *  - debugLabel: optional string for console logs
 */
export function renderAnalysisResults({ docId, stageId, results, parentEl, debugLabel = "" }) {
  console.log(`[renderAnalysisResults] docId=${docId}, stageId=${stageId}, debugLabel=${debugLabel}`);

  if (!parentEl) {
    console.warn("[renderAnalysisResults] No parentEl => cannot render results container");
    return;
  }
  if (!results) {
    console.error("[renderAnalysisResults] No results object provided");
    return;
  }

  // Build a unique ID for the sub-container
  const containerId = getAnalysisLMResultsContainerId(docId, stageId);

  // If an old container with this ID exists, remove it
  const existingEl = document.getElementById(containerId);
  if (existingEl) {
    console.log(`[renderAnalysisResults] Removing old results container #${containerId}`);
    existingEl.remove();
  }

  // Create a fresh container
  const resultsContainer = document.createElement("div");
  resultsContainer.id = containerId;
  resultsContainer.className = "analysis-lm-results";

  parentEl.appendChild(resultsContainer);

  // Now call the shared formatter function, which appends to our container
  // preserving the debug statements from your code
  formatAnalysisLMResults(resultsContainer, results);

  console.log(`[renderAnalysisResults] Successfully appended results into #${containerId}`);
}
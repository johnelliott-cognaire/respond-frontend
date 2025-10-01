/**
 * Assist Document Context Module
 *
 * This module extracts document workflow and task type context from Cognaire Respond's
 * document task framework. It provides information about active documents, workflow stages,
 * and task types for context-aware assistance.
 *
 * Key Features:
 * - Active document detection from store state and DOM
 * - Document task type identification (RFP, Security, etc.)
 * - Current stage information and progress tracking
 * - Document metadata extraction
 * - Integration with multi-stage document framework
 */

/**
 * Get active document information from store and current context
 * @returns {Object} Active document information
 */
export function getActiveDocumentInfo() {
  try {
    const documentInfo = {
      hasActiveDocument: false,
      documentId: null,
      source: null,
      tabIndex: null,
      isFrameworkDocument: false
    };

    // Method 1: Check URL for document ID (most reliable for current context)
    const pathname = window.location.pathname;
    const urlDocumentMatch = pathname.match(/\/docs\/([A-Z]{3}-\d{3,6})$/);
    if (urlDocumentMatch) {
      documentInfo.hasActiveDocument = true;
      documentInfo.documentId = urlDocumentMatch[1];
      documentInfo.source = 'url';
      documentInfo.isFrameworkDocument = true; // URL-based docs are framework docs
      return documentInfo;
    }

    // Method 2: Check store for active tab with document
    if (window.store && typeof window.store.get === 'function') {
      try {
        const openTabs = window.store.get('openTabs') || [];
        const activeTabIndex = window.store.get('activeTabIndex') || 0;

        if (openTabs.length > 0 && openTabs[activeTabIndex]) {
          const activeTab = openTabs[activeTabIndex];

          // Check if it's a framework document tab
          if (activeTab.isFrameworkDoc && activeTab.docTaskInstance) {
            documentInfo.hasActiveDocument = true;
            documentInfo.documentId = activeTab.docTaskInstance.documentId || activeTab.documentId;
            documentInfo.source = 'store-active-tab';
            documentInfo.tabIndex = activeTabIndex;
            documentInfo.isFrameworkDocument = true;
            documentInfo.tabInfo = {
              title: activeTab.title,
              type: activeTab.type,
              docTaskInstance: activeTab.docTaskInstance
            };
            return documentInfo;
          }

          // Check for regular document tab
          if (activeTab.documentId) {
            documentInfo.hasActiveDocument = true;
            documentInfo.documentId = activeTab.documentId;
            documentInfo.source = 'store-regular-tab';
            documentInfo.tabIndex = activeTabIndex;
            documentInfo.isFrameworkDocument = false;
            documentInfo.tabInfo = {
              title: activeTab.title,
              type: activeTab.type
            };
            return documentInfo;
          }
        }
      } catch (storeError) {
        console.warn('[AssistDocument] Error accessing store for document info:', storeError);
      }
    }

    // Method 3: Check DOM for document framework elements
    const frameworkElement = document.querySelector('.multi-stage-document-framework');
    if (frameworkElement) {
      const documentIdElement = frameworkElement.querySelector('[data-document-id]');
      if (documentIdElement) {
        const documentId = documentIdElement.getAttribute('data-document-id');
        if (documentId) {
          documentInfo.hasActiveDocument = true;
          documentInfo.documentId = documentId;
          documentInfo.source = 'dom-framework';
          documentInfo.isFrameworkDocument = true;
          return documentInfo;
        }
      }
    }

    return documentInfo;
  } catch (error) {
    console.error('[AssistDocument] Error getting active document info:', error);
    return {
      hasActiveDocument: false,
      error: error.message
    };
  }
}

/**
 * Get document task type information
 * @returns {Object} Task type information
 */
export function getDocumentTaskType() {
  try {
    const documentInfo = getActiveDocumentInfo();
    if (!documentInfo.hasActiveDocument || !documentInfo.isFrameworkDocument) {
      return {
        available: false,
        reason: 'No active framework document'
      };
    }

    let taskTypeInfo = {
      available: false,
      taskType: null,
      displayName: null,
      description: null,
      stages: [],
      source: null
    };

    // Method 1: Get from active tab's docTaskInstance
    if (documentInfo.source === 'store-active-tab' && documentInfo.tabInfo?.docTaskInstance) {
      const docTaskInstance = documentInfo.tabInfo.docTaskInstance;
      if (docTaskInstance.taskType) {
        taskTypeInfo.available = true;
        taskTypeInfo.taskType = docTaskInstance.taskType;
        taskTypeInfo.source = 'docTaskInstance';

        // Try to get definition from task type definitions
        const definition = getTaskTypeDefinition(docTaskInstance.taskType);
        if (definition) {
          taskTypeInfo.displayName = definition.displayLabel;
          taskTypeInfo.description = definition.description;
          taskTypeInfo.stages = definition.stages || [];
          taskTypeInfo.iconClass = definition.iconClass;
          taskTypeInfo.color = definition.color;
        }

        return taskTypeInfo;
      }
    }

    // Method 2: Try to get from global document task framework
    if (window.documentTaskFramework) {
      try {
        const framework = window.documentTaskFramework;
        if (framework.docTaskInstance && framework.docTaskInstance.taskType) {
          taskTypeInfo.available = true;
          taskTypeInfo.taskType = framework.docTaskInstance.taskType;
          taskTypeInfo.source = 'global-framework';

          const definition = getTaskTypeDefinition(framework.docTaskInstance.taskType);
          if (definition) {
            taskTypeInfo.displayName = definition.displayLabel;
            taskTypeInfo.description = definition.description;
            taskTypeInfo.stages = definition.stages || [];
            taskTypeInfo.iconClass = definition.iconClass;
            taskTypeInfo.color = definition.color;
          }

          return taskTypeInfo;
        }
      } catch (frameworkError) {
        console.warn('[AssistDocument] Error accessing global framework:', frameworkError);
      }
    }

    // Method 3: Try to infer from DOM elements
    const frameworkElement = document.querySelector('.multi-stage-document-framework');
    if (frameworkElement) {
      const taskTypeElement = frameworkElement.querySelector('[data-task-type]');
      if (taskTypeElement) {
        const taskType = taskTypeElement.getAttribute('data-task-type');
        if (taskType) {
          taskTypeInfo.available = true;
          taskTypeInfo.taskType = taskType;
          taskTypeInfo.source = 'dom-data-attribute';

          const definition = getTaskTypeDefinition(taskType);
          if (definition) {
            taskTypeInfo.displayName = definition.displayLabel;
            taskTypeInfo.description = definition.description;
            taskTypeInfo.stages = definition.stages || [];
          }

          return taskTypeInfo;
        }
      }
    }

    return taskTypeInfo;
  } catch (error) {
    console.error('[AssistDocument] Error getting task type:', error);
    return {
      available: false,
      error: error.message
    };
  }
}

/**
 * Get task type definition from document task type definitions
 * @param {string} taskType - Task type identifier
 * @returns {Object|null} Task type definition or null
 */
function getTaskTypeDefinition(taskType) {
  try {
    // Try to access global task type definitions
    if (window.DOC_TASK_TYPE_DEFINITIONS && Array.isArray(window.DOC_TASK_TYPE_DEFINITIONS)) {
      return window.DOC_TASK_TYPE_DEFINITIONS.find(def => def.taskType === taskType);
    }

    // Try to import dynamically if available
    if (window.documentTaskTypeDefinitions) {
      return window.documentTaskTypeDefinitions.find(def => def.taskType === taskType);
    }

    return null;
  } catch (error) {
    console.warn('[AssistDocument] Error accessing task type definitions:', error);
    return null;
  }
}

/**
 * Get current stage information from active document
 * @returns {Object} Current stage information
 */
export function getCurrentStageInfo() {
  try {
    const documentInfo = getActiveDocumentInfo();
    if (!documentInfo.hasActiveDocument || !documentInfo.isFrameworkDocument) {
      return {
        available: false,
        reason: 'No active framework document'
      };
    }

    let stageInfo = {
      available: false,
      currentStageId: null,
      currentStageName: null,
      currentStageIndex: null,
      totalStages: null,
      progress: null,
      stageType: null,
      source: null
    };

    // Method 1: Get from active tab's docTaskInstance
    if (documentInfo.source === 'store-active-tab' && documentInfo.tabInfo?.docTaskInstance) {
      const docTaskInstance = documentInfo.tabInfo.docTaskInstance;

      stageInfo.available = true;
      stageInfo.source = 'docTaskInstance';
      stageInfo.currentStageId = docTaskInstance.currentStageId;
      stageInfo.currentStageIndex = docTaskInstance.currentStageIndex;

      // Get stage definition information
      const taskType = getDocumentTaskType();
      if (taskType.available && taskType.stages) {
        stageInfo.totalStages = taskType.stages.length;

        const currentStage = taskType.stages[stageInfo.currentStageIndex];
        if (currentStage) {
          stageInfo.currentStageName = currentStage.stageName;
          stageInfo.stageType = currentStage.stageType;
        }

        // Calculate progress
        if (stageInfo.currentStageIndex !== null && stageInfo.totalStages) {
          stageInfo.progress = Math.round(((stageInfo.currentStageIndex + 1) / stageInfo.totalStages) * 100);
        }
      }

      return stageInfo;
    }

    // Method 2: Get from global framework
    if (window.documentTaskFramework) {
      try {
        const framework = window.documentTaskFramework;
        if (framework.docTaskInstance) {
          const docTaskInstance = framework.docTaskInstance;

          stageInfo.available = true;
          stageInfo.source = 'global-framework';
          stageInfo.currentStageId = docTaskInstance.currentStageId;
          stageInfo.currentStageIndex = docTaskInstance.currentStageIndex;

          const taskType = getDocumentTaskType();
          if (taskType.available && taskType.stages) {
            stageInfo.totalStages = taskType.stages.length;

            const currentStage = taskType.stages[stageInfo.currentStageIndex];
            if (currentStage) {
              stageInfo.currentStageName = currentStage.stageName;
              stageInfo.stageType = currentStage.stageType;
            }

            if (stageInfo.currentStageIndex !== null && stageInfo.totalStages) {
              stageInfo.progress = Math.round(((stageInfo.currentStageIndex + 1) / stageInfo.totalStages) * 100);
            }
          }

          return stageInfo;
        }
      } catch (frameworkError) {
        console.warn('[AssistDocument] Error accessing global framework for stage info:', frameworkError);
      }
    }

    // Method 3: Try to get from DOM
    const stageElements = document.querySelectorAll('.breadcrumb .breadcrumb-item');
    if (stageElements.length > 0) {
      stageInfo.available = true;
      stageInfo.source = 'dom-breadcrumbs';
      stageInfo.totalStages = stageElements.length;

      // Find active stage
      const activeStageElement = document.querySelector('.breadcrumb .breadcrumb-item.active');
      if (activeStageElement) {
        stageInfo.currentStageName = activeStageElement.textContent.trim();
        stageInfo.currentStageIndex = Array.from(stageElements).indexOf(activeStageElement);
        stageInfo.progress = Math.round(((stageInfo.currentStageIndex + 1) / stageInfo.totalStages) * 100);
      }

      return stageInfo;
    }

    return stageInfo;
  } catch (error) {
    console.error('[AssistDocument] Error getting stage info:', error);
    return {
      available: false,
      error: error.message
    };
  }
}

/**
 * Get document metadata (title, project, etc.)
 * @returns {Object} Document metadata
 */
export function getDocumentMetadata() {
  try {
    const documentInfo = getActiveDocumentInfo();
    if (!documentInfo.hasActiveDocument) {
      return {
        available: false,
        reason: 'No active document'
      };
    }

    let metadata = {
      available: false,
      title: null,
      projectId: null,
      projectName: null,
      documentId: documentInfo.documentId,
      source: null
    };

    // Method 1: Get from active tab info
    if (documentInfo.tabInfo) {
      metadata.available = true;
      metadata.source = 'tab-info';
      metadata.title = documentInfo.tabInfo.title;

      if (documentInfo.tabInfo.docTaskInstance) {
        const docTaskInstance = documentInfo.tabInfo.docTaskInstance;
        metadata.projectId = docTaskInstance.projectId;
        metadata.documentTitle = docTaskInstance.documentTitle;
        metadata.createdDate = docTaskInstance.createdDate;
        metadata.lastModified = docTaskInstance.lastModified;
      }

      return metadata;
    }

    // Method 2: Get from DOM elements
    const titleElement = document.querySelector('.document-title, .tab-title, h1');
    if (titleElement) {
      metadata.available = true;
      metadata.source = 'dom-title';
      metadata.title = titleElement.textContent.trim();
    }

    // Try to get project info from breadcrumbs or navigation
    const breadcrumbElement = document.querySelector('.breadcrumb .project-name');
    if (breadcrumbElement) {
      metadata.projectName = breadcrumbElement.textContent.trim();
    }

    return metadata;
  } catch (error) {
    console.error('[AssistDocument] Error getting document metadata:', error);
    return {
      available: false,
      error: error.message
    };
  }
}

/**
 * Get stage completion status for all stages
 * @returns {Array} Array of stage completion information
 */
export function getStageCompletionStatus() {
  try {
    const taskType = getDocumentTaskType();
    const currentStage = getCurrentStageInfo();

    if (!taskType.available || !currentStage.available) {
      return [];
    }

    const documentInfo = getActiveDocumentInfo();
    let stageData = null;

    // Try to get stage data from docTaskInstance
    if (documentInfo.source === 'store-active-tab' && documentInfo.tabInfo?.docTaskInstance) {
      stageData = documentInfo.tabInfo.docTaskInstance.stageData || {};
    }

    const stages = taskType.stages.map((stage, index) => {
      const stageInfo = {
        stageId: stage.stageId,
        stageName: stage.stageName,
        stageIndex: index,
        isCurrentStage: index === currentStage.currentStageIndex,
        isCompleted: index < currentStage.currentStageIndex,
        stageType: stage.stageType
      };

      // Add completion data if available
      if (stageData && stageData[stage.stageId]) {
        stageInfo.hasData = true;
        stageInfo.stageResults = stageData[stage.stageId];
      }

      return stageInfo;
    });

    return stages;
  } catch (error) {
    console.error('[AssistDocument] Error getting stage completion status:', error);
    return [];
  }
}

/**
 * Get workflow-specific context summary
 * @returns {string} Human-readable workflow summary
 */
export function getWorkflowContextSummary() {
  try {
    const documentInfo = getActiveDocumentInfo();
    if (!documentInfo.hasActiveDocument) {
      return "No active document workflow.";
    }

    const taskType = getDocumentTaskType();
    const stageInfo = getCurrentStageInfo();
    const metadata = getDocumentMetadata();

    let summary = `Active document: ${documentInfo.documentId}`;

    if (metadata.available && metadata.title) {
      summary += ` (${metadata.title})`;
    }

    if (taskType.available) {
      summary += `. Workflow type: ${taskType.displayName || taskType.taskType}`;

      if (stageInfo.available) {
        summary += `. Current stage: ${stageInfo.currentStageName || 'Unknown'}`;

        if (stageInfo.progress !== null) {
          summary += ` (${stageInfo.progress}% complete)`;
        }

        if (stageInfo.currentStageIndex !== null && stageInfo.totalStages) {
          summary += ` - Stage ${stageInfo.currentStageIndex + 1} of ${stageInfo.totalStages}`;
        }
      }
    }

    summary += ".";

    return summary;
  } catch (error) {
    console.error('[AssistDocument] Error generating workflow summary:', error);
    return "Unable to determine current workflow context.";
  }
}
// ui/framework/document-task-framework.js
/**
 * Ensures we store docTaskInstance.taskType and properly restore it.
 */

import { DOC_TASK_TYPE_DEFINITIONS } from "./document-task-type-definitions.js";
import { ErrorModal } from "../../ui/modals/error-modal.js";
import { MultiStageDocumentWithBreadcrumbOrchestrator } from "./multi-stage-document-with-breadcrumb.js";

export class DocumentTaskFramework {
  constructor(store, jobController) {
    console.log("[DocumentTaskFramework] constructor called");
    this.store = store;
    this.jobController = jobController;
    this.definitions = DOC_TASK_TYPE_DEFINITIONS;
  }

  listAllTaskTypes() {
    console.log("[DocumentTaskFramework] listAllTaskTypes() called");
    return this.definitions.map(def => ({
      taskType: def.taskType,
      label: def.displayLabel || def.taskType,
      iconClass: def.iconClass || "fas fa-file",
      color: def.color || "default-color"
    }));
  }

  getTaskDefinition(taskType) {
    const defn = this.definitions.find(d => d.taskType === taskType);
    if (!defn) {
      console.error(`[DocumentTaskFramework] No definition for '${taskType}'`);
      return null;
    }
    return defn;
  }

  /**
   * Validate or fallback to "single_question_new_framework"
   */
  _validateOrDefaultTaskType(rawType) {
    if (!rawType) {
      console.warn("[DocumentTaskFramework] _validateOrDefaultTaskType => no taskType found. Defaulting to single_question_new_framework.");
      return "single_question_new_framework";
    }
    const validTypes = this.definitions.map(d => d.taskType);
    if (!validTypes.includes(rawType)) {
      console.warn(`[DocumentTaskFramework] Task type "${rawType}" not recognized => defaulting to single_question_new_framework.`);
      return "single_question_new_framework";
    }
    return rawType;
  }

  createNewDocumentTask(taskType, projectId, projectName, ownerUsername = "guest") {
    // Validate project ID is in composite format
    if (!projectId.includes('#')) {
      const errorMsg = `Project ID must be in composite format "accountId#projectId". Received: "${projectId}"`;
      console.error(`[DocumentTaskFramework] ${errorMsg}`);
      new ErrorModal().show({
        title: "Invalid Project ID",
        message: errorMsg
      });
      return null;
    }
  
    const finalTaskType = this._validateOrDefaultTaskType(taskType);
    const defn = this.getTaskDefinition(finalTaskType);
    if (!defn) {
      new ErrorModal().show({
        title: "Error Creating Document",
        message: `No framework definition found for task type '${finalTaskType}'.`
      });
      return null;
    }
  
    // Generate a short document ID (3 characters)
    const tempDocId = Math.random().toString(36).slice(2, 5);
    
    // Extract account_id and project_id components from the composite ID
    const [accountId, plainProjectId] = projectId.split('#', 2);
    
    // Use a safe project name/ID for display
    const safeProjectName = projectName || plainProjectId || "Unknown";
    const projectIdDisplay = plainProjectId || accountId;
  
    // Build the docTaskInstance (plain data object)
    const docTaskInstance = {
      taskType: finalTaskType,
      projectId,  // Store the full composite ID
      accountId,  // Store account_id separately for easier reference
      plainProjectId, // Store project_id part separately too
      projectName: safeProjectName,
      ownerUsername,
      documentId: null,
      title: `${defn.displayLabel || 'Document'} - ${projectIdDisplay} - ${tempDocId}`,
      status: "NEW",
      createdAt: new Date().toISOString(),
      lastSavedAt: null,
      isSaved: false,
      isDirty: true,
      stages: defn.stages.map(stage => ({ ...stage, status: "NOT_STARTED" })),
      currentStageIndex: 0,
      stageData: {},
      jobReferences: {},
      compositeId: projectId  // Store the composite ID here as well
    };
  
    // Instantiate using the definition's stages
    let docInstance = null;
    if (defn.stages && defn.stages.length) {
      docInstance = new MultiStageDocumentWithBreadcrumbOrchestrator(docTaskInstance, this.jobController, defn);
    } else {
      throw new Error(`Task type "${finalTaskType}" does not have any stages defined.`);
    }
  
    return docInstance;
  }

  /**
   * Restore from saved JSON => rebuild the doc instance class.
   */
  restoreDocumentTask(serializedDoc) {
    const finalType = this._validateOrDefaultTaskType(serializedDoc.taskType);
    serializedDoc.taskType = finalType;

    // Find the definition
    const defn = this.definitions.find(d => d.taskType === finalType);
    if (!defn) {
      throw new Error(`No task definition found for taskType="${finalType}". Cannot continue.`);
    }
    
    // Ensure we have properly parsed projectId components
    if (serializedDoc.projectId && !serializedDoc.plainProjectId) {
      const [accountId, plainProjectId] = serializedDoc.projectId.split('#', 2);
      serializedDoc.accountId = accountId;
      serializedDoc.plainProjectId = plainProjectId;
    }

    // If the definition has 'stages', let's use the generic multi-stage doc
    if (defn.stages && defn.stages.length) {
      // Create a doc instance that can load each stage form from defn.stages
      return new MultiStageDocumentWithBreadcrumbOrchestrator(serializedDoc, this.jobController, defn);
    }

    // If no 'stages', we could either throw or show an error doc
    // The user asked: "If no definition, show an error rather than fallback."
    throw new Error(`The taskType="${finalType}" does not have any stages defined. Stopping.`);
  }

  /**
   * Instructs the doc instance to render itself in containerEl.
   */
  loadStage(docTaskInstanceOrObj, stageIndex, containerEl) {
    console.log("[DocumentTaskFramework] loadStage() called");
    
    if (typeof docTaskInstanceOrObj.renderContent !== "function") {
      console.error("[DocumentTaskFramework] docTask is not an instance => can't call renderContent().");
      return;
    }
    
    // Attach to DOM first
    docTaskInstanceOrObj.attachToDOM(containerEl);
    
    // Try to restore active stage from tab metadata if available
    try {
      // Use window.tabManager instead of this.tabs since tabs belong to TabManager
      if (window.tabManager && window.tabManager.tabs) {
        // Find the tab for this document
        const tabIndex = window.tabManager.tabs.findIndex(t => t.newFrameworkDoc === docTaskInstanceOrObj);
        
        if (tabIndex >= 0 && window.tabManager.tabs[tabIndex].activeStageId) {
          const activeStageId = window.tabManager.tabs[tabIndex].activeStageId;
          
          // Validate the stageId exists in the document
          if (docTaskInstanceOrObj.docTaskInstance?.stages) {
            const foundStageIndex = docTaskInstanceOrObj.docTaskInstance.stages.findIndex(
              s => s.stageId === activeStageId
            );
            
            // If valid stageId found, set it as current
            if (foundStageIndex >= 0) {
              console.log(`[DocumentTaskFramework] Restoring to last active stage: ${activeStageId} (index: ${foundStageIndex})`);
              docTaskInstanceOrObj.docTaskInstance.currentStageIndex = foundStageIndex;
            }
          }
        }
      }
    } catch (err) {
      // Just log the error but don't prevent rendering
      console.warn("[DocumentTaskFramework] Error restoring active stage:", err);
    }
    
    // Continue with normal rendering
    docTaskInstanceOrObj.renderContent();
  }

  /**
   * Calls the doc instance's handleSaveDocument.
   */
  async saveDocumentTask(docTaskInstanceOrObj) {
    if (typeof docTaskInstanceOrObj.handleSaveDocument === "function") {
      return docTaskInstanceOrObj.handleSaveDocument();
    }
    throw new Error("No handleSaveDocument() found on doc instance.");
  }
}
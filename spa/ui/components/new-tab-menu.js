// ui/components/new-tab-menu.js
import { MessageModal } from "../modals/message-modal.js";
import { TextPromptModal } from "../modals/text-prompt-modal.js";
import { DocumentTaskFramework } from "../framework/document-task-framework.js";
import { ErrorModal } from "../modals/error-modal.js";
import { isUserFriendlyStorageError } from "../../utils/storage-errors.js";

export class NewTabMenu {
  constructor(store, tabManager) {
    console.log("[NewTabMenu] Constructor called");
    this.store = store;
    this.tabManager = tabManager;
    this.rootEl = null;
    this.isVisible = false;
    this.selectedTask = null;

    this.framework = new DocumentTaskFramework(this.store, window.jobController);

    // List tasks
    this.tasks = this.framework.listAllTaskTypes();
    console.log("[NewTabMenu] Set this.tasks using this.framework.listAllTaskTypes(): " + this.tasks);

    this.authorizedProjects = [];
    this.position = { top: 0, right: 0 };
    this.messageModal = new MessageModal();
    this.errorModal = new ErrorModal();
  }

  addEventListeners() {
    this.addMenuEventListeners();
  }

  attachToDOM(rootEl) {
    console.log("[NewTabMenu] attachToDOM() => rootEl:", rootEl);
    this.rootEl = rootEl;
    this.refresh();
  }

  setPosition(position) {
    console.log("[NewTabMenu] setPosition() =>", position);
    this.position = position;
    this.refresh();
  }

  refresh() {
    console.log("[NewTabMenu] refresh() called");
    const user = this.store.get("user");
    console.log("[NewTabMenu] current user =>", user);
    const token = localStorage.getItem("authToken");

    if (!user || !token) {
      console.warn("[NewTabMenu] No user or not logged in => tasks/projects empty");
      this.tasks = [];
      this.authorizedProjects = [];
    } else {
      this.tasks = this.framework.listAllTaskTypes();
      if (Array.isArray(user.authorized_projects)) {
        this.authorizedProjects = user.authorized_projects;
        console.log("[NewTabMenu] authorizedProjects =>", this.authorizedProjects);
      } else {
        console.warn("[NewTabMenu] user.authorized_projects is not an array =>", user.authorized_projects);
        this.authorizedProjects = [];
      }
    }
    this.render();
  }

  render() {
    if (!this.rootEl) {
      console.warn("[NewTabMenu] No rootEl => skip rendering");
      return;
    }
    const menuVisibleClass = this.isVisible ? "visible" : "";
    const menuStyles = `
      position: absolute;
      top: ${this.position.top}px;
      right: ${this.position.right}px;
    `;
    this.rootEl.innerHTML = `
      <div class="new-tab-menu ${menuVisibleClass}" style="${menuStyles}">
        <div class="task-menu">
          ${
            this.tasks.length === 0
              ? `<div class="task-menu-item" style="color:#aaa;">No tasks available (login first?)</div>`
              : this.tasks.map(t => `
                  <div class="task-menu-item" data-task-id="${t.taskType}">
                    ${t.label}
                    ${
                      this.selectedTask && this.selectedTask.taskType === t.taskType
                        ? this.renderProjectMenu()
                        : ""
                    }
                  </div>
                `).join("")
          }
        </div>
      </div>
    `;
    console.log("[NewTabMenu] render() => isVisible:", this.isVisible);
    if (this.isVisible) {
      this.addMenuEventListeners();
    }
  }

  addMenuEventListeners() {
    console.log("[NewTabMenu] addMenuEventListeners()");
    if (!this.rootEl) return;

    const taskItems = this.rootEl.querySelectorAll(".task-menu-item");
    taskItems.forEach(item => {
      item.addEventListener("click", e => {
        e.stopPropagation();
        const tId = item.dataset.taskId;
        console.log("[NewTabMenu] user clicked task =>", tId);
        const foundTask = this.tasks.find(x => x.taskType === tId);
        if (!foundTask) return;

        if (this.authorizedProjects.length === 0) {
          console.warn("[NewTabMenu] no projects => can't proceed");
          this.messageModal.show({
            title: "No Projects",
            message: "You have no assigned projects. Contact your admin."
          });
          this.hideMenu();
          return;
        }

        if (this.authorizedProjects.length === 1) {
          this.openTaskTab(foundTask, this.authorizedProjects[0]);
        } else {
          // multiple projects => show sub-menu
          this.selectedTask = foundTask;
          this.render(); // re-render so project sub-menu shows
        }
      });
    });

    // Projects
    const projectItems = this.rootEl.querySelectorAll(".project-item");
    projectItems.forEach(pEl => {
      pEl.addEventListener("click", e => {
        e.stopPropagation();
        const projVal = pEl.dataset.projectValue;
        console.log("[NewTabMenu] user clicked project =>", projVal);
        if (this.selectedTask && projVal) {
          this.openTaskTab(this.selectedTask, projVal);
        }
      });
    });
  }

  toggleVisibility(evt) {
    console.log("[NewTabMenu] toggleVisibility() => plus button clicked");
    evt.stopPropagation();
    const buttonRect = evt.currentTarget.getBoundingClientRect();
    this.setPosition({
      top: buttonRect.bottom + window.scrollY,
      right: window.innerWidth - buttonRect.right
    });
    this.isVisible = !this.isVisible;
    this.selectedTask = null;
    this.refresh();
  }

  hideMenu() {
    console.log("[NewTabMenu] hideMenu()");
    this.isVisible = false;
    this.selectedTask = null;
    this.refresh();
  }

  renderProjectMenu() {
    if (!this.authorizedProjects || this.authorizedProjects.length === 0) {
      return `
        <div class="project-menu visible">
          <div style="color:#ccc; padding:8px;">No projects found</div>
        </div>
      `;
    }
    return `
      <div class="project-menu visible">
        ${this.authorizedProjects.map((projectStr) => `
          <div class="project-item" data-project-value="${projectStr}">
            ${projectStr}
          </div>
        `).join("")}
      </div>
    `;
  }

  openTaskTab(task, rawProjectVal) {
    console.log("[NewTabMenu] openTaskTab => Task:", task, "Project:", rawProjectVal);
    this.hideMenu();

    // Create doc instance
    const docInstance = this.framework.createNewDocumentTask(
      task.taskType,
      rawProjectVal,  // projectId
      rawProjectVal,  // projectName
      (this.store.get("user")?.username || "guest")
    );
    if (!docInstance) {
      console.error("[NewTabMenu] docInstance is null => can't open tab");
      return;
    }

    // Prompt user for doc name
    const promptModal = new TextPromptModal({
      fieldLabel: "Enter Document Title",
      defaultValue: docInstance.docTaskInstance.title,
      onOk: (userInput) => {
        const finalTitle = userInput.trim();
        if (!finalTitle) {
          console.warn("[NewTabMenu] user provided empty doc name => using default");
        } else {
          docInstance.docTaskInstance.title = finalTitle;
        }

        // Add a new tab
        this._createNewTab(task, docInstance);
      },
      onCancel: () => {
        console.log("[NewTabMenu] user canceled doc name => not opening doc");
      }
    });
    promptModal.show();
  }

  _createNewTab(task, docInstance) {
    console.log("[NewTabMenu] _createNewTab => docInstance.compositeId =", docInstance.docTaskInstance?.compositeId);

    try {
      // Use TabManager's createDocumentTab method which handles limits
      const tabIndex = this.tabManager.createDocumentTab(docInstance, task.iconClass || "fas fa-file");
      
      if (tabIndex >= 0) {
        console.log(`[NewTabMenu] Successfully created new tab at index ${tabIndex}`);
      } else {
        console.error("[NewTabMenu] Failed to create new tab");
        this.errorModal.show({
          title: "Failed to Create Tab",
          message: "Could not create a new tab. Please try again."
        });
      }
    } catch (error) {
      console.error("[NewTabMenu] Error creating new tab:", error);
      
      // Handle user-friendly storage errors specially
      if (isUserFriendlyStorageError(error)) {
        const userMessage = error.getUserMessage();
        this.errorModal.show({
          title: userMessage.title,
          message: userMessage.message,
          details: userMessage.details + "\n\n" + userMessage.actionAdvice
        });
      } else {
        // Handle other errors
        this.errorModal.show({
          title: "Cannot Create New Tab",
          message: error.message || "An unexpected error occurred while creating the tab.",
          details: "Please try again or contact support if the problem persists."
        });
      }
    }
  }
}

// main.js
import { checkAndRestoreLogin, logout } from "./api/auth.js";
import { AdaptiveJobController } from "./modules/adaptive-job-controller.js";
import { JobSessionManager } from "./modules/job-session-manager.js";
import { NotificationController } from "./modules/notification-controller.js";
import { ScrollController } from "./modules/scroll-controller.js";
import { SubtenantManager } from "./modules/subtenant-manager.js";
import { Security } from "./state/security.js";
import { Store } from "./state/store.js";
import { NewTabMenu } from "./ui/components/new-tab-menu.js";
import { JobsModal } from "./ui/modals/jobs-modal.js";
import { TopBar } from "./ui/top-bar/top-bar.js";
import { CorpusManager } from "./ui/views/corpus-manager.js";
import { TabManager } from "./ui/views/tab-manager.js";
import { getBaseUrl, getConfig } from "./utils/config.js";
import { mainThreadMonitor } from "./utils/main-thread-monitor.js";
import { initializeSecurityManager } from "./utils/security-utils.js";
import { initializeModalNavigation } from "./ui/components/modal-navigation-manager.js";
import { storageAnalyzer } from "./utils/storage-analyzer.js";
import { AssistIntegration } from "./modules/assist-integration.js";
import { initializeRouterIntegration } from "./router/integration.js";
import { ErrorModal } from "./ui/modals/error-modal.js";

// Use config module instead of hardcoded values
const config = getConfig();
export const API_BASE_URL = getBaseUrl("main");



let store, security;
let jobController, notificationController;
let jobSessionManager; // Enhanced session management
let topBar, tabManager, newTabMenu;
let jobsModal;
let corpusManager;            // instance of CorpusManager
let currentView = null;   // 'main' | 'corpus'
let subtenantManager;
let routerIntegration;        // Router integration instance
let errorModal;               // Global error modal for router

window.appStore = null;

const VIEW_STATE_KEY = "currentView";  // "main" or "corpus"

// Flag to prevent double event handling
let isProcessingLogin = false;
let isProcessingLogout = false;

/**
 * Show subtenant error and prevent app from loading
 */
function showSubtenantError(errorMessage) {
  console.error('[main] Subtenant validation failed:', errorMessage);

  // Hide the normal app interface
  document.getElementById("topBarRoot").style.display = "none";
  document.querySelector(".tab-bar-wrapper").style.display = "none";

  // Show error message
  const mainContent = document.getElementById("mainContent");
  mainContent.innerHTML = `
    <div style="
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 60vh;
      padding: 2rem;
      text-align: center;
      background: #f8f9fa;
      border-radius: 8px;
      margin: 2rem;
      border: 1px solid #e9ecef;
    ">
      <div style="
        background: #dc3545;
        color: white;
        padding: 1rem 2rem;
        border-radius: 6px;
        margin-bottom: 1.5rem;
        font-weight: 500;
      ">
        <i class="fas fa-exclamation-triangle" style="margin-right: 0.5rem;"></i>
        Organization Validation Error
      </div>
      
      <div style="
        font-size: 1.1rem;
        color: #495057;
        margin-bottom: 2rem;
        max-width: 600px;
        line-height: 1.5;
      ">
        ${errorMessage}
      </div>
      
      <div style="
        background: #e9ecef;
        padding: 1.5rem;
        border-radius: 6px;
        max-width: 500px;
        color: #6c757d;
        font-size: 0.9rem;
      ">
        <div style="margin-bottom: 1rem; font-weight: 500;">
          <i class="fas fa-info-circle" style="margin-right: 0.5rem;"></i>
          Need help?
        </div>
        <div>
          Contact your administrator for the correct organization code, or ensure your login link 
          includes the proper ?s=organization-code parameter.
        </div>
      </div>
      
      <button onclick="window.location.reload()" style="
        margin-top: 2rem;
        background: #007bff;
        color: white;
        border: none;
        padding: 0.75rem 1.5rem;
        border-radius: 4px;
        cursor: pointer;
        font-size: 1rem;
      ">
        <i class="fas fa-refresh" style="margin-right: 0.5rem;"></i>
        Retry
      </button>
    </div>
  `;
}


// Update the showCorpusManagement function
function showCorpusManagement() {
  console.log("[main] → Showing Corpus Management (currentView:", currentView, ")");

  if (currentView === "corpus") return;
  console.log("[main] → Showing Corpus Management");

  /* 1 – hide tab bar */
  const tabBarWrapper = document.querySelector(".tab-bar-wrapper");
  if (tabBarWrapper) tabBarWrapper.style.display = "none";

  /* 2 – remove #mainContent styling to not interfere with CorpusManager */
  const mainContentEl = document.getElementById("mainContent");
  if (mainContentEl) {
    mainContentEl.style.background = "transparent";
    mainContentEl.style.backgroundColor = "transparent";
    mainContentEl.style.border = "none";
    mainContentEl.style.padding = "0";
    mainContentEl.style.minHeight = "0";
    mainContentEl.style.borderRadius = "0";
    mainContentEl.style.boxShadow = "none";
  }

  /* 3 – create / render CorpusManager */
  if (!corpusManager) {
    corpusManager = new CorpusManager(store, jobController);
    corpusManager.attachToDOM({ mainContentEl });
    
    // Make corpusManager globally available for router integration
    window.corpusManager = corpusManager;
  }
  corpusManager.render();

  currentView = "corpus";

  /* 4 – Save view state to localStorage */
  localStorage.setItem(VIEW_STATE_KEY, "corpus");
}

// Update the showMainApp function
function showMainApp() {
  console.log("[main] → Showing Main App (currentView:", currentView, ")");

  /* 1 – restore #mainContent styling */
  const mainContentEl = document.getElementById("mainContent");
  if (mainContentEl) {
    mainContentEl.style.background = "";  // Reset to CSS default
    mainContentEl.style.backgroundColor = "";
    mainContentEl.style.border = "";
    mainContentEl.style.padding = "";
    mainContentEl.style.minHeight = "";
    mainContentEl.style.borderRadius = "";
    mainContentEl.style.boxShadow = "";
  }

  /* 2 – show tab bar based on token status */
  const token = localStorage.getItem("authToken");
  const tabBarWrapper = document.querySelector(".tab-bar-wrapper");

  // Only log tab bar visibility for debugging UI issues
  if (tabBarWrapper) {
    if (token) {
      tabBarWrapper.style.display = "flex";
    } else {
      console.log("[main] showMainApp - HIDING tab bar (user is logged out)");
      tabBarWrapper.style.display = "none";
    }
  } else {
    console.warn("[main] showMainApp - tab bar wrapper not found!");
  }

  /* 3 – hide corpus manager */
  if (corpusManager) {
    if (corpusManager.destroy) {
      corpusManager.destroy();
    }
    corpusManager.mainContentEl.innerHTML = "";  // quick blank
  }

  /* 4 – redraw tabs */
  if (window.tabManager) {
    window.tabManager.render();
    window.tabManager.showActiveTabContent();
  }

  currentView = "main";

  /* 5 – Save view state to localStorage */
  localStorage.setItem(VIEW_STATE_KEY, "main");
}

/* expose for other modules */
window.showCorpusManagement = showCorpusManagement;
window.showMainApp = showMainApp;


function restoreViewState() {
  const savedView = localStorage.getItem(VIEW_STATE_KEY);
  const token = localStorage.getItem("authToken");

  console.log("[main] 🔄 RESTORE_VIEW_STATE START - savedView:", savedView, "token exists:", !!token);
  console.log("[main] 🔄 Current URL before restore:", window.location.href);
  console.log("[main] 🔄 window.router exists:", !!window.router);
  console.log("[main] 🔄 window.router type:", typeof window.router);
  
  if (window.router) {
    console.log("[main] 🔄 window.router.isReady exists:", typeof window.router.isReady);
    if (typeof window.router.isReady === 'function') {
      const isReady = window.router.isReady();
      console.log("[main] 🔄 window.router.isReady() result:", isReady);
    }
  }

  // Use router to navigate properly after login, preserving query parameters
  console.log("[main] 🔄 Router availability check:");
  console.log("[main] 🔄 - window.router exists:", !!window.router);
  console.log("[main] 🔄 - window.router.isReady function exists:", typeof window.router?.isReady);
  
  if (window.router && typeof window.router.isReady === 'function') {
    const routerReady = window.router.isReady();
    console.log("[main] 🔄 - window.router.isReady() result:", routerReady);
    
    if (routerReady) {
      console.log("[main] ✅ Using router for post-login navigation");
      
      // Determine target route based on saved view state
      let targetRoute = 'docs'; // Default
      if (savedView === "corpus") {
        // Preserve current URL if it's already a corpus route to maintain entity IDs
        const currentPath = window.location.pathname;
        if (currentPath.startsWith('/corpus')) {
          // Use the full current URL to preserve entity IDs like /corpus/cognaire%2Frespond%2Frespond-rfp
          targetRoute = currentPath.substring(1); // Remove leading slash
          console.log("[main] 🔄 Preserving corpus URL with entity ID:", targetRoute);
        } else {
          targetRoute = 'corpus';
        }
      }
      
      console.log("[main] 🎯 Target route determined:", targetRoute);
      console.log("[main] 🚀 About to call router.navigate with URL:", `/${targetRoute}`);
      console.log("[main] 🚀 Current URL before navigation:", window.location.href);
      
      // Navigate using router to preserve query parameters and update URL properly
      window.router.navigate(`/${targetRoute}`, { replace: true })
      .then((result) => {
        console.log("[main] 📊 Router navigation completed with result:", result);
        if (result.success) {
          console.log(`[main] ✅ Successfully navigated to /${targetRoute} after login - URL should now be updated!`);
          console.log("[main] ✅ Final URL after router navigation:", window.location.href);
        } else {
          console.warn(`[main] ❌ Router navigation failed, falling back to direct view:`, result.error);
          // Fallback to direct view functions
          if (savedView === "corpus") {
            showCorpusManagement();
          } else {
            showMainApp();
          }
        }
      })
      .catch((error) => {
        console.error("[main] 💥 Router navigation error, falling back to direct view:", error);
        // Fallback to direct view functions
        if (savedView === "corpus") {
          showCorpusManagement();
        } else {
          showMainApp();
        }
      });
    } else {
      console.log("[main] ❌ Router not ready yet - will wait and retry");
      console.log("[main] ❌ Router ready state:", routerReady);
      
      // Wait for router to be ready and try again
      let retryCount = 0;
      const maxRetries = 10;
      const retryInterval = 100; // 100ms
      
      const retryNavigation = () => {
        retryCount++;
        console.log(`[main] 🔄 Retry ${retryCount}/${maxRetries} - Checking router readiness...`);
        
        if (window.router && window.router.isReady()) {
          console.log(`[main] ✅ Router ready on retry ${retryCount} - proceeding with navigation`);
          
          // Recalculate targetRoute for retry to ensure we preserve current URL
          let retryTargetRoute = 'docs'; // Default
          if (savedView === "corpus") {
            // Preserve current URL if it's already a corpus route to maintain entity IDs
            const currentPath = window.location.pathname;
            if (currentPath.startsWith('/corpus')) {
              // Use the full current URL to preserve entity IDs like /corpus/cognaire%2Frespond%2Frespond-rfp
              retryTargetRoute = currentPath.substring(1); // Remove leading slash
              console.log("[main] 🔄 Preserving corpus URL with entity ID on retry:", retryTargetRoute);
            } else {
              retryTargetRoute = 'corpus';
            }
          }
          
          window.router.navigate(`/${retryTargetRoute}`, { replace: true })
            .then((result) => {
              console.log("[main] 📊 Router navigation completed on retry with result:", result);
              if (result.success) {
                console.log(`[main] ✅ Successfully navigated to /${retryTargetRoute} after retry!`);
                console.log("[main] ✅ Final URL after retry navigation:", window.location.href);
              } else {
                console.warn(`[main] ❌ Router navigation failed on retry, using fallback:`, result.error);
                // Fallback to direct view functions
                if (savedView === "corpus") {
                  showCorpusManagement();
                } else {
                  showMainApp();
                }
              }
            })
            .catch((error) => {
              console.error("[main] 💥 Router navigation error on retry, using fallback:", error);
              // Fallback to direct view functions
              if (savedView === "corpus") {
                showCorpusManagement();
              } else {
                showMainApp();
              }
            });
        } else if (retryCount >= maxRetries) {
          console.log(`[main] ❌ Router still not ready after ${maxRetries} retries - using direct view functions`);
          console.log("[main] ❌ This is why the URL stays at /auth - router integration timing issue!");
          // Fallback to direct view functions
          if (savedView === "corpus") {
            showCorpusManagement();
          } else {
            showMainApp();
          }
        } else {
          // Continue retrying
          setTimeout(retryNavigation, retryInterval);
        }
      };
      
      // Start retry process
      setTimeout(retryNavigation, retryInterval);
    }
  } else {
    console.log("[main] ❌ Router not available at all, using direct view functions");
    console.log("[main] ❌ window.router:", !!window.router);
    console.log("[main] ❌ window.router.isReady function:", typeof window.router?.isReady);
    console.log("[main] ❌ This is why the URL stays at /auth - router integration missing!");
    // Fallback to direct view functions
    if (savedView === "corpus") {
      showCorpusManagement();
    } else {
      showMainApp();
    }
  }
}

/**
 * refreshApplicationState()
 * A single function that refreshes the entire application state
 * including store, security, and UI components
 */
async function refreshApplicationState() {
  const token = localStorage.getItem("authToken");
  const username = localStorage.getItem("currentUser") || "guest";

  // Only log for debugging login/logout issues
  if (username === "guest" || !token) {
    console.log("[main] refreshApplicationState() - user:", username, "| token:", !!token);
  }

  // 1) (Re)create the store with a stable name
  store = new Store(`app-state-${username}`);
  window.appStore = store;

  // 2) Build user data from localStorage with a consolidated approach
  const userData = {
    username,
    // Pass permissions as-is - Security.storeUser will handle parsing
    permissions: localStorage.getItem("permissions"),
    // Include project and account access lists
    authorized_projects: JSON.parse(localStorage.getItem("authorized_projects") || "[]"),
    authorized_accounts: JSON.parse(localStorage.getItem("authorized_accounts") || "[]")
  };

  // 3) Process user data and update store
  Security.storeUser(store, userData);

  // 4) Initialize the security manager with the new store
  initializeSecurityManager(store);
  security = window.securityManager.getSecurity();

  // 5) Initialize modal navigation manager (router not available yet, will be set later)
  // initializeModalNavigation(); // Moved to after router initialization

  // 5) Update references for all UI components
  if (tabManager) {
    tabManager.store = store;
    if (token) {
      await tabManager.restoreFromStore();
      // Don't render here - let showMainApp handle visibility
    } else {
      // No token => user is guest => do not restore tabs
      tabManager.tabs = [];
    }
  }

  if (newTabMenu) {
    newTabMenu.store = store;
    newTabMenu.refresh();
  }

  if (topBar) {
    topBar.store = store;
    topBar.render();
  }

  // Make sure JobsModal has the updated store reference
  if (jobsModal) {
    jobsModal.store = store;
  }
}


/**
 * handleLogout()
 * Called when user clicks "Logout" button
 */
function handleLogout() {
  console.log("[main] handleLogout() => logging out user");

  // Clean up enhanced job session data
  if (jobSessionManager) {
    jobSessionManager.cleanupOldJobs();
    console.log("[main] Cleaned up job session data on logout");
  }

  logout(); // Clears token, user data from localStorage and dispatches userLoggedOut event

  // Clear any cached AnalysisLM process definitions.
  Object.keys(localStorage).forEach(key => {
    if (key.startsWith("analysisLMProcessDef_")) {
      localStorage.removeItem(key);
    }
  });

  refreshApplicationState();
}

window.addEventListener("DOMContentLoaded", async () => {
  console.log("[main] App Initialization Started");

  // Start main thread monitoring
  mainThreadMonitor.startMonitoring();

  // Library detection (only log problematic libraries)
  if (typeof window.customElements !== 'undefined') {
    console.log('[MAIN_THREAD_DEBUG] 🎨 Shoelace Web Components detected - this can cause cursor issues during initialization');
  }

  // Make storage analyzer available globally for manual inspection
  window.storageAnalyzer = storageAnalyzer;

  // 1) Initialize subtenant manager and validate FIRST
  subtenantManager = new SubtenantManager();
  const subtenantResult = await subtenantManager.initialize();

  if (!subtenantResult.valid) {
    // Subtenant validation failed - show error and stop initialization
    showSubtenantError(subtenantResult.error);
    return;
  }

  console.log('[main] Subtenant validation successful:', subtenantResult.subtenant);

  // 1) Check for existing token and possibly refresh it
  try {
    await checkAndRestoreLogin();
  } catch (error) {
    console.error('[main] Login restoration failed on app startup:', error);
    
    // Show a clear error message to the user instead of silently failing
    const errorDiv = document.createElement('div');
    errorDiv.innerHTML = `
      <div style="
        position: fixed; 
        top: 20px; 
        right: 20px; 
        background: var(--status-error); 
        color: white; 
        padding: 1rem; 
        border-radius: 4px; 
        z-index: 10000;
        max-width: 400px;
      ">
        <strong>Login Restoration Failed</strong><br>
        ${error.message}<br>
        <button onclick="location.reload()" style="
          background: white; 
          color: var(--status-error); 
          border: none; 
          padding: 0.5rem 1rem; 
          border-radius: 4px; 
          margin-top: 0.5rem;
          cursor: pointer;
        ">Retry</button>
        <button onclick="this.parentElement.remove()" style="
          background: transparent; 
          color: white; 
          border: 1px solid white; 
          padding: 0.5rem 1rem; 
          border-radius: 4px; 
          margin-top: 0.5rem; 
          margin-left: 0.5rem;
          cursor: pointer;
        ">Dismiss</button>
      </div>
    `;
    document.body.appendChild(errorDiv);
    
    // Continue with app initialization anyway - don't block the entire app
    console.warn('[main] Continuing app initialization despite login restoration failure');
  }

  // 2) Initialize Store with current username
  const currentUser = localStorage.getItem("currentUser") || "guest";
  // User detection - no need to log routine guest user detection
  store = new Store(`app-state-${currentUser}`);
  window.appStore = store;

  // 3) Process user data with a clean approach
  const userData = {
    username: currentUser,
    // Pass permissions as-is - Security.storeUser will handle parsing
    permissions: localStorage.getItem("permissions"),
    // Include project and account access lists
    authorized_projects: JSON.parse(localStorage.getItem("authorized_projects") || "[]"),
    authorized_accounts: JSON.parse(localStorage.getItem("authorized_accounts") || "[]")
  };

  // Store and process user data
  Security.storeUser(store, userData);

  // 4) Initialize security manager (which creates the Security instance)
  initializeSecurityManager(store);
  security = window.securityManager.getSecurity();

  // 5) Initialize modal navigation manager (router not available yet, will be set later)
  // initializeModalNavigation(); // Moved to after router initialization

  // 5) Initialize controllers with enhanced features
  jobController = new AdaptiveJobController(store);
  jobSessionManager = new JobSessionManager();
  notificationController = new NotificationController(store);

  // Initialize enhanced job controller and session management
  await jobController.initialize();

  // Expose globally for debugging
  window.jobController = jobController;
  window.jobSessionManager = jobSessionManager;
  window.notificationController = notificationController;

  // 6) Initialize UI components
  jobsModal = new JobsModal(store, jobController);
  await jobsModal.init();

  topBar = new TopBar(store, jobController, notificationController);
  topBar.jobsModal = jobsModal; // Important: Pass the jobsModal reference
  topBar.attachToDOM(document.getElementById("topBarRoot"));
  topBar.render();
  
  // Make topBar globally available for router integration
  window.topBar = topBar;

  tabManager = new TabManager(store, jobController);
  window.tabManager = tabManager;

  tabManager.attachToDOM({
    tabsRootEl: document.getElementById("tabsRoot"),
    mainContentEl: document.getElementById("mainContent"),
    scrollLeftBtn: document.getElementById("scrollLeft"),
    scrollRightBtn: document.getElementById("scrollRight"),
  });

  window.tabManager = tabManager;
  window.documentTaskFramework = tabManager.framework;

  console.log("[main] Exposed tabManager and documentTaskFramework to window");

  const token = localStorage.getItem("authToken");
  if (token) {
    await tabManager.restoreFromStore();
    tabManager.addEventListeners();
    // Don't render here - let restoreViewState handle display
  } else {
    console.warn("[main] No authToken => user is guest => skipping tab restore");
    // Don't render here - let showMainApp handle display
  }

  newTabMenu = new NewTabMenu(store, tabManager);
  newTabMenu.attachToDOM(document.getElementById("newTabMenu"));
  newTabMenu.addEventListeners();

  const btnNewTab = document.getElementById("btnNewTab");
  if (btnNewTab) {
    btnNewTab.addEventListener("click", (e) => {
      newTabMenu.toggleVisibility(e);
    });
  }

  // Scroll controller
  const scrollController = new ScrollController(".tabs-scroller", "#scrollLeft", "#scrollRight");
  scrollController.init();

  // Initialize Cognaire Assist integration
  const assistIntegration = new AssistIntegration();
  window.assistIntegration = assistIntegration; // Expose for debugging

  // Initialize Router Integration
  try {
    console.log("[main] Initializing router integration...");
    
    // Verify SecurityManager is available before router initialization
    console.log("[main] 🔐 SecurityManager verification:");
    console.log("[main] 🔐 - window.securityManager:", !!window.securityManager);
    console.log("[main] 🔐 - window.SecurityManager:", !!window.SecurityManager);
    console.log("[main] 🔐 - window.securityManager.store:", !!window.securityManager?.store);
    console.log("[main] 🔐 - Current auth token:", !!localStorage.getItem('authToken'));
    
    if (window.securityManager?.store) {
      const testSecurity = window.securityManager.getSecurity();
      console.log("[main] 🔐 - Security instance test:", !!testSecurity);
      console.log("[main] 🔐 - Security permissions:", !!testSecurity?.permissions);
    }
    
    // Create global error modal for router
    errorModal = new ErrorModal(store);
    
    // Load router configuration
    const routeConfigResponse = await fetch('/router/route-config.json');
    const routeConfig = await routeConfigResponse.json();
    
    // Initialize router integration - NOTE: Don't pass static security instance
    // The router integration will use getFreshSecurity() to get current instance
    routerIntegration = await initializeRouterIntegration(routeConfig, {
      store,
      topBar,
      tabManager,
      corpusManager,
      errorModal,
      subtenantManager
    });
    
    console.log("[main] Router integration initialized successfully");
    
    // Initialize modal navigation manager now that router is available
    if (window.router && store) {
      try {
        await initializeModalNavigation(window.router, store);
        console.log("[main] Modal navigation manager initialized successfully");
      } catch (modalError) {
        console.error("[main] Modal navigation initialization failed:", modalError);
        // Continue without modal navigation - application should still work
      }
    }
    
  } catch (error) {
    console.error("[main] Router integration failed:", error);
    // Continue without router - application should still work
  }

  console.log("[main] App Initialization Complete");

  // Stop monitoring after a shorter delay to reduce overhead
  setTimeout(() => {
    mainThreadMonitor.stopMonitoring();
  }, 5000); // Monitor for 5 seconds after init completes

  // Listen for userLoggedIn event
  document.addEventListener("userLoggedIn", () => {
    if (isProcessingLogin) {
      console.log("[main] Already processing login, ignoring duplicate event");
      return;
    }

    isProcessingLogin = true;
    console.log("[main] User logged in event received");

    // Process login immediately
    refreshApplicationState().then(() => {
      console.log("[main] refreshApplicationState completed");

      // Start notification polling
      if (notificationController) {
        notificationController.startPolling();
      }

      // Restore view state after login
      restoreViewState();

      // Reset flag
      setTimeout(() => {
        isProcessingLogin = false;
      }, 500);
    });
  });

  // Listen for userLoggedOut event
  document.addEventListener("userLoggedOut", (event) => {
    if (isProcessingLogout) {
      console.log("[main] Already processing logout, ignoring duplicate event");
      return;
    }

    isProcessingLogout = true;
    console.log(`[main] User ${event.detail?.username || 'unknown'} logged out => refreshing state`);

    refreshApplicationState().then(() => {
      console.log("[main] refreshApplicationState completed after logout");
      // After refresh, ensure we're in main view
      showMainApp();

      // Reset flag
      setTimeout(() => {
        isProcessingLogout = false;
      }, 500);
    });
  });

  // Start notification polling if already logged in
  if (token && notificationController) {
    notificationController.startPolling();
  }

  // Expose handleLogout globally
  window.handleLogout = handleLogout;

  if (token) {
    // User is already logged in, restore the view state
    restoreViewState();
  } else {
    // Default to main view if not logged in
    showMainApp();
  }
});
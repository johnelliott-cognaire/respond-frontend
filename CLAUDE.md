# CLAUDE.md - Frontend Development

This file provides strict standards and guidance for frontend development in the Cognaire Respond application.

## Project Overview

**Cognaire Respond** is a vanilla JavaScript SPA for automating questionnaire responses (RFPs, security questionnaires, compliance documents). The frontend implements a multi-stage document workflow, corpus management, and AI-powered content generation without any JavaScript frameworks.

## Critical Development Rules

### NEVER Use JavaScript Frameworks
- **NO React, Vue, Angular, or any other JS framework**
- **NO build tools like Webpack, Vite, or Rollup**
- **NO package managers like npm or yarn for runtime dependencies**
- **ALWAYS use vanilla JavaScript ES6+ with native browser APIs**
- **ALL dependencies loaded via CDN in index.html**

### Browser Compatibility Requirements
- **Primary**: Chrome 100+, Firefox 100+, Safari 14+, Edge 100+
- **ES6+ features**: Classes, modules, async/await, template literals, destructuring
- **APIs required**: History API, localStorage, Fetch API, Web Components (optional)
- **Feature detection**: Always check for API availability before use
- **Graceful degradation**: Application must function without cutting-edge features

### No Build Process
- **Direct serving**: Files served directly from filesystem via CloudFront
- **ES6 modules**: Use native browser module loading with explicit `.js` extensions
- **No transpilation**: Write code that runs natively in target browsers
- **No bundling**: Individual files loaded as needed

## Architecture Standards

### Application Structure

```
frontend/spa/
├── index.html              # Entry point with CDN dependencies
├── main.js                 # Application initialization
├── router.js               # Custom SPA routing
├── config/                 # Runtime configuration
├── api/                    # Backend API integration
├── state/                  # State management
├── ui/                     # Components, views, modals, stages
├── utils/                  # Utility functions
└── styles/                 # CSS architecture
```

### Component Architecture Pattern

```javascript
// Standard component structure
export class ComponentName {
  constructor(store, options = {}) {
    this.store = store;
    this.options = { ...this.defaultOptions, ...options };
    this.element = null;
    this.eventListeners = [];
    
    // Subscribe to store changes
    this.storeSubscription = this.store.subscribe(this.handleStoreChange.bind(this));
  }
  
  get defaultOptions() {
    return {
      autoRender: true,
      className: 'component-name'
    };
  }
  
  attachToDOM(parentElement) {
    this.element = document.createElement('div');
    this.element.className = this.options.className;
    parentElement.appendChild(this.element);
    
    if (this.options.autoRender) {
      this.render();
    }
    
    this.addEventListeners();
    return this.element;
  }
  
  render() {
    if (!this.element) return;
    
    this.element.innerHTML = this.getTemplate();
    this.updateUIState();
  }
  
  getTemplate() {
    return `
      <div class="component-content">
        <!-- Component HTML template -->
      </div>
    `;
  }
  
  addEventListeners() {
    // Add all event listeners and store references for cleanup
    const handler = this.handleClick.bind(this);
    this.element.addEventListener('click', handler);
    this.eventListeners.push({ element: this.element, event: 'click', handler });
  }
  
  handleClick(event) {
    // Handle component interactions
  }
  
  handleStoreChange(newState, oldState) {
    // React to store changes
    this.render();
  }
  
  updateUIState() {
    // Update UI based on current state
  }
  
  destroy() {
    // Clean up event listeners
    this.eventListeners.forEach(({ element, event, handler }) => {
      element.removeEventListener(event, handler);
    });
    this.eventListeners = [];
    
    // Unsubscribe from store
    if (this.storeSubscription) {
      this.storeSubscription();
    }
    
    // Remove from DOM
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
  }
}
```

## Modal System Standards

### Modal Class Hierarchy

```
AsyncFormModal (base)
├── AsyncFormEntityModal (entity CRUD operations)
│   ├── UserModal
│   ├── AccountModal
│   └── ProjectModal
├── MessageModal (simple messages)
├── ErrorModal (error display with details)
├── YesNoModal (confirmation dialogs)
└── TextPromptModal (text input)
```

### Modal Implementation Pattern

```javascript
export class EntityModal extends AsyncFormEntityModal {
  constructor(store) {
    super(store);
    this.entityType = 'entity';
    this.apiClient = new EntityAPIClient();
  }
  
  async loadEntityData() {
    try {
      this.lockFields();
      this.lockButtons();
      
      const response = await this.apiClient.getEntity(this.entityId);
      this.currentData = response.entity;
      return this.currentData;
    } catch (error) {
      this.handleError(error);
      throw error;
    } finally {
      this.unlockFields();
      this.unlockButtons();
    }
  }
  
  async saveEntityData() {
    try {
      const payload = this.prepareDataForSave();
      await this.apiClient.updateEntity(this.entityId, payload);
      
      this.messageModal.show({
        title: "Success",
        message: "Entity saved successfully!"
      });
    } catch (error) {
      this.handleError(error);
    }
  }
  
  buildModalContent() {
    return `
      <h2>Entity Details</h2>
      <form class="async-form">
        <div class="form-group">
          <label for="entityName">Name</label>
          <input type="text" id="entityName" class="doc-input" />
        </div>
        <!-- More form fields -->
      </form>
    `;
  }
}
```

## CSS Standards

### Design Token System

**ALWAYS use CSS custom properties from `styles/tokens.css`:**

```css
/* Use design tokens - REQUIRED */
.my-component {
  background: var(--surface-default);
  color: var(--text-primary);
  border: 1px solid var(--border-subtle);
  padding: var(--spacing-4);
}

/* NEVER hardcode values */
.bad-component {
  background: #ffffff;  /* NO - use var(--surface-default) */
  color: #333333;       /* NO - use var(--text-primary) */
  padding: 16px;        /* NO - use var(--spacing-4) */
}
```

### Component CSS Pattern

```css
/* Component base class */
.component-name {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-4);
}

/* BEM modifiers */
.component-name--large {
  padding: var(--spacing-8);
}

.component-name--disabled {
  opacity: var(--opacity-disabled);
  pointer-events: none;
}

/* Element classes */
.component-name__header {
  border-bottom: 1px solid var(--border-subtle);
  padding-bottom: var(--spacing-2);
}

.component-name__content {
  flex: 1;
}
```

### Button Standards

```css
/* Always use btn class hierarchy */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 80px;
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  font: 500 14px/1.2 var(--font-family-base);
  cursor: pointer;
  transition: filter 0.15s ease, background-color 0.15s ease;
  gap: 6px;
}

/* Use semantic button classes */
.btn--primary { background: var(--interactive-primary); color: var(--text-on-primary); }
.btn--secondary { background: var(--interactive-secondary); color: var(--text-on-accent); }
.btn--danger { background: var(--status-error); color: var(--color-white); }
```

## State Management

### Store Pattern

```javascript
// state/store.js usage
import { store } from '../state/store.js';

// Subscribe to changes
const unsubscribe = store.subscribe((newState, oldState) => {
  // React to state changes
});

// Update state
store.setState({
  user: { ...store.getState().user, name: 'New Name' }
});

// Clean up subscription
unsubscribe();
```

### Security Integration

```javascript
// Always check permissions before showing UI
import { getFreshSecurity } from '../state/security.js';

const security = getFreshSecurity(store);

if (security.hasSystemPermission(['CORPUS_EDITOR'])) {
  // Show edit controls
}

if (security.canAccessProject(projectId)) {
  // Show project content
}
```

## API Integration Standards

### Lambda Function Integration

The client-side API client layer files are located in frontend/spa/api/*.js.

Inside each each API client layer module contains a set of methods/functions that call an API Gateway endpoint. Behind those endpoints are Lambda functions.

Each function/method contains inline comments indicating which Lambda function is behind them. For example, these are the inline comments for the `listCorpusDocuments(...)` method in `frontend/spa/api/corpus.js`. Note the **Lambda:** part of the inline documentation below:

```javascript
/**
 * List documents under selected folder with filters
 * Lambda: backend/services/lambdas/corpus/structure/list_corpus_documents.py
 * @param {Object} params - Parameters object
 * @param {string} params.folderPath - Path to folder
 * @param {Object} params.filters - Filter criteria (topic, type, status, author)
 * @returns {Promise<Object>} Array of document objects
 */
```

### Backend Communication Pattern

```javascript
// api/entity-client.js
export class EntityAPIClient {
  constructor() {
    this.baseUrl = getBaseUrl();
  }
  
  async getEntity(entityId) {
    try {
      const response = await fetch(`${this.baseUrl}/entities/${entityId}`, {
        method: 'GET',
        headers: {
          ...getAuthHeader(),
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new APIError(error.message || 'Request failed', response.status);
      }
      
      return await response.json();
    } catch (error) {
      console.error('[EntityAPIClient] Get entity failed:', error);
      throw error;
    }
  }
  
  async updateEntity(entityId, data) {
    try {
      const response = await fetch(`${this.baseUrl}/entities/${entityId}`, {
        method: 'PUT',
        headers: {
          ...getAuthHeader(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new APIError(error.message || 'Update failed', response.status);
      }
      
      return await response.json();
    } catch (error) {
      console.error('[EntityAPIClient] Update entity failed:', error);
      throw error;
    }
  }
}
```

### Error Handling Pattern

```javascript
try {
  const result = await apiCall();
  // Success handling
} catch (error) {
  console.error('[ComponentName] Operation failed:', error);
  
  // Handle authentication errors
  if (this.isUnauthorizedError(error)) {
    this.handleUnauthorized();
    return;
  }
  
  // Show user-friendly error
  this.errorModal.show({
    title: "Operation Failed",
    message: error.message || "An unexpected error occurred",
    details: error.stack // For technical details
  });
}
```

## JavaScript Standards

### ES6+ Usage Guidelines

```javascript
// ALWAYS use modern JavaScript features

// Classes for components
export class MyComponent {
  constructor(options = {}) {
    this.options = { ...this.defaultOptions, ...options };
  }
}

// Arrow functions for callbacks
element.addEventListener('click', (event) => {
  this.handleClick(event);
});

// Template literals for HTML
getTemplate() {
  return `
    <div class="my-component">
      <h2>${this.title}</h2>
      <p>${this.description}</p>
    </div>
  `;
}

// Destructuring for clean code
const { user, projects } = store.getState();

// Async/await for promises
async function loadData() {
  try {
    const data = await apiClient.getData();
    return data;
  } catch (error) {
    console.error('Load failed:', error);
    throw error;
  }
}
```

### Module Import/Export Standards

```javascript
// Named exports preferred
export class MyComponent { }
export function helperFunction() { }

// Import with explicit file extensions
import { MyComponent } from './components/my-component.js';
import { apiClient } from '../api/api-client.js';

// Use relative imports
import { store } from '../state/store.js';
import { MessageModal } from './modals/message-modal.js';
```

### Logging Standards

```javascript
// Consistent logging with component prefixes
console.log('[ComponentName] Operation started');
console.warn('[ComponentName] Unexpected condition:', data);
console.error('[ComponentName] Operation failed:', error);

// Structured logging for complex data
console.log('[ComponentName] State change:', {
  oldState,
  newState,
  timestamp: new Date().toISOString()
});
```

## Performance Guidelines

### Memory Management

```javascript
export class Component {
  constructor() {
    this.eventListeners = [];
    this.subscriptions = [];
  }
  
  addEventListeners() {
    const handler = this.handleClick.bind(this);
    element.addEventListener('click', handler);
    
    // Store for cleanup
    this.eventListeners.push({ element, event: 'click', handler });
  }
  
  destroy() {
    // Clean up event listeners
    this.eventListeners.forEach(({ element, event, handler }) => {
      element.removeEventListener(event, handler);
    });
    
    // Clean up subscriptions
    this.subscriptions.forEach(unsubscribe => unsubscribe());
    
    // Clear references
    this.eventListeners = [];
    this.subscriptions = [];
  }
}
```

### Debouncing and Throttling

```javascript
// Use debouncing for user input
import { debounce } from '../utils/performance-utils.js';

const searchHandler = debounce((query) => {
  this.performSearch(query);
}, 300);

searchInput.addEventListener('input', (event) => {
  searchHandler(event.target.value);
});
```

## Security Standards

### Input Validation

```javascript
// ALWAYS validate and sanitize user input
function validateInput(value, type) {
  switch (type) {
    case 'email':
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    case 'name':
      return value.length >= 2 && value.length <= 100;
    default:
      return value !== null && value !== undefined;
  }
}

// Sanitize HTML content
function sanitizeHTML(html) {
  const div = document.createElement('div');
  div.textContent = html;
  return div.innerHTML;
}
```

### Authentication Integration

```javascript
// Check authentication before sensitive operations
import { getAuthHeader, isTokenValid } from '../utils/auth-utils.js';

async function performSecureOperation() {
  if (!isTokenValid()) {
    throw new Error('Authentication required');
  }
  
  const response = await fetch(url, {
    headers: getAuthHeader()
  });
  
  if (response.status === 401) {
    // Handle token expiration
    await refreshToken();
    // Retry operation
  }
}
```

## Multi-Stage Document Workflow

### Document Task Framework

```javascript
// Implement stage-specific components
export class RFPStage3AnswerQuestions {
  constructor(documentData, stageConfig) {
    this.documentData = documentData;
    this.stageConfig = stageConfig;
    this.questionsGrid = null;
    this.topicTabs = null;
    this.controlPane = null;
  }
  
  async onEnter() {
    // Initialize stage
    await this.loadData();
    this.render();
  }
  
  async beforeExit() {
    // Validate before leaving stage
    if (this.hasUnsavedChanges()) {
      const confirmed = await this.confirmModal.show({
        message: 'You have unsaved changes. Continue?'
      });
      return confirmed;
    }
    return true;
  }
  
  calculateProgress() {
    // Return completion percentage
    const total = this.getAllItems().length;
    const completed = this.getCompletedItems().length;
    return Math.round((completed / total) * 100);
  }
}
```

## Testing Guidelines

### Manual Testing Patterns

```javascript
// Add debug helpers in development
if (window.location.hostname === 'localhost') {
  window.debugComponent = this;
  window.debugStore = store;
}

// Validation helpers for testing
validateState() {
  const errors = [];
  
  if (!this.currentData) {
    errors.push('Current data not loaded');
  }
  
  if (this.isDirty && !this.hasValidForm()) {
    errors.push('Form is dirty but invalid');
  }
  
  return errors;
}
```

## Accessibility Requirements

### ARIA and Keyboard Support

```javascript
// Always include proper ARIA attributes
buildModalContent() {
  return `
    <div role="dialog" aria-labelledby="modal-title" aria-modal="true">
      <h2 id="modal-title">Entity Details</h2>
      <button aria-label="Close modal" class="modal-close">&times;</button>
      
      <form role="form">
        <label for="entityName">Name</label>
        <input 
          type="text" 
          id="entityName" 
          aria-required="true"
          aria-describedby="name-error"
        />
        <div id="name-error" role="alert" aria-live="polite"></div>
      </form>
    </div>
  `;
}

// Support keyboard navigation
handleKeyDown(event) {
  switch (event.key) {
    case 'Escape':
      this.hide();
      break;
    case 'Enter':
      if (event.ctrlKey || event.metaKey) {
        this.handleSave();
      }
      break;
  }
}
```

## Development Pitfalls to Avoid

1. **NEVER use JavaScript frameworks** - Stick to vanilla JavaScript
2. **NEVER hardcode CSS values** - Always use design tokens
3. **NEVER skip error handling** - Every API call must have error handling
4. **NEVER forget to display error messages** - whenever an error is caught, make sure to display ErrorModal
5. **NEVER forget memory cleanup** - Always remove event listeners and subscriptions
6. **NEVER skip input validation** - Validate all user input
7. **NEVER expose sensitive data** - Check what data is logged or stored
8. **NEVER skip permission checks** - Verify user permissions for every action
9. **NEVER use global variables** - Use proper module patterns
10. **NEVER skip browser compatibility** - Test in all supported browsers
11. **NEVER ignore accessibility** - Include ARIA attributes and keyboard support
12. **NEVER use browser Window.alert(), prompt() or confirm()** - always use MessageModal, ErrorModal, YesNoModal or TextPromptModal

## File Organization Standards

```
ui/
├── components/          # Reusable UI components
├── views/              # Page-level views
├── modals/             # Modal dialogs
├── stages/             # Document workflow stages
└── framework/          # Base framework classes

utils/
├── api-utils.js        # API integration helpers
├── form-helpers.js     # Form validation and utilities  
├── error-handling.js   # Error handling utilities
└── performance-utils.js # Performance optimization utilities

api/
├── auth.js            # Authentication API
├── users.js           # User management API
├── documents.js       # Document operations API
└── corpus.js          # Corpus management API
```

This frontend follows enterprise-grade patterns while maintaining the simplicity and performance benefits of vanilla JavaScript.
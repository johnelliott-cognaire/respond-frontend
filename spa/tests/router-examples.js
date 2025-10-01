// File: frontend/spa/tests/router-examples.js
/**
 * Router Usage Examples
 * 
 * Interactive examples and demonstrations of the Cognaire Respond router
 * framework functionality, including practical usage patterns.
 */

import { initializeRouterIntegration } from '../router/integration.js';
import { URLValidator } from '../router/url-validator.js';

/**
 * Router Examples Manager
 * Provides interactive examples of router functionality
 */
export class RouterExamples {
    constructor() {
        this.router = null;
        this.integration = null;
        this.urlValidator = null;
        this.exampleResults = [];
        this.demoContainer = null;
    }

    /**
     * Initialize examples with full router integration
     */
    async initialize() {
        console.log('[RouterExamples] Initializing router examples...');
        
        try {
            // Load route configuration
            const routeConfig = await this.loadRouteConfig();
            
            // Create mock application components for examples
            const mockComponents = this.createMockComponents();
            
            // Initialize router integration
            this.integration = await initializeRouterIntegration(routeConfig, mockComponents);
            this.router = this.integration.getRouter();
            this.urlValidator = new URLValidator(routeConfig);
            
            // Create demo UI
            this.createDemoInterface();
            
            console.log('[RouterExamples] Router examples initialized successfully');
            return true;
            
        } catch (error) {
            console.error('[RouterExamples] Initialization failed:', error);
            return false;
        }
    }

    /**
     * Load route configuration
     */
    async loadRouteConfig() {
        try {
            const response = await fetch('/router/route-config.json');
            return await response.json();
        } catch (error) {
            console.warn('[RouterExamples] Using demo route configuration');
            return this.getDemoRouteConfig();
        }
    }

    /**
     * Create mock components for examples
     */
    createMockComponents() {
        return {
            store: {
                getState: () => ({
                    user: { name: 'Demo User', permissions: ['PROJECT_VIEWER', 'PROJECT_EDITOR', 'CORPUS_VIEWER'] },
                    subtenant: { id: 'cognaire', name: 'Cognaire Demo' }
                }),
                setState: (newState) => console.log('[MockStore] State updated:', newState),
                subscribe: (callback) => {
                    console.log('[MockStore] Subscription added');
                    return () => console.log('[MockStore] Subscription removed');
                }
            },
            security: {
                hasSystemPermission: (permissions) => {
                    const userPerms = ['PROJECT_VIEWER', 'PROJECT_EDITOR', 'CORPUS_VIEWER', 'CORPUS_EDITOR'];
                    return permissions.some(perm => userPerms.includes(perm));
                }
            },
            tabManager: {
                openDocument: (documentId) => {
                    console.log(`[MockTabManager] Opening document: ${documentId}`);
                    this.logExample(`Opened document tab: ${documentId}`);
                }
            },
            corpusManager: {
                navigateToDocument: (documentPath) => {
                    console.log(`[MockCorpusManager] Navigating to: ${documentPath}`);
                    this.logExample(`Navigated to corpus document: ${documentPath}`);
                }
            },
            errorModal: {
                show: (options) => {
                    console.log('[MockErrorModal] Showing error:', options);
                    this.logExample(`Error displayed: ${options.title} - ${options.message}`);
                }
            }
        };
    }

    /**
     * Demo route configuration
     */
    getDemoRouteConfig() {
        return {
            version: "1.0.0",
            globalSettings: {
                preserveQueryParams: ["s", "key"],
                defaultRoute: "docs",
                errorRoute: "docs",
                enableHistoryMode: true,
                enableDeepLinking: true,
                urlValidation: {
                    entityIdPatterns: {
                        document: "^[A-Z]{3}-\\d{3,6}$",
                        project: "^proj_[a-z0-9]{8,16}$",
                        corpus_document: "^[a-z0-9_\\/.\\-]+$"
                    },
                    strictValidation: true,
                    showValidationErrors: true
                }
            },
            routes: [
                {
                    id: "docs",
                    path: "docs",
                    title: "Documents",
                    component: { factory: "createDocumentWorkspace" },
                    access: { requiresAuth: true, permissionsAnyOf: ["PROJECT_VIEWER"] },
                    entitySupport: {
                        enabled: true,
                        paramName: "documentId",
                        pattern: "^[A-Z]{3}-\\d{3,6}$",
                        examples: ["RFP-123", "DOC-4567", "QUE-891011"]
                    },
                    modals: [
                        {
                            id: "document_settings",
                            title: "Document Settings",
                            component: { factory: "createDocumentSettingsModal" }
                        },
                        {
                            id: "export_document",
                            title: "Export Document",
                            component: { factory: "createExportDocumentModal" }
                        }
                    ]
                },
                {
                    id: "corpus",
                    path: "corpus",
                    title: "Corpus Management",
                    component: { factory: "createCorpusManager" },
                    access: { requiresAuth: true, permissionsAnyOf: ["CORPUS_VIEWER"] },
                    entitySupport: {
                        enabled: true,
                        paramName: "corpusDocumentPath",
                        pattern: "^[a-z0-9_\\/.\\-]+$",
                        examples: ["policies/security.pdf", "guides/user-manual.docx"]
                    },
                    modals: [
                        {
                            id: "import_wizard",
                            title: "Import Content Wizard",
                            component: { factory: "createImportContentWizard" }
                        }
                    ]
                }
            ]
        };
    }

    /**
     * Create interactive demo interface
     */
    createDemoInterface() {
        // Find or create demo container
        this.demoContainer = document.getElementById('router-examples-demo');
        if (!this.demoContainer) {
            this.demoContainer = document.createElement('div');
            this.demoContainer.id = 'router-examples-demo';
            this.demoContainer.className = 'router-examples-container';
            document.body.appendChild(this.demoContainer);
        }

        this.demoContainer.innerHTML = `
            <div class="router-examples-header">
                <h2>Router Framework Examples</h2>
                <p>Interactive demonstrations of Cognaire Respond router functionality</p>
            </div>
            
            <div class="router-examples-content">
                <div class="example-section">
                    <h3>Navigation Examples</h3>
                    <div class="example-buttons">
                        <button class="btn btn--primary" data-action="navigate-docs">Navigate to Documents</button>
                        <button class="btn btn--primary" data-action="navigate-corpus">Navigate to Corpus</button>
                        <button class="btn btn--secondary" data-action="navigate-doc-entity">Open RFP-123</button>
                        <button class="btn btn--secondary" data-action="navigate-corpus-entity">Open Security Policy</button>
                    </div>
                </div>
                
                <div class="example-section">
                    <h3>Modal Examples</h3>
                    <div class="example-buttons">
                        <button class="btn btn--accent" data-action="show-document-settings">Document Settings Modal</button>
                        <button class="btn btn--accent" data-action="show-export-modal">Export Document Modal</button>
                        <button class="btn btn--accent" data-action="show-import-wizard">Import Wizard Modal</button>
                    </div>
                </div>
                
                <div class="example-section">
                    <h3>URL Validation Examples</h3>
                    <div class="url-validation-demo">
                        <div class="form-group">
                            <label for="url-input">Enter URL to validate:</label>
                            <input type="text" id="url-input" class="doc-input" 
                                   placeholder="/docs/RFP-123" value="/docs/RFP-123">
                        </div>
                        <button class="btn btn--info" data-action="validate-url">Validate URL</button>
                        <button class="btn btn--secondary" data-action="test-invalid-url">Test Invalid URL</button>
                    </div>
                </div>
                
                <div class="example-section">
                    <h3>Router Link Examples</h3>
                    <div class="router-links-demo">
                        <p>Click these router-aware links:</p>
                        <div class="example-links">
                            <a href="/docs" data-router-link>Documents Home</a>
                            <a href="/docs/RFP-456" data-router-link>RFP-456 Document</a>
                            <a href="/corpus" data-router-link>Corpus Management</a>
                            <a href="/corpus/templates/rfp-template.xlsx" data-router-link>RFP Template</a>
                            <a href="/docs/document_settings" data-router-link>Document Settings</a>
                        </div>
                    </div>
                </div>
                
                <div class="example-section">
                    <h3>Current Router State</h3>
                    <div class="router-state-display">
                        <div class="state-item">
                            <label>Current Route:</label>
                            <span id="current-route">-</span>
                        </div>
                        <div class="state-item">
                            <label>Current Entity:</label>
                            <span id="current-entity">-</span>
                        </div>
                        <div class="state-item">
                            <label>Current Modal:</label>
                            <span id="current-modal">-</span>
                        </div>
                        <div class="state-item">
                            <label>Current URL:</label>
                            <span id="current-url">-</span>
                        </div>
                    </div>
                </div>
                
                <div class="example-section">
                    <h3>Example Activity Log</h3>
                    <div class="activity-log" id="activity-log">
                        <div class="log-entry">Ready for examples...</div>
                    </div>
                </div>
            </div>
        `;

        // Add event listeners
        this.addExampleEventListeners();
        
        // Update state display
        this.updateStateDisplay();
        
        // Set up router change listener
        this.router.onRouteChange(() => {
            this.updateStateDisplay();
            this.logExample('Route changed');
        });
    }

    /**
     * Add event listeners for example interactions
     */
    addExampleEventListeners() {
        this.demoContainer.addEventListener('click', async (event) => {
            const action = event.target.dataset.action;
            if (!action) return;

            event.preventDefault();
            
            try {
                await this.handleExampleAction(action, event.target);
            } catch (error) {
                console.error('[RouterExamples] Action failed:', error);
                this.logExample(`Action failed: ${action} - ${error.message}`);
            }
        });

        // Handle router link clicks
        this.demoContainer.addEventListener('click', async (event) => {
            if (event.target.hasAttribute('data-router-link')) {
                event.preventDefault();
                const url = event.target.getAttribute('href');
                await this.router.navigate(url);
                this.logExample(`Router link navigated to: ${url}`);
            }
        });
    }

    /**
     * Handle example actions
     */
    async handleExampleAction(action, element) {
        switch (action) {
            case 'navigate-docs':
                await this.router.navigate('/docs');
                this.logExample('Navigated to Documents workspace');
                break;

            case 'navigate-corpus':
                await this.router.navigate('/corpus');
                this.logExample('Navigated to Corpus Management');
                break;

            case 'navigate-doc-entity':
                await this.router.navigate('/docs/RFP-123');
                this.logExample('Navigated to document entity: RFP-123');
                break;

            case 'navigate-corpus-entity':
                await this.router.navigate('/corpus/policies/security.pdf');
                this.logExample('Navigated to corpus document: policies/security.pdf');
                break;

            case 'show-document-settings':
                await this.router.navigate('/docs/document_settings');
                this.logExample('Opened Document Settings modal');
                break;

            case 'show-export-modal':
                await this.router.navigate('/docs/export_document');
                this.logExample('Opened Export Document modal');
                break;

            case 'show-import-wizard':
                await this.router.navigate('/corpus/import_wizard');
                this.logExample('Opened Import Wizard modal');
                break;

            case 'validate-url':
                await this.demonstrateURLValidation();
                break;

            case 'test-invalid-url':
                await this.demonstrateInvalidURLHandling();
                break;

            default:
                console.warn('[RouterExamples] Unknown action:', action);
        }
    }

    /**
     * Demonstrate URL validation
     */
    async demonstrateURLValidation() {
        const urlInput = document.getElementById('url-input');
        const url = urlInput.value.trim();
        
        if (!url) {
            this.logExample('Please enter a URL to validate');
            return;
        }

        const validation = this.urlValidator.validateURL(url, {
            isAuthenticated: true,
            userPermissions: ['PROJECT_VIEWER', 'PROJECT_EDITOR', 'CORPUS_VIEWER', 'CORPUS_EDITOR']
        });

        this.logExample(`URL Validation Results for: ${url}`);
        this.logExample(`Valid: ${validation.valid}`);
        
        if (validation.errors.length > 0) {
            this.logExample(`Errors: ${validation.errors.join(', ')}`);
        }
        
        if (validation.warnings.length > 0) {
            this.logExample(`Warnings: ${validation.warnings.join(', ')}`);
        }
        
        if (validation.suggestions.length > 0) {
            this.logExample(`Suggestions: ${validation.suggestions.join(', ')}`);
        }

        // Try to navigate to show practical result
        if (validation.valid) {
            try {
                const result = await this.router.navigate(url);
                this.logExample(`Navigation ${result.success ? 'succeeded' : 'failed'}`);
            } catch (error) {
                this.logExample(`Navigation error: ${error.message}`);
            }
        }
    }

    /**
     * Demonstrate invalid URL handling
     */
    async demonstrateInvalidURLHandling() {
        const invalidUrls = [
            '/invalid-route',
            '/docs/invalid-doc-123',
            '/corpus/INVALID/PATH!@#',
            '/docs/nonexistent_modal',
            '///malformed///url///'
        ];

        const testUrl = invalidUrls[Math.floor(Math.random() * invalidUrls.length)];
        
        this.logExample(`Testing invalid URL: ${testUrl}`);
        
        try {
            const result = await this.router.navigate(testUrl);
            this.logExample(`Result: ${result.success ? 'Success' : 'Failed'} - ${result.error || 'No error'}`);
        } catch (error) {
            this.logExample(`Navigation threw error: ${error.message}`);
        }
    }

    /**
     * Update router state display
     */
    updateStateDisplay() {
        const currentMatch = this.router.getCurrentMatch();
        
        document.getElementById('current-route').textContent = currentMatch?.route?.id || '-';
        document.getElementById('current-entity').textContent = currentMatch?.entityId || '-';
        document.getElementById('current-modal').textContent = currentMatch?.modalId || '-';
        document.getElementById('current-url').textContent = window.location.pathname || '-';
    }

    /**
     * Log example activity
     */
    logExample(message) {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = document.createElement('div');
        logEntry.className = 'log-entry';
        logEntry.innerHTML = `<span class="log-time">[${timestamp}]</span> ${message}`;
        
        const activityLog = document.getElementById('activity-log');
        activityLog.appendChild(logEntry);
        
        // Keep only last 50 entries
        while (activityLog.children.length > 50) {
            activityLog.removeChild(activityLog.firstChild);
        }
        
        // Scroll to bottom
        activityLog.scrollTop = activityLog.scrollHeight;
        
        // Also log to console for debugging
        console.log(`[RouterExamples] ${message}`);
    }

    // ===============================================
    // PROGRAMMATIC EXAMPLES
    // ===============================================

    /**
     * Run all programmatic examples
     */
    async runAllExamples() {
        console.log('[RouterExamples] Running all programmatic examples...');
        
        await this.exampleBasicNavigation();
        await this.exampleEntityNavigation();
        await this.exampleModalNavigation();
        await this.exampleURLValidation();
        await this.exampleErrorHandling();
        await this.exampleAdvancedPatterns();
        
        console.log('[RouterExamples] All examples completed');
    }

    /**
     * Example: Basic Navigation
     */
    async exampleBasicNavigation() {
        console.log('\n=== Basic Navigation Examples ===');
        
        // Simple route navigation
        console.log('1. Navigate to documents workspace');
        const docsResult = await this.router.navigate('/docs');
        console.log('Result:', docsResult);
        
        // Navigate to different section
        console.log('2. Navigate to corpus management');
        const corpusResult = await this.router.navigate('/corpus');
        console.log('Result:', corpusResult);
        
        // Get current route information
        const currentMatch = this.router.getCurrentMatch();
        console.log('3. Current route information:', currentMatch);
    }

    /**
     * Example: Entity Navigation
     */
    async exampleEntityNavigation() {
        console.log('\n=== Entity Navigation Examples ===');
        
        // Navigate to specific document
        console.log('1. Navigate to document entity');
        const docEntityResult = await this.router.navigate('/docs/RFP-123');
        console.log('Result:', docEntityResult);
        console.log('Entity ID extracted:', this.router.getCurrentMatch().entityId);
        
        // Navigate to corpus document
        console.log('2. Navigate to corpus document entity');
        const corpusEntityResult = await this.router.navigate('/corpus/policies/security.pdf');
        console.log('Result:', corpusEntityResult);
        console.log('Corpus path extracted:', this.router.getCurrentMatch().entityId);
    }

    /**
     * Example: Modal Navigation
     */
    async exampleModalNavigation() {
        console.log('\n=== Modal Navigation Examples ===');
        
        // Show document settings modal
        console.log('1. Show document settings modal');
        await this.router.navigate('/docs');
        const modalResult = await this.router.navigate('/docs/document_settings');
        console.log('Result:', modalResult);
        console.log('Modal ID:', this.router.getCurrentMatch().modalId);
    }

    /**
     * Example: URL Validation
     */
    async exampleURLValidation() {
        console.log('\n=== URL Validation Examples ===');
        
        const testUrls = [
            '/docs',                              // Valid basic route
            '/docs/RFP-123',                      // Valid entity route
            '/corpus/policies/security.pdf',      // Valid corpus document
            '/docs/document_settings',            // Valid modal route
            '/invalid-route',                     // Invalid route
            '/docs/invalid-format',               // Invalid entity format
            '/docs/nonexistent_modal'             // Invalid modal
        ];
        
        for (const url of testUrls) {
            console.log(`Validating: ${url}`);
            const validation = this.urlValidator.validateURL(url, {
                isAuthenticated: true,
                userPermissions: ['PROJECT_VIEWER', 'CORPUS_VIEWER']
            });
            console.log(`  Valid: ${validation.valid}`);
            if (!validation.valid) {
                console.log(`  Errors: ${validation.errors.join(', ')}`);
                console.log(`  Suggestions: ${validation.suggestions.join(', ')}`);
            }
        }
    }

    /**
     * Example: Error Handling
     */
    async exampleErrorHandling() {
        console.log('\n=== Error Handling Examples ===');
        
        // Try to navigate to invalid route
        console.log('1. Navigate to invalid route');
        try {
            const result = await this.router.navigate('/completely-invalid-route');
            console.log('Navigation result:', result);
        } catch (error) {
            console.log('Caught error:', error.message);
        }
        
        // Try invalid entity format
        console.log('2. Try invalid document ID format');
        try {
            const result = await this.router.navigate('/docs/invalid-format-123');
            console.log('Navigation result:', result);
        } catch (error) {
            console.log('Caught error:', error.message);
        }
    }

    /**
     * Example: Advanced Patterns
     */
    async exampleAdvancedPatterns() {
        console.log('\n=== Advanced Patterns Examples ===');
        
        // Query parameter preservation
        console.log('1. Navigate with query parameters');
        const queryResult = await this.router.navigate('/docs?s=cognaire&key=test123');
        console.log('Result:', queryResult);
        console.log('URL with preserved params:', window.location.href);
        
        // Programmatic modal management
        console.log('2. Programmatic modal handling');
        await this.router.navigate('/docs');
        await this.router.showModal('document_settings');
        console.log('Modal shown programmatically');
        
        // Route change listeners
        console.log('3. Route change listener example');
        const unsubscribe = this.router.onRouteChange((currentMatch, previousMatch) => {
            console.log('Route changed from', previousMatch?.route?.id, 'to', currentMatch?.route?.id);
        });
        
        await this.router.navigate('/corpus');
        await this.router.navigate('/docs');
        
        unsubscribe(); // Clean up listener
    }
}

// CSS for examples interface
export const EXAMPLES_CSS = `
.router-examples-container {
    max-width: 1200px;
    margin: 20px auto;
    padding: 20px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #fff;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.router-examples-header {
    text-align: center;
    margin-bottom: 30px;
    padding-bottom: 20px;
    border-bottom: 2px solid #f0f0f0;
}

.router-examples-header h2 {
    margin: 0 0 10px 0;
    color: #2c3e50;
    font-size: 28px;
    font-weight: 600;
}

.router-examples-header p {
    margin: 0;
    color: #7f8c8d;
    font-size: 16px;
}

.example-section {
    margin-bottom: 30px;
    padding: 20px;
    background: #f8f9fa;
    border-radius: 6px;
    border-left: 4px solid #3498db;
}

.example-section h3 {
    margin: 0 0 15px 0;
    color: #2c3e50;
    font-size: 20px;
    font-weight: 600;
}

.example-buttons {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
}

.btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 8px 16px;
    border: none;
    border-radius: 4px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
    text-decoration: none;
}

.btn--primary {
    background: #3498db;
    color: white;
}

.btn--primary:hover {
    background: #2980b9;
}

.btn--secondary {
    background: #95a5a6;
    color: white;
}

.btn--secondary:hover {
    background: #7f8c8d;
}

.btn--accent {
    background: #e74c3c;
    color: white;
}

.btn--accent:hover {
    background: #c0392b;
}

.btn--info {
    background: #1abc9c;
    color: white;
}

.btn--info:hover {
    background: #16a085;
}

.url-validation-demo {
    display: flex;
    gap: 15px;
    align-items: flex-end;
    flex-wrap: wrap;
}

.form-group {
    flex: 1;
    min-width: 200px;
}

.form-group label {
    display: block;
    margin-bottom: 5px;
    font-weight: 500;
    color: #2c3e50;
}

.doc-input {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid #bdc3c7;
    border-radius: 4px;
    font-size: 14px;
}

.router-links-demo p {
    margin: 0 0 10px 0;
    font-weight: 500;
}

.example-links {
    display: flex;
    gap: 15px;
    flex-wrap: wrap;
}

.example-links a {
    padding: 6px 12px;
    background: #ecf0f1;
    color: #2c3e50;
    text-decoration: none;
    border-radius: 4px;
    font-size: 14px;
    transition: background 0.15s ease;
}

.example-links a:hover {
    background: #d5dbdb;
}

.router-state-display {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 15px;
}

.state-item {
    display: flex;
    justify-content: space-between;
    padding: 10px;
    background: white;
    border-radius: 4px;
    border: 1px solid #ecf0f1;
}

.state-item label {
    font-weight: 500;
    color: #2c3e50;
}

.state-item span {
    color: #7f8c8d;
    font-family: monospace;
}

.activity-log {
    max-height: 300px;
    overflow-y: auto;
    background: #2c3e50;
    color: #ecf0f1;
    padding: 15px;
    border-radius: 4px;
    font-family: monospace;
    font-size: 13px;
    line-height: 1.4;
}

.log-entry {
    margin-bottom: 5px;
}

.log-time {
    color: #3498db;
    font-weight: 500;
}

@media (max-width: 768px) {
    .router-examples-container {
        margin: 10px;
        padding: 15px;
    }
    
    .example-buttons {
        flex-direction: column;
    }
    
    .url-validation-demo {
        flex-direction: column;
        align-items: stretch;
    }
    
    .example-links {
        flex-direction: column;
    }
    
    .router-state-display {
        grid-template-columns: 1fr;
    }
}
`;

// Auto-initialize examples if loaded directly
if (typeof window !== 'undefined' && window.location.search.includes('show-router-examples')) {
    document.addEventListener('DOMContentLoaded', async () => {
        // Add CSS
        const style = document.createElement('style');
        style.textContent = EXAMPLES_CSS;
        document.head.appendChild(style);
        
        // Initialize examples
        const examples = new RouterExamples();
        const success = await examples.initialize();
        
        if (success) {
            console.log('[RouterExamples] Interactive examples ready!');
            // Optionally run programmatic examples
            if (window.location.search.includes('run-examples')) {
                await examples.runAllExamples();
            }
        } else {
            console.error('[RouterExamples] Failed to initialize examples');
        }
    });
}
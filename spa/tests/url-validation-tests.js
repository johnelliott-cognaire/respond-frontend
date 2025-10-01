// File: frontend/spa/tests/url-validation-tests.js
/**
 * URL Validation Test Scenarios
 * 
 * Comprehensive test scenarios for URL validation functionality,
 * including edge cases, security scenarios, and user experience flows.
 */

import { URLValidator } from '../router/url-validator.js';

/**
 * URL Validation Test Suite
 * Specialized testing for URL validation logic
 */
export class URLValidationTestSuite {
    constructor() {
        this.validator = null;
        this.testResults = {
            total: 0,
            passed: 0,
            failed: 0,
            categories: {
                basic: { passed: 0, failed: 0 },
                entities: { passed: 0, failed: 0 },
                modals: { passed: 0, failed: 0 },
                security: { passed: 0, failed: 0 },
                edge_cases: { passed: 0, failed: 0 }
            }
        };
        
        // Test data configurations
        this.routeConfig = this.getTestRouteConfig();
        this.testCases = this.getTestCases();
        this.securityContexts = this.getSecurityContexts();
    }

    /**
     * Run all URL validation tests
     */
    async runAllTests() {
        console.log('[URLValidationTests] Starting comprehensive URL validation tests...');
        
        try {
            this.validator = new URLValidator(this.routeConfig);
            
            // Run test categories
            await this.runBasicValidationTests();
            await this.runEntityValidationTests();
            await this.runModalValidationTests();
            await this.runSecurityValidationTests();
            await this.runEdgeCaseTests();
            await this.runPerformanceTests();
            
            this.reportResults();
            
        } catch (error) {
            console.error('[URLValidationTests] Test execution failed:', error);
        }
        
        return this.testResults;
    }

    /**
     * Get test route configuration
     */
    getTestRouteConfig() {
        return {
            version: "1.0.0",
            globalSettings: {
                preserveQueryParams: ["s", "key"],
                defaultRoute: "docs",
                errorRoute: "docs",
                urlValidation: {
                    entityIdPatterns: {
                        document: "^[A-Z]{3}-\\d{3,6}$",
                        project: "^proj_[a-z0-9]{8,16}$",
                        user: "^user_[a-z0-9]{8,12}$",
                        corpus_document: "^[a-z0-9_\\/.\\-]+$"
                    },
                    strictValidation: true,
                    showValidationErrors: true
                }
            },
            routes: [
                {
                    id: "auth",
                    path: "auth",
                    title: "Authentication",
                    component: { factory: "createAuthView" },
                    access: { requiresAuth: false }
                },
                {
                    id: "docs",
                    path: "docs",
                    title: "Documents",
                    component: { factory: "createDocumentWorkspace" },
                    access: {
                        requiresAuth: true,
                        permissionsAnyOf: ["PROJECT_VIEWER", "PROJECT_EDITOR"]
                    },
                    entitySupport: {
                        enabled: true,
                        paramName: "documentId",
                        pattern: "^[A-Z]{3}-\\d{3,6}$",
                        description: "Document ID format: ABC-123",
                        examples: ["RFP-123", "DOC-4567", "QUE-891011"]
                    },
                    children: [
                        {
                            id: "docs_overview",
                            path: "overview",
                            title: "Overview"
                        }
                    ],
                    modals: [
                        {
                            id: "document_settings",
                            title: "Document Settings",
                            access: {
                                requiresAuth: true,
                                permissionsAnyOf: ["PROJECT_EDITOR"]
                            }
                        },
                        {
                            id: "export_document",
                            title: "Export Document",
                            access: {
                                requiresAuth: true,
                                permissionsAnyOf: ["PROJECT_VIEWER", "PROJECT_EDITOR"]
                            }
                        }
                    ]
                },
                {
                    id: "corpus",
                    path: "corpus",
                    title: "Corpus Management",
                    component: { factory: "createCorpusManager" },
                    access: {
                        requiresAuth: true,
                        permissionsAnyOf: ["CORPUS_VIEWER", "CORPUS_EDITOR", "CORPUS_ADMIN"]
                    },
                    entitySupport: {
                        enabled: true,
                        paramName: "corpusDocumentPath",
                        pattern: "^[a-z0-9_\\/.\\-]+$",
                        description: "Corpus document path",
                        examples: ["policies/security.pdf", "guides/user-manual.docx"]
                    },
                    children: [
                        {
                            id: "corpus_browse",
                            path: "browse",
                            title: "Browse"
                        },
                        {
                            id: "corpus_approvals",
                            path: "approvals",
                            title: "Approvals",
                            access: {
                                requiresAuth: true,
                                permissionsAnyOf: ["CORPUS_APPROVER"]
                            }
                        }
                    ],
                    modals: [
                        {
                            id: "import_wizard",
                            title: "Import Content Wizard",
                            access: {
                                requiresAuth: true,
                                permissionsAnyOf: ["CORPUS_EDITOR", "CORPUS_ADMIN"]
                            }
                        }
                    ]
                },
                {
                    id: "admin",
                    path: "admin",
                    title: "Administration",
                    component: { factory: "createAdminPanel" },
                    access: {
                        requiresAuth: true,
                        permissionsAnyOf: ["SYSTEM_ADMIN"]
                    },
                    entitySupport: {
                        enabled: true,
                        paramName: "userId",
                        pattern: "^user_[a-z0-9]{8,12}$"
                    }
                }
            ]
        };
    }

    /**
     * Get comprehensive test cases
     */
    getTestCases() {
        return {
            valid_urls: [
                // Basic routes
                { url: '/', expected: 'Should redirect to default route' },
                { url: '/auth', expected: 'Public auth route' },
                { url: '/docs', expected: 'Basic docs route' },
                { url: '/corpus', expected: 'Basic corpus route' },
                
                // Routes with entities
                { url: '/docs/RFP-123', expected: 'Document with valid ID format' },
                { url: '/docs/DOC-4567', expected: 'Document with longer ID' },
                { url: '/docs/QUE-891011', expected: 'Document with max length ID' },
                { url: '/corpus/policies/security.pdf', expected: 'Corpus document path' },
                { url: '/corpus/guides/user_manual.docx', expected: 'Corpus with underscores' },
                { url: '/corpus/templates/rfp-template.xlsx', expected: 'Corpus with hyphens' },
                { url: '/admin/user_abc123def45', expected: 'Admin user entity' },
                
                // Child routes
                { url: '/docs/overview', expected: 'Document overview child route' },
                { url: '/corpus/browse', expected: 'Corpus browse child route' },
                { url: '/corpus/approvals', expected: 'Corpus approvals child route' },
                
                // Modal routes
                { url: '/docs/document_settings', expected: 'Document settings modal' },
                { url: '/docs/export_document', expected: 'Export document modal' },
                { url: '/corpus/import_wizard', expected: 'Import wizard modal' },
                
                // Routes with query parameters
                { url: '/docs?s=cognaire', expected: 'Route with subtenant param' },
                { url: '/docs/RFP-123?s=cognaire&key=test123', expected: 'Entity with query params' },
                
                // Routes with hash fragments
                { url: '/docs#section1', expected: 'Route with hash fragment' },
                { url: '/docs/RFP-123#question-5', expected: 'Entity with hash fragment' }
            ],
            
            invalid_urls: [
                // Invalid routes
                { url: '/nonexistent-route', error: 'Route not found', suggestions: ['Did you mean /docs?'] },
                { url: '/doc', error: 'Route not found', suggestions: ['Did you mean /docs?'] },
                { url: '/corpus-management', error: 'Route not found', suggestions: ['Did you mean /corpus?'] },
                
                // Invalid entity formats
                { url: '/docs/rfp-123', error: 'Invalid document ID format', suggestions: ['Use format: ABC-123'] },
                { url: '/docs/RFP123', error: 'Invalid document ID format', suggestions: ['Missing dash: RFP-123'] },
                { url: '/docs/RFP-12', error: 'Invalid document ID format', suggestions: ['ID too short: RFP-123'] },
                { url: '/docs/RFP-1234567', error: 'Invalid document ID format', suggestions: ['ID too long: RFP-123'] },
                { url: '/docs/RFPX-123', error: 'Invalid document ID format', suggestions: ['Use 3 letters: RFP-123'] },
                
                // Invalid corpus paths
                { url: '/corpus/INVALID/PATH', error: 'Invalid corpus path format' },
                { url: '/corpus/path with spaces', error: 'Invalid characters in path' },
                { url: '/corpus/path/with/UPPERCASE', error: 'Uppercase letters not allowed' },
                { url: '/corpus/path!@#$%', error: 'Invalid special characters' },
                
                // Invalid modals
                { url: '/docs/nonexistent_modal', error: 'Modal not found', suggestions: ['Available: document_settings, export_document'] },
                { url: '/corpus/document_settings', error: 'Modal not available for route' },
                
                // Malformed URLs
                { url: '///malformed///url///', error: 'Malformed URL structure' },
                { url: '/docs//', error: 'Double slashes not allowed' },
                { url: '/docs/../corpus', error: 'Path traversal not allowed' },
                
                // Security issues
                { url: '/docs/<script>', error: 'Potential XSS attempt' },
                { url: '/corpus/file.php%00.pdf', error: 'Null byte injection attempt' },
                { url: '/admin?' + 'x'.repeat(5000), error: 'Query string too long' }
            ],
            
            edge_cases: [
                // Empty and special cases
                { url: '', expected: 'Should handle empty URL' },
                { url: ' ', expected: 'Should handle whitespace URL' },
                { url: '/docs?', expected: 'Should handle empty query' },
                { url: '/docs#', expected: 'Should handle empty hash' },
                
                // Unicode and international
                { url: '/corpus/документы/файл.pdf', expected: 'Should handle Unicode paths' },
                { url: '/docs/РФП-123', expected: 'Should handle Cyrillic entity IDs' },
                
                // Very long URLs
                { url: '/docs/' + 'x'.repeat(100), expected: 'Should handle long entity IDs appropriately' },
                { url: '/corpus/' + 'folder/'.repeat(50) + 'file.pdf', expected: 'Should handle deep paths' },
                
                // Case sensitivity
                { url: '/DOCS', expected: 'Should handle uppercase routes' },
                { url: '/Docs/RFP-123', expected: 'Should handle mixed case' },
                
                // Encoded characters
                { url: '/corpus/folder%2Fsubfolder%2Ffile.pdf', expected: 'Should handle URL encoding' },
                { url: '/docs/RFP%2D123', expected: 'Should handle encoded entity IDs' }
            ]
        };
    }

    /**
     * Get security contexts for testing
     */
    getSecurityContexts() {
        return {
            anonymous: {
                isAuthenticated: false,
                userPermissions: []
            },
            basic_user: {
                isAuthenticated: true,
                userPermissions: ['PROJECT_VIEWER']
            },
            editor_user: {
                isAuthenticated: true,
                userPermissions: ['PROJECT_VIEWER', 'PROJECT_EDITOR', 'CORPUS_VIEWER']
            },
            admin_user: {
                isAuthenticated: true,
                userPermissions: ['PROJECT_VIEWER', 'PROJECT_EDITOR', 'CORPUS_VIEWER', 'CORPUS_EDITOR', 'CORPUS_ADMIN', 'SYSTEM_ADMIN']
            },
            limited_user: {
                isAuthenticated: true,
                userPermissions: ['CORPUS_VIEWER']
            },
            approver_user: {
                isAuthenticated: true,
                userPermissions: ['CORPUS_VIEWER', 'CORPUS_APPROVER']
            }
        };
    }

    // ===============================================
    // BASIC VALIDATION TESTS
    // ===============================================

    /**
     * Test basic URL validation
     */
    async runBasicValidationTests() {
        console.log('\n=== Basic URL Validation Tests ===');
        
        const category = 'basic';
        const testCases = this.testCases.valid_urls.concat(
            this.testCases.invalid_urls.map(tc => ({ ...tc, shouldFail: true }))
        );
        
        for (const testCase of testCases) {
            const testName = `Basic validation: ${testCase.url}`;
            
            try {
                const validation = this.validator.validateURL(testCase.url, this.securityContexts.editor_user);
                
                if (testCase.shouldFail) {
                    this.assert(!validation.valid, `${testCase.url} should be invalid`);
                    this.assert(validation.errors.length > 0, `${testCase.url} should have errors`);
                } else {
                    this.assert(validation.valid, `${testCase.url} should be valid`);
                    this.assert(validation.errors.length === 0, `${testCase.url} should have no errors`);
                }
                
                this.recordTestResult(category, testName, true);
                
            } catch (error) {
                this.recordTestResult(category, testName, false, error.message);
            }
        }
    }

    /**
     * Test entity validation patterns
     */
    async runEntityValidationTests() {
        console.log('\n=== Entity Validation Pattern Tests ===');
        
        const category = 'entities';
        const entityTests = [
            // Document ID tests
            { entityType: 'document', value: 'RFP-123', shouldPass: true },
            { entityType: 'document', value: 'DOC-4567', shouldPass: true },
            { entityType: 'document', value: 'QUE-891011', shouldPass: true },
            { entityType: 'document', value: 'rfp-123', shouldPass: false },
            { entityType: 'document', value: 'RFP123', shouldPass: false },
            { entityType: 'document', value: 'RFP-12', shouldPass: false },
            { entityType: 'document', value: 'RFP-1234567', shouldPass: false },
            { entityType: 'document', value: 'RFPX-123', shouldPass: false },
            
            // Project ID tests
            { entityType: 'project', value: 'proj_abc123def456', shouldPass: true },
            { entityType: 'project', value: 'proj_12345678', shouldPass: true },
            { entityType: 'project', value: 'proj_abcdefghijklmnop', shouldPass: true },
            { entityType: 'project', value: 'proj_abc123', shouldPass: false }, // too short
            { entityType: 'project', value: 'proj_abcdefghijklmnopq', shouldPass: false }, // too long
            { entityType: 'project', value: 'project_abc123def456', shouldPass: false }, // wrong prefix
            { entityType: 'project', value: 'proj_ABC123DEF456', shouldPass: false }, // uppercase
            
            // User ID tests
            { entityType: 'user', value: 'user_abc12345', shouldPass: true },
            { entityType: 'user', value: 'user_123456789012', shouldPass: true },
            { entityType: 'user', value: 'user_ab12', shouldPass: false }, // too short
            { entityType: 'user', value: 'user_abcdefghijk12', shouldPass: false }, // too long
            { entityType: 'user', value: 'usr_abc12345', shouldPass: false }, // wrong prefix
            
            // Corpus document path tests
            { entityType: 'corpus_document', value: 'policies/security.pdf', shouldPass: true },
            { entityType: 'corpus_document', value: 'guides/user_manual.docx', shouldPass: true },
            { entityType: 'corpus_document', value: 'templates/rfp-template.xlsx', shouldPass: true },
            { entityType: 'corpus_document', value: 'folder/subfolder/file.txt', shouldPass: true },
            { entityType: 'corpus_document', value: 'simple-file.pdf', shouldPass: true },
            { entityType: 'corpus_document', value: 'file_with_underscores.pdf', shouldPass: true },
            { entityType: 'corpus_document', value: 'file-with-hyphens.pdf', shouldPass: true },
            { entityType: 'corpus_document', value: 'UPPERCASE/FILE.PDF', shouldPass: false },
            { entityType: 'corpus_document', value: 'file with spaces.pdf', shouldPass: false },
            { entityType: 'corpus_document', value: 'file!@#$.pdf', shouldPass: false },
            { entityType: 'corpus_document', value: '../traversal/file.pdf', shouldPass: false }
        ];
        
        for (const test of entityTests) {
            const testName = `Entity ${test.entityType}: ${test.value}`;
            
            try {
                const validation = this.validator.validateEntityId(test.value, test.entityType);
                
                if (test.shouldPass) {
                    this.assert(validation.valid, `${test.value} should be valid for ${test.entityType}`);
                } else {
                    this.assert(!validation.valid, `${test.value} should be invalid for ${test.entityType}`);
                }
                
                this.recordTestResult(category, testName, true);
                
            } catch (error) {
                this.recordTestResult(category, testName, false, error.message);
            }
        }
    }

    /**
     * Test modal validation
     */
    async runModalValidationTests() {
        console.log('\n=== Modal Validation Tests ===');
        
        const category = 'modals';
        const modalTests = [
            // Valid modals for docs route
            { routeId: 'docs', modalId: 'document_settings', shouldPass: true },
            { routeId: 'docs', modalId: 'export_document', shouldPass: true },
            
            // Valid modals for corpus route
            { routeId: 'corpus', modalId: 'import_wizard', shouldPass: true },
            
            // Invalid modals (wrong route)
            { routeId: 'docs', modalId: 'import_wizard', shouldPass: false },
            { routeId: 'corpus', modalId: 'document_settings', shouldPass: false },
            
            // Nonexistent modals
            { routeId: 'docs', modalId: 'nonexistent_modal', shouldPass: false },
            { routeId: 'corpus', modalId: 'invalid_modal', shouldPass: false },
            
            // Modals for routes without modal support
            { routeId: 'auth', modalId: 'document_settings', shouldPass: false }
        ];
        
        for (const test of modalTests) {
            const testName = `Modal ${test.modalId} on route ${test.routeId}`;
            
            try {
                const validation = this.validator.validateModalId(test.modalId, test.routeId);
                
                if (test.shouldPass) {
                    this.assert(validation.valid, `Modal ${test.modalId} should be valid for route ${test.routeId}`);
                } else {
                    this.assert(!validation.valid, `Modal ${test.modalId} should be invalid for route ${test.routeId}`);
                }
                
                this.recordTestResult(category, testName, true);
                
            } catch (error) {
                this.recordTestResult(category, testName, false, error.message);
            }
        }
    }

    /**
     * Test security-based validation
     */
    async runSecurityValidationTests() {
        console.log('\n=== Security-Based Validation Tests ===');
        
        const category = 'security';
        const securityTests = [
            // Anonymous user tests
            { url: '/auth', context: 'anonymous', shouldPass: true, reason: 'Public route' },
            { url: '/docs', context: 'anonymous', shouldPass: false, reason: 'Requires authentication' },
            { url: '/corpus', context: 'anonymous', shouldPass: false, reason: 'Requires authentication' },
            { url: '/admin', context: 'anonymous', shouldPass: false, reason: 'Requires authentication' },
            
            // Basic user tests
            { url: '/docs', context: 'basic_user', shouldPass: true, reason: 'Has PROJECT_VIEWER' },
            { url: '/corpus', context: 'basic_user', shouldPass: false, reason: 'Lacks CORPUS_VIEWER' },
            { url: '/admin', context: 'basic_user', shouldPass: false, reason: 'Lacks SYSTEM_ADMIN permission' },
            { url: '/docs/document_settings', context: 'basic_user', shouldPass: false, reason: 'Modal requires PROJECT_EDITOR' },
            
            // Editor user tests
            { url: '/docs', context: 'editor_user', shouldPass: true, reason: 'Has PROJECT_VIEWER' },
            { url: '/corpus', context: 'editor_user', shouldPass: true, reason: 'Has CORPUS_VIEWER' },
            { url: '/admin', context: 'editor_user', shouldPass: false, reason: 'Lacks SYSTEM_ADMIN permission' },
            { url: '/docs/document_settings', context: 'editor_user', shouldPass: true, reason: 'Has PROJECT_EDITOR' },
            { url: '/corpus/import_wizard', context: 'editor_user', shouldPass: false, reason: 'Lacks CORPUS_EDITOR for modal' },
            
            // Admin user tests
            { url: '/docs', context: 'admin_user', shouldPass: true, reason: 'Has all permissions' },
            { url: '/corpus', context: 'admin_user', shouldPass: true, reason: 'Has all permissions' },
            { url: '/admin', context: 'admin_user', shouldPass: true, reason: 'Has SYSTEM_ADMIN permission' },
            { url: '/corpus/import_wizard', context: 'admin_user', shouldPass: true, reason: 'Has CORPUS_ADMIN' },
            
            // Approver user tests
            { url: '/corpus/approvals', context: 'approver_user', shouldPass: true, reason: 'Has CORPUS_APPROVER' },
            { url: '/corpus/approvals', context: 'editor_user', shouldPass: false, reason: 'Lacks CORPUS_APPROVER' },
            
            // Limited user tests
            { url: '/docs', context: 'limited_user', shouldPass: false, reason: 'Lacks PROJECT_VIEWER' },
            { url: '/corpus', context: 'limited_user', shouldPass: true, reason: 'Has CORPUS_VIEWER' }
        ];
        
        for (const test of securityTests) {
            const testName = `Security: ${test.url} for ${test.context}`;
            
            try {
                const context = this.securityContexts[test.context];
                const validation = this.validator.validateURL(test.url, context);
                
                if (test.shouldPass) {
                    this.assert(validation.valid || validation.warnings.length === 0, 
                              `${test.url} should be accessible for ${test.context}: ${test.reason}`);
                } else {
                    this.assert(!validation.valid || validation.errors.some(e => e.includes('permission') || e.includes('authentication')), 
                              `${test.url} should be blocked for ${test.context}: ${test.reason}`);
                }
                
                this.recordTestResult(category, testName, true);
                
            } catch (error) {
                this.recordTestResult(category, testName, false, error.message);
            }
        }
    }

    /**
     * Test edge cases and malformed URLs
     */
    async runEdgeCaseTests() {
        console.log('\n=== Edge Case Validation Tests ===');
        
        const category = 'edge_cases';
        const edgeCases = this.testCases.edge_cases;
        
        for (const testCase of edgeCases) {
            const testName = `Edge case: ${testCase.url}`;
            
            try {
                const validation = this.validator.validateURL(testCase.url, this.securityContexts.editor_user);
                
                // Edge cases should not crash the validator
                this.assert(typeof validation === 'object', 'Validation should return an object');
                this.assert(typeof validation.valid === 'boolean', 'Validation should have valid property');
                this.assert(Array.isArray(validation.errors), 'Validation should have errors array');
                this.assert(Array.isArray(validation.warnings), 'Validation should have warnings array');
                
                this.recordTestResult(category, testName, true);
                
            } catch (error) {
                this.recordTestResult(category, testName, false, error.message);
            }
        }
    }

    /**
     * Test performance characteristics
     */
    async runPerformanceTests() {
        console.log('\n=== Performance Tests ===');
        
        const iterations = 1000;
        const testUrls = [
            '/docs',
            '/docs/RFP-123',
            '/corpus/policies/security.pdf',
            '/docs/document_settings',
            '/invalid-route'
        ];
        
        // Warm up
        for (let i = 0; i < 10; i++) {
            this.validator.validateURL('/docs', this.securityContexts.editor_user);
        }
        
        // Performance test
        const startTime = performance.now();
        
        for (let i = 0; i < iterations; i++) {
            const url = testUrls[i % testUrls.length];
            this.validator.validateURL(url, this.securityContexts.editor_user);
        }
        
        const endTime = performance.now();
        const totalTime = endTime - startTime;
        const avgTime = totalTime / iterations;
        
        console.log(`Performance: ${iterations} validations took ${totalTime.toFixed(2)}ms (avg: ${avgTime.toFixed(2)}ms each)`);
        
        // Performance assertions
        this.assert(avgTime < 1, 'Average validation time should be under 1ms');
        this.assert(totalTime < 1000, 'Total validation time should be under 1 second');
    }

    // ===============================================
    // TEST UTILITIES
    // ===============================================

    /**
     * Assert condition with error message
     */
    assert(condition, message) {
        if (!condition) {
            throw new Error(`Assertion failed: ${message}`);
        }
    }

    /**
     * Record test result
     */
    recordTestResult(category, testName, passed, error = null) {
        this.testResults.total++;
        
        if (passed) {
            this.testResults.passed++;
            this.testResults.categories[category].passed++;
            console.log(`  ✅ ${testName}`);
        } else {
            this.testResults.failed++;
            this.testResults.categories[category].failed++;
            console.log(`  ❌ ${testName} - ${error}`);
        }
    }

    /**
     * Report comprehensive test results
     */
    reportResults() {
        console.log('\n[URLValidationTests] Test Results Summary:');
        console.log('===========================================');
        console.log(`Total Tests: ${this.testResults.total}`);
        console.log(`✅ Passed: ${this.testResults.passed}`);
        console.log(`❌ Failed: ${this.testResults.failed}`);
        
        const passRate = ((this.testResults.passed / this.testResults.total) * 100).toFixed(1);
        console.log(`📊 Pass Rate: ${passRate}%`);
        
        console.log('\nResults by Category:');
        for (const [category, results] of Object.entries(this.testResults.categories)) {
            const total = results.passed + results.failed;
            const rate = total > 0 ? ((results.passed / total) * 100).toFixed(1) : '0';
            console.log(`  ${category}: ${results.passed}/${total} (${rate}%)`);
        }
        
        console.log('\n===========================================');
        
        if (this.testResults.failed === 0) {
            console.log('🎉 All URL validation tests passed!');
        } else {
            console.log(`⚠️  ${this.testResults.failed} test(s) failed.`);
        }
    }
}

/**
 * URL Validation Demonstration
 * Interactive demo showing validation results
 */
export class URLValidationDemo {
    constructor() {
        this.validator = null;
        this.demoContainer = null;
    }

    /**
     * Initialize demo interface
     */
    async initialize() {
        // Create validator with test configuration
        const testSuite = new URLValidationTestSuite();
        this.validator = new URLValidator(testSuite.getTestRouteConfig());
        
        // Create demo interface
        this.createDemoInterface();
        
        console.log('[URLValidationDemo] Interactive demo initialized');
    }

    /**
     * Create demo interface
     */
    createDemoInterface() {
        this.demoContainer = document.createElement('div');
        this.demoContainer.id = 'url-validation-demo';
        this.demoContainer.className = 'url-validation-demo-container';
        
        this.demoContainer.innerHTML = `
            <div class="demo-header">
                <h2>URL Validation Interactive Demo</h2>
                <p>Test URL validation with different contexts and patterns</p>
            </div>
            
            <div class="demo-content">
                <div class="input-section">
                    <div class="form-group">
                        <label for="demo-url">URL to validate:</label>
                        <input type="text" id="demo-url" class="demo-input" 
                               placeholder="/docs/RFP-123" value="/docs/RFP-123">
                    </div>
                    
                    <div class="form-group">
                        <label for="demo-context">Security context:</label>
                        <select id="demo-context" class="demo-select">
                            <option value="anonymous">Anonymous (not logged in)</option>
                            <option value="basic_user">Basic User (PROJECT_VIEWER only)</option>
                            <option value="editor_user" selected>Editor User (PROJECT + CORPUS viewer/editor)</option>
                            <option value="admin_user">Admin User (all permissions)</option>
                            <option value="limited_user">Limited User (CORPUS_VIEWER only)</option>
                            <option value="approver_user">Approver User (CORPUS_APPROVER)</option>
                        </select>
                    </div>
                    
                    <button id="validate-btn" class="demo-btn demo-btn--primary">Validate URL</button>
                </div>
                
                <div class="results-section">
                    <h3>Validation Results</h3>
                    <div id="validation-results" class="results-display">
                        <p class="results-placeholder">Enter a URL and click "Validate URL" to see results</p>
                    </div>
                </div>
                
                <div class="examples-section">
                    <h3>Quick Test Examples</h3>
                    <div class="example-buttons">
                        <button class="demo-btn demo-btn--example" data-url="/docs">Valid: Docs</button>
                        <button class="demo-btn demo-btn--example" data-url="/docs/RFP-123">Valid: Doc Entity</button>
                        <button class="demo-btn demo-btn--example" data-url="/corpus/policies/security.pdf">Valid: Corpus Entity</button>
                        <button class="demo-btn demo-btn--example" data-url="/docs/document_settings">Valid: Modal</button>
                        <button class="demo-btn demo-btn--example" data-url="/invalid-route">Invalid: Bad Route</button>
                        <button class="demo-btn demo-btn--example" data-url="/docs/rfp-123">Invalid: Bad Format</button>
                        <button class="demo-btn demo-btn--example" data-url="/admin">Permission Test</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(this.demoContainer);
        this.addDemoEventListeners();
    }

    /**
     * Add event listeners for demo interactions
     */
    addDemoEventListeners() {
        const validateBtn = document.getElementById('validate-btn');
        const urlInput = document.getElementById('demo-url');
        const contextSelect = document.getElementById('demo-context');
        
        // Validate button click
        validateBtn.addEventListener('click', () => {
            this.performValidation();
        });
        
        // Enter key in URL input
        urlInput.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') {
                this.performValidation();
            }
        });
        
        // Example button clicks
        this.demoContainer.addEventListener('click', (event) => {
            if (event.target.hasAttribute('data-url')) {
                const url = event.target.getAttribute('data-url');
                urlInput.value = url;
                this.performValidation();
            }
        });
    }

    /**
     * Perform URL validation and display results
     */
    performValidation() {
        const url = document.getElementById('demo-url').value.trim();
        const contextKey = document.getElementById('demo-context').value;
        const resultsDiv = document.getElementById('validation-results');
        
        if (!url) {
            resultsDiv.innerHTML = '<p class="results-error">Please enter a URL to validate</p>';
            return;
        }
        
        // Get security context
        const testSuite = new URLValidationTestSuite();
        const context = testSuite.getSecurityContexts()[contextKey];
        
        // Perform validation
        const validation = this.validator.validateURL(url, context);
        
        // Display results
        resultsDiv.innerHTML = this.formatValidationResults(url, validation, contextKey);
    }

    /**
     * Format validation results for display
     */
    formatValidationResults(url, validation, contextKey) {
        let html = `
            <div class="validation-summary">
                <div class="validation-url"><strong>URL:</strong> <code>${url}</code></div>
                <div class="validation-context"><strong>Context:</strong> ${contextKey.replace('_', ' ')}</div>
                <div class="validation-status validation-status--${validation.valid ? 'valid' : 'invalid'}">
                    <strong>Status:</strong> ${validation.valid ? '✅ Valid' : '❌ Invalid'}
                </div>
            </div>
        `;
        
        if (validation.errors.length > 0) {
            html += `
                <div class="validation-errors">
                    <h4>❌ Errors:</h4>
                    <ul>
                        ${validation.errors.map(error => `<li>${error}</li>`).join('')}
                    </ul>
                </div>
            `;
        }
        
        if (validation.warnings.length > 0) {
            html += `
                <div class="validation-warnings">
                    <h4>⚠️ Warnings:</h4>
                    <ul>
                        ${validation.warnings.map(warning => `<li>${warning}</li>`).join('')}
                    </ul>
                </div>
            `;
        }
        
        if (validation.suggestions.length > 0) {
            html += `
                <div class="validation-suggestions">
                    <h4>💡 Suggestions:</h4>
                    <ul>
                        ${validation.suggestions.map(suggestion => `<li>${suggestion}</li>`).join('')}
                    </ul>
                </div>
            `;
        }
        
        if (validation.entityValidation) {
            html += `
                <div class="validation-entity">
                    <h4>🔍 Entity Validation:</h4>
                    <p><strong>Type:</strong> ${validation.entityValidation.type}</p>
                    <p><strong>Valid:</strong> ${validation.entityValidation.valid ? 'Yes' : 'No'}</p>
                    ${validation.entityValidation.examples ? 
                        `<p><strong>Examples:</strong> ${validation.entityValidation.examples.join(', ')}</p>` : ''}
                </div>
            `;
        }
        
        if (validation.modalValidation) {
            html += `
                <div class="validation-modal">
                    <h4>🔍 Modal Validation:</h4>
                    <p><strong>Valid:</strong> ${validation.modalValidation.valid ? 'Yes' : 'No'}</p>
                    ${validation.modalValidation.availableModals ? 
                        `<p><strong>Available:</strong> ${validation.modalValidation.availableModals.join(', ')}</p>` : ''}
                </div>
            `;
        }
        
        return html;
    }
}

// Export classes
// Exports are already defined above as class exports

// Auto-run if loaded with test parameters
if (typeof window !== 'undefined' && window.location.search.includes('run-url-validation-tests')) {
    document.addEventListener('DOMContentLoaded', async () => {
        const testSuite = new URLValidationTestSuite();
        await testSuite.runAllTests();
    });
}

if (typeof window !== 'undefined' && window.location.search.includes('show-url-validation-demo')) {
    document.addEventListener('DOMContentLoaded', async () => {
        const demo = new URLValidationDemo();
        await demo.initialize();
    });
}
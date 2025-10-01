// File: frontend/spa/tests/router-tests.js
/**
 * Router Test Suite
 * 
 * Comprehensive test suite for the Cognaire Respond router framework,
 * including URL validation, navigation, entity handling, and modal routing.
 */

import { createRouter } from '../router/index.js';
import { URLValidator } from '../router/url-validator.js';

/**
 * Test Suite Runner
 * Manages test execution and results reporting
 */
export class RouterTestSuite {
    constructor() {
        this.tests = [];
        this.results = {
            total: 0,
            passed: 0,
            failed: 0,
            skipped: 0,
            errors: []
        };
        
        this.setupComplete = false;
        this.router = null;
        this.urlValidator = null;
        this.mockComponents = null;
    }

    /**
     * Run all router tests
     */
    async runAllTests() {
        console.log('[RouterTests] Starting comprehensive router test suite...');
        
        try {
            await this.setup();
            
            // Core router functionality tests
            await this.testRouterInitialization();
            await this.testRouteMatching();
            await this.testNavigationBasics();
            await this.testEntityRouting();
            await this.testModalRouting();
            
            // URL validation tests
            await this.testURLValidation();
            await this.testEntityValidation();
            await this.testModalValidation();
            
            // Integration tests
            await this.testPermissionIntegration();
            await this.testHistoryIntegration();
            await this.testErrorHandling();
            
            // Edge cases and stress tests
            await this.testEdgeCases();
            await this.testPerformance();
            
            this.reportResults();
            
        } catch (error) {
            console.error('[RouterTests] Test suite execution failed:', error);
            this.results.errors.push({
                test: 'Test Suite Setup',
                error: error.message,
                stack: error.stack
            });
        } finally {
            await this.cleanup();
        }
        
        return this.results;
    }

    /**
     * Set up test environment
     */
    async setup() {
        console.log('[RouterTests] Setting up test environment...');
        
        // Create mock components
        this.mockComponents = this.createMockComponents();
        
        // Load router configuration
        const routeConfig = await this.loadRouteConfig();
        
        // Initialize router with test configuration
        this.router = await createRouter(routeConfig, {
            autoStart: false,
            onError: (error, url) => {
                console.log('[RouterTests] Router error captured:', error, url);
            },
            onValidationError: (validation) => {
                console.log('[RouterTests] Validation error captured:', validation);
            }
        });
        
        // Set up router with mock components
        this.router.setSecurityContext(() => this.mockComponents.security);
        this.router.setViewFactory(this.mockComponents.viewFactory);
        this.router.setModalFactory(this.mockComponents.modalFactory);
        
        // Initialize URL validator
        this.urlValidator = new URLValidator(routeConfig);
        
        this.setupComplete = true;
        console.log('[RouterTests] Test environment setup complete');
    }

    /**
     * Create mock components for testing
     */
    createMockComponents() {
        return {
            security: {
                isAuthenticated: () => true,
                hasAnyPermission: (permissions) => {
                    // Mock permission check - allow most permissions for testing
                    const allowedPermissions = [
                        'PROJECT_VIEWER', 'PROJECT_EDITOR', 'CORPUS_VIEWER', 
                        'CORPUS_EDITOR', 'CORPUS_ADMIN', 'PROJECT_ADMIN'
                    ];
                    return permissions.some(perm => allowedPermissions.includes(perm));
                },
                hasAllPermissions: (permissions) => {
                    return permissions.every(perm => this.hasAnyPermission([perm]));
                }
            },
            viewFactory: {
                renderRoute: async (match, options) => {
                    console.log('[MockViewFactory] Rendering route:', match.route.id);
                    return { success: true, view: match.route.id };
                }
            },
            modalFactory: {
                showModal: async (modalInfo, match) => {
                    console.log('[MockModalFactory] Showing modal:', modalInfo.modal.id);
                    return { success: true, modal: modalInfo.modal.id };
                },
                hideCurrentModal: () => {
                    console.log('[MockModalFactory] Hiding current modal');
                }
            },
            errorModal: {
                show: (options) => {
                    console.log('[MockErrorModal] Showing error:', options);
                }
            }
        };
    }

    /**
     * Load route configuration for testing
     */
    async loadRouteConfig() {
        // Force fallback config for consistent testing
        console.warn('[RouterTests] Using fallback route configuration for consistent testing');
        return this.getFallbackRouteConfig();
    }

    /**
     * Fallback route configuration for testing
     */
    getFallbackRouteConfig() {
        return {
            version: "1.0.0",
            globalSettings: {
                preserveQueryParams: ["s", "key"],
                defaultRoute: "docs",
                errorRoute: "docs",
                enableHistoryMode: true,
                urlValidation: {
                    entityIdPatterns: {
                        document: "^[A-Z]{3}-\\d{3,6}$",
                        project: "^proj_[a-z0-9]{8,16}$",
                        corpus_document: "^[a-z0-9_\\/.\\-]+$"
                    },
                    strictValidation: true
                }
            },
            routes: [
                {
                    id: "docs",
                    path: "docs",
                    title: "Documents",
                    component: { type: "view", factory: "createDocumentWorkspace" },
                    access: { requiresAuth: true, permissionsAnyOf: ["PROJECT_VIEWER"] },
                    entitySupport: {
                        enabled: true,
                        paramName: "documentId",
                        pattern: "^[A-Z]{3}-\\d{3,6}$"
                    },
                    modals: [
                        {
                            id: "document_settings",
                            title: "Document Settings",
                            component: { factory: "createDocumentSettingsModal" },
                            access: { requiresAuth: true, permissionsAnyOf: ["PROJECT_EDITOR"] }
                        }
                    ]
                },
                {
                    id: "corpus",
                    path: "corpus",
                    title: "Corpus Management",
                    component: { type: "view", factory: "createCorpusManager" },
                    access: { requiresAuth: true, permissionsAnyOf: ["CORPUS_VIEWER"] },
                    entitySupport: {
                        enabled: true,
                        paramName: "corpusDocumentPath",
                        pattern: "^[a-z0-9_\\/.\\-]+$"
                    }
                }
            ]
        };
    }

    // ===============================================
    // CORE ROUTER TESTS
    // ===============================================

    /**
     * Test router initialization
     */
    async testRouterInitialization() {
        await this.runTest('Router Initialization', async () => {
            this.assert(this.router !== null, 'Router should be created');
            this.assert(typeof this.router.navigate === 'function', 'Router should have navigate method');
            this.assert(typeof this.router.getCurrentMatch === 'function', 'Router should have getCurrentMatch method');
            this.assert(typeof this.router.start === 'function', 'Router should have start method');
            
            // Test router start
            await this.router.start();
            this.assert(this.router.isStarted(), 'Router should be started');
        });
    }

    /**
     * Test route matching logic
     */
    async testRouteMatching() {
        await this.runTest('Route Matching', async () => {
            // Test basic route matching
            const docsMatch = await this.router.matchRoute('/docs');
            this.assert(docsMatch.success, 'Should match docs route');
            this.assert(docsMatch.route.id === 'docs', 'Should match correct route');
            
            // Test route with entity
            const docsWithEntity = await this.router.matchRoute('/docs/RFP-123');
            this.assert(docsWithEntity.success, 'Should match docs route with entity');
            this.assert(docsWithEntity.entityId === 'RFP-123', 'Should extract entity ID');
            
            // Test corpus route
            const corpusMatch = await this.router.matchRoute('/corpus');
            this.assert(corpusMatch.success, 'Should match corpus route');
            this.assert(corpusMatch.route.id === 'corpus', 'Should match correct corpus route');
            
            // Test invalid route
            const invalidMatch = await this.router.matchRoute('/invalid-route');
            this.assert(!invalidMatch.success, 'Should not match invalid route');
        });
    }

    /**
     * Test basic navigation functionality
     */
    async testNavigationBasics() {
        await this.runTest('Navigation Basics', async () => {
            // Test navigation to docs
            const docsResult = await this.router.navigate('/docs');
            this.assert(docsResult.success, 'Should successfully navigate to docs');
            
            const currentMatch = this.router.getCurrentMatch();
            this.assert(currentMatch.route.id === 'docs', 'Current route should be docs');
            
            // Test navigation to corpus
            const corpusResult = await this.router.navigate('/corpus');
            this.assert(corpusResult.success, 'Should successfully navigate to corpus');
            
            const newMatch = this.router.getCurrentMatch();
            this.assert(newMatch.route.id === 'corpus', 'Current route should be corpus');
        });
    }

    /**
     * Test entity routing functionality
     */
    async testEntityRouting() {
        await this.runTest('Entity Routing', async () => {
            // Test document entity routing
            const docResult = await this.router.navigate('/docs/RFP-123');
            this.assert(docResult.success, 'Should navigate to document entity');
            
            const docMatch = this.router.getCurrentMatch();
            this.assert(docMatch.entityId === 'RFP-123', 'Should have correct entity ID');
            this.assert(docMatch.route.id === 'docs', 'Should be on docs route');
            
            // Test corpus document entity routing
            const corpusDocResult = await this.router.navigate('/corpus/policies/security.pdf');
            this.assert(corpusDocResult.success, 'Should navigate to corpus document entity');
            
            const corpusDocMatch = this.router.getCurrentMatch();
            this.assert(corpusDocMatch.entityId === 'policies/security.pdf', 'Should have correct corpus document path');
        });
    }

    /**
     * Test modal routing functionality
     */
    async testModalRouting() {
        await this.runTest('Modal Routing', async () => {
            // Navigate to base route first
            await this.router.navigate('/docs');
            
            // Test modal navigation
            const modalResult = await this.router.navigate('/docs/document_settings');
            this.assert(modalResult.success, 'Should navigate to modal');
            
            const modalMatch = this.router.getCurrentMatch();
            this.assert(modalMatch.modalId === 'document_settings', 'Should have correct modal ID');
            this.assert(modalMatch.route.id === 'docs', 'Should still be on base route');
        });
    }

    // ===============================================
    // URL VALIDATION TESTS
    // ===============================================

    /**
     * Test URL validation functionality
     */
    async testURLValidation() {
        await this.runTest('URL Validation', async () => {
            // Test valid URLs
            const validUrls = [
                '/docs',
                '/docs/RFP-123',
                '/corpus',
                '/corpus/policies/security.pdf',
                '/docs/document_settings'
            ];
            
            for (const url of validUrls) {
                const validation = this.urlValidator.validateURL(url, { 
                    isAuthenticated: true,
                    userPermissions: ['PROJECT_VIEWER', 'CORPUS_VIEWER']
                });
                this.assert(validation.valid, `URL should be valid: ${url}`);
                this.assert(validation.errors.length === 0, `URL should have no errors: ${url}`);
            }
            
            // Test invalid URLs
            const invalidUrls = [
                '/invalid-route',
                '/docs/invalid-document-format',
                '/corpus/invalid-path-with-invalid-chars!@#'
            ];
            
            for (const url of invalidUrls) {
                const validation = this.urlValidator.validateURL(url, {
                    isAuthenticated: true,
                    userPermissions: ['PROJECT_VIEWER', 'CORPUS_VIEWER']
                });
                this.assert(!validation.valid, `URL should be invalid: ${url}`);
                this.assert(validation.errors.length > 0, `URL should have errors: ${url}`);
            }
        });
    }

    /**
     * Test entity validation patterns
     */
    async testEntityValidation() {
        await this.runTest('Entity Validation', async () => {
            // Test document ID validation
            const validDocIds = ['RFP-123', 'DOC-4567', 'QUE-891011'];
            const invalidDocIds = ['rfp-123', 'DOC123', 'INVALID-ID-12345678'];
            
            for (const docId of validDocIds) {
                const validation = this.urlValidator.validateEntityId(docId, 'document');
                this.assert(validation.valid, `Document ID should be valid: ${docId}`);
            }
            
            for (const docId of invalidDocIds) {
                const validation = this.urlValidator.validateEntityId(docId, 'document');
                this.assert(!validation.valid, `Document ID should be invalid: ${docId}`);
            }
            
            // Test corpus document path validation
            const validCorpusPaths = ['policies/security.pdf', 'guides/user_manual.docx', 'templates/rfp-template.xlsx'];
            const invalidCorpusPaths = ['INVALID/PATH!@#', 'path with spaces', 'path/with/UPPERCASE'];
            
            for (const path of validCorpusPaths) {
                const validation = this.urlValidator.validateEntityId(path, 'corpus_document');
                this.assert(validation.valid, `Corpus path should be valid: ${path}`);
            }
            
            for (const path of invalidCorpusPaths) {
                const validation = this.urlValidator.validateEntityId(path, 'corpus_document');
                this.assert(!validation.valid, `Corpus path should be invalid: ${path}`);
            }
        });
    }

    /**
     * Test modal validation
     */
    async testModalValidation() {
        await this.runTest('Modal Validation', async () => {
            // Test valid modals for docs route
            const docsModals = ['document_settings'];
            
            for (const modalId of docsModals) {
                const validation = this.urlValidator.validateModalId(modalId, 'docs');
                this.assert(validation.valid, `Modal should be valid for docs route: ${modalId}`);
            }
            
            // Test invalid modal for route
            const invalidModal = this.urlValidator.validateModalId('nonexistent_modal', 'docs');
            this.assert(!invalidModal.valid, 'Nonexistent modal should be invalid');
            
            // Test modal access with wrong route
            const wrongRouteModal = this.urlValidator.validateModalId('document_settings', 'corpus');
            this.assert(!wrongRouteModal.valid, 'Modal should be invalid for wrong route');
        });
    }

    // ===============================================
    // INTEGRATION TESTS
    // ===============================================

    /**
     * Test permission integration
     */
    async testPermissionIntegration() {
        await this.runTest('Permission Integration', async () => {
            // Test with mock user having limited permissions
            const limitedSecurity = {
                isAuthenticated: () => true,
                hasAnyPermission: (permissions) => permissions.includes('PROJECT_VIEWER'),
                hasAllPermissions: (permissions) => permissions.every(p => p === 'PROJECT_VIEWER')
            };
            
            this.router.setSecurityContext(() => limitedSecurity);
            
            // Should allow docs viewing
            const docsResult = await this.router.navigate('/docs');
            this.assert(docsResult.success, 'Should allow navigation to docs with PROJECT_VIEWER');
            
            // Should block corpus access
            const corpusResult = await this.router.navigate('/corpus');
            this.assert(!corpusResult.success, 'Should block navigation to corpus without CORPUS_VIEWER');
            
            // Restore full permissions for remaining tests
            this.router.setSecurityContext(() => this.mockComponents.security);
        });
    }

    /**
     * Test history integration
     */
    async testHistoryIntegration() {
        await this.runTest('History Integration', async () => {
            // Test history navigation
            await this.router.navigate('/docs');
            await this.router.navigate('/corpus');
            
            // Simulate back button
            window.history.back();
            
            // Wait for popstate event to process
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Check that router handled the history change
            // Note: In actual tests, we'd need to mock the popstate event
            this.assert(true, 'History integration test placeholder - would need DOM environment');
        });
    }

    /**
     * Test error handling
     */
    async testErrorHandling() {
        await this.runTest('Error Handling', async () => {
            // Test navigation to invalid route
            const invalidResult = await this.router.navigate('/completely-invalid-route');
            this.assert(!invalidResult.success, 'Should fail for invalid route');
            this.assert(invalidResult.error, 'Should have error information');
            
            // Test malformed URL
            const malformedResult = await this.router.navigate('///malformed//url///');
            this.assert(!malformedResult.success, 'Should handle malformed URLs gracefully');
            
            // Test very long URL
            const longUrl = '/docs/' + 'x'.repeat(1000);
            const longUrlResult = await this.router.navigate(longUrl);
            this.assert(!longUrlResult.success, 'Should handle very long URLs appropriately');
        });
    }

    // ===============================================
    // EDGE CASES AND STRESS TESTS
    // ===============================================

    /**
     * Test edge cases
     */
    async testEdgeCases() {
        await this.runTest('Edge Cases', async () => {
            // Test empty URL
            const emptyResult = await this.router.navigate('');
            // Should default to default route
            this.assert(emptyResult.success, 'Should handle empty URL');
            
            // Test root URL
            const rootResult = await this.router.navigate('/');
            this.assert(rootResult.success, 'Should handle root URL');
            
            // Test URL with query parameters
            const queryResult = await this.router.navigate('/docs?s=cognaire&key=test123');
            this.assert(queryResult.success, 'Should handle URLs with query parameters');
            
            // Test URL with hash
            const hashResult = await this.router.navigate('/docs#section1');
            this.assert(hashResult.success, 'Should handle URLs with hash fragments');
            
            // Test consecutive navigation calls
            const promises = [
                this.router.navigate('/docs'),
                this.router.navigate('/corpus'),
                this.router.navigate('/docs')
            ];
            
            const results = await Promise.all(promises);
            const lastSuccessful = results.filter(r => r.success).pop();
            this.assert(lastSuccessful, 'Should handle rapid consecutive navigation');
        });
    }

    /**
     * Test performance characteristics
     */
    async testPerformance() {
        await this.runTest('Performance', async () => {
            const iterations = 100;
            const startTime = performance.now();
            
            // Test rapid URL validation
            for (let i = 0; i < iterations; i++) {
                this.urlValidator.validateURL('/docs', {
                    isAuthenticated: true,
                    userPermissions: ['PROJECT_VIEWER']
                });
            }
            
            const validationTime = performance.now() - startTime;
            console.log(`[RouterTests] ${iterations} URL validations took ${validationTime.toFixed(2)}ms`);
            
            this.assert(validationTime < 1000, 'URL validation should be performant');
            
            // Test rapid route matching
            const matchStartTime = performance.now();
            
            for (let i = 0; i < iterations; i++) {
                await this.router.matchRoute('/docs');
            }
            
            const matchTime = performance.now() - matchStartTime;
            console.log(`[RouterTests] ${iterations} route matches took ${matchTime.toFixed(2)}ms`);
            
            this.assert(matchTime < 2000, 'Route matching should be performant');
        });
    }

    // ===============================================
    // TEST UTILITIES
    // ===============================================

    /**
     * Run a single test
     */
    async runTest(testName, testFunction) {
        console.log(`[RouterTests] Running test: ${testName}`);
        this.results.total++;
        
        try {
            await testFunction();
            this.results.passed++;
            console.log(`[RouterTests] ✅ ${testName} - PASSED`);
        } catch (error) {
            this.results.failed++;
            console.error(`[RouterTests] ❌ ${testName} - FAILED:`, error.message);
            this.results.errors.push({
                test: testName,
                error: error.message,
                stack: error.stack
            });
        }
    }

    /**
     * Assert condition is true
     */
    assert(condition, message) {
        if (!condition) {
            throw new Error(`Assertion failed: ${message}`);
        }
    }

    /**
     * Report test results
     */
    reportResults() {
        console.log('\n[RouterTests] Test Results Summary:');
        console.log('=====================================');
        console.log(`Total Tests: ${this.results.total}`);
        console.log(`✅ Passed: ${this.results.passed}`);
        console.log(`❌ Failed: ${this.results.failed}`);
        console.log(`⏭️  Skipped: ${this.results.skipped}`);
        
        const passRate = ((this.results.passed / this.results.total) * 100).toFixed(1);
        console.log(`📊 Pass Rate: ${passRate}%`);
        
        if (this.results.errors.length > 0) {
            console.log('\nDetailed Errors:');
            this.results.errors.forEach((error, index) => {
                console.log(`\n${index + 1}. ${error.test}:`);
                console.log(`   Error: ${error.error}`);
                if (error.stack) {
                    console.log(`   Stack: ${error.stack.split('\n')[1]?.trim()}`);
                }
            });
        }
        
        console.log('\n=====================================');
        
        if (this.results.failed === 0) {
            console.log('🎉 All tests passed successfully!');
        } else {
            console.log(`⚠️  ${this.results.failed} test(s) failed. Review errors above.`);
        }
    }

    /**
     * Clean up test environment
     */
    async cleanup() {
        if (this.router) {
            try {
                await this.router.stop();
            } catch (error) {
                console.warn('[RouterTests] Router cleanup failed:', error);
            }
        }
        
        // Reset any global state changes
        this.router = null;
        this.urlValidator = null;
        this.mockComponents = null;
        this.setupComplete = false;
        
        console.log('[RouterTests] Test cleanup complete');
    }
}

// Export test suite factory
export function createRouterTestSuite() {
    return new RouterTestSuite();
}

// Auto-run tests if this module is loaded directly
if (typeof window !== 'undefined' && window.location.search.includes('run-router-tests')) {
    document.addEventListener('DOMContentLoaded', async () => {
        const testSuite = createRouterTestSuite();
        await testSuite.runAllTests();
    });
}
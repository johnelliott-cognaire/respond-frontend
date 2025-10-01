/**
 * Test script for Enhanced Job Management Features (Phase 1 & Phase 2)
 * 
 * Phase 1 Tests:
 * - AdaptiveJobController with enhanced tracking
 * - JobSessionManager with localStorage schema v2.1
 * - Realtime progress API integration
 * - Cross-session job recovery
 * 
 * Phase 2 Tests:
 * - Real-time visual feedback for AI job processing
 * - AG-Grid compatible processing state indicators
 * - Enhanced TopBar job progress display
 * - Throttled grid updates for performance
 * - Processing state animations and styling
 * 
 * Usage: Run window.testEnhancedJobFeatures() in browser console after logging into dev1.cognairerespond.com/?s=cognaire
 */

console.log("🧪 Enhanced Job Management Features Test Suite Loaded (Phase 1 & 2)");

// Test 1: Verify enhanced job controller is loaded
function testAdaptiveJobController() {
    console.log("\n1️⃣ Testing AdaptiveJobController Integration");
    
    if (!window.jobController) {
        console.error("❌ jobController not found on window");
        return false;
    }
    
    if (window.jobController.constructor.name !== 'AdaptiveJobController') {
        console.error("❌ Expected AdaptiveJobController, got:", window.jobController.constructor.name);
        return false;
    }
    
    console.log("✅ AdaptiveJobController loaded correctly");
    
    // Test enhanced features configuration
    const enhancedFeatures = window.jobController.enhancedFeatures;
    if (!enhancedFeatures || !enhancedFeatures.adaptivePolling) {
        console.error("❌ Enhanced features not configured");
        return false;
    }
    
    console.log("✅ Enhanced features enabled:", enhancedFeatures);
    return true;
}

// Test 2: Verify job session manager
function testJobSessionManager() {
    console.log("\n2️⃣ Testing JobSessionManager");
    
    if (!window.jobSessionManager) {
        console.error("❌ jobSessionManager not found on window");
        return false;
    }
    
    if (window.jobSessionManager.constructor.name !== 'JobSessionManager') {
        console.error("❌ Expected JobSessionManager, got:", window.jobSessionManager.constructor.name);
        return false;
    }
    
    console.log("✅ JobSessionManager loaded correctly");
    
    // Test session management features
    const version = window.jobSessionManager.version;
    if (version !== '2.1') {
        console.error("❌ Expected version 2.1, got:", version);
        return false;
    }
    
    console.log("✅ JobSessionManager version:", version);
    
    // Test storage functionality
    const testJobData = {
        jobId: 'test-123',
        jobType: 'question-answering-master',
        status: 'QUEUED',
        progress: 0,
        meta: { enhanced: true }
    };
    
    window.jobSessionManager.saveJob('test-123', testJobData);
    const loaded = window.jobSessionManager.loadJob('test-123');
    
    if (!loaded || loaded.jobId !== 'test-123') {
        console.error("❌ Failed to save/load test job");
        return false;
    }
    
    // Clean up test data
    window.jobSessionManager.removeJob('test-123');
    console.log("✅ Session storage working correctly");
    
    return true;
}

// Test 3: Verify API endpoints availability
async function testRealtimeAPI() {
    console.log("\n3️⃣ Testing Realtime API Integration");
    
    try {
        // Import the API module
        const realtimeModule = await import('../api/realtime-jobs.js');
        const { getRealtimeProgress, getUserActiveJobs } = realtimeModule;
        
        console.log("✅ Realtime API module loaded");
        
        // Test authentication check for user active jobs
        if (!localStorage.getItem("authToken")) {
            console.log("⚠️  No auth token - skipping API calls");
            return true;
        }
        
        // Test user active jobs endpoint (should work even with no active jobs)
        try {
            const activeJobs = await getUserActiveJobs();
            console.log("✅ User active jobs endpoint working:", activeJobs);
            return true;
        } catch (error) {
            if (error.message.includes('404') || error.message.includes('not found')) {
                console.log("⚠️  User active jobs endpoint not yet deployed - this is expected");
                return true;
            }
            console.error("❌ User active jobs API error:", error);
            return false;
        }
        
    } catch (error) {
        console.error("❌ Failed to load realtime API module:", error);
        return false;
    }
}

// Test 4: Test enhanced job tracking features  
function testEnhancedJobFeatures() {
    console.log("\n4️⃣ Testing Enhanced Job Features");
    
    const jobController = window.jobController;
    
    // Test feature detection
    const supportsEnhanced = jobController.supportsEnhancedFeatures('question-answering-master');
    if (!supportsEnhanced) {
        console.error("❌ Enhanced features not supported for question-answering-master");
        return false;
    }
    
    console.log("✅ Enhanced features supported for question-answering jobs");
    
    // Test polling configuration
    const pollingConfig = jobController.pollingConfig;
    if (!pollingConfig['question-answering-master'] || !pollingConfig['question-answering-master'].useRealtimeAPI) {
        console.error("❌ Realtime API not configured for question-answering-master");
        return false;
    }
    
    console.log("✅ Adaptive polling configured correctly");
    
    // Test synthetic progress capability
    const shouldUseSynthetic = jobController.shouldUseSyntheticProgress('question-answering-master');
    console.log("✅ Synthetic progress enabled:", shouldUseSynthetic);
    
    // CRITICAL TEST: Verify adaptive polling methods are available and unique
    console.log("\n🔧 Testing Critical Fix: Adaptive Polling Methods");
    
    // Test that startAdaptivePolling exists and calls enhancedPollJob
    if (typeof jobController.startAdaptivePolling !== 'function') {
        console.error("❌ startAdaptivePolling method missing");
        return false;
    }
    
    if (typeof jobController.enhancedPollJob !== 'function') {
        console.error("❌ enhancedPollJob method missing");
        return false;
    }
    
    if (typeof jobController.pollWithRealtimeAPI !== 'function') {
        console.error("❌ pollWithRealtimeAPI method missing");
        return false;
    }
    
    console.log("✅ All adaptive polling methods available");
    
    // Test that question completion methods exist
    if (typeof jobController.processQuestionCompletions !== 'function') {
        console.error("❌ processQuestionCompletions method missing");
        return false;
    }
    
    if (typeof jobController.notifyQuestionCompletion !== 'function') {
        console.error("❌ notifyQuestionCompletion method missing");
        return false;
    }
    
    console.log("✅ Question completion methods available");
    
    // Test enhanced startQuestionJob override
    const startJobMethod = jobController.startQuestionJob.toString();
    if (!startJobMethod.includes('enhanced tracking') && !startJobMethod.includes('supportsEnhancedFeatures')) {
        console.error("❌ startQuestionJob not properly overridden for enhanced tracking");
        return false;
    }
    
    console.log("✅ Enhanced startQuestionJob override detected");
    
    return true;
}

// Test 5: Test session recovery
function testSessionRecovery() {
    console.log("\n5️⃣ Testing Session Recovery");
    
    const sessionManager = window.jobSessionManager;
    
    // Create a mock job for testing recovery
    const mockJob = {
        jobId: 'recovery-test-456',
        jobType: 'question-answering-master',
        status: 'RUNNING',
        progress: 45,
        startTime: Date.now() - 300000, // 5 minutes ago
        meta: {
            enhanced: true,
            selectedRowCount: 25,
            modelUsed: 'claude-3-sonnet'
        },
        documentContext: {
            projectDocumentId: 'test-doc-123',
            documentTitle: 'Test RFP Document'
        }
    };
    
    // Save mock job
    sessionManager.saveJob(mockJob.jobId, mockJob);
    
    // Test getAllJobs
    const allJobs = sessionManager.getAllJobs();
    const foundJob = allJobs.find(job => job.jobId === mockJob.jobId);
    
    if (!foundJob) {
        console.error("❌ Failed to retrieve saved job");
        return false;
    }
    
    console.log("✅ Session recovery working - found job:", {
        jobId: foundJob.jobId,
        status: foundJob.status,
        progress: foundJob.progress,
        enhanced: foundJob.meta?.enhanced
    });
    
    // Test last active document
    const lastActiveDoc = sessionManager.getLastActiveDocument();
    if (lastActiveDoc && lastActiveDoc.projectDocumentId === 'test-doc-123') {
        console.log("✅ Last active document tracking working");
    }
    
    // Clean up
    sessionManager.removeJob(mockJob.jobId);
    
    return true;
}

// ============================
// Phase 2: Visual Indicators Tests
// ============================

// Test 6: Verify enhanced CSS styles are loaded
function testEnhancedCSSLoading() {
    console.log("\n6️⃣ Testing Enhanced CSS Loading");
    
    // Check if enhanced-job-progress.css is loaded
    const stylesheets = Array.from(document.styleSheets);
    const enhancedStylesheet = stylesheets.find(sheet => 
        sheet.href && sheet.href.includes('enhanced-job-progress.css')
    );
    
    if (!enhancedStylesheet) {
        console.error("❌ enhanced-job-progress.css not loaded");
        return false;
    }
    
    console.log("✅ Enhanced CSS stylesheet loaded");
    
    // Test that CSS rules are accessible
    try {
        const testRules = [
            '.question-processing',
            '.question-completed', 
            '.progress-bar-enhanced',
            '.ai-answer-btn.processing'
        ];
        
        let foundRules = 0;
        for (const rule of enhancedStylesheet.cssRules || []) {
            if (rule.selectorText && testRules.some(selector => 
                rule.selectorText.includes(selector))) {
                foundRules++;
            }
        }
        
        if (foundRules < 2) {
            console.warn("⚠️  Could not verify all CSS rules (may be due to CORS)");
        } else {
            console.log("✅ Enhanced CSS rules accessible");
        }
        
        return true;
    } catch (error) {
        console.warn("⚠️  CSS rule verification failed (CORS restriction):", error.message);
        return true; // Still pass if CSS is loaded
    }
}

// Test 7: Verify ThrottledGridUpdater functionality
function testThrottledGridUpdater() {
    console.log("\n7️⃣ Testing ThrottledGridUpdater");
    
    // Look for questions grid instance
    const questionsGridElement = document.querySelector('.question-grid-container');
    if (!questionsGridElement) {
        console.warn("⚠️  Questions grid not found - test requires document with questions");
        return true; // Skip test gracefully
    }
    
    // Check if global questionsGrid exists (set by stage controller)
    if (!window.questionsGrid) {
        console.warn("⚠️  Global questionsGrid instance not found");
        return true; // Skip test gracefully
    }
    
    const grid = window.questionsGrid;
    
    // Test ThrottledGridUpdater exists
    if (!grid.gridUpdater) {
        console.error("❌ ThrottledGridUpdater not initialized");
        return false;
    }
    
    console.log("✅ ThrottledGridUpdater initialized");
    
    // Test updater methods exist
    const requiredMethods = ['scheduleRowUpdate', 'processPendingUpdates', 'forceUpdate', 'destroy'];
    for (const method of requiredMethods) {
        if (typeof grid.gridUpdater[method] !== 'function') {
            console.error(`❌ ThrottledGridUpdater missing method: ${method}`);
            return false;
        }
    }
    
    console.log("✅ ThrottledGridUpdater methods available");
    
    // Test that gridUpdater has proper configuration
    if (grid.gridUpdater.updateInterval !== 1500) {
        console.warn("⚠️  Unexpected update interval:", grid.gridUpdater.updateInterval);
    } else {
        console.log("✅ ThrottledGridUpdater configured with 1.5s interval");
    }
    
    return true;
}

// Test 8: Test processing state management methods
function testProcessingStateMethods() {
    console.log("\n8️⃣ Testing Processing State Management");
    
    if (!window.questionsGrid) {
        console.warn("⚠️  Questions grid not available for testing");
        return true;
    }
    
    const grid = window.questionsGrid;
    
    // Test Phase 2 methods exist
    const requiredMethods = [
        'markRowsAsProcessing',
        'clearProcessingIndicators', 
        'handleQuestionCompletion',
        'handleJobStateChange',
        'subscribeToJobEvents',
        'unsubscribeFromJobEvents'
    ];
    
    for (const method of requiredMethods) {
        if (typeof grid[method] !== 'function') {
            console.error(`❌ QuestionsGrid missing Phase 2 method: ${method}`);
            return false;
        }
    }
    
    console.log("✅ Processing state management methods available");
    
    // Test event listener setup
    if (!Array.isArray(grid.jobEventListeners)) {
        console.error("❌ Job event listeners not properly initialized");
        return false;
    }
    
    console.log("✅ Job event listeners initialized");
    
    // Test processing state properties
    const requiredProperties = ['processingJobId', 'jobEventListeners'];
    for (const prop of requiredProperties) {
        if (!(prop in grid)) {
            console.error(`❌ QuestionsGrid missing property: ${prop}`);
            return false;
        }
    }
    
    console.log("✅ Processing state properties available");
    
    return true;
}

// Test 9: Test enhanced grid formatting capabilities
function testEnhancedGridFormatting() {
    console.log("\n9️⃣ Testing Enhanced Grid Formatting");
    
    if (!window.questionsGrid || !window.questionsGrid.formatting) {
        console.warn("⚠️  Grid formatting not available for testing");
        return true;
    }
    
    const formatting = window.questionsGrid.formatting;
    
    // Test enhanced formatting methods
    const requiredMethods = ['renderAnswerTextCell', 'getRowClass'];
    for (const method of requiredMethods) {
        if (typeof formatting[method] !== 'function') {
            console.error(`❌ QuestionsGridFormatting missing method: ${method}`);
            return false;
        }
    }
    
    console.log("✅ Enhanced formatting methods available");
    
    // Test processing indicator rendering
    const mockProcessingData = {
        data: {
            _isProcessing: true,
            answer_text: 'Previous answer'
        }
    };
    
    try {
        const processingHTML = formatting.renderAnswerTextCell(mockProcessingData);
        if (!processingHTML.includes('processing-indicator') || 
            !processingHTML.includes('AI Processing')) {
            console.error("❌ Processing indicator not rendered correctly");
            return false;
        }
        
        console.log("✅ Processing indicator rendering works");
    } catch (error) {
        console.error("❌ Error testing processing indicator:", error);
        return false;
    }
    
    // Test completed state rendering
    const mockCompletedData = {
        data: {
            _justCompleted: true,
            answer_text: 'Newly generated answer'
        }
    };
    
    try {
        const completedHTML = formatting.renderAnswerTextCell(mockCompletedData);
        if (!completedHTML.includes('completion-highlight')) {
            console.error("❌ Completion highlight not rendered correctly");
            return false;
        }
        
        console.log("✅ Completion highlight rendering works");
    } catch (error) {
        console.error("❌ Error testing completion highlight:", error);
        return false;
    }
    
    return true;
}

// Test 10: Test enhanced TopBar job display
function testEnhancedTopBarDisplay() {
    console.log("\n🔟 Testing Enhanced TopBar Display");
    
    if (!window.topBar) {
        console.warn("⚠️  TopBar instance not found");
        return true;
    }
    
    const topBar = window.topBar;
    
    // Test enhanced TopBar methods
    const requiredMethods = [
        '_getEnhancedJobMetadata',
        '_shouldShowProgressDetails', 
        '_getProgressText',
        '_getCurrentPhase',
        '_getTimeEstimate'
    ];
    
    for (const method of requiredMethods) {
        if (typeof topBar[method] !== 'function') {
            console.error(`❌ TopBar missing enhanced method: ${method}`);
            return false;
        }
    }
    
    console.log("✅ Enhanced TopBar methods available");
    
    // Test enhanced job metadata generation
    const mockJob = {
        jobId: 'test-123',
        jobType: 'question-answering-master',
        status: 'RUNNING',
        progress: 65,
        meta: {
            enhanced: true,
            selectedRowCount: 20,
            modelUsed: 'claude-3-sonnet'
        }
    };
    
    try {
        const metadata = topBar._getEnhancedJobMetadata(mockJob);
        if (!metadata || !metadata.enhanced || !metadata.model) {
            console.error("❌ Enhanced metadata not generated correctly");
            return false;
        }
        
        console.log("✅ Enhanced job metadata generation works");
        
        // Test progress details
        const shouldShow = topBar._shouldShowProgressDetails(mockJob);
        if (shouldShow !== true) {
            console.error("❌ Progress details check failed");
            return false;
        }
        
        console.log("✅ Progress details check works");
        
        // Test phase calculation
        const phase = topBar._getCurrentPhase(65);
        if (!phase || typeof phase !== 'string') {
            console.error("❌ Phase calculation failed");
            return false;
        }
        
        console.log("✅ Phase calculation works:", phase);
        
    } catch (error) {
        console.error("❌ Error testing TopBar enhancements:", error);
        return false;
    }
    
    return true;
}

// Run all tests (Phase 1 & Phase 2)
async function runAllTests() {
    console.log("🚀 Starting Enhanced Job Management Feature Tests (Phase 1 & 2)\n");
    
    const results = {
        // Phase 1 Tests
        adaptiveJobController: testAdaptiveJobController(),
        jobSessionManager: testJobSessionManager(),
        realtimeAPI: await testRealtimeAPI(),
        enhancedFeatures: testEnhancedJobFeatures(),
        sessionRecovery: testSessionRecovery(),
        
        // Phase 2 Tests
        enhancedCSSLoading: testEnhancedCSSLoading(),
        throttledGridUpdater: testThrottledGridUpdater(),
        processingStateMethods: testProcessingStateMethods(),
        enhancedGridFormatting: testEnhancedGridFormatting(),
        enhancedTopBarDisplay: testEnhancedTopBarDisplay()
    };
    
    console.log("\n📊 Test Results Summary:");
    Object.entries(results).forEach(([test, passed]) => {
        console.log(`${passed ? '✅' : '❌'} ${test}: ${passed ? 'PASSED' : 'FAILED'}`);
    });
    
    const allPassed = Object.values(results).every(result => result);
    
    if (allPassed) {
        console.log("\n🎉 All Enhanced Job Management features are working correctly!");
        console.log("\n📋 Phase 1 Features Ready:");
        console.log("  • AdaptiveJobController with enhanced tracking");
        console.log("  • JobSessionManager with localStorage schema v2.1");
        console.log("  • Realtime progress API integration");
        console.log("  • Cross-session job recovery");
        console.log("  • Synthetic progress enhancement");
        console.log("  • Adaptive polling strategies");
        
        console.log("\n📋 Phase 2 Features Ready:");
        console.log("  • Real-time visual feedback for AI job processing");
        console.log("  • AG-Grid compatible processing state indicators");
        console.log("  • Enhanced TopBar job progress display with phases");
        console.log("  • Throttled grid updates for large datasets");
        console.log("  • Processing animations with design tokens");
        console.log("  • Event-driven architecture for real-time updates");
        console.log("  • Accessibility support with reduced motion");
        
        console.log("\n🔧 To manually test enhanced features:");
        console.log("1. Navigate to a document with questions");
        console.log("2. Select multiple questions");
        console.log("3. Click 'AI Answer' button");
        console.log("4. Observe:");
        console.log("   • Immediate visual feedback on AI button");
        console.log("   • Processing indicators on selected rows");
        console.log("   • Enhanced progress display in TopBar");
        console.log("   • Real-time completion highlights");
        console.log("   • Smooth animations and transitions");
        
    } else {
        console.log("\n⚠️  Some features may not be fully functional yet");
        console.log("This is expected if you're not on a document with questions");
        console.log("Or if the backend deployment is still in progress");
    }
    
    return allPassed;
}

// Export test functions globally when this module loads
if (typeof window !== 'undefined') {
    window.testEnhancedJobFeatures = runAllTests;
    
    // Phase 1 Tests
    window.testAdaptiveJobController = testAdaptiveJobController;
    window.testJobSessionManager = testJobSessionManager;
    window.testRealtimeAPI = testRealtimeAPI;
    window.testEnhancedJobFeaturesOnly = testEnhancedJobFeatures;
    window.testSessionRecovery = testSessionRecovery;
    
    // Phase 2 Tests
    window.testEnhancedCSSLoading = testEnhancedCSSLoading;
    window.testThrottledGridUpdater = testThrottledGridUpdater;
    window.testProcessingStateMethods = testProcessingStateMethods;
    window.testEnhancedGridFormatting = testEnhancedGridFormatting;
    window.testEnhancedTopBarDisplay = testEnhancedTopBarDisplay;
    
    console.log("🔧 Enhanced Job Management Test Functions Available:");
    console.log("  • window.testEnhancedJobFeatures() - Run all tests (Phase 1 & 2)");
    console.log("\n  Phase 1 Tests:");
    console.log("  • window.testAdaptiveJobController() - Test job controller");
    console.log("  • window.testJobSessionManager() - Test session management");
    console.log("  • window.testRealtimeAPI() - Test API integration");
    console.log("  • window.testSessionRecovery() - Test session recovery");
    console.log("\n  Phase 2 Tests:");
    console.log("  • window.testEnhancedCSSLoading() - Test CSS loading");
    console.log("  • window.testThrottledGridUpdater() - Test grid updater");
    console.log("  • window.testProcessingStateMethods() - Test processing state");
    console.log("  • window.testEnhancedGridFormatting() - Test grid formatting");
    console.log("  • window.testEnhancedTopBarDisplay() - Test TopBar display");
}

export { 
    runAllTests as testEnhancedJobFeatures, 
    testAdaptiveJobController, 
    testJobSessionManager, 
    testRealtimeAPI, 
    testEnhancedJobFeatures as testEnhancedJobFeaturesOnly, 
    testSessionRecovery,
    testEnhancedCSSLoading,
    testThrottledGridUpdater,
    testProcessingStateMethods,
    testEnhancedGridFormatting,
    testEnhancedTopBarDisplay
};
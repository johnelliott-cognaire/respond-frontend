// Main Thread Monitoring Utility
// Tracks potential main thread blocking operations during page load

class MainThreadMonitor {
    constructor() {
        this.isMonitoring = false;
        this.startTime = null;
        this.operations = [];
        this.longTasks = [];
        this.debugMode = false; // Control verbose logging
        
        // Override JSON methods to track their usage
        this.setupJSONOverrides();
        
        // Setup performance observer for long tasks
        this.setupLongTaskObserver();
        
        // Only log initialization if debug mode is enabled
        if (this.debugMode) {
            console.log('[MAIN_THREAD_DEBUG] MainThreadMonitor initialized');
        }
    }
    
    startMonitoring() {
        this.isMonitoring = true;
        this.startTime = performance.now();
        this.operations = [];
        this.longTasks = [];
        
        if (this.debugMode) {
            console.log('[MAIN_THREAD_DEBUG] 🚀 Starting main thread monitoring...');
            
            // Log initial cursor state
            this.logCursorState();
            
            // Analyze localStorage for potential performance issues
            this.analyzeLocalStorage();
            
            // Set up cursor state monitoring
            this.setupCursorMonitoring();
        }
        
        // Set up localStorage monitoring (keep this for performance tracking)
        this.setupLocalStorageMonitoring();
    }
    
    stopMonitoring() {
        this.isMonitoring = false;
        const totalTime = performance.now() - this.startTime;
        
        // Always log essential performance summary
        const criticalOperations = this.operations.filter(op => op.duration > 50);
        const longTaskCount = this.longTasks.length;
        
        if (criticalOperations.length > 0 || longTaskCount > 0) {
            console.warn(`[MAIN_THREAD] Performance Summary: ${criticalOperations.length} slow operations, ${longTaskCount} long tasks in ${totalTime.toFixed(0)}ms`);
        }
        
        // Detailed logging only in debug mode
        if (this.debugMode) {
            console.log(`[MAIN_THREAD_DEBUG] 🏁 Monitoring stopped after ${totalTime.toFixed(2)}ms`);
            console.log(`[MAIN_THREAD_DEBUG] 📊 Total operations tracked: ${this.operations.length}`);
            console.log(`[MAIN_THREAD_DEBUG] ⚠️ Long tasks detected: ${this.longTasks.length}`);
            
            // Log top 10 slowest operations
            const slowest = this.operations
                .filter(op => op.duration > 5)
                .sort((a, b) => b.duration - a.duration)
                .slice(0, 10);
                
            if (slowest.length > 0) {
                console.log('[MAIN_THREAD_DEBUG] 🐌 Top slow operations:');
                slowest.forEach((op, i) => {
                    console.log(`  ${i + 1}. ${op.operation} - ${op.duration.toFixed(2)}ms`);
                });
            }
            
            // Log final cursor state
            this.logCursorState();
        }
    }
    
    trackOperation(operationName, fn) {
        if (!this.isMonitoring) return fn();
        
        const startTime = performance.now();
        if (this.debugMode) {
            console.log(`[MAIN_THREAD_DEBUG] 🔄 Starting: ${operationName}`);
        }
        
        try {
            const result = fn();
            const duration = performance.now() - startTime;
            
            this.operations.push({
                operation: operationName,
                duration,
                timestamp: startTime
            });
            
            // Only log very slow operations to reduce noise
            if (duration > 100) {
                console.warn(`[MAIN_THREAD] SLOW OPERATION: ${operationName} took ${duration.toFixed(2)}ms`);
            } else if (this.debugMode && duration > 20) {
                console.log(`[MAIN_THREAD_DEBUG] ${operationName} took ${duration.toFixed(2)}ms`);
            }
            
            return result;
        } catch (error) {
            const duration = performance.now() - startTime;
            console.error(`[MAIN_THREAD] ERROR: ${operationName} failed after ${duration.toFixed(2)}ms:`, error);
            throw error;
        }
    }
    
    async trackAsyncOperation(operationName, asyncFn) {
        if (!this.isMonitoring) return asyncFn();
        
        const startTime = performance.now();
        if (this.debugMode) {
            console.log(`[MAIN_THREAD_DEBUG] 🔄 Starting async: ${operationName}`);
        }
        
        try {
            const result = await asyncFn();
            const duration = performance.now() - startTime;
            
            this.operations.push({
                operation: `${operationName} (async)`,
                duration,
                timestamp: startTime
            });
            
            // Only log slow async operations
            if (duration > 200) {
                console.warn(`[MAIN_THREAD] SLOW ASYNC: ${operationName} took ${duration.toFixed(2)}ms`);
            } else if (this.debugMode && duration > 50) {
                console.log(`[MAIN_THREAD_DEBUG] ${operationName} completed in ${duration.toFixed(2)}ms`);
            }
            
            return result;
        } catch (error) {
            const duration = performance.now() - startTime;
            console.error(`[MAIN_THREAD] ASYNC ERROR: ${operationName} failed after ${duration.toFixed(2)}ms:`, error);
            throw error;
        }
    }
    
    setupJSONOverrides() {
        const originalParse = JSON.parse;
        const originalStringify = JSON.stringify;
        
        JSON.parse = (text, reviver) => {
            if (!this.isMonitoring) return originalParse(text, reviver);
            
            // Only track very large JSON operations to reduce overhead
            if (text.length > 50000) {
                return this.trackOperation(`JSON.parse (${text.length} chars)`, () => {
                    return originalParse(text, reviver);
                });
            }
            
            return originalParse(text, reviver);
        };
        
        JSON.stringify = (value, replacer, space) => {
            if (!this.isMonitoring) return originalStringify(value, replacer, space);
            
            // Only track stringify operations that might be large
            const result = originalStringify(value, replacer, space);
            if (result && result.length > 50000) {
                if (this.debugMode) {
                    console.log(`[MAIN_THREAD_DEBUG] Large JSON.stringify (${result.length} chars)`);
                }
            }
            
            return result;
        };
    }
    
    setupLongTaskObserver() {
        if ('PerformanceObserver' in window) {
            try {
                const observer = new PerformanceObserver((list) => {
                    for (const entry of list.getEntries()) {
                        this.longTasks.push({
                            name: entry.name,
                            duration: entry.duration,
                            startTime: entry.startTime
                        });
                        
                        // Always log long tasks as they are critical performance issues
                        console.warn(`[MAIN_THREAD] LONG TASK: ${entry.name} - ${entry.duration.toFixed(2)}ms`);
                    }
                });
                
                observer.observe({ entryTypes: ['longtask'] });
            } catch (error) {
                if (this.debugMode) {
                    console.warn('[MAIN_THREAD_DEBUG] Could not setup PerformanceObserver for long tasks:', error);
                }
            }
        }
    }
    
    setupCursorMonitoring() {
        let cursorCheckInterval;
        
        const checkCursor = () => {
            if (!this.isMonitoring) {
                clearInterval(cursorCheckInterval);
                return;
            }
            
            const elapsed = performance.now() - this.startTime;
            
            // Test basic cursor functionality
            const testElement = document.createElement('div');
            testElement.style.position = 'absolute';
            testElement.style.top = '-1000px';
            testElement.style.cursor = 'text';
            document.body.appendChild(testElement);
            
            const computedCursor = window.getComputedStyle(testElement).cursor;
            document.body.removeChild(testElement);
            
            // Check for potential cursor-blocking elements
            const overlays = document.querySelectorAll('.overlay, .modal-backdrop, .loading-overlay');
            const tooltips = document.querySelectorAll('.tooltip, .custom-tooltip');
            const webComponents = document.querySelectorAll('sl-tooltip, sl-dialog, sl-drawer');
            
            if (this.debugMode) {
                console.log(`[MAIN_THREAD_DEBUG] 🖱️ Cursor check at ${elapsed.toFixed(0)}ms:`);
                console.log(`  - Test cursor: ${computedCursor}`);
                console.log(`  - Overlays: ${overlays.length}`);
                console.log(`  - Tooltips: ${tooltips.length}`);
                console.log(`  - Web Components: ${webComponents.length}`);
                
                // Check for high CPU usage indicators
                const longTaskCount = this.longTasks.length;
                const recentOperations = this.operations.filter(op => 
                    performance.now() - op.timestamp < 5000
                ).length;
                
                console.log(`  - Long tasks: ${longTaskCount}`);
                console.log(`  - Recent operations: ${recentOperations}`);
                
                // Test actual textarea cursor
                const textareas = document.querySelectorAll('textarea:not([style*="display: none"])');
                if (textareas.length > 0) {
                    const firstTextarea = textareas[0];
                    const textareaCursor = window.getComputedStyle(firstTextarea).cursor;
                    console.log(`  - Textarea cursor: ${textareaCursor}`);
                    
                    // Check if textarea is actually responsive
                    const rect = firstTextarea.getBoundingClientRect();
                    console.log(`  - Textarea visible: ${rect.width > 0 && rect.height > 0}`);
                }
            }
        };
        
        // Check cursor every 3 seconds during monitoring
        cursorCheckInterval = setInterval(checkCursor, 3000);
    }
    
    logCursorState() {
        if (!this.debugMode) return;
        
        const textAreas = document.querySelectorAll('textarea');
        const buttons = document.querySelectorAll('button');
        
        console.log(`[MAIN_THREAD_DEBUG] 🖱️ Current DOM state: ${textAreas.length} textareas, ${buttons.length} buttons`);
        
        if (textAreas.length > 0) {
            const firstTextarea = textAreas[0];
            const style = window.getComputedStyle(firstTextarea);
            console.log(`[MAIN_THREAD_DEBUG] 🖱️ First textarea cursor: ${style.cursor}`);
        }
    }
    
    analyzeLocalStorage() {
        if (!this.debugMode) return;
        
        console.log('[MAIN_THREAD_DEBUG] 💾 Analyzing localStorage...');
        
        let totalSize = 0;
        const keyAnalysis = [];
        
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            const value = localStorage.getItem(key);
            const size = new Blob([value]).size;
            totalSize += size;
            
            keyAnalysis.push({
                key,
                size,
                type: this.detectDataType(key, value)
            });
        }
        
        // Sort by size (largest first)
        keyAnalysis.sort((a, b) => b.size - a.size);
        
        console.log(`[MAIN_THREAD_DEBUG] 💾 Total localStorage size: ${this.formatBytes(totalSize)}`);
        console.log(`[MAIN_THREAD_DEBUG] 💾 Largest items:`);
        
        keyAnalysis.slice(0, 5).forEach((item, i) => {
            console.log(`  ${i + 1}. ${item.key} (${item.type}): ${this.formatBytes(item.size)}`);
            
            // Special analysis for known problematic keys
            if (item.key.includes('docTaskInstance') || item.key.includes('tabManager')) {
                this.analyzeDocumentData(item.key, localStorage.getItem(item.key));
            }
        });
        
        // Always warn about large storage as it affects performance
        if (totalSize > 5 * 1024 * 1024) { // 5MB
            console.warn(`[MAIN_THREAD] localStorage is very large (${this.formatBytes(totalSize)}) - this could cause performance issues!`);
        }
    }
    
    analyzeDocumentData(key, jsonString) {
        if (!this.debugMode) return;
        
        try {
            console.log(`[MAIN_THREAD_DEBUG] 🔍 Analyzing ${key}...`);
            
            const parseStart = performance.now();
            const data = JSON.parse(jsonString);
            const parseTime = performance.now() - parseStart;
            
            console.log(`  - Parse time: ${parseTime.toFixed(2)}ms`);
            
            if (data.tabs) {
                console.log(`  - Tab count: ${data.tabs.length}`);
                
                // Analyze each tab's document data
                let totalStageDataSize = 0;
                let totalJobsMapSize = 0;
                let largestDocument = null;
                let largestDocSize = 0;
                
                data.tabs.forEach((tab, i) => {
                    if (tab.docTaskInstance) {
                        const docData = tab.docTaskInstance;
                        
                        // Check stageData size
                        if (docData.stageData) {
                            const stageDataStr = JSON.stringify(docData.stageData);
                            const stageSize = new Blob([stageDataStr]).size;
                            totalStageDataSize += stageSize;
                            
                            if (stageSize > largestDocSize) {
                                largestDocSize = stageSize;
                                largestDocument = `Tab ${i} (${docData.title || 'Untitled'})`;
                            }
                        }
                        
                        // Check for jobsMap 
                        if (docData.jobsMap) {
                            const jobsMapStr = JSON.stringify(docData.jobsMap);
                            const jobsSize = new Blob([jobsMapStr]).size;
                            totalJobsMapSize += jobsSize;
                            
                            console.log(`  - Tab ${i} jobsMap: ${Object.keys(docData.jobsMap).length} jobs, ${this.formatBytes(jobsSize)}`);
                        }
                        
                        // Check for other large nested objects
                        if (docData.stages) {
                            console.log(`  - Tab ${i} stages: ${docData.stages.length} stages`);
                        }
                    }
                });
                
                console.log(`  - Total stageData size: ${this.formatBytes(totalStageDataSize)}`);
                console.log(`  - Total jobsMap size: ${this.formatBytes(totalJobsMapSize)}`);
                if (largestDocument) {
                    console.log(`  - Largest document: ${largestDocument} (${this.formatBytes(largestDocSize)})`);
                }
            }
            
        } catch (error) {
            console.error(`[MAIN_THREAD_DEBUG] ❌ Error analyzing ${key}:`, error);
        }
    }
    
    detectDataType(key, value) {
        if (key.includes('auth') || key.includes('token')) return 'auth';
        if (key.includes('tab') || key.includes('doc')) return 'document';
        if (key.includes('corpus')) return 'corpus';
        if (key.includes('job')) return 'jobs';
        
        try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) return 'array';
            if (typeof parsed === 'object') return 'object';
        } catch (e) {
            // Not JSON
        }
        
        return 'string';
    }
    
    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    setupLocalStorageMonitoring() {
        // Override localStorage.setItem to track when large objects are stored
        const originalSetItem = localStorage.setItem;
        
        localStorage.setItem = (key, value) => {
            if (!this.isMonitoring) {
                return originalSetItem.call(localStorage, key, value);
            }
            
            const size = new Blob([value]).size;
            const startTime = performance.now();
            
            const result = originalSetItem.call(localStorage, key, value);
            
            const duration = performance.now() - startTime;
            
            // Only log very large writes or slow operations
            if (size > 1024 * 1024) { // 1MB
                console.warn(`[MAIN_THREAD] Very large localStorage write: ${key} (${this.formatBytes(size)}) took ${duration.toFixed(2)}ms`);
            } else if (this.debugMode && size > 1024 * 500) { // 500KB
                console.log(`[MAIN_THREAD_DEBUG] Large localStorage write: ${key} (${this.formatBytes(size)}) took ${duration.toFixed(2)}ms`);
            }
            
            if (duration > 100) {
                console.warn(`[MAIN_THREAD] Slow localStorage write: ${key} took ${duration.toFixed(2)}ms`);
            } else if (this.debugMode && duration > 50) {
                console.log(`[MAIN_THREAD_DEBUG] Slow localStorage write: ${key} took ${duration.toFixed(2)}ms`);
            }
            
            return result;
        };
    }
}

// Create global instance
const mainThreadMonitor = new MainThreadMonitor();

// Export for use in other modules
export { mainThreadMonitor };

// Add method to enable debug mode
mainThreadMonitor.enableDebugMode = function() {
    this.debugMode = true;
    console.log('[MAIN_THREAD_DEBUG] Debug mode enabled');
};

// Auto-start monitoring when module loads (reduced logging)
if (mainThreadMonitor.debugMode) {
    console.log('[MAIN_THREAD_DEBUG] 🎯 Main thread monitor module loaded');
}
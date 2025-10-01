// Storage Analyzer - Manual localStorage inspection tool
// Usage: storageAnalyzer.analyzeAll() in console

class StorageAnalyzer {
    analyzeAll() {
        console.log('🔍 STORAGE ANALYSIS REPORT');
        console.log('========================');
        
        this.showSummary();
        this.showLargestItems();
        this.analyzeTabManager();
        this.checkForMemoryLeaks();
    }
    
    showSummary() {
        let totalSize = 0;
        const itemCount = localStorage.length;
        
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            const value = localStorage.getItem(key);
            totalSize += new Blob([value]).size;
        }
        
        console.log(`📊 Summary: ${itemCount} items, ${this.formatBytes(totalSize)} total`);
        
        if (totalSize > 10 * 1024 * 1024) {
            console.warn('⚠️ localStorage is very large (>10MB)!');
        }
    }
    
    showLargestItems(limit = 10) {
        const items = [];
        
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            const value = localStorage.getItem(key);
            const size = new Blob([value]).size;
            
            items.push({ key, size, value });
        }
        
        items.sort((a, b) => b.size - a.size);
        
        console.log(`\n📋 Top ${Math.min(limit, items.length)} largest items:`);
        items.slice(0, limit).forEach((item, i) => {
            console.log(`${i + 1}. ${item.key}: ${this.formatBytes(item.size)}`);
        });
    }
    
    analyzeTabManager() {
        const tabManagerData = localStorage.getItem('tabManager');
        if (!tabManagerData) {
            console.log('\n📑 No tabManager data found');
            return;
        }
        
        try {
            const data = JSON.parse(tabManagerData);
            console.log(`\n📑 TabManager Analysis:`);
            console.log(`- Tabs: ${data.tabs?.length || 0}`);
            
            if (data.tabs) {
                let totalJobsMapEntries = 0;
                let totalStageDataSize = 0;
                
                data.tabs.forEach((tab, i) => {
                    if (tab.docTaskInstance) {
                        const doc = tab.docTaskInstance;
                        
                        if (doc.jobsMap) {
                            const jobCount = Object.keys(doc.jobsMap).length;
                            totalJobsMapEntries += jobCount;
                            console.log(`  Tab ${i} (${doc.title || 'Untitled'}): ${jobCount} jobs`);
                        }
                        
                        if (doc.stageData) {
                            const stageSize = new Blob([JSON.stringify(doc.stageData)]).size;
                            totalStageDataSize += stageSize;
                        }
                    }
                });
                
                console.log(`- Total jobsMap entries: ${totalJobsMapEntries}`);
                console.log(`- Total stageData size: ${this.formatBytes(totalStageDataSize)}`);
                
                if (totalJobsMapEntries > 50) {
                    console.warn('⚠️ High number of jobsMap entries - possible memory leak!');
                }
            }
        } catch (error) {
            console.error('❌ Error parsing tabManager data:', error);
        }
    }
    
    checkForMemoryLeaks() {
        console.log('\n🔍 Checking for potential memory leaks...');
        
        // Check for duplicate data
        const duplicateCheck = new Map();
        const suspiciousKeys = [];
        
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            const value = localStorage.getItem(key);
            
            // Check for suspicious patterns
            if (key.includes('temp') || key.includes('cache')) {
                suspiciousKeys.push(key);
            }
            
            // Check for very large individual items
            const size = new Blob([value]).size;
            if (size > 2 * 1024 * 1024) { // 2MB
                console.warn(`⚠️ Very large item: ${key} (${this.formatBytes(size)})`);
            }
        }
        
        if (suspiciousKeys.length > 0) {
            console.log('🗑️ Suspicious keys (might be temporary/cache data):');
            suspiciousKeys.forEach(key => console.log(`  - ${key}`));
        }
    }
    
    cleanupSuggestions() {
        console.log('\n🧹 Cleanup suggestions:');
        console.log('1. Clear old auth tokens: storageAnalyzer.clearAuthTokens()');
        console.log('2. Remove temp data: storageAnalyzer.clearTempData()');
        console.log('3. Clear all tabs: storageAnalyzer.clearTabManager()');
        console.log('4. Nuclear option: localStorage.clear()');
    }
    
    clearAuthTokens() {
        const keys = Object.keys(localStorage);
        keys.forEach(key => {
            if (key.includes('auth') || key.includes('token')) {
                localStorage.removeItem(key);
                console.log(`Removed: ${key}`);
            }
        });
    }
    
    clearTempData() {
        const keys = Object.keys(localStorage);
        keys.forEach(key => {
            if (key.includes('temp') || key.includes('cache')) {
                localStorage.removeItem(key);
                console.log(`Removed: ${key}`);
            }
        });
    }
    
    clearTabManager() {
        localStorage.removeItem('tabManager');
        console.log('Removed tabManager data');
    }
    
    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

// Create global instance
const storageAnalyzer = new StorageAnalyzer();

// Make it available in console
if (typeof window !== 'undefined') {
    window.storageAnalyzer = storageAnalyzer;
}

export { storageAnalyzer };
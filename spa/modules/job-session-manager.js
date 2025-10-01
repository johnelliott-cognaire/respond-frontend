// File: modules/job-session-manager.js

/**
 * Job Session Manager
 * 
 * Handles session persistence and cross-session job recovery using enhanced
 * localStorage schema and optional server-side job registry integration.
 */
export class JobSessionManager {
    constructor() {
        this.storageKey = 'cognaire-respond-jobs';
        this.version = '2.1';
        this.maxJobAge = 24 * 60 * 60 * 1000; // 24 hours
        this.maxStoredJobs = 50; // Maximum jobs to keep
        
        console.log('[JobSessionManager] Initialized with enhanced session management');
    }

    /**
     * Save job to enhanced localStorage schema
     */
    saveJob(jobId, jobData) {
        try {
            const storage = this.getJobStorage();
            
            const enhancedJobData = {
                // Core job information
                jobId: jobData.jobId,
                jobType: jobData.jobType,
                status: jobData.status,
                progress: jobData.progress || 0,
                startTime: jobData.startTime || Date.now(),
                lastUpdated: Date.now(),
                
                // Enhanced metadata
                meta: {
                    ...jobData.meta,
                    enhanced: jobData.meta?.enhanced || false,
                    version: this.version
                },
                
                // Document context (for question-answering jobs)
                documentContext: this.extractDocumentContext(jobData),
                
                // Processing state
                processingItems: this.extractProcessingItems(jobData),
                
                // Recovery information
                recoveryData: {
                    selectedRowCount: jobData.meta?.selectedRowCount || 0,
                    modelUsed: jobData.meta?.modelUsed || 'unknown',
                    jobPayload: jobData.meta?.jobPayload || {}
                },
                
                // Session tracking
                sessionInfo: {
                    browserSessionId: this.getBrowserSessionId(),
                    userAgent: navigator.userAgent,
                    lastActiveTime: Date.now(),
                    savedFromPage: window.location.pathname
                }
            };
            
            storage.jobs[jobId] = enhancedJobData;
            
            // Update global context
            if (enhancedJobData.documentContext?.projectDocumentId) {
                storage.lastActiveDocument = {
                    projectDocumentId: enhancedJobData.documentContext.projectDocumentId,
                    groupId: enhancedJobData.documentContext.groupId,
                    documentTitle: enhancedJobData.documentContext.documentTitle,
                    lastAccessed: Date.now()
                };
            }
            
            this.saveJobStorage(storage);
            console.log(`[JobSessionManager] Saved enhanced job data for ${jobId}`);
            
        } catch (error) {
            console.error('[JobSessionManager] Failed to save job:', error);
        }
    }

    /**
     * Load job from localStorage
     */
    loadJob(jobId) {
        try {
            const storage = this.getJobStorage();
            const jobData = storage.jobs[jobId];
            
            if (!jobData) {
                return null;
            }
            
            // Check if job is too old
            const age = Date.now() - (jobData.startTime || 0);
            if (age > this.maxJobAge) {
                console.log(`[JobSessionManager] Job ${jobId} is too old (${Math.round(age / 1000 / 60 / 60)}h), removing`);
                this.removeJob(jobId);
                return null;
            }
            
            // Update last accessed time
            jobData.sessionInfo.lastActiveTime = Date.now();
            this.saveJob(jobId, jobData);
            
            console.log(`[JobSessionManager] Loaded job ${jobId} from storage`);
            return jobData;
            
        } catch (error) {
            console.error(`[JobSessionManager] Failed to load job ${jobId}:`, error);
            return null;
        }
    }

    /**
     * Get all stored jobs
     */
    getAllJobs() {
        try {
            const storage = this.getJobStorage();
            const jobs = Object.values(storage.jobs || {});
            
            // Filter out expired jobs
            const validJobs = jobs.filter(job => {
                const age = Date.now() - (job.startTime || 0);
                return age <= this.maxJobAge;
            });
            
            console.log(`[JobSessionManager] Retrieved ${validJobs.length} valid jobs from storage`);
            return validJobs;
            
        } catch (error) {
            console.error('[JobSessionManager] Failed to get all jobs:', error);
            return [];
        }
    }

    /**
     * Remove job from storage
     */
    removeJob(jobId) {
        try {
            const storage = this.getJobStorage();
            delete storage.jobs[jobId];
            this.saveJobStorage(storage);
            console.log(`[JobSessionManager] Removed job ${jobId} from storage`);
            
        } catch (error) {
            console.error(`[JobSessionManager] Failed to remove job ${jobId}:`, error);
        }
    }

    /**
     * Update job status
     */
    updateJobStatus(jobId, status, additionalData = {}) {
        try {
            const jobData = this.loadJob(jobId);
            if (!jobData) {
                console.warn(`[JobSessionManager] Cannot update status for unknown job ${jobId}`);
                return false;
            }
            
            jobData.status = status;
            jobData.lastUpdated = Date.now();
            
            // Update additional data
            Object.assign(jobData, additionalData);
            
            this.saveJob(jobId, jobData);
            console.log(`[JobSessionManager] Updated job ${jobId} status to ${status}`);
            return true;
            
        } catch (error) {
            console.error(`[JobSessionManager] Failed to update job ${jobId} status:`, error);
            return false;
        }
    }

    /**
     * Update job progress
     */
    updateJobProgress(jobId, progress, processingMetadata = {}) {
        try {
            const jobData = this.loadJob(jobId);
            if (!jobData) {
                return false;
            }
            
            jobData.progress = progress;
            jobData.lastUpdated = Date.now();
            
            // Update processing metadata if provided
            if (processingMetadata.recent_completions) {
                jobData.processingItems = processingMetadata.recent_completions.slice(-10); // Keep last 10
            }
            
            if (processingMetadata.enhanced) {
                jobData.enhanced = processingMetadata.enhanced;
            }
            
            this.saveJob(jobId, jobData);
            return true;
            
        } catch (error) {
            console.error(`[JobSessionManager] Failed to update job ${jobId} progress:`, error);
            return false;
        }
    }

    /**
     * Clean up old and completed jobs
     */
    cleanupOldJobs() {
        try {
            const storage = this.getJobStorage();
            const now = Date.now();
            let removedCount = 0;
            
            // Remove old jobs
            Object.keys(storage.jobs).forEach(jobId => {
                const job = storage.jobs[jobId];
                const age = now - (job.startTime || 0);
                
                // Remove if too old or completed for more than 1 hour
                if (age > this.maxJobAge || 
                    (job.status === 'COMPLETED' && (now - job.lastUpdated) > 60 * 60 * 1000)) {
                    delete storage.jobs[jobId];
                    removedCount++;
                }
            });
            
            // Limit total number of jobs
            const remainingJobs = Object.entries(storage.jobs);
            if (remainingJobs.length > this.maxStoredJobs) {
                // Sort by last updated and keep only the most recent
                remainingJobs.sort((a, b) => (b[1].lastUpdated || 0) - (a[1].lastUpdated || 0));
                
                const jobsToKeep = remainingJobs.slice(0, this.maxStoredJobs);
                storage.jobs = Object.fromEntries(jobsToKeep);
                removedCount += remainingJobs.length - this.maxStoredJobs;
            }
            
            this.saveJobStorage(storage);
            
            if (removedCount > 0) {
                console.log(`[JobSessionManager] Cleaned up ${removedCount} old jobs`);
            }
            
        } catch (error) {
            console.error('[JobSessionManager] Failed to cleanup old jobs:', error);
        }
    }

    /**
     * Get last active document context for restoration
     */
    getLastActiveDocument() {
        try {
            const storage = this.getJobStorage();
            return storage.lastActiveDocument || null;
            
        } catch (error) {
            console.error('[JobSessionManager] Failed to get last active document:', error);
            return null;
        }
    }

    /**
     * Export job data for debugging
     */
    exportJobData() {
        try {
            const storage = this.getJobStorage();
            return {
                version: storage.version,
                exportTime: new Date().toISOString(),
                jobCount: Object.keys(storage.jobs).length,
                jobs: storage.jobs,
                lastActiveDocument: storage.lastActiveDocument
            };
            
        } catch (error) {
            console.error('[JobSessionManager] Failed to export job data:', error);
            return null;
        }
    }

    /**
     * Clear all job data (for logout or reset)
     */
    clearAllJobs() {
        try {
            localStorage.removeItem(this.storageKey);
            console.log('[JobSessionManager] Cleared all job data');
            
        } catch (error) {
            console.error('[JobSessionManager] Failed to clear job data:', error);
        }
    }

    /**
     * Get or create browser session ID
     */
    getBrowserSessionId() {
        const sessionKey = 'cognaire-respond-session-id';
        let sessionId = sessionStorage.getItem(sessionKey);
        
        if (!sessionId) {
            sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            sessionStorage.setItem(sessionKey, sessionId);
        }
        
        return sessionId;
    }

    /**
     * Extract document context from job data
     */
    extractDocumentContext(jobData) {
        const meta = jobData.meta || {};
        
        // Try to extract from various sources
        const context = {
            available: false
        };
        
        if (meta.projectDocumentId) {
            context.projectDocumentId = meta.projectDocumentId;
            context.available = true;
        }
        
        if (meta.stageId) {
            context.stageId = meta.stageId;
            context.available = true;
        }
        
        if (meta.groupId) {
            context.groupId = meta.groupId;
            context.available = true;
        }
        
        if (meta.documentTitle) {
            context.documentTitle = meta.documentTitle;
            context.available = true;
        }
        
        // Try to extract from URL or other sources if not in meta
        if (!context.available) {
            const url = window.location.pathname;
            const urlMatch = url.match(/\/documents\/([^\/]+)/);
            if (urlMatch) {
                context.projectDocumentId = urlMatch[1];
                context.available = true;
            }
        }
        
        return context.available ? context : null;
    }

    /**
     * Extract processing items from job data
     */
    extractProcessingItems(jobData) {
        const enhanced = jobData.enhanced || {};
        const recent_completions = enhanced.recent_completions || [];
        
        return recent_completions.map(completion => ({
            project_document_stage_group_id_item_id: completion.item_id,
            question_text: completion.question_text || '',
            processingStatus: completion.status,
            processingStartTime: completion.processing_started_at,
            completedAt: completion.processing_completed_at
        })).slice(-20); // Keep last 20 items
    }

    /**
     * Get job storage with version migration
     */
    getJobStorage() {
        try {
            const storedData = localStorage.getItem(this.storageKey);
            let storage;
            
            if (storedData) {
                storage = JSON.parse(storedData);
                
                // Handle version migration
                if (!storage.version || storage.version !== this.version) {
                    storage = this.migrateStorageVersion(storage);
                }
            } else {
                storage = this.createEmptyStorage();
            }
            
            return storage;
            
        } catch (error) {
            console.error('[JobSessionManager] Failed to parse job storage, creating new:', error);
            return this.createEmptyStorage();
        }
    }

    /**
     * Save job storage
     */
    saveJobStorage(storage) {
        try {
            storage.lastUpdated = Date.now();
            localStorage.setItem(this.storageKey, JSON.stringify(storage));
            
        } catch (error) {
            console.error('[JobSessionManager] Failed to save job storage:', error);
        }
    }

    /**
     * Create empty storage structure
     */
    createEmptyStorage() {
        return {
            version: this.version,
            jobs: {},
            lastActiveDocument: null,
            created: Date.now(),
            lastUpdated: Date.now()
        };
    }

    /**
     * Migrate storage from older versions
     */
    migrateStorageVersion(oldStorage) {
        console.log(`[JobSessionManager] Migrating storage from version ${oldStorage.version || 'unknown'} to ${this.version}`);
        
        const newStorage = this.createEmptyStorage();
        
        // Migrate jobs from old format
        if (oldStorage.jobs) {
            Object.entries(oldStorage.jobs).forEach(([jobId, jobData]) => {
                try {
                    // Convert old format to new format
                    const migratedJob = {
                        jobId: jobData.jobId || jobId,
                        jobType: jobData.jobType || 'unknown',
                        status: jobData.status || 'UNKNOWN',
                        progress: jobData.progress || 0,
                        startTime: jobData.startTime || Date.now(),
                        lastUpdated: Date.now(),
                        
                        meta: {
                            ...jobData.meta,
                            migrated: true,
                            version: this.version
                        },
                        
                        documentContext: null,
                        processingItems: [],
                        recoveryData: {
                            selectedRowCount: 0,
                            modelUsed: 'unknown',
                            jobPayload: {}
                        },
                        
                        sessionInfo: {
                            browserSessionId: this.getBrowserSessionId(),
                            userAgent: navigator.userAgent,
                            lastActiveTime: Date.now(),
                            savedFromPage: 'migrated'
                        }
                    };
                    
                    newStorage.jobs[jobId] = migratedJob;
                    
                } catch (error) {
                    console.error(`[JobSessionManager] Failed to migrate job ${jobId}:`, error);
                }
            });
        }
        
        // Migrate last active document if available
        if (oldStorage.lastActiveDocument) {
            newStorage.lastActiveDocument = oldStorage.lastActiveDocument;
        }
        
        console.log(`[JobSessionManager] Migration completed. Migrated ${Object.keys(newStorage.jobs).length} jobs`);
        return newStorage;
    }
}
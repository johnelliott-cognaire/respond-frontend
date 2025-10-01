// api/question-grid-analytics.js
import { getBaseUrl } from '../utils/config.js';
import { getAuthHeader, logout } from "./auth.js";

/**
 * Question Grid Analytics API Client
 * 
 * Provides data access for analytics dashboard views including:
 * - Overview metrics and distributions
 * - Team performance analytics
 * 
 * All queries are designed to use existing GSIs and avoid table scans.
 * getTabMetadata function has been removed as tab data is now provided
 * by the parent component via fetchDocumentItemGroups.
 */

/**
 * Fetches comprehensive analytics data for the Overview dashboard
 * Lambda: backend/services/lambdas/analytics/get_overview_analytics.py
 * 
 * BACKEND IMPLEMENTATION NOTES:
 * - Primary Query: DocumentItemsTable.query() using project_document_id (PK)
 * - Secondary Query: DocumentItemGroupsTable.query() using GSI-ProjectDocumentId
 * - No additional GSIs needed - uses existing primary key efficiently
 * - Should aggregate data server-side for performance
 * 
 * Query Pattern:
 * DocumentItemsTable.query({
 *   KeyConditionExpression: 'project_document_id = :docId',
 *   ExpressionAttributeValues: { ':docId': projectDocumentId }
 * })
 * 
 * @param {string} projectDocumentId - Full document ID with subtenant prefix
 * @param {Object} filters - Optional filters for analysis
 * @returns {Promise<Object>} Comprehensive analytics data
 */
export async function getOverviewAnalytics(projectDocumentId, filters = {}) {
  console.log('[question-grid-analytics.js] getOverviewAnalytics() called with:', { projectDocumentId, filters });
  
  try {
    const url = getBaseUrl("extended") + '/question-grid/analytics/overview';
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify({ 
        projectDocumentId,
        filters 
      })
    });
    
    if (response.status === 401) {
      logout();
      throw new Error('Unauthorized /question-grid/analytics/overview => token invalid');
    }
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `Failed to fetch overview analytics (${response.status})`);
    }
    
    const data = await response.json();
    console.log('[question-grid-analytics.js] Overview analytics fetched successfully');
    return data;
    
  } catch (error) {
    console.error('[question-grid-analytics.js] Error fetching overview analytics:', error);
    
    if (error.message && error.message.toLowerCase().includes('unauthorized')) {
      logout();
      throw new Error('Your session has expired. Please log in again.');
    }
    
    throw error;
  }
}

/**
 * Fetches detailed team performance analytics
 * Lambda: backend/services/lambdas/analytics/get_team_analytics.py
 * 
 * BACKEND IMPLEMENTATION NOTES:
 * - Multiple Queries: One per team member using GSI-OwnerStageDoc
 * - Parallel Execution: Use Promise.all() for performance
 * - Aggregation: Server-side aggregation recommended for large datasets
 * 
 * Query Pattern per team member:
 * DocumentItemsTable.query({
 *   IndexName: 'GSI-OwnerStageDoc',
 *   KeyConditionExpression: 'owner_stage_doc_key = :ownerKey',
 *   ExpressionAttributeValues: {
 *     ':ownerKey': `${subtenant}___${username}#${projectDocumentId}#${stageId}`
 *   }
 * })
 * 
 * @param {string} projectDocumentId - Full document ID with subtenant prefix
 * @param {string} stageId - Current stage ID for owner_stage_doc_key construction
 * @param {Array<string>} teamMembers - List of usernames to analyze
 * @param {Object} filters - Optional filters for team view (tab, assignee, risk level)
 * @returns {Promise<Object>} Detailed team analytics
 */
export async function getTeamAnalytics(projectDocumentId, stageId, teamMembers = [], filters = {}) {
  console.log('[question-grid-analytics.js] getTeamAnalytics() called with:', { projectDocumentId, stageId, teamMembers, filters });
  
  try {
    const url = getBaseUrl("extended") + '/question-grid/analytics/team';
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify({ 
        projectDocumentId,
        stageId,
        teamMembers,
        filters 
      })
    });
    
    if (response.status === 401) {
      logout();
      throw new Error('Unauthorized /question-grid/analytics/team => token invalid');
    }
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `Failed to fetch team analytics (${response.status})`);
    }
    
    const data = await response.json();
    console.log('[question-grid-analytics.js] Team analytics fetched successfully');
    return data;
    
  } catch (error) {
    console.error('[question-grid-analytics.js] Error fetching team analytics:', error);
    
    if (error.message && error.message.toLowerCase().includes('unauthorized')) {
      logout();
      throw new Error('Your session has expired. Please log in again.');
    }
    
    throw error;
  }
}
// Fixed api/projects-add.js - Now includes corpus in the request

import { parseApiError } from "../utils/api-utils.js";
import { getBaseUrl } from "../utils/config.js";
import { getAuthHeader } from "./auth.js";
import { Security } from "../state/security.js";
import { verifyPermission, getFreshSecurity } from "../utils/security-utils.js";

/**
 * addProject => calls /projects/add
 * Lambda: backend/services/lambdas/admin/create_project.py
 * FIXED: Now accepts and sends corpus parameter
 * Returns { project: { project_id, account_id, name, code, corpus, ... } }
 */
export async function addProject({ name, code, account_id, corpus }, store) {
  console.log("[projects-add] addProject => name:", name, "code:", code, "account_id:", account_id, "corpus:", corpus);

  verifyPermission(
    store, 
    'canEditAccount', 
    account_id, 
    `Access denied. You do not have permission to create a project on account=${account_id}`
  );

  // CRITICAL: Validate corpus is provided (since it's mandatory)
  if (!corpus || corpus.trim() === '') {
    throw new Error("Corpus is required to create a project");
  }

  const baseUrl = getBaseUrl("extended");
  const url = `${baseUrl}/projects/add`;

  // FIXED: Include corpus in the request body
  const body = { 
    name, 
    project_code: code,
    account_id,
    corpus: corpus.trim()  // Include corpus and ensure it's clean
  };

  console.log("[projects-add] Request body:", body);

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeader()
    },
    body: JSON.stringify(body)
  });
  
  if (!resp.ok) {
    const errData = await resp.json().catch(() => ({}));
    const msg = parseApiError(errData);
    console.error("[projects-add] addProject => error:", msg);
    throw new Error(msg);
  }

  const result = await resp.json();
  console.log("[projects-add] addProject => success:", result);
  return result; // { project: {...} }
}
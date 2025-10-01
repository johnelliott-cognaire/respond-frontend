// File: api/accounts-add.js
import { parseApiError } from "../utils/api-utils.js";
import { getBaseUrl } from "../utils/config.js";
import { getAuthHeader } from "./auth.js";
import { Security } from "../state/security.js";
import { verifyPermission, getFreshSecurity } from "../utils/security-utils.js";

/**
 * addAccount => calls /accounts/add
 * Lambda: backend/services/lambdas/admin/create_account.py
 * Returns { account: { account_id, name, owner, created_datetime, ... } }
 */
export async function addAccount({ name, owner }, store) {
  console.log("[accounts-add] addAccount => name:", name, "owner:", owner);

  verifyPermission(
    store,
    'hasSystemPermission',
    ["SYSTEM_ADMIN", "APP_ADMIN"],
    "Access denied. You do not have permission to create new accounts."
  );

  const baseUrl = getBaseUrl("extended");
  const url = `${baseUrl}/accounts/add`;
  const body = { name, owner };

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
    console.error("[accounts-add] addAccount => error:", msg);
    throw new Error(msg);
  }

  return await resp.json(); // { account: {...} }
}

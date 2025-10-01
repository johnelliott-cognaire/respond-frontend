// api/files.js
import { getBaseUrl } from "../utils/config.js";
import { getAuthHeader, logout } from "./auth.js";

/**
 * Requests a presigned URL from the backend to upload a file.
 * Lambda: backend/services/lambdas/utilities/generate_presigned_url.py
 * @param {string} filename - The name of the file to upload.
 * @returns {Promise<object>} - Returns an object with { presigned_url, s3_key, s3_uri }.
 */
async function _getPresignedUrl(filename) {
  const baseUrl = getBaseUrl("main");
  const url = `${baseUrl}/generate-presigned-url`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader()
      },
      body: JSON.stringify({ filename })
    });
    if (response.status === 401) {
      logout();
      throw new Error("Unauthorized: token invalid");
    }
    if (!response.ok) {
      // Try to parse JSON error; if fails, get text.
      let errorData;
      try {
        errorData = await response.json();
      } catch (err) {
        errorData = await response.text();
      }
      throw new Error(errorData.error || `Failed to get presigned URL: HTTP ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("[Files API] getPresignedUrl error:", error);
    throw error;
  }
}

/**
 * Uploads a file to S3 using the provided presigned URL.
 * @param {File} file - The file to upload.
 * @param {string} presignedUrl - The URL to use for uploading.
 * @returns {Promise<void>}
 */
async function _uploadFileToS3(file, presignedUrl) {
  try {
    const response = await fetch(presignedUrl, {
      method: "PUT",
      headers: {
        "Content-Type": file.type || "application/octet-stream"
      },
      body: file
    });
    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Files API] S3 upload failed:", response.status, errorText);
      throw new Error(`Failed to upload file: ${response.status} ${errorText}`);
    }
  } catch (error) {
    console.error("[Files API] uploadFileToS3 error:", error);
    throw error;
  }
}

/**
 * Combines the above two steps: Get a presigned URL and then upload the file.
 * @param {File} file - The file to upload.
 * @returns {Promise<object>} - Returns an object with { s3_uri, s3_key }.
 */
export async function uploadFile(file) {
  try {
    // Step 1: Get presigned URL.
    const { presigned_url, s3_key, s3_uri } = await _getPresignedUrl(file.name);
    // Step 2: Upload the file to S3.
    await _uploadFileToS3(file, presigned_url);
    return { s3_uri, s3_key };
  } catch (error) {
    console.error("[Files API] uploadFile error:", error);
    throw error;
  }
}

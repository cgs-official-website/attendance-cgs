/**
 * Google Drive REST API v3 utilities
 * Uses OAuth 2.0 token obtained via Google Identity Services (GIS)
 */

const DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
const DRIVE_FILES_URL   = "https://www.googleapis.com/drive/v3/files";
const CLIENT_ID   = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const FOLDER_ID   = import.meta.env.VITE_GOOGLE_DRIVE_FOLDER_ID || "1DsIAklg29b3wmEHFpxQV4l4MeJCpWUdy";
const SCOPES      = "https://www.googleapis.com/auth/drive.file";
const MAX_SIZE_MB = 25;

let _tokenClient = null;
let _accessToken  = null;
let _tokenExpiry  = 0;

/**
 * Initialize the Google OAuth token client (call once on mount)
 */
export const initGoogleAuth = () => {
  return new Promise((resolve, reject) => {
    if (!CLIENT_ID) {
      reject(new Error("VITE_GOOGLE_CLIENT_ID is not configured in .env"));
      return;
    }
    if (typeof window.google === "undefined" || !window.google?.accounts?.oauth2) {
      reject(new Error("Google Identity Services script not loaded. Check index.html."));
      return;
    }
    _tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: (tokenResponse) => {
        if (tokenResponse.error) {
          reject(new Error(tokenResponse.error));
        } else {
          _accessToken = tokenResponse.access_token;
          _tokenExpiry = Date.now() + (tokenResponse.expires_in - 60) * 1000;
          resolve(_accessToken);
        }
      },
    });
    resolve(null); // client initialized, token not yet fetched
  });
};

/**
 * Request an access token (opens Google OAuth popup if needed)
 */
export const requestAccessToken = () => {
  return new Promise((resolve, reject) => {
    if (_accessToken && Date.now() < _tokenExpiry) {
      resolve(_accessToken);
      return;
    }
    if (!_tokenClient) {
      reject(new Error("Google Auth not initialized. Call initGoogleAuth() first."));
      return;
    }
    // Override callback for this specific call
    _tokenClient.callback = (tokenResponse) => {
      if (tokenResponse.error) {
        reject(new Error("Google OAuth failed: " + tokenResponse.error));
      } else {
        _accessToken = tokenResponse.access_token;
        _tokenExpiry = Date.now() + (tokenResponse.expires_in - 60) * 1000;
        resolve(_accessToken);
      }
    };
    _tokenClient.requestAccessToken({ prompt: "none" });
  });
};

/**
 * Upload a file to Google Drive
 * @param {File} file - The File object from an <input type="file">
 * @param {string} accessToken - OAuth access token
 * @returns {Promise<{ id: string, name: string, url: string, mimeType: string, size: number }>}
 */
export const uploadFileToDrive = async (file, accessToken) => {
  if (file.size > MAX_SIZE_MB * 1024 * 1024) {
    throw new Error(`File size exceeds the ${MAX_SIZE_MB}MB limit.`);
  }

  const metadata = {
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    parents: [FOLDER_ID],
  };

  const form = new FormData();
  form.append(
    "metadata",
    new Blob([JSON.stringify(metadata)], { type: "application/json" })
  );
  form.append("file", file);

  const res = await fetch(DRIVE_UPLOAD_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err?.error?.message || "Drive upload failed");
  }

  const data = await res.json();
  const fileId = data.id;

  // Make file publicly viewable
  await fetch(`${DRIVE_FILES_URL}/${fileId}/permissions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ role: "reader", type: "anyone" }),
  });

  return {
    id:       fileId,
    name:     file.name,
    url:      `https://drive.google.com/file/d/${fileId}/view`,
    mimeType: file.type || "application/octet-stream",
    size:     file.size,
  };
};

/**
 * High-level helper: request token then upload
 */
export const pickAndUploadFile = async (file) => {
  if (!CLIENT_ID) {
    // No Google OAuth configured — return a placeholder local URL
    return {
      id:       "local-" + Date.now(),
      name:     file.name,
      url:      URL.createObjectURL(file),
      mimeType: file.type,
      size:     file.size,
      isLocal:  true, // flag to show it's not actually in Drive
    };
  }
  const token = await requestAccessToken();
  return await uploadFileToDrive(file, token);
};

/**
 * Format bytes to human-readable string
 */
export const formatFileSize = (bytes) => {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
};

/**
 * Get file type icon label for display
 */
export const getFileIcon = (mimeType, name) => {
  const ext = name?.split(".").pop()?.toLowerCase();
  if (!mimeType && !ext) return "📄";
  if (mimeType?.includes("image") || ["jpg","jpeg","png","gif","webp","svg"].includes(ext)) return "🖼️";
  if (mimeType?.includes("pdf") || ext === "pdf") return "📕";
  if (mimeType?.includes("spreadsheet") || ["xlsx","xls","csv"].includes(ext)) return "📊";
  if (mimeType?.includes("presentation") || ["pptx","ppt"].includes(ext)) return "📊";
  if (mimeType?.includes("document") || ["docx","doc"].includes(ext)) return "📝";
  if (["zip","rar","7z","tar","gz"].includes(ext)) return "🗜️";
  if (["mp4","mov","avi","mkv"].includes(ext)) return "🎬";
  if (["mp3","wav","ogg"].includes(ext)) return "🎵";
  return "📄";
};

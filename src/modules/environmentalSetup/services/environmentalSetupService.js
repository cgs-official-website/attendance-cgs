import { doc, getDoc, setDoc } from "firebase/firestore";
import { db, getDbType } from "../../../firebase";

const COLLECTION = "companies";
const SUBCOLLECTION = "environmentSettings";
const DOCUMENT = "general";

/**
 * Get the environment settings for a specific company
 * @param {string} companyId - The authenticated user's company ID
 */
export const getEnvironmentSettings = async (companyId) => {
  if (!companyId) throw new Error("Company ID is required");

  if (getDbType() === 'firebase') {
    const docRef = doc(db, COLLECTION, companyId, SUBCOLLECTION, DOCUMENT);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data();
    }
    return null;
  } else {
    // Local storage fallback if configured
    const current = localStorage.getItem(`env_settings_general_${companyId}`);
    return current ? JSON.parse(current) : null;
  }
};

/**
 * Save or update environment settings for a specific company (uses merge)
 * @param {string} companyId - The authenticated user's company ID
 * @param {object} data - The settings to save/update
 * @param {string} userId - The authenticated user's ID tracking who updated it
 */
export const saveEnvironmentSettings = async (companyId, data, userId) => {
  if (!companyId) throw new Error("Company ID is required");
  if (!userId) throw new Error("User ID is required for auditing");

  const timestamp = new Date().toISOString();
  
  const payload = {
    ...data,
    updatedAt: timestamp,
    updatedBy: userId
  };

  if (getDbType() === 'firebase') {
    const docRef = doc(db, COLLECTION, companyId, SUBCOLLECTION, DOCUMENT);
    
    // Attempt to read first to see if we need to set createdAt
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
      payload.createdAt = timestamp;
    }

    await setDoc(docRef, payload, { merge: true });
    return true;
  } else {
    // Local storage fallback
    const key = `env_settings_general_${companyId}`;
    const existing = JSON.parse(localStorage.getItem(key) || '{}');
    if (!existing.createdAt) {
      payload.createdAt = timestamp;
    }
    localStorage.setItem(key, JSON.stringify({ ...existing, ...payload }));
    return true;
  }
};

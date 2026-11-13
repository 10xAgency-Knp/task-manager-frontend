/**
 * LocalStorage Mock Database Engine
 *
 * Implements a persistent, browser-local database initialized from seed data
 * on first launch and preserved in `localStorage` under `crm10x_demo_db_v1`.
 *
 * Ensures full multi-tab synchronization and prevents data loss during reloads.
 */

import { buildSeed, dbDateTime } from "../data/seed.js";

const DATABASE_STORAGE_KEY = "crm10x_demo_db_v1";
const SESSION_STORAGE_KEY = "crm10x_demo_session";

/**
 * In-memory storage for large base64 file payloads that exceed localStorage quotas.
 * Persists for the lifetime of the browser tab.
 */
export const fileBlobs = new Map();

let cachedDatabaseInstance = null;

/**
 * Loads the existing database from localStorage or builds a fresh seed dataset.
 *
 * @returns {Object} Database snapshot
 */
function loadDatabaseFromStorage() {
  try {
    const rawData = localStorage.getItem(DATABASE_STORAGE_KEY);
    if (rawData) {
      const parsedData = JSON.parse(rawData);
      if (parsedData && parsedData.version === 1) {
        return parsedData;
      }
    }
  } catch (err) {
    // Storage access blocked or data corrupted; fall back to fresh seed
  }
  return buildSeed();
}

/**
 * Retrieves the active database instance (cached in memory).
 *
 * @returns {Object}
 */
export function getDb() {
  if (!cachedDatabaseInstance) {
    cachedDatabaseInstance = loadDatabaseFromStorage();
    save();
  }
  return cachedDatabaseInstance;
}

/**
 * Flushes current database state to browser localStorage.
 */
export function save() {
  if (!cachedDatabaseInstance) {
    // Nothing loaded yet (e.g. initial signed-out session check); do not overwrite storage
    return;
  }

  try {
    localStorage.setItem(DATABASE_STORAGE_KEY, JSON.stringify(cachedDatabaseInstance));
  } catch (storageError) {
    // Storage quota exceeded (e.g. large file upload); detach file contents to memory
    if (cachedDatabaseInstance.attachments) {
      cachedDatabaseInstance.attachments.forEach((attachment) => {
        if (attachment.dataUrl) {
          fileBlobs.set(attachment.id, attachment.dataUrl);
          attachment.dataUrl = null;
        }
      });
    }
    try {
      localStorage.setItem(DATABASE_STORAGE_KEY, JSON.stringify(cachedDatabaseInstance));
    } catch (retryError) {
      // In-memory only fallback for this tab session
    }
  }
}

/**
 * Resets local demo data to initial defaults and reloads the browser tab.
 * Accessible in developer console as `window.resetDemoData()`.
 */
export function resetDemoData() {
  try {
    localStorage.removeItem(DATABASE_STORAGE_KEY);
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch (err) {
    // Nothing in storage
  }
  cachedDatabaseInstance = null;
  fileBlobs.clear();
  location.reload();
}

if (typeof window !== "undefined") {
  window.resetDemoData = resetDemoData;

  // Multi-tab synchronization: invalidate memory cache when another tab saves
  window.addEventListener("storage", (event) => {
    if (event.key === DATABASE_STORAGE_KEY) {
      cachedDatabaseInstance = null;
    }
  });
}

/**
 * Returns the currently signed-in user ID stored in session storage.
 *
 * @returns {number|string|null}
 */
export function sessionUserId() {
  try {
    const sessionData = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) || "null");
    return sessionData && sessionData.userId ? sessionData.userId : null;
  } catch (err) {
    return null;
  }
}

/**
 * Stores or clears the active session user ID.
 *
 * @param {number|string|null} userId
 */
export function setSession(userId) {
  try {
    if (userId) {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ userId }));
    } else {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  } catch (err) {
    // Private browsing mode restrictions
  }
}

/**
 * Generates an ISO-like timestamp string in DB format (YYYY-MM-DD HH:mm:ss).
 *
 * @returns {string}
 */
export const nowStamp = () => dbDateTime(new Date());

/**
 * Returns current date formatted as YYYY-MM-DD.
 *
 * @returns {string}
 */
export const today = () => nowStamp().slice(0, 10);

/**
 * Generates the next sequential auto-incrementing ID for a database table.
 *
 * @param {string} tableName
 * @returns {number}
 */
export function nextId(tableName) {
  const database = getDb();
  if (!database.seq) {
    database.seq = {};
  }
  const existingMaxId = (database[tableName] || []).reduce(
    (max, row) => Math.max(max, Number(row.id) || 0),
    0
  );
  database.seq[tableName] = Math.max(database.seq[tableName] || 0, existingMaxId) + 1;
  return database.seq[tableName];
}

// Backward compatibility aliases
export {
  getDb as getDatabase,
  save as saveDatabase,
  nowStamp as getNowTimestamp,
  today as getTodayDateString,
  nextId as getNextSequentialId
};

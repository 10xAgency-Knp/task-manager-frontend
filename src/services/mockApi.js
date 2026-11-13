/**
 * Mock Backend Gateway
 *
 * Intercepts frontend service calls and answers with JSON responses matching
 * the production CRM API protocol ({ ok: true, ... } or { ok: false, error: "..." }).
 *
 * Implements session validation, permission checks, and transactional saves to mockDb.
 */

import { getDb, save, sessionUserId, setSession } from "./mockDb.js";
import { ApiError } from "./mock/shared.js";
import * as authHandlers from "./mock/auth.js";
import * as workspaceHandlers from "./mock/workspace.js";
import * as taskHandlers from "./mock/tasks.js";
import * as projectHandlers from "./mock/projects.js";
import * as peopleHandlers from "./mock/people.js";
import * as adminHandlers from "./mock/admin.js";

/**
 * Actions permitted without an active user session.
 */
const PUBLIC_ACTIONS = {
  login: authHandlers.login,
  forgotPassword: authHandlers.forgotPassword,
  checkReset: authHandlers.checkReset,
  resetPassword: authHandlers.resetPassword
};

/**
 * Handlers requiring an authenticated session: (payload, activeUser) => responsePayload
 */
const AUTHENTICATED_ACTIONS = {
  session: authHandlers.session,
  me: authHandlers.me,
  logout: authHandlers.logout,
  changePassword: authHandlers.changePassword,

  load: workspaceHandlers.load,
  search: workspaceHandlers.search,
  reports: workspaceHandlers.reports,
  workload: workspaceHandlers.workload,
  notifPoll: workspaceHandlers.notifPoll,
  notifRead: workspaceHandlers.notifRead,
  pushConfig: workspaceHandlers.pushConfig,
  pushSubscribe: workspaceHandlers.pushSubscribe,
  pushUnsubscribe: workspaceHandlers.pushUnsubscribe,
  pushTest: workspaceHandlers.pushTest,
  setAvatar: workspaceHandlers.setAvatar,
  removeAvatar: workspaceHandlers.removeAvatar,

  taskDetail: taskHandlers.taskDetail,
  saveTask: taskHandlers.saveTask,
  setTaskStatus: taskHandlers.setTaskStatus,
  deleteTask: taskHandlers.deleteTask,
  subtask: taskHandlers.subtask,
  comment: taskHandlers.comment,
  upload: taskHandlers.upload,
  download: taskHandlers.download,
  deleteAttachment: taskHandlers.deleteAttachment,

  saveProject: projectHandlers.saveProject,
  deleteProject: projectHandlers.deleteProject,
  saveDeal: projectHandlers.saveDeal,
  deleteDeal: projectHandlers.deleteDeal,

  saveUser: (payload, user) => peopleHandlers.saveUser(payload, user, false),
  saveAdmin: peopleHandlers.saveAdmin,
  deleteUser: peopleHandlers.deleteUser,
  setRole: peopleHandlers.setRole,
  permissions: peopleHandlers.permissions,
  savePermissions: peopleHandlers.savePermissions,
  setSuper: peopleHandlers.setSuper,

  auditLog: adminHandlers.auditLog,
  recycleList: adminHandlers.recycleList,
  recycleRestore: adminHandlers.recycleRestore,
  recyclePurge: adminHandlers.recyclePurge,
  pwResets: adminHandlers.pwResets,
  pwPending: adminHandlers.pwPending,
  pwResetOpen: adminHandlers.pwResetOpen,
  pwResetComplete: adminHandlers.pwResetComplete,
  pwResetReject: adminHandlers.pwResetReject
};

/**
 * Actions permitted for users flagged with `mustChange` before updating their temporary password.
 */
const ACTIONS_ALLOWED_BEFORE_PASSWORD_CHANGE = ["me", "load", "logout", "changePassword", "session"];

/**
 * Resolves the currently active authenticated user from session store.
 *
 * @returns {Object|null}
 */
function getActiveSessionUser() {
  const currentUserId = sessionUserId();
  const user = currentUserId ? getDb().users.find((u) => u.id === currentUserId && !u.deletedAt) : null;

  if (currentUserId && (!user || user.status === "Inactive")) {
    setSession(null); // Signed out if user was deleted or deactivated
  }

  return user && user.status !== "Inactive" ? user : null;
}

/**
 * Executes an action handler with authorization and password change enforcement.
 *
 * @param {string} actionName
 * @param {Object} payload
 * @returns {Object} Response object
 */
function executeAction(actionName, payload) {
  if (PUBLIC_ACTIONS[actionName]) {
    return PUBLIC_ACTIONS[actionName](payload);
  }

  const currentUser = getActiveSessionUser();
  if (!currentUser) {
    return actionName === "session"
      ? { ok: true, authed: false }
      : { ok: false, error: "AUTH", message: "Your session has expired. Please sign in again." };
  }

  if (currentUser.mustChange && !ACTIONS_ALLOWED_BEFORE_PASSWORD_CHANGE.includes(actionName)) {
    return {
      ok: false,
      error: "MUST_CHANGE",
      message: "Please set your own password before continuing."
    };
  }

  const handler = AUTHENTICATED_ACTIONS[actionName];
  if (!handler) {
    return { ok: false, error: "Unknown action." };
  }

  return handler(payload, currentUser);
}

/**
 * Artificial network latency simulator for realistic UI loading states.
 */
const simulateNetworkLatency = (durationMs) => new Promise((resolve) => setTimeout(resolve, durationMs));

/**
 * Dispatches an action request to the mock backend.
 * Resolves with response JSON matching API format ({ ok: true, ... } or { ok: false, error: "..." }).
 *
 * @param {string} action
 * @param {Object} [payload={}]
 * @param {Object} [options={}]
 * @param {boolean} [options.background=false]
 * @returns {Promise<Object>}
 */
export async function request(action, payload = {}, options = {}) {
  const delayMs = options.background ? 40 : 120 + Math.random() * 180;
  await simulateNetworkLatency(delayMs);

  let responseData;
  try {
    responseData = executeAction(action, { ...payload });
  } catch (error) {
    if (!(error instanceof ApiError)) {
      console.error(`[mock api] ${action}`, error);
      return { ok: false, error: "Something went wrong. Please try again." };
    }
    responseData = error.payload;
  }

  if (responseData.ok !== false) {
    save();
  }

  // Return a cloned copy so callers cannot mutate internal database rows directly
  return JSON.parse(JSON.stringify(responseData));
}

// Backward compatibility alias
export { request as mockApiRequest };

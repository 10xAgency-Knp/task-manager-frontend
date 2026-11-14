/**
 * Central HTTP Client & REST API Service
 *
 * Configures Axios for communication with the Laravel API backend,
 * manages Sanctum Bearer tokens, and handles standard HTTP errors
 * (401 Unauthorized, 422 Validation Error, 429 Rate Limit, 500 Server Error).
 */

import axios from "axios";
import { appStore, setStoreState, showErrorToast, showToast } from "../store/appStore.js";
import { canViewModule } from "../utils/helpers.js";
import {
  transformUserFromApi,
  transformTaskFromApi,
  transformProjectFromApi,
  transformDealFromApi,
  transformDashboardFromApi,
  transformNotificationFromApi,
  extractUserDirectoryFromPayloads
} from "./apiAdapters.js";

const AUTH_TOKEN_STORAGE_KEY = "crm_auth_token";

function isPrivateIp(hostname) {
  return /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname);
}

/**
 * Resolve API base URL dynamically.
 * - In production (e.g. task-manager.clicxormedia.in), always target the production API.
 * - On local machine (localhost / 127.0.0.1), use the configured VITE_API_BASE_URL.
 * - On local LAN testing (e.g. mobile on 192.168.x.x), dynamically rewrite port 8000 for LAN testing.
 */
function resolveApiBaseUrl() {
  const envUrl = import.meta.env.VITE_API_BASE_URL;

  if (typeof window !== "undefined" && window.location) {
    const currentHost = window.location.hostname;

    // 1. Production / Staging domains: never attach :8000
    if (currentHost.includes("clicxormedia.in") || currentHost.includes("the10xagency.in")) {
      return "https://api-task-manager.clicxormedia.in/api";
    }

    // 2. LAN IP testing only (e.g. 192.168.1.x from mobile device)
    if (isPrivateIp(currentHost)) {
      if (!envUrl || envUrl.includes("localhost") || envUrl.includes("127.0.0.1")) {
        const port = "8000";
        return `${window.location.protocol}//${currentHost}:${port}/api`;
      }
    }
  }

  return envUrl || "https://api-task-manager.clicxormedia.in/api";
}

const API_BASE_URL = resolveApiBaseUrl();

export const httpClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Accept": "application/json",
    "Content-Type": "application/json",
  },
  timeout: 30000,
});

/* ==========================================================================
   TOKEN STORAGE MANAGEMENT
   ========================================================================== */

export function getAuthToken() {
  try {
    return localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) || "";
  } catch (error) {
    console.warn("Unable to access localStorage for auth token:", error);
    return "";
  }
}

export function setAuthToken(token) {
  try {
    if (token) {
      localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    }
  } catch (error) {
    console.warn("Unable to store auth token in localStorage:", error);
  }
}

export function clearAuthToken() {
  setAuthToken(null);
}

/* ==========================================================================
   AXIOS INTERCEPTORS
   ========================================================================== */

// Request Interceptor: Inject Sanctum Bearer Token
httpClient.interceptors.request.use(
  (config) => {
    const token = getAuthToken();
    if (token && !config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: Uniform Status Code & Error Handling
httpClient.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const status = error.response ? error.response.status : null;
    const errorData = error.response ? error.response.data : null;

    // 1. Session expired or unauthenticated
    if (status === 401) {
      clearAuthToken();
      setStoreState({
        currentScreen: "login",
        currentUser: null,
        authMessage: "Your session has expired. Please sign in again.",
        isAuthSuccess: false,
        activeModal: null,
        modalStack: [],
      });
      const authError = new Error(errorData?.message || "Unauthenticated session");
      authError.status = 401;
      authError.silent = true;
      return Promise.reject(authError);
    }

    // 2. Forbidden access
    if (status === 403) {
      const forbiddenMessage = errorData?.message || "You do not have permission to perform this action.";
      showToast(forbiddenMessage, "err");
      const forbiddenError = new Error(forbiddenMessage);
      forbiddenError.status = 403;
      return Promise.reject(forbiddenError);
    }

    // 3. Validation failure (Laravel Form Request / validator)
    if (status === 422) {
      const validationMessage = errorData?.message || "Validation failed. Please review the highlighted fields.";
      const validationError = new Error(validationMessage);
      validationError.status = 422;
      validationError.validationErrors = errorData?.errors || {};
      return Promise.reject(validationError);
    }

    // 4. Rate limiting / throttle
    if (status === 429) {
      const retryAfter = errorData?.retry_after || 60;
      const throttleMessage = `Too many attempts. Please try again in ${retryAfter} seconds.`;
      showToast(throttleMessage, "err");
      const throttleError = new Error(throttleMessage);
      throttleError.status = 429;
      return Promise.reject(throttleError);
    }

    // 5. Server or Network error
    const genericMessage = errorData?.message || error.message || "An unexpected server error occurred.";
    const genericError = new Error(genericMessage);
    genericError.status = status || 500;
    return Promise.reject(genericError);
  }
);

/* ==========================================================================
   AUTHENTICATION API CALLS
   ========================================================================== */

/**
 * Authenticates user credentials against Laravel Sanctum /api/login.
 *
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{ access_token: string, user: Object, forcePasswordReset: boolean, permissions: string[] }>}
 */
export async function login(email, password) {
  const response = await httpClient.post("/login", {
    usr_email: email,
    usr_password: password,
  });

  if (response.access_token) {
    setAuthToken(response.access_token);
  }

  return response;
}

/**
 * Logs out the authenticated user and revokes personal access tokens.
 */
export async function logout() {
  try {
    await httpClient.post("/logout");
  } catch (error) {
    console.warn("Logout request encountered an issue:", error);
  } finally {
    clearAuthToken();
  }
}

/**
 * Changes user password during mandatory initial reset or from settings.
 *
 * @param {string} currentPassword
 * @param {string} newPassword
 * @param {string} confirmPassword
 */
export async function changePassword(currentPassword, newPassword, confirmPassword) {
  const response = await httpClient.post("/reset-password", {
    usr_password: currentPassword,
    new_password: newPassword,
    new_password_confirmation: confirmPassword,
  });

  if (response.access_token) {
    setAuthToken(response.access_token);
  }

  return response;
}

/**
 * Fetches the currently authenticated user profile from /api/user.
 */
export async function fetchCurrentUserProfile() {
  return await httpClient.get("/user");
}

/**
 * Fetches dashboard analytical metrics, focus tasks, and activity timeline.
 *
 * @returns {Promise<Object>}
 */
export async function fetchDashboardData() {
  if (!canViewModule("dashboard")) {
    return null;
  }
  const response = await httpClient.get("/dashboard");
  return transformDashboardFromApi(response);
}

/* ==========================================================================
   CONVENIENCE REQUEST HELPERS
   ========================================================================== */

export const httpGet = (url, params = {}) => httpClient.get(url, { params });
export const httpPost = (url, data = {}, config = {}) => httpClient.post(url, data, config);
export const httpPut = (url, data = {}, config = {}) => httpClient.put(url, data, config);
export const httpDelete = (url, config = {}) => httpClient.delete(url, config);

/**
 * Fetches all core workspace collections in parallel and normalizes them into human-readable domain objects.
 * Used during application startup (enterApp) and background refreshes (safeRefresh).
 *
 * @returns {Promise<{ ok: boolean, data: Object }>}
 */
export async function fetchWorkspaceData() {
  // First load user profile and permissions to avoid requesting modules the user cannot access
  let rawUser = null;
  let userPerms = null;
  try {
    const userProfileRes = await fetchCurrentUserProfile();
    rawUser = userProfileRes?.user || userProfileRes;
    userPerms = userProfileRes?.permissions || null;
  } catch (e) {
    console.warn("Could not load user profile:", e);
  }

  const transformedUser = transformUserFromApi(rawUser, userPerms);
  const isSuper = Boolean(transformedUser?.isSuperAdmin || transformedUser?.superAdmin);

  // Check granular permissions before hitting endpoints to avoid 403 Forbidden errors
  const canViewAllTasks = isSuper || canViewModule("all_tasks", transformedUser);
  const canViewMyTasks = isSuper || canViewModule("my_tasks", transformedUser);
  const canViewAssignedByMe = isSuper || canViewModule("assigned_by_me", transformedUser);
  const tasksUrl = canViewAllTasks ? "/all-tasks" : (canViewMyTasks ? "/my-tasks" : null);

  const canViewProjects = isSuper || canViewModule("projects", transformedUser);
  const canViewMembers = isSuper || canViewModule("members", transformedUser);
  const canViewDeals = isSuper || canViewModule("sales_pipeline", transformedUser);
  const canViewNotifs = isSuper || canViewModule("notifications", transformedUser);
  const canViewAudit = isSuper || canViewModule("audit_log", transformedUser);

  const [tasksRes, assignedByMeRes, projectsRes, membersRes, assignableRes, dealsRes, notifsRes, auditLogsRes] =
    await Promise.allSettled([
      tasksUrl ? httpGet(tasksUrl) : Promise.resolve([]),
      (!canViewAllTasks && canViewAssignedByMe) ? httpGet("/assigned-by-me") : Promise.resolve(null),
      canViewProjects ? httpGet("/projects") : Promise.resolve({ data: [] }),
      canViewMembers ? httpGet("/members") : Promise.resolve({}),
      (canViewAllTasks || canViewMyTasks || canViewAssignedByMe || canViewProjects || canViewMembers)
        ? httpGet("/users/assignable")
        : Promise.resolve({}),
      canViewDeals ? httpGet("/sales-pipeline") : Promise.resolve({ data: [] }),
      canViewNotifs ? httpGet("/notifications") : Promise.resolve({ notifications: [], unread_count: 0 }),
      canViewAudit ? httpGet("/audit-logs") : Promise.resolve({ data: [] }),
    ]);

  const primaryRawTasks = tasksRes.status === "fulfilled"
    ? (Array.isArray(tasksRes.value) ? tasksRes.value : (Array.isArray(tasksRes.value?.all_my_tasks) ? tasksRes.value.all_my_tasks : []))
    : [];
  const extraRawAssigned = assignedByMeRes.status === "fulfilled" && assignedByMeRes.value
    ? (Array.isArray(assignedByMeRes.value?.assigned_by_me) ? assignedByMeRes.value.assigned_by_me : (Array.isArray(assignedByMeRes.value) ? assignedByMeRes.value : []))
    : [];
  const seenTaskIds = new Set();
  const rawTasks = [...primaryRawTasks, ...extraRawAssigned].filter((t) => {
    const id = t?.tsk_id ?? t?.id;
    if (!id || seenTaskIds.has(id)) return false;
    seenTaskIds.add(id);
    return true;
  });
  const transformedTasks = rawTasks.map(transformTaskFromApi);

  const rawProjects = projectsRes.status === "fulfilled" && Array.isArray(projectsRes.value?.data) ? projectsRes.value.data : [];
  const transformedProjects = rawProjects.map(transformProjectFromApi);

  const rawMembers = membersRes.status === "fulfilled" && typeof membersRes.value === "object" ? membersRes.value : {};
  const transformedUsers = Object.entries(rawMembers).map(([idString, memberData]) => {
    const deptVal = memberData.usr_dept || memberData.member_dept || "";
    const customDeptVal = memberData.usr_custom_dept || memberData.member_custom_dept || "";
    const reportsToVal = memberData.usr_reporting_to ? Number(memberData.usr_reporting_to) : null;
    const isSuperFlag = Boolean(memberData.usr_is_super_admin);
    return {
      id: Number(idString),
      name: memberData.member_name || "",
      avatar: memberData.member_avatar || memberData.usr_avatar || memberData.avatar || "",
      email: memberData.member_email === "-" ? "" : memberData.member_email,
      phone: memberData.member_phone === "-" ? "" : memberData.member_phone,
      designation: memberData.member_designation === "-" ? "" : memberData.member_designation,
      role: (memberData.member_role || "employee").charAt(0).toUpperCase() + (memberData.member_role || "employee").slice(1),
      dept: deptVal || customDeptVal || "General",
      department: deptVal || customDeptVal || "General",
      customDept: customDeptVal,
      customDepartment: customDeptVal,
      reportsTo: reportsToVal,
      reportsToId: reportsToVal,
      joined: memberData.usr_joined || "",
      joinedOn: memberData.usr_joined || "",
      superAdmin: isSuperFlag,
      isSuperAdmin: isSuperFlag,
      status: memberData.member_status ? "Active" : "Inactive",
      city: memberData.member_place === "-" ? "" : memberData.member_place,
      taskStatistics: memberData.task_statistics || {},
      inTeam: true,
    };
  });

  // Ensure current user is in transformedUsers list with avatar synced
  if (transformedUser) {
    const existingIndex = transformedUsers.findIndex((u) => u.id === transformedUser.id);
    if (existingIndex >= 0) {
      if (transformedUser.avatar && !transformedUsers[existingIndex].avatar) {
        transformedUsers[existingIndex].avatar = transformedUser.avatar;
      } else if (transformedUsers[existingIndex].avatar && !transformedUser.avatar) {
        transformedUser.avatar = transformedUsers[existingIndex].avatar;
      }
    } else {
      transformedUsers.push({ ...transformedUser, inTeam: true });
    }
  }

  const rawAssignable = assignableRes.status === "fulfilled" && typeof assignableRes.value === "object" ? assignableRes.value : {};
  const assignableUserIds = Object.keys(rawAssignable).map(Number);

  const rawDeals = dealsRes.status === "fulfilled" && Array.isArray(dealsRes.value?.data) ? dealsRes.value.data : [];
  const transformedDeals = rawDeals.map(transformDealFromApi);

  const rawNotifications = notifsRes.status === "fulfilled" ? (notifsRes.value?.notifications || []) : [];
  const unreadCount = notifsRes.status === "fulfilled" ? (Number(notifsRes.value?.unread_count) || 0) : 0;
  const transformedNotifications = rawNotifications.map(transformNotificationFromApi);

  const rawAuditLogs = auditLogsRes.status === "fulfilled" ? (auditLogsRes.value?.data || []) : [];
  const transformedActivity = rawAuditLogs.slice(0, 50).map((log) => ({
    id: log.alg_id,
    userId: log.alg_usr_id,
    who: log.alg_actor_name || "System",
    text: log.alg_description || `${log.alg_action} on ${log.alg_module}`,
    when: log.alg_updated_on ? log.alg_updated_on.slice(0, 16) : "",
  }));

  const userDirectory = extractUserDirectoryFromPayloads({
    tasks: rawTasks,
    projects: rawProjects,
    assignable: rawAssignable,
    users: transformedUsers,
  });

  return {
    ok: true,
    data: {
      me: transformedUser,
      currentUser: transformedUser,
      users: transformedUsers,
      userDirectory,
      assignable: assignableUserIds.length > 0 ? assignableUserIds : transformedUsers.map((u) => u.id),
      projects: transformedProjects,
      tasks: transformedTasks,
      deals: transformedDeals,
      notifications: transformedNotifications,
      unread: unreadCount,
      unreadCount: unreadCount,
      activity: transformedActivity,
      oldClosed: { projects: {}, users: {} },
      roleLimits: { Admin: { max: 5 }, Manager: { max: 10 } },
      limits: { task_title: [3, 200], checklist: [1, 200], tag: [1, 30], comment: [1, 4000] },
      taskCategories: [
        "Web development",
        "SMM",
        "E commerce",
        "Video editing/ graphic",
        "Human resource",
        "SEO",
        "Custom/ remark",
      ],
      meta: {
        serverTime: new Date().toISOString(),
        today: new Date().toISOString().slice(0, 10),
        ownFileDeleteHours: 24,
      },
    },
  };
}

/* ==========================================================================
   TASK WORKFLOW MUTATIONS & LISTINGS (PHASE 4)
   ========================================================================== */

/**
 * Creates a new task in the database via POST /api/task/save.
 *
 * @param {Object} taskPayload
 * @returns {Promise<Object>}
 */
export async function createTask(taskPayload) {
  return await httpClient.post("/task/save", taskPayload);
}

/**
 * Updates an existing task via PUT /api/task/{taskId}/update.
 *
 * @param {number|string} taskId
 * @param {Object} taskPayload
 * @returns {Promise<Object>}
 */
export async function updateTask(taskId, taskPayload) {
  return await httpClient.put(`/task/${taskId}/update`, taskPayload);
}

/**
 * Updates task status via PUT /api/task/{taskId}/status_update.
 *
 * @param {number|string} taskId
 * @param {string} rawStatus - e.g. "to_do", "in_progress", "completed"
 * @returns {Promise<Object>}
 */
export async function updateTaskStatus(taskId, rawStatus) {
  return await httpClient.put(`/task/${taskId}/status_update`, { status: rawStatus });
}

/**
 * Soft deletes a task and preserves it in recycle bin via DELETE /api/task/{taskId}/delete.
 *
 * @param {number|string} taskId
 * @returns {Promise<Object>}
 */
export async function deleteTask(taskId) {
  return await httpClient.delete(`/task/${taskId}/delete`);
}

/**
 * Fetches full task details with assignees, subtasks, comments, and attachments via GET /api/task/{taskId}/view.
 *
 * @param {number|string} taskId
 * @returns {Promise<Object>}
 */
export async function fetchTaskDetail(taskId) {
  return await httpClient.get(`/task/${taskId}/view`);
}

/**
 * Fetches tasks assigned to the current user via GET /api/my-tasks.
 *
 * @returns {Promise<Object>}
 */
export async function fetchMyTasks() {
  return await httpClient.get("/my-tasks");
}

/**
 * Fetches tasks created by or assigned by the current user via GET /api/assigned-by-me.
 *
 * @returns {Promise<Object>}
 */
export async function fetchAssignedByMeTasks() {
  return await httpClient.get("/assigned-by-me");
}

/**
 * Fetches all tasks organized for the Kanban board via GET /api/task-board.
 *
 * @returns {Promise<Object>}
 */
export async function fetchTaskBoard() {
  return await httpClient.get("/task-board");
}

/**
 * Fetches tasks grouped by date for the calendar view via GET /api/calendar-tasks.
 *
 * @returns {Promise<Object>}
 */
export async function fetchCalendarTasks() {
  return await httpClient.get("/calendar-tasks");
}

/* ==========================================================================
   TASK COLLABORATION & ATTACHMENTS (PHASE 5)
   ========================================================================== */

/**
 * Adds a new checklist subtask to a task via POST /api/checklist/{taskId}/add.
 *
 * @param {number|string} taskId
 * @param {string} title
 * @returns {Promise<Object>}
 */
export async function addSubtaskChecklist(taskId, title) {
  return await httpClient.post(`/checklist/${taskId}/add`, { title });
}

/**
 * Toggles done state of a checklist item via PUT /api/checklist/{subtaskId}/toggle.
 *
 * @param {number|string} subtaskId
 * @returns {Promise<Object>}
 */
export async function toggleSubtaskChecklist(subtaskId) {
  return await httpClient.put(`/checklist/${subtaskId}/toggle`);
}

/**
 * Deletes a checklist item via DELETE /api/subtask/{subtaskId}/delete.
 *
 * @param {number|string} subtaskId
 * @returns {Promise<Object>}
 */
export async function deleteSubtask(subtaskId) {
  return await httpClient.delete(`/subtask/${subtaskId}/delete`);
}

/**
 * Adds a comment to a task with optional user mentions via POST /api/task/{taskId}/comment.
 *
 * @param {number|string} taskId
 * @param {string} comment
 * @param {number[]} [mentions=[]]
 * @returns {Promise<Object>}
 */
export async function addTaskComment(taskId, comment, mentions = []) {
  return await httpClient.post(`/task/${taskId}/comment`, { comment, mentions });
}

/**
 * Uploads multipart file attachments to a task via POST /api/task/{taskId}/attachment.
 *
 * @param {number|string} taskId
 * @param {FormData} formData
 * @param {Function} [onUploadProgress]
 * @returns {Promise<Object>}
 */
export async function uploadTaskAttachment(taskId, formData, onUploadProgress) {
  return await httpClient.post(`/task/${taskId}/attachment`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress,
  });
}

/**
 * Deletes an attachment via DELETE /api/attachment/delete/{attachmentId}.
 *
 * @param {number|string} attachmentId
 * @returns {Promise<Object>}
 */
export async function deleteTaskAttachment(attachmentId) {
  return await httpClient.delete(`/attachment/delete/${attachmentId}`);
}

/**
 * Downloads an attachment file blob via GET /api/attachment/download/{attachmentId}.
 *
 * @param {number|string} attachmentId
 * @returns {Promise<Blob>}
 */
export async function downloadAttachmentBlob(attachmentId) {
  const response = await httpClient.get(`/attachment/download/${attachmentId}`, {
    responseType: "blob",
  });
  return response.data || response;
}

/**
 * Fetches mentionable users for the comment chat autocomplete via GET /api/chat-mentions.
 *
 * @returns {Promise<Object>}
 */
export async function fetchChatMentions() {
  return await httpClient.get("/chat-mentions");
}

/* ==========================================================================
   PROJECTS WORKFLOW (PHASE 6)
   ========================================================================== */

/**
 * Creates a project via POST /api/project/save.
 *
 * @param {Object} projectPayload
 * @returns {Promise<Object>}
 */
export async function createProject(projectPayload) {
  return await httpClient.post("/project/save", projectPayload);
}

/**
 * Updates a project via PUT /api/project/{projectId}/update.
 *
 * @param {number|string} projectId
 * @param {Object} projectPayload
 * @returns {Promise<Object>}
 */
export async function updateProject(projectId, projectPayload) {
  return await httpClient.put(`/project/${projectId}/update`, projectPayload);
}

/**
 * Deletes a project and preserves it in recycle bin via DELETE /api/project/{projectId}/delete.
 *
 * @param {number|string} projectId
 * @returns {Promise<Object>}
 */
export async function deleteProject(projectId) {
  return await httpClient.delete(`/project/${projectId}/delete`);
}

/**
 * Fetches project details via GET /api/project/{projectId}/view.
 *
 * @param {number|string} projectId
 * @returns {Promise<Object>}
 */
export async function fetchProjectDetail(projectId) {
  return await httpClient.get(`/project/${projectId}/view`);
}

/* ==========================================================================
   MEMBERS & USERS WORKFLOW (PHASE 7)
   ========================================================================== */

/**
 * Fetches workspace members via GET /api/members.
 *
 * @returns {Promise<Object>}
 */
export async function fetchMembers() {
  return await httpClient.get("/members");
}

/**
 * Fetches single member workload and details via GET /api/member-view/{memberId}.
 *
 * @param {number|string} memberId
 * @returns {Promise<Object>}
 */
export async function fetchMemberView(memberId) {
  return await httpClient.get(`/member-view/${memberId}`);
}

/**
 * Creates a new user via POST /api/create-user.
 *
 * @param {Object} userPayload
 * @returns {Promise<Object>}
 */
export async function createUser(userPayload) {
  return await httpClient.post("/create-user", userPayload);
}

/**
 * Updates an existing user via PUT /api/update-user/{userId}.
 *
 * @param {number|string} userId
 * @param {Object} userPayload
 * @returns {Promise<Object>}
 */
export async function updateUser(userId, userPayload) {
  return await httpClient.put(`/update-user/${userId}`, userPayload);
}

/**
 * Moves a user to the recycle bin via DELETE /api/user/{userId}/delete.
 *
 * @param {number|string} userId
 * @param {boolean} [force=false]
 * @returns {Promise<Object>}
 */
export async function deleteUser(userId, force = false) {
  return await httpClient.delete(`/user/${userId}/delete`, {
    params: { force: Boolean(force) },
  });
}

/**
 * Updates a user's role via PUT /api/user/{userId}/role.
 *
 * @param {number|string} userId
 * @param {string} role - "admin", "manager", or "employee"
 * @returns {Promise<Object>}
 */
export async function updateUserRole(userId, role) {
  return await httpClient.put(`/user/${userId}/role`, { role: role.toLowerCase() });
}

/**
 * Toggles a user's Super Admin status via PUT /api/user/{userId}/super-admin.
 *
 * @param {number|string} userId
 * @param {boolean} isSuperAdmin
 * @returns {Promise<Object>}
 */
export async function setUserSuperAdmin(userId, isSuperAdmin) {
  return await httpClient.put(`/user/${userId}/super-admin`, {
    is_super_admin: Boolean(isSuperAdmin),
  });
}

/* ==========================================================================
   SALES PIPELINE (DEALS) WORKFLOW (PHASE 8)
   ========================================================================== */

/**
 * Fetches all sales deals via GET /api/sales-pipeline.
 *
 * @returns {Promise<Object>}
 */
export async function fetchSalesPipeline() {
  return await httpClient.get("/sales-pipeline");
}

/**
 * Creates a new sales deal via POST /api/sales-pipeline/save.
 *
 * @param {Object} dealPayload
 * @returns {Promise<Object>}
 */
export async function createDeal(dealPayload) {
  return await httpClient.post("/sales-pipeline/save", dealPayload);
}

/**
 * Updates an existing sales deal via PUT /api/sales-pipeline/{dealId}/update.
 *
 * @param {number|string} dealId
 * @param {Object} dealPayload
 * @returns {Promise<Object>}
 */
export async function updateDeal(dealId, dealPayload) {
  return await httpClient.put(`/sales-pipeline/${dealId}/update`, dealPayload);
}

/**
 * Soft deletes a sales deal via DELETE /api/sales-pipeline/{dealId}/delete.
 *
 * @param {number|string} dealId
 * @returns {Promise<Object>}
 */
export async function deleteDeal(dealId) {
  return await httpClient.delete(`/sales-pipeline/${dealId}/delete`);
}

/**
 * Fetches deal details via GET /api/sales-pipeline/{dealId}.
 *
 * @param {number|string} dealId
 * @returns {Promise<Object>}
 */
export async function fetchDealDetail(dealId) {
  return await httpClient.get(`/sales-pipeline/${dealId}`);
}

/* ==========================================================================
   ANALYTICAL REPORTS WORKFLOW (PHASE 9)
   ========================================================================== */

/**
 * Fetches report statistics and metrics via GET /api/reports.
 *
 * @returns {Promise<Object>}
 */
export async function fetchReportsData() {
  return await httpClient.get("/reports");
}

/* ==========================================================================
   ADMINISTRATION & GOVERNANCE WORKFLOW (PHASE 10)
   ========================================================================== */

/**
 * Fetches permissions matrix via GET /api/permissions.
 *
 * @returns {Promise<Object>}
 */
export async function fetchPermissionsMatrix() {
  return await httpClient.get("/permissions");
}

/**
 * Saves a user's permissions via PUT /api/users/{userId}/permissions.
 *
 * @param {number|string} userId
 * @param {Array<{module_slug: string, can_view: boolean, can_add: boolean, can_edit: boolean, can_delete: boolean}>} perms
 * @returns {Promise<Object>}
 */
export async function saveUserPermissions(userId, perms) {
  return await httpClient.put(`/users/${userId}/permissions`, { permissions: perms });
}

/**
 * Fetches paginated audit logs via GET /api/audit-logs.
 *
 * @param {Object} [filters={}]
 * @returns {Promise<Object>}
 */
export async function fetchAuditLogs(filters = {}) {
  return await httpClient.get("/audit-logs", { params: filters });
}

/**
 * Fetches soft-deleted items in the recycle bin via GET /api/recycle-bin.
 *
 * @param {Object} [filters={}]
 * @returns {Promise<Object>}
 */
export async function fetchRecycleBin(filters = {}) {
  return await httpClient.get("/recycle-bin", { params: filters });
}

/**
 * Restores an item from the recycle bin via POST /api/recycle-bin/restore.
 *
 * @param {number|string} itemId
 * @returns {Promise<Object>}
 */
export async function restoreRecycleItem(itemId) {
  return await httpClient.post("/recycle-bin/restore", { id: Number(itemId) });
}

/**
 * Permanently purges an item from the recycle bin via POST /api/recycle-bin/purge.
 *
 * @param {number|string} itemId
 * @returns {Promise<Object>}
 */
export async function purgeRecycleItem(itemId) {
  return await httpClient.post("/recycle-bin/purge", { id: Number(itemId) });
}

/**
 * Fetches all password reset requests for admins via GET /api/reset-password/list.
 *
 * @returns {Promise<Object>}
 */
export async function fetchPasswordResets() {
  return await httpClient.get("/reset-password/list");
}

/**
 * Marks a password reset request as opened via GET /api/reset-password/reset-request-opened/{requestId}.
 *
 * @param {number|string} requestId
 * @returns {Promise<Object>}
 */
export async function openPasswordReset(requestId) {
  return await httpClient.get(`/reset-password/reset-request-opened/${requestId}`);
}

/**
 * Completes a password reset request via POST /api/reset-password/reset-request-success/{requestId}.
 *
 * @param {number|string} requestId
 * @param {string} mode - "auto" or "manual"
 * @param {string} [manualPassword=""]
 * @returns {Promise<Object>}
 */
export async function completePasswordReset(requestId, mode, manualPassword = "") {
  return await httpClient.post(`/reset-password/reset-request-success/${requestId}`, {
    is_system_generated: mode !== "manual",
    is_manually_generated: mode === "manual",
    password: manualPassword || null,
  });
}

/**
 * Rejects a password reset request via POST /api/reset-password/reset-request-reject/{requestId}.
 *
 * @param {number|string} requestId
 * @param {string} rejectionNote
 * @returns {Promise<Object>}
 */
export async function rejectPasswordReset(requestId, rejectionNote = "") {
  return await httpClient.post(`/reset-password/reset-request-reject/${requestId}`, {
    reject_reason: rejectionNote || "Rejected by Admin",
  });
}

/* ==========================================================================
   NOTIFICATIONS WORKFLOW (PHASE 11)
   ========================================================================== */

/**
 * Fetches notifications list via GET /api/notifications.
 *
 * @returns {Promise<Object>}
 */
export async function fetchNotificationsPoll() {
  return await httpClient.get("/notifications");
}

/**
 * Marks a single notification as read via PUT /api/notification/{notificationId}/read.
 *
 * @param {number|string} notificationId
 * @returns {Promise<Object>}
 */
export async function markNotificationRead(notificationId) {
  return await httpClient.put(`/notification/${notificationId}/read`);
}

/**
 * Marks all notifications as read via POST /api/notifications/mark-all-read.
 *
 * @returns {Promise<Object>}
 */
export async function markAllNotificationsRead() {
  return await httpClient.post("/notifications/mark-all-read");
}

/* ==========================================================================
   USER PROFILE & AVATAR ENDPOINTS
   ========================================================================== */

/**
 * Uploads a user avatar image via POST /api/user/avatar.
 * Supports both base64 object ({ name, mime, data }) and FormData.
 *
 * @param {Object|FormData} payload
 * @returns {Promise<Object>}
 */
export async function uploadUserAvatar(payload) {
  if (payload instanceof FormData) {
    return await httpClient.post("/user/avatar", payload, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  }
  return await httpClient.post("/user/avatar", payload);
}

/**
 * Deletes user avatar image via DELETE /api/user/avatar.
 *
 * @returns {Promise<Object>}
 */
export async function deleteUserAvatar() {
  return await httpClient.delete("/user/avatar");
}


/**
 * Unified API Client & Service Gateway
 *
 * Single access point for CRM data and server actions across the entire frontend.
 * Dispatches requests to the active data backend (currently mockApi.js, or Laravel httpApi.js),
 * normalizes session expiration, forces password resets when required, and coordinates file downloads.
 */

import { appStore, setStoreState } from "../store/appStore.js";
import { stopPoll } from "./sync.js";
import { request } from "./mockApi.js";
import { canViewModule } from "../utils/helpers.js";
import {
  login as apiLogin,
  logout as apiLogout,
  changePassword as apiChangePassword,
  fetchCurrentUserProfile,
  fetchWorkspaceData,
  fetchDashboardData,
  createTask,
  updateTask,
  updateTaskStatus,
  deleteTask,
  fetchTaskDetail,
  addSubtaskChecklist,
  toggleSubtaskChecklist,
  deleteSubtask,
  addTaskComment,
  uploadTaskAttachment,
  deleteTaskAttachment,
  downloadAttachmentBlob,
  fetchChatMentions,
  createProject,
  updateProject,
  deleteProject,
  fetchProjectDetail,
  fetchMembers,
  fetchMemberView,
  createUser,
  updateUser,
  deleteUser,
  updateUserRole,
  setUserSuperAdmin,
  fetchSalesPipeline,
  createDeal,
  updateDeal,
  deleteDeal,
  fetchDealDetail,
  fetchReportsData,
  fetchPermissionsMatrix,
  saveUserPermissions,
  fetchAuditLogs,
  fetchRecycleBin,
  restoreRecycleItem,
  purgeRecycleItem,
  fetchPasswordResets,
  openPasswordReset,
  completePasswordReset,
  rejectPasswordReset,
  fetchNotificationsPoll,
  markNotificationRead,
  markAllNotificationsRead,
  uploadUserAvatar,
  deleteUserAvatar,
  getAuthToken,
  clearAuthToken,
  httpPost
} from "./httpApi.js";
import {
  transformUserFromApi,
  transformUserForApi,
  transformTaskFromApi,
  transformTaskForApi,
  transformProjectFromApi,
  transformProjectForApi,
  transformDealFromApi,
  transformDealForApi,
  transformPasswordResetRequestFromApi,
  transformNotificationFromApi,
  extractUserDirectoryFromPayloads,
  mergeUserDirectoryEntries,
  UI_TO_API_TASK_STATUS
} from "./apiAdapters.js";

/**
 * Global application constants and configuration limits.
 */
export const CONFIG = {
  APP_NAME: "10X Agency CRM",
  ORG: "10X Agency",
  LOGO: "assets/img/logo.png",
  MAX_UPLOAD_MB: 5,
  OWN_FILE_DELETE_HOURS: 24
};

/**
 * Main API controller object consumed by pages and components.
 */
export const API = {
  authed: false,

  /**
   * Executes an action against the backend and handles global error interceptors (AUTH, MUST_CHANGE).
   *
   * @param {string} action - Action identifier (e.g. "load", "saveTask")
   * @param {Object} [payload={}] - Payload data
   * @param {Object} [options={}] - Request options
   * @param {boolean} [options.background=false] - If true, background check without extending session
   * @param {boolean} [options.quietAuth=false] - Suppress auth error banner on initial boot check
   * @returns {Promise<Object>}
   */
  async call(action, payload = {}, options = {}) {
    if (action === "session") {
      return await API.session();
    }
    if (action === "load") {
      return await API.load(options.background);
    }
    if (action === "saveTask") {
      return await API.saveTask(payload.data || payload);
    }
    if (action === "setTaskStatus") {
      return await API.setStatus(payload.id || payload.taskId, payload.status);
    }
    if (action === "deleteTask") {
      return await API.delTask(payload.id || payload.taskId);
    }
    if (action === "taskDetail") {
      return await API.detail(payload.id || payload.taskId);
    }
    if (action === "subtask") {
      return await API.subtask(payload);
    }
    if (action === "comment") {
      return await API.comment(payload.task || payload.taskId, payload.body || payload.comment, payload.mentions || []);
    }
    if (action === "deleteAttachment") {
      return await API.delFile(payload.id || payload.attachmentId, payload.task || payload.taskId);
    }
    if (action === "saveProject") {
      return await API.saveProject(payload.data || payload);
    }
    if (action === "deleteProject") {
      return await API.delProject(payload.id || payload.projectId);
    }
    if (action === "projectDetail") {
      return await API.projectDetail(payload.id || payload.projectId);
    }
    if (action === "saveUser") {
      return await API.saveUser(payload.data || payload);
    }
    if (action === "saveAdmin") {
      return await API.saveAdmin(payload.data || payload);
    }
    if (action === "deleteUser") {
      return await API.delUser(payload.id || payload.userId, payload.force);
    }
    if (action === "setRole") {
      return await API.setRole(payload.userId, payload.role);
    }
    if (action === "setSuper") {
      return await API.setSuper(payload.userId, payload.on);
    }
    if (action === "saveDeal") {
      return await API.saveDeal(payload.data || payload);
    }
    if (action === "deleteDeal") {
      return await API.delDeal(payload.id || payload.dealId);
    }
    if (action === "reports") {
      return await API.reports();
    }
    if (action === "permissions") {
      return await API.permissions();
    }
    if (action === "savePermissions") {
      return await API.savePermissions(payload.userId, payload.perms);
    }
    if (action === "auditLog") {
      return await API.auditLog(payload);
    }
    if (action === "recycleList") {
      return await API.recycleList(payload);
    }
    if (action === "recycleRestore") {
      return await API.recycleRestore(payload.id);
    }
    if (action === "recyclePurge") {
      return await API.recyclePurge(payload.id);
    }
    if (action === "pwResets") {
      return await API.pwResets();
    }
    if (action === "pwResetOpen") {
      return await API.pwResetOpen(payload.id);
    }
    if (action === "pwResetComplete") {
      return await API.pwResetComplete(payload.id, payload.mode, payload.password);
    }
    if (action === "pwResetReject") {
      return await API.pwResetReject(payload.id, payload.note);
    }
    if (action === "notifPoll") {
      return await API.notifPoll(payload.after);
    }
    if (action === "notifRead") {
      return await API.notifRead(payload.id);
    }
    if (action === "pushConfig") {
      return await API.pushConfig();
    }
    if (action === "pushSubscribe") {
      return await API.pushSubscribe(payload);
    }
    if (action === "pushUnsubscribe") {
      return await API.pushUnsubscribe(payload.endpoint || payload);
    }
    if (action === "pushTest") {
      return await API.pushTest();
    }

    const response = await request(action, payload, { background: Boolean(options.background) });

    if (response.ok === false) {
      // 1. Session expired or unauthenticated
      if (response.error === "AUTH") {
        if (getAuthToken()) {
          // Live token is present, ignore mock-session expiration
          return { ok: true, data: null };
        }
        sessionClear();
        stopPoll();

        // Preserve in-progress form drafts if modal was open
        const preservedModalDraft =
          appStore.activeModal && appStore.activeModal.form && !appStore.activeModal.closing
            ? Object.assign(appStore.activeModal, { owner: appStore.currentUser && appStore.currentUser.id })
            : null;

        setStoreState({
          screen: "login",
          authMsg: options.quietAuth ? "" : (response.message || "Your session has expired. Please sign in again."),
          authGood: false,
          activeModal: preservedModalDraft,
          modalStack: []
        });

        const authError = new Error(response.message || "Session expired");
        authError.silent = true;
        throw authError;
      }

      // 2. User must change temporary password before accessing app
      if (response.error === "MUST_CHANGE") {
        stopPoll();
        setStoreState({
          screen: "force",
          activeModal: null,
          modalStack: []
        });

        const forcePasswordChangeError = new Error(response.message || "Please set a new password first.");
        forcePasswordChangeError.silent = true;
        throw forcePasswordChangeError;
      }

      // 3. General domain validation or permission error
      const generalError = new Error(response.error || response.message || "Request failed");
      generalError.needForce = Boolean(response.needForce);
      generalError.field = response.field || "";
      throw generalError;
    }

    return response;
  },

  /**
   * Downloads a stored attachment file to the client machine.
   *
   * @param {number|string} attachmentId
   * @param {string} [fileName]
   */
  async download(attachmentId, fileName) {
    try {
      const blob = await downloadAttachmentBlob(attachmentId);
      const downloadUrl = URL.createObjectURL(blob);
      const downloadAnchor = document.createElement("a");
      downloadAnchor.href = downloadUrl;
      downloadAnchor.download = fileName || "attachment";
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 4000);
    } catch (err) {
      const { file } = await request("download", { id: attachmentId });
      if (file?.dataUrl) {
        const downloadUrl = file.dataUrl;
        const downloadAnchor = document.createElement("a");
        downloadAnchor.href = downloadUrl;
        downloadAnchor.download = fileName || file.name || "file";
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
      }
    }
  },

  /**
   * Uploads an attachment payload while broadcasting progress percentage ticks.
   *
   * @param {Object} uploadPayload
   * @param {Function} [onProgress] - Callback invoked with progress percentage (0 - 100)
   * @returns {Promise<Object>}
   */
  async uploadWithProgress(uploadPayload, onProgress) {
    const rawTaskId = uploadPayload.task || uploadPayload.taskId || uploadPayload.id;
    const numericTaskId = rawTaskId ? Number(String(rawTaskId).replace(/^TK-/, "")) : null;

    if (numericTaskId && (uploadPayload.file || uploadPayload.files)) {
      const formData = new FormData();
      if (uploadPayload.file) {
        formData.append("attachments[]", uploadPayload.file);
      } else if (Array.isArray(uploadPayload.files)) {
        uploadPayload.files.forEach(f => formData.append("attachments[]", f));
      }

      if (onProgress) onProgress(30);
      const result = await uploadTaskAttachment(numericTaskId, formData, progressEvent => {
        if (onProgress && progressEvent.total) {
          const percent = Math.min(95, Math.round((progressEvent.loaded * 100) / progressEvent.total));
          onProgress(percent);
        }
      });
      if (onProgress) onProgress(100);
      return { ok: true, ...result };
    }

    const progressStages = [15, 40, 70, 90];
    for (const percent of progressStages) {
      if (onProgress) onProgress(percent);
      await new Promise((resolve) => setTimeout(resolve, 90));
    }
    const result = await request("upload", uploadPayload);
    if (onProgress) onProgress(100);
    return result;
  },

  // Authentication
  login: async (email, password) => {
    const data = await apiLogin(email, password);
    const transformedUser = transformUserFromApi(data.user, data.permissions);
    if (transformedUser && transformedUser.id) {
      localStorage.setItem("10x_crm_session", String(transformedUser.id));
    }
    return {
      ...data,
      user: transformedUser,
      mustChange: (data.forcePasswordReset || transformedUser?.mustChangePassword) ? 1 : 0
    };
  },
  forgot: async (email) => {
    try {
      return await httpPost("/reset_password/through-mail", { requested_mail: email });
    } catch (err) {
      return API.call("forgotPassword", { email });
    }
  },
  checkReset: (resetToken) => API.call("checkReset", { reset: resetToken }),
  resetPassword: (resetToken, password) => API.call("resetPassword", { reset: resetToken, password }),
  changePassword: async (currentPassword, newPassword, confirmPassword) => {
    const data = await apiChangePassword(currentPassword, newPassword, confirmPassword);
    const transformedUser = data.user ? transformUserFromApi(data.user) : null;
    return { ...data, user: transformedUser };
  },
  session: async () => {
    const token = getAuthToken();
    if (!token) {
      return { authed: false };
    }
    try {
      const data = await fetchCurrentUserProfile();
      const user = transformUserFromApi(data.user || data, data.permissions);
      if (user && user.id) {
        localStorage.setItem("10x_crm_session", String(user.id));
      }
      return {
        authed: true,
        user,
        permissions: data.permissions,
        mustChange: (data.forcePasswordReset || user?.mustChangePassword) ? 1 : 0
      };
    } catch (err) {
      clearAuthToken();
      localStorage.removeItem("10x_crm_session");
      return { authed: false };
    }
  },
  load: async (isBackground = false) => {
    const token = getAuthToken();
    if (token) {
      try {
        return await fetchWorkspaceData();
      } catch (err) {
        console.warn("Live workspace load failed, falling back to cached/mock:", err);
      }
    }
    const response = await request("load", {}, { background: Boolean(isBackground) });
    return response;
  },
  logout: async (pushEndpoint) => {
    await apiLogout();
    sessionClear();
    try {
      await API.call("logout", pushEndpoint ? { pushEndpoint } : {});
    } catch (err) {
      // Ignored if already signed out
    }
  },

  // Tasks & Checklists (Phase 4 Live Integration)
  detail: async (taskId) => {
    const numericId = Number(String(taskId).replace(/^TK-/, ""));
    const response = await fetchTaskDetail(numericId);
    const rawTaskData = response.task_data || response;
    const task = transformTaskFromApi(rawTaskData);

    const extractedDir = extractUserDirectoryFromPayloads({ tasks: [rawTaskData] });
    if (appStore.database) {
      appStore.database.userDirectory = mergeUserDirectoryEntries(
        appStore.database.userDirectory || [],
        extractedDir
      );
    }

    const usersList = appStore.database?.users || [];
    const directoryUsers = appStore.database?.userDirectory || [];
    const assignableIds = appStore.database?.assignable || [];
    const mentionMap = new Map();
    [...directoryUsers, ...usersList].forEach((u) => {
      if (u && u.id) mentionMap.set(Number(u.id), u);
    });
    const mentionableUsers = mentionMap.size > 0
      ? Array.from(mentionMap.values())
      : assignableIds.map((id) => ({ id: Number(id), name: `User #${id}` }));

    const payload = {
      ok: true,
      task,
      subtasks: task.subtasks || [],
      comments: task.comments || [],
      attachments: task.attachments || [],
      activities: task.activities || [],
      timeline: task.activities || [],
      mentionable: mentionableUsers,
    };
    return {
      ...payload,
      data: payload,
    };
  },
  saveTask: async (taskData) => {
    const rawId = taskData.id || taskData.numericId;
    const isUpdate = Boolean(rawId);
    const numericId = isUpdate ? Number(String(rawId).replace(/^TK-/, "")) : null;

    if (isUpdate && numericId) {
      const payload = transformTaskForApi(taskData, true);
      const response = await updateTask(numericId, payload);
      return {
        ok: true,
        id: taskData.id || `TK-${numericId}`,
        message: response.message || "Task updated successfully",
        task: response.updatedTask ? transformTaskFromApi(response.updatedTask) : null,
      };
    } else {
      const payload = transformTaskForApi(taskData, false);
      const response = await createTask(payload);
      const savedTask = response.savedTask;
      const assignedCode = savedTask?.tsk_code || (savedTask?.tsk_id ? `TK-${savedTask.tsk_id}` : "");
      return {
        ok: true,
        id: assignedCode,
        message: response.message || "Task created successfully",
        task: savedTask ? transformTaskFromApi(savedTask) : null,
      };
    }
  },
  setStatus: async (taskId, status) => {
    const numericId = Number(String(taskId).replace(/^TK-/, ""));
    const rawStatus = UI_TO_API_TASK_STATUS[status] || (status ? status.toLowerCase().replace(/\s+/g, "_") : "to_do");
    const response = await updateTaskStatus(numericId, rawStatus);
    return {
      ok: true,
      message: response.message || "Task status updated successfully",
      status: status,
      task: response.task ? transformTaskFromApi(response.task) : null,
    };
  },
  delTask: async (taskId) => {
    const found = (appStore.database.tasks || []).find(t => t.id === taskId || t.code === taskId || t.numericId === Number(taskId));
    const param = found?.numericId || taskId;
    const response = await deleteTask(param);
    return {
      ok: true,
      message: response.message || "Task deleted successfully",
      recycleBinId: response.recycle_bin_id,
    };
  },
  subtask: async (payload) => {
    if (payload.op === "add") {
      const taskObj = (appStore.database?.tasks || []).find(
        t => t.id === payload.task || String(t.rawId) === String(payload.task)
      );
      const targetId = taskObj?.rawId || taskObj?.tsk_id || payload.task;
      const res = await addSubtaskChecklist(targetId, payload.title);
      return { ok: true, subtask: res.subtask || res };
    }
    if (payload.op === "toggle") {
      const res = await toggleSubtaskChecklist(payload.subId);
      return { ok: true, done: res.stk_done };
    }
    if (payload.op === "delete") {
      const res = await deleteSubtask(payload.subId);
      return { ok: true, ...res };
    }
    return { ok: true };
  },
  comment: async (taskId, commentBody, mentions = []) => {
    const numericTaskId = Number(String(taskId).replace(/^TK-/, ""));
    const res = await addTaskComment(numericTaskId, commentBody, mentions);
    return { ok: true, ...res };
  },
  delFile: async (attachmentId, taskId) => {
    const res = await deleteTaskAttachment(attachmentId);
    return { ok: true, ...res };
  },
  chatMentions: async () => {
    return await fetchChatMentions();
  },

  // User Profile & Avatars
  setAvatar: async (avatarPayload) => {
    const res = await uploadUserAvatar(avatarPayload);
    const newAvatarUrl = res?.avatar || avatarPayload?.data || "";
    if (appStore.currentUser) {
      appStore.currentUser.avatar = newAvatarUrl;
    }
    if (Array.isArray(appStore.database?.users) && appStore.currentUser?.id) {
      const u = appStore.database.users.find((user) => Number(user.id) === Number(appStore.currentUser.id));
      if (u) {
        u.avatar = newAvatarUrl;
      }
    }
    return { ok: true, avatar: newAvatarUrl, ...res };
  },
  removeAvatar: async () => {
    const res = await deleteUserAvatar();
    if (appStore.currentUser) {
      appStore.currentUser.avatar = "";
    }
    if (Array.isArray(appStore.database?.users) && appStore.currentUser?.id) {
      const u = appStore.database.users.find((user) => Number(user.id) === Number(appStore.currentUser.id));
      if (u) {
        u.avatar = "";
      }
    }
    return { ok: true, avatar: null, ...res };
  },

  // Push Configuration & Web Notifications
  pushConfig: async () => {
    const userId = appStore.currentUser?.id;
    const isDeviceSubscribed = Boolean(
      userId &&
      localStorage.getItem(`crm_push_device_${userId}`) === "1"
    );
    return {
      ok: true,
      ready: true,
      publicKey: "",
      devices: isDeviceSubscribed ? 1 : 0,
      reason: "",
    };
  },
  pushSubscribe: async (payload) => {
    const userId = appStore.currentUser?.id;
    if (userId) {
      localStorage.setItem(`crm_push_device_${userId}`, "1");
    }
    return { ok: true, devices: 1 };
  },
  pushUnsubscribe: async (endpoint) => {
    const userId = appStore.currentUser?.id;
    if (userId) {
      localStorage.removeItem(`crm_push_device_${userId}`);
    }
    return { ok: true, devices: 0 };
  },
  pushTest: async () => {
    return {
      ok: true,
      sent: 1,
      devices: 1,
      local: {
        title: "10X Agency CRM",
        body: "Notifications are working on this device.",
      },
    };
  },

  // Workload & Projects (Phase 6 Live Integration)
  workload: async (userId) => {
    const user = appStore.currentUser || {};
    const db = appStore.database || { users: [], tasks: [] };
    const users = db.users || [];
    const tasks = db.tasks || [];
    const todayStr = new Date().toISOString().slice(0, 10);
    const soonDate = new Date();
    soonDate.setDate(soonDate.getDate() + 7);
    const soonStr = soonDate.toISOString().slice(0, 10);

    const targetUsers = userId
      ? users.filter(u => u.id === Number(userId))
      : users;

    const people = targetUsers.map(u => {
      const uId = u.id;
      const uTasks = tasks.filter(t => (t.assigneeIds || []).includes(uId) && t.status !== "Cancelled");
      const open = uTasks.filter(t => t.status !== "Completed" && t.status !== "Cancelled");
      return {
        id: u.id,
        name: u.name,
        designation: u.designation || u.role,
        role: u.role,
        assigned: uTasks.length,
        pending: uTasks.filter(t => t.status === "To Do").length,
        inProgress: uTasks.filter(t => t.status === "In Progress").length,
        waiting: uTasks.filter(t => t.status === "On Hold" || t.status === "Review").length,
        completed: uTasks.filter(t => t.status === "Completed").length,
        overdue: open.filter(t => t.due && t.due < todayStr).length,
        dueSoon: open.filter(t => t.due && t.due >= todayStr && t.due <= soonStr).length,
        upcoming: open.slice(0, 5).map(t => ({ id: t.id, title: t.title, status: t.status, priority: t.priority, due: t.due }))
      };
    }).sort((a, b) => a.id === user.id ? -1 : b.id === user.id ? 1 : a.name.localeCompare(b.name));

    return {
      ok: true,
      scope: user.role === "admin" ? "all" : (people.length > 1 ? "team" : "own"),
      people
    };
  },
  projectDetail: async (projectId) => {
    const numericId = Number(String(projectId).replace(/^P-/, ""));
    const response = await fetchProjectDetail(numericId);
    const rawProjectData = response.data || response;
    if (appStore.database) {
      const extractedDir = extractUserDirectoryFromPayloads({
        projects: [rawProjectData],
        tasks: Array.isArray(response.tasks) ? response.tasks : [],
      });
      appStore.database.userDirectory = mergeUserDirectoryEntries(
        appStore.database.userDirectory || [],
        extractedDir
      );
    }
    return {
      ok: true,
      project: transformProjectFromApi(rawProjectData),
      tasks: (response.tasks || []).map(transformTaskFromApi),
    };
  },
  saveProject: async (projectData) => {
    const rawId = projectData.id || projectData.numericId;
    const isUpdate = Boolean(rawId);
    const numericId = isUpdate ? Number(String(rawId).replace(/^P-/, "")) : null;
    const payload = transformProjectForApi(projectData);

    if (isUpdate && numericId) {
      const response = await updateProject(numericId, payload);
      return {
        ok: true,
        id: projectData.id || `P-${numericId}`,
        message: response.message || "Project updated successfully",
        project: response.project ? transformProjectFromApi(response.project) : null,
      };
    } else {
      const response = await createProject(payload);
      const saved = response.project || response;
      const assignedCode = saved.pro_code || (saved.pro_id ? `P-${saved.pro_id}` : "");
      return {
        ok: true,
        id: assignedCode,
        message: response.message || "Project created successfully",
        project: saved ? transformProjectFromApi(saved) : null,
      };
    }
  },
  delProject: async (projectId) => {
    const found = (appStore.database.projects || []).find(p => p.id === projectId || p.code === projectId || p.numericId === Number(projectId));
    const param = found?.numericId || projectId;
    const response = await deleteProject(param);
    return {
      ok: true,
      message: response.message || "Project deleted successfully",
      recycleBinId: response.recycle_bin_id,
    };
  },

  // People & Permissions (Phase 7 Live Integration)
  saveUser: async (userData) => {
    const rawId = userData.id || userData.numericId;
    const isUpdate = Boolean(rawId);
    const numericId = isUpdate ? Number(String(rawId)) : null;
    const payload = transformUserForApi(userData);

    if (isUpdate && numericId) {
      const response = await updateUser(numericId, payload);
      return {
        ok: true,
        id: numericId,
        created: false,
        passwordSet: Boolean(userData.password),
        user: response.user ? transformUserFromApi(response.user) : null,
      };
    } else {
      const response = await createUser(payload);
      const newUser = response.user;
      return {
        ok: true,
        id: newUser?.usr_id || response.id,
        created: true,
        passwordSet: Boolean(userData.password),
        user: newUser ? transformUserFromApi(newUser) : null,
      };
    }
  },
  saveAdmin: async (adminData) => {
    return await API.saveUser({ ...adminData, role: "admin", isSuperAdmin: Boolean(adminData.isSuperAdmin) });
  },
  setRole: async (userId, role) => {
    const numericId = Number(userId);
    const response = await updateUserRole(numericId, role);
    return {
      ok: true,
      message: response.message || "Role updated",
      role,
      user: response.user ? transformUserFromApi(response.user) : null,
    };
  },
  delUser: async (userId, force = false) => {
    const numericId = Number(userId);
    const response = await deleteUser(numericId, force);
    return {
      ok: true,
      message: response.message || "User moved to recycle bin",
      recycled: true,
      recycleBinId: response.recycle_bin_id,
    };
  },
  userView: async (memberId) => {
    const numericId = Number(memberId);
    return await fetchMemberView(numericId);
  },
  permissions: async () => {
    const token = getAuthToken();
    if (token) {
      try {
        const response = await fetchPermissionsMatrix();
        return response;
      } catch (err) {
        console.warn("Live permissions matrix fetch failed:", err);
      }
    }
    return await request("permissions");
  },
  savePermissions: async (userId, perms) => {
    const numericId = Number(userId);
    const validSlugs = [
      "dashboard", "my_tasks", "assigned_by_me", "task_board", "calendar",
      "all_tasks", "team_tasks", "members", "projects", "sales_pipeline",
      "reports", "password_reset_request", "audit_log", "recycle_bin",
      "notifications", "settings"
    ];
    const moduleMap = {};
    validSlugs.forEach((slug) => {
      moduleMap[slug] = { module_slug: slug, can_view: false, can_add: false, can_edit: false, can_delete: false };
    });

    if (Array.isArray(perms)) {
      perms.forEach((item) => {
        if (typeof item === "string") {
          const [slug, act] = item.split(".");
          if (moduleMap[slug]) {
            if (act === "view") moduleMap[slug].can_view = true;
            if (act === "add") moduleMap[slug].can_add = true;
            if (act === "edit" || act === "update") moduleMap[slug].can_edit = true;
            if (act === "delete") moduleMap[slug].can_delete = true;
          }
        } else if (item && typeof item === "object" && item.module_slug) {
          moduleMap[item.module_slug] = item;
        }
      });
    }

    const formattedList = Object.values(moduleMap);
    return await saveUserPermissions(numericId, formattedList);
  },
  setSuper: async (userId, isSuperAdmin) => {
    const numericId = Number(userId);
    const response = await setUserSuperAdmin(numericId, isSuperAdmin);
    return {
      ok: true,
      message: response.message || "Super Admin updated",
      isSuperAdmin: Boolean(isSuperAdmin),
    };
  },

  // Deals (Phase 8 Live Integration)
  saveDeal: async (dealData) => {
    const rawId = dealData.id || dealData.numericId;
    const isUpdate = Boolean(rawId);
    const numericId = isUpdate ? Number(String(rawId).replace(/^D-/, "")) : null;
    const payload = transformDealForApi(dealData);

    if (isUpdate && numericId) {
      const response = await updateDeal(numericId, payload);
      return {
        ok: true,
        id: dealData.id || `D-${numericId}`,
        message: response.message || "Deal updated successfully",
        deal: response.deal ? transformDealFromApi(response.deal) : null,
      };
    } else {
      const response = await createDeal(payload);
      const savedId = response.deal_id || response.id;
      return {
        ok: true,
        id: `D-${savedId}`,
        numericId: savedId,
        message: response.message || "Deal created successfully",
      };
    }
  },
  delDeal: async (dealId) => {
    const found = (appStore.database.deals || []).find(d => d.id === dealId || d.code === dealId || d.numericId === Number(dealId));
    const param = found?.numericId || dealId;
    const response = await deleteDeal(param);
    return {
      ok: true,
      message: response.message || "Deal deleted successfully",
      recycleBinId: response.recycle_bin_id,
    };
  },
  dealDetail: async (dealId) => {
    const numericId = Number(String(dealId).replace(/^D-/, ""));
    const response = await fetchDealDetail(numericId);
    return {
      ok: true,
      deal: transformDealFromApi(response.deal || response),
    };
  },

  // Global Search
  search: (query) => API.call("search", { q: query }),

  // Admin Logs & Recycle Bin (Phase 10 Live Integration)
  auditLog: async (filters = {}) => {
    const token = getAuthToken();
    if (token) {
      const queryParams = {
        page: filters.page || 1,
        module: filters.module || undefined,
        action: filters.actionType || filters.action || undefined,
        user_id: filters.user ? Number(filters.user) : undefined,
        from: filters.from || undefined,
        to: filters.to || undefined,
        q: filters.q || undefined,
      };
      const response = await fetchAuditLogs(queryParams);
      const dataRows = Array.isArray(response.data) ? response.data : (Array.isArray(response) ? response : []);
      const total = Number(response.total) || dataRows.length;
      const page = Number(response.current_page) || Number(filters.page) || 1;
      const perPage = Number(response.per_page) || 20;
      const pages = Number(response.last_page) || Math.max(1, Math.ceil(total / perPage));

      const rows = dataRows.map((row) => ({
        id: row.alg_id,
        user_id: row.alg_usr_id,
        user_name: row.alg_actor_name || "User",
        user_email: row.alg_actor_email || "",
        user_role: row.alg_actor_role || "",
        user_designation: "",
        action: row.alg_action,
        action_type: row.alg_action,
        module: row.alg_module,
        record_id: row.alg_record_id,
        record: row.alg_record_id,
        old_value: row.alg_old_values,
        new_value: row.alg_new_values,
        ip_address: row.alg_ip_address || "",
        description: row.alg_description || "",
        text: row.alg_description || "",
        at: row.alg_updated_on || row.alg_created_on || "",
      }));

      const distinctModules = Array.from(new Set(rows.map((r) => r.module).filter(Boolean))).sort();
      const distinctActions = Array.from(new Set(rows.map((r) => r.action).filter(Boolean))).sort();
      const peopleMap = new Map();
      (appStore.database?.users || []).forEach((u) => {
        if (u?.id) peopleMap.set(Number(u.id), { id: Number(u.id), name: u.name });
      });
      rows.forEach((r) => {
        if (r.user_id && !peopleMap.has(Number(r.user_id))) {
          peopleMap.set(Number(r.user_id), { id: Number(r.user_id), name: r.user_name });
        }
      });

      return {
        ok: true,
        total,
        page,
        pages,
        perPage,
        scope: "all",
        keepDays: 40,
        modules: distinctModules.length > 0 ? distinctModules : ["task", "project", "user", "deals", "auth", "security"],
        actions: distinctActions.length > 0 ? distinctActions : ["create", "update", "delete", "login", "password_reset"],
        designations: [],
        people: Array.from(peopleMap.values()),
        rows,
      };
    }
    return await request("auditLog", filters);
  },
  recycleList: async (filters = {}) => {
    const token = getAuthToken();
    if (token) {
      try {
        const response = await fetchRecycleBin(filters);
        const rawItems = response.recycled_items || [];
        const rows = rawItems.map((row) => ({
          id: row.id,
          label: row.item?.name || row.label || "Item",
          module: row.item?.type || row.module,
          deleted_by_name: row.deleted_by?.name || row.deleted_by_name || "User",
          deleted_at: row.deleted_at,
          restore_status: row.status?.value || row.restore_status || "deleted",
          purge_at: row.timestamps?.purge_at || row.purge_at,
          restored_at: row.timestamps?.restored_at || row.restored_at,
          restored_by: row.details?.restored_by || row.restored_by || "",
          purged_at: row.timestamps?.purged_at || row.purged_at,
          purged_by: row.details?.purged_by || row.purged_by || "",
          file_count: Number(row.item?.file_count || row.file_count) || 0,
          deletion_reason: row.details?.deletion_reason || row.deletion_reason || "",
          purge_error: row.details?.purge_error || row.purge_error || "",
        }));

        return {
          ok: true,
          days: response.meta?.retention_days || 30,
          canPurge: Boolean(response.meta?.can_purge),
          rows,
          items: rows,
          meta: response.meta,
        };
      } catch (err) {
        console.warn("Live recycle bin fetch failed:", err);
      }
    }
    return await request("recycleList", filters);
  },
  recycleRestore: async (itemId) => {
    const response = await restoreRecycleItem(itemId);
    return {
      ok: true,
      message: response.message || "Item restored successfully",
    };
  },
  recyclePurge: async (itemId) => {
    const response = await purgeRecycleItem(itemId);
    return {
      ok: true,
      message: response.message || "Item permanently deleted",
    };
  },

  // Password Reset Administration (Phase 10 Live Integration)
  pwResets: async () => {
    const token = getAuthToken();
    if (token) {
      try {
        const response = await fetchPasswordResets();
        return {
          ok: true,
          pending: (response.pending || []).map(transformPasswordResetRequestFromApi),
          history: (response.history || []).map(transformPasswordResetRequestFromApi),
          reminderMinutes: response.reminderMinutes || 15,
        };
      } catch (err) {
        console.warn("Live pwResets fetch failed:", err);
      }
    }
    return await request("pwResets");
  },
  pwPending: async () => {
    const token = getAuthToken();
    if (token) {
      try {
        const response = await fetchPasswordResets();
        return {
          ok: true,
          pending: (response.pending || []).map(transformPasswordResetRequestFromApi),
        };
      } catch (err) {
        console.warn("Live pwPending fetch failed:", err);
      }
    }
    return await request("pwPending");
  },
  pwResetOpen: async (requestId) => {
    const numericId = Number(String(requestId).replace(/^PR-/, ""));
    const response = await openPasswordReset(numericId);
    return {
      ok: true,
      request: transformPasswordResetRequestFromApi(response.password_reset_request || response),
    };
  },
  pwResetComplete: async (requestId, mode, temporaryPassword) => {
    const numericId = Number(String(requestId).replace(/^PR-/, ""));
    const response = await completePasswordReset(numericId, mode, temporaryPassword);
    const resetData = response.password_reset_data || response;
    const resolvedPassword = resetData.temporary_password || temporaryPassword || "";
    return {
      ok: true,
      message: response.message || "Password reset completed",
      data: resetData,
      tempPassword: resolvedPassword,
      name: resetData.user_name || resetData.name || "",
      email: resetData.email || "",
    };
  },
  pwResetReject: async (requestId, rejectionNote) => {
    const numericId = Number(String(requestId).replace(/^PR-/, ""));
    const response = await rejectPasswordReset(numericId, rejectionNote);
    return {
      ok: true,
      message: response.message || "Password reset request rejected",
    };
  },

  // Dashboard Real API
  dashboard: async () => {
    const token = getAuthToken();
    if (token) {
      if (!canViewModule("dashboard")) {
        return null;
      }
      try {
        return await fetchDashboardData();
      } catch (err) {
        console.warn("Live dashboard fetch failed:", err);
      }
    }
    return null;
  },

  // Analytical Reports (Phase 9 Live Integration)
  reports: async () => {
    const token = getAuthToken();
    if (token) {
      if (!canViewModule("reports")) {
        return null;
      }
      try {
        return await fetchReportsData();
      } catch (err) {
        console.warn("Live reports fetch failed:", err);
      }
    }
    return await request("reports");
  },

  // Real-time Notifications & Push (Phase 11 Live Integration)
  notifPoll: async (afterId = 0) => {
    const token = getAuthToken();
    if (token) {
      try {
        const response = await fetchNotificationsPoll();
        const rawNotifs = Array.isArray(response?.notifications) ? response.notifications : [];
        const items = rawNotifs.map(transformNotificationFromApi);
        return {
          ok: true,
          items,
          unread: Number(response?.unread_count) || 0,
        };
      } catch (err) {
        console.warn("Live notifications poll failed:", err);
      }
    }
    return await request("notifPoll", { after: afterId }, { background: true });
  },
  notifRead: async (notificationId) => {
    const token = getAuthToken();
    if (token) {
      try {
        if (notificationId) {
          const numericId = Number(notificationId);
          const res = await markNotificationRead(numericId);
          if (Array.isArray(appStore.database?.notifications)) {
            const notif = appStore.database.notifications.find((n) => Number(n.id) === numericId);
            if (notif) {
              notif.read = 1;
              notif.isRead = true;
            }
          }
          return { ok: true, ...res };
        } else {
          const res = await markAllNotificationsRead();
          if (Array.isArray(appStore.database?.notifications)) {
            appStore.database.notifications.forEach((n) => {
              n.read = 1;
              n.isRead = true;
            });
          }
          if (appStore.database) {
            appStore.database.unread = 0;
          }
          return { ok: true, ...res };
        }
      } catch (err) {
        console.warn("Live mark notification read failed:", err);
      }
    }
    return await request("notifRead", notificationId ? { id: notificationId } : {});
  }
};

/**
 * Marks active session authenticated state.
 */
export function sessionSet() {
  API.authed = true;
}

/**
 * Clears authenticated state.
 */
export function sessionClear() {
  API.authed = false;
  clearAuthToken();
  localStorage.removeItem("10x_crm_session");
  const userId = appStore.currentUser?.id;
  if (userId) {
    localStorage.removeItem(`crm_push_device_${userId}`);
  }
}

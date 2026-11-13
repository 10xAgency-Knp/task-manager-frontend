/**
 * Domain Helpers, Formatters, Validators and Authorization Checks
 *
 * Provides central constants, lookup functions, formatting, and client-side
 * permission helpers for the 10X CRM application.
 */
import { appStore } from "../store/appStore.js";
import { CONFIG } from "../services/api.js";

/* ==========================================================================
   CONSTANTS & CONFIGURATION
   ========================================================================== */

export const STATUSES = ["To Do", "In Progress", "On Hold", "Review", "Completed", "Cancelled"];
export const BOARD_COLS = STATUSES;
export const PRIORITIES = ["Low", "Medium", "High", "Urgent"];
export const PROJECT_STATUSES = ["Planning", "In Progress", "At Risk", "Completed", "On Hold"];
export const DEAL_STAGES = ["Discovery", "Qualified", "Proposal", "Negotiation", "Won", "Lost"];

export const TASK_STATUS_BADGE_CLASSES = {
  "To Do": "b-grey",
  "In Progress": "b-navy",
  "On Hold": "b-amber",
  "Review": "b-violet",
  "Completed": "b-green",
  "Cancelled": "b-red"
};

export const PROJECT_STATUS_BADGE_CLASSES = {
  "Planning": "b-grey",
  "In Progress": "b-navy",
  "At Risk": "b-red",
  "Completed": "b-green",
  "On Hold": "b-amber"
};

export const DEAL_STAGE_BADGE_CLASSES = {
  "Discovery": "b-grey",
  "Qualified": "b-cyan",
  "Proposal": "b-navy",
  "Negotiation": "b-violet",
  "Won": "b-green",
  "Lost": "b-red"
};

export const PRIORITY_BADGE_CLASSES = {
  Low: "b-cyan",
  Medium: "b-green",
  High: "b-amber",
  Urgent: "b-red"
};

export const PRIORITY_SORT_WEIGHTS = {
  Urgent: 0,
  High: 1,
  Medium: 2,
  Low: 3
};

export const STATUS_HEX_COLORS = {
  "To Do": "#8894ac",
  "In Progress": "#0b3d91",
  "On Hold": "#e0a13a",
  "Review": "#7a5af8",
  "Completed": "#5aa236",
  "Cancelled": "#d94b4b"
};

export const AVATAR_BACKGROUND_PALETTE = [
  "#0b3d91",
  "#5aa236",
  "#e0a13a",
  "#d94b4b",
  "#7a5af8",
  "#2e75b6",
  "#c2410c",
  "#0369a1"
];

export const CATEGORY_CUSTOM_OPT = "Custom/ remark";
export const DESCRIPTION_MIN_LENGTH = 3;
export const DESCRIPTION_MAX_LENGTH = 3000;

/* ==========================================================================
   FORMATTING & DATE UTILITIES
   ========================================================================== */

/**
 * Hashes a string into a deterministic numeric index within [0, moduloMax - 1].
 * Useful for picking avatar background colors based on a user's name.
 * @param {string} inputString
 * @param {number} moduloMax
 * @returns {number}
 */
export function hashStringToIndex(inputString, moduloMax) {
  let hash = 0;
  const str = String(inputString || "");
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash % moduloMax;
}

/**
 * Extracts uppercase initials from a person's name (e.g. "Aarav Patel" -> "AP").
 * @param {string} fullName
 * @returns {string}
 */
export function getUserInitials(fullName) {
  const parts = String(fullName || "?").trim().split(/\s+/);
  const firstChar = (parts[0] || "").charAt(0);
  const secondChar = (parts[1] || "").charAt(0);
  return (firstChar + secondChar).toUpperCase();
}

/**
 * Formats a Date object into a YYYY-MM-DD string.
 * @param {Date} date
 * @returns {string}
 */
export function formatDateToISO(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Returns today's date in YYYY-MM-DD format.
 * @returns {string}
 */
export function getTodayISO() {
  return formatDateToISO(new Date());
}

/**
 * Formats a date string (YYYY-MM-DD) into Indian English display format (e.g., "24 Oct 2026").
 * @param {string|Date} dateValue
 * @returns {string}
 */
export function formatDisplayDate(dateValue) {
  if (!dateValue) return "-";
  const dateObj = new Date(String(dateValue).slice(0, 10) + "T00:00:00");
  if (isNaN(dateObj.getTime())) return String(dateValue);
  return dateObj.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

/**
 * Formats a date string into short format without year (e.g., "24 Oct").
 * @param {string|Date} dateValue
 * @returns {string}
 */
export function formatShortDisplayDate(dateValue) {
  if (!dateValue) return "-";
  const dateObj = new Date(String(dateValue).slice(0, 10) + "T00:00:00");
  if (isNaN(dateObj.getTime())) return String(dateValue);
  return dateObj.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short"
  });
}

/**
 * Formats a date-time string into readable format (e.g., "24 Oct, 04:30 pm").
 * @param {string|Date} dateValue
 * @returns {string}
 */
export function formatDateTime(dateValue) {
  if (!dateValue) return "-";
  const dateObj = new Date(String(dateValue).replace(" ", "T"));
  if (isNaN(dateObj.getTime())) return String(dateValue);
  return dateObj.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}

/**
 * Checks whether a task is overdue relative to today.
 * Completed and Cancelled tasks are never considered overdue.
 * @param {{ status?: string, due?: string }} task
 * @returns {boolean}
 */
export function isTaskOverdue(task) {
  if (!task || !task.due) return false;
  if (task.status === "Completed" || task.status === "Cancelled") return false;
  return String(task.due).slice(0, 10) < getTodayISO();
}

/**
 * Checks whether a task is still active (not Completed and not Cancelled).
 * @param {{ status?: string }} task
 * @returns {boolean}
 */
export function isTaskOpen(task) {
  return task?.status !== "Completed" && task?.status !== "Cancelled";
}

/**
 * Formats a numeric currency value into Indian Rupee representation (e.g. "₹1,50,000").
 * @param {number|string} value
 * @returns {string}
 */
export function formatCurrencyINR(value) {
  const numericAmount = Number(String(value ?? "").replace(/[^0-9.-]/g, "")) || 0;
  return "₹" + numericAmount.toLocaleString("en-IN");
}

/**
 * Pluralizes a word given an item count (e.g. 1 "task" vs 2 "tasks").
 * @param {number} count
 * @param {string} singularNoun
 * @returns {string}
 */
export function pluralize(count, singularNoun) {
  return `${count} ${singularNoun}${count === 1 ? "" : "s"}`;
}

/**
 * Formats byte length into human-readable size string (KB / MB).
 * @param {number} bytes
 * @returns {string}
 */
export function formatByteSize(bytes) {
  const numBytes = Number(bytes) || 0;
  if (numBytes >= 1048576) {
    return (numBytes / 1048576).toFixed(2) + " MB";
  }
  return Math.max(1, Math.round(numBytes / 1024)) + " KB";
}

/**
 * Creates a debounced version of a function.
 * @param {Function} callback
 * @param {number} delayMilliseconds
 * @returns {Function}
 */
export function debounce(callback, delayMilliseconds) {
  let timerId;
  return (...args) => {
    clearTimeout(timerId);
    timerId = setTimeout(() => callback(...args), delayMilliseconds);
  };
}

/**
 * Sorts tasks with open tasks first, ordered by due date, then priority rank.
 * @param {Array<Object>} tasksList
 * @returns {Array<Object>}
 */
export function sortTasks(tasksList) {
  return tasksList.slice().sort((taskA, taskB) => {
    const isAClosed = isTaskOpen(taskA) ? 0 : 1;
    const isBClosed = isTaskOpen(taskB) ? 0 : 1;
    if (isAClosed !== isBClosed) return isAClosed - isBClosed;

    const dueA = taskA.due || "9999-12-31";
    const dueB = taskB.due || "9999-12-31";
    if (dueA !== dueB) return dueA < dueB ? -1 : 1;

    const rankA = PRIORITY_SORT_WEIGHTS[taskA.priority] ?? 9;
    const rankB = PRIORITY_SORT_WEIGHTS[taskB.priority] ?? 9;
    return rankA - rankB;
  });
}

/* ==========================================================================
   LOOKUPS & CACHE ACCESSORS
   ========================================================================== */

/**
 * Finds a user in the local database cache by their numeric ID.
 * @param {number|string} userId
 * @returns {Object|undefined}
 */
export function getUserById(userId) {
  const numericId = Number(userId);
  if (appStore.currentUser && Number(appStore.currentUser.id) === numericId) {
    return appStore.currentUser;
  }
  return (
    (appStore.database.users || []).find(user => Number(user.id) === numericId) ||
    (appStore.database.userDirectory || []).find(user => Number(user.id) === numericId)
  );
}

/**
 * Finds a user in the database cache by exact name.
 * @param {string} name
 * @returns {Object|undefined}
 */
export function getUserByName(name) {
  return (
    (appStore.database.users || []).find(user => user.name === name) ||
    (appStore.database.userDirectory || []).find(user => user.name === name)
  );
}

/**
 * Resolves a user input (object, numeric ID, or name string) into a user entity.
 * @param {Object|number|string} userReference
 * @returns {Object|null}
 */
export function resolveUserEntity(userReference) {
  if (userReference && typeof userReference === "object") return userReference;
  if (typeof userReference === "number" || (typeof userReference === "string" && /^\d+$/.test(userReference))) {
    return getUserById(userReference);
  }
  if (typeof userReference === "string") {
    return getUserByName(userReference);
  }
  return null;
}

/**
 * Returns a user's display name by their ID, or "-" if not found.
 * @param {number|string} userId
 * @returns {string}
 */
export function getUserNameById(userId) {
  const user = getUserById(userId);
  return user ? user.name : "-";
}

/**
 * Finds a project in the database cache by its ID.
 * @param {string} projectId
 * @returns {Object|undefined}
 */
export function getProjectById(projectId) {
  if (!projectId) return undefined;
  const list = appStore.database.projects || [];
  const strId = String(projectId).trim();

  // 1. Direct match by id or code
  let found = list.find(project => String(project.id) === strId || String(project.code) === strId);
  if (found) return found;

  // 2. Case-insensitive match
  const lowerId = strId.toLowerCase();
  found = list.find(project => String(project.id).toLowerCase() === lowerId || String(project.code).toLowerCase() === lowerId);
  if (found) return found;

  // 3. Numeric ID match or padded P-xx match (e.g. "P-1" <-> "P-01" or 1 <-> "P-01")
  const numMatch = strId.match(/\d+/);
  if (numMatch) {
    const num = parseInt(numMatch[0], 10);
    const padded = `P-${String(num).padStart(2, "0")}`;
    const unpadded = `P-${num}`;
    found = list.find(project => 
      Number(project.numericId) === num ||
      project.id === padded ||
      project.code === padded ||
      project.id === unpadded ||
      project.code === unpadded
    );
    if (found) return found;
  }

  return undefined;
}

/**
 * Returns a project's display name by its ID.
 * @param {string} projectId
 * @returns {string}
 */
export function getProjectNameById(projectId) {
  const project = getProjectById(projectId);
  return project ? project.name : (projectId || "-");
}

/**
 * Finds a task in the database cache by its ID (e.g. "TK-101").
 * @param {string} taskId
 * @returns {Object|undefined}
 */
export function getTaskById(taskId) {
  return (appStore.database.tasks || []).find(task => String(task.id) === String(taskId));
}

/**
 * Returns all active, unarchived users.
 * @returns {Array<Object>}
 */
export function getActiveUsers() {
  return (appStore.database.users || []).filter(user => !user.archived && user.status !== "Inactive");
}

/**
 * Returns all users visible in the current user's team plus the user themselves.
 * @returns {Array<Object>}
 */
export function getTeamUsers() {
  const currentUserId = appStore.currentUser?.id;
  return (appStore.database.users || []).filter(
    user => !user.archived && (user.inTeam || user.id === currentUserId)
  );
}

/**
 * Checks whether a given task is assigned to a specific user ID.
 * @param {Object} task
 * @param {number|string} userId
 * @returns {boolean}
 */
export function isTaskAssignedToUser(task, userId) {
  if (!task || !Array.isArray(task.assigneeIds)) return false;
  return task.assigneeIds.includes(Number(userId));
}

/**
 * Returns all tasks assigned to the currently authenticated user.
 * @returns {Array<Object>}
 */
export function getMyTasks() {
  const currentUserId = appStore.currentUser?.id;
  return (appStore.database.tasks || []).filter(task => isTaskAssignedToUser(task, currentUserId));
}

/**
 * Checks whether a task is assigned to or created by the current user.
 * @param {Object} task
 * @returns {boolean}
 */
export function isTaskRelatedToCurrentUser(task) {
  const currentUserId = appStore.currentUser?.id;
  return isTaskAssignedToUser(task, currentUserId) || task.createdById === currentUserId;
}

/**
 * Checks whether the current user is allowed to view another user's profile card.
 * @param {Object} user
 * @returns {boolean}
 */
export function canViewUser(user) {
  if (!user || user.archived) return false;
  return Boolean(user.inTeam || (appStore.currentUser && user.id === appStore.currentUser.id));
}

/**
 * Retrieves field validation character limits defined in settings.
 * @param {string} fieldKey
 * @param {number} [index=0] - 0 for min, 1 for max
 * @returns {number|Array<number>}
 */
export function getFieldValidationLimit(fieldKey, index = 0) {
  const databaseLimits = appStore.database.limits || {};
  const defaultLimits = {
    task_title: [3, 200],
    checklist: [1, 200],
    tag: [1, 30],
    comment: [1, 4000]
  };
  const limitValue = databaseLimits[fieldKey] ?? defaultLimits[fieldKey];
  return Array.isArray(limitValue) ? limitValue[index] : limitValue;
}

/**
 * Returns an array of user IDs representing everyone reporting directly or indirectly to `userId`.
 * @param {number|string} userId
 * @returns {Array<number>}
 */
export function getReportingUserIds(userId) {
  const reportingUserIds = [];
  const queue = [Number(userId)];
  const visited = {};

  while (queue.length > 0) {
    const currentSupervisorId = queue.shift();
    (appStore.database.users || []).forEach(candidateUser => {
      if (candidateUser.reportsTo === currentSupervisorId && !visited[candidateUser.id]) {
        visited[candidateUser.id] = true;
        reportingUserIds.push(candidateUser.id);
        queue.push(candidateUser.id);
      }
    });
  }
  return reportingUserIds;
}

/**
 * Returns numeric hierarchical rank for a user (Super Admin=4, Admin=3, Manager=2, Employee=1).
 * @param {Object} user
 * @returns {number}
 */
export function getUserRoleRank(user) {
  if (!user) return 0;
  if (user.superAdmin) return 4;
  const roleRanks = { Admin: 3, Manager: 2, Employee: 1 };
  return roleRanks[user.role] ?? 1;
}

/**
 * Filters tasks according to the active scope ("team" vs "mine").
 * @returns {Array<Object>}
 */
export function getTasksByCurrentScope() {
  if (appStore.taskFilters.scope === "team" && hasTeamView()) {
    return appStore.database.tasks;
  }
  return appStore.database.tasks.filter(isTaskRelatedToCurrentUser);
}

/**
 * Returns role capacity limits (e.g. maximum Admins or Managers allowed).
 * @returns {{ Admin: { used: number, max: number }, Manager: { used: number, max: number } }}
 */
export function getRoleCapacityLimits() {
  const databaseRoleLimits = appStore.database.roleLimits || {
    Admin: { max: 2 },
    Manager: { max: 5 }
  };
  const activeUsers = (appStore.database.users || []).filter(user => !user.archived);

  return {
    Admin: {
      used: activeUsers.filter(user => user.role === "Admin" && !user.superAdmin).length,
      max: databaseRoleLimits.Admin.max
    },
    Manager: {
      used: activeUsers.filter(user => user.role === "Manager").length,
      max: databaseRoleLimits.Manager.max
    }
  };
}

/**
 * Returns the list of standard project task categories.
 * @returns {Array<string>}
 */
export function getTaskCategories() {
  const categories = appStore.database.taskCategories;
  if (Array.isArray(categories) && categories.length > 0) {
    return categories;
  }
  return [
    "Web development",
    "SMM",
    "E commerce",
    "Video editing/ graphic",
    "Human resource",
    "SEO",
    "Custom/ remark"
  ];
}

/**
 * Returns aggregated task counts closed >90 days ago for a project.
 * @param {string} projectCode
 * @returns {Object}
 */
export function getArchivedProjectMetrics(projectCode) {
  const oldProjects = appStore.database.oldClosed?.projects;
  if (oldProjects && !Array.isArray(oldProjects) && oldProjects[projectCode]) {
    return oldProjects[projectCode];
  }
  return {};
}

/**
 * Returns aggregated task counts closed >90 days ago for a user.
 * @param {number|string} userId
 * @returns {Object}
 */
export function getArchivedUserMetrics(userId) {
  const oldUsers = appStore.database.oldClosed?.users;
  if (oldUsers && !Array.isArray(oldUsers) && oldUsers[userId]) {
    return oldUsers[userId];
  }
  return {};
}

/**
 * Computes live statistical metrics for a project.
 * @param {Object} project
 * @returns {Object}
 */
export function calculateProjectStatistics(project) {
  const projectTasks = (appStore.database.tasks || []).filter(task => task.project === project.id);
  const completedCount = projectTasks.filter(task => task.status === "Completed").length;
  const archivedMetrics = getArchivedProjectMetrics(project.id);
  const oldCompleted = archivedMetrics.Completed || 0;
  const oldCancelled = archivedMetrics.Cancelled || 0;

  return {
    tasks: projectTasks,
    total: projectTasks.length + oldCompleted + oldCancelled,
    done: completedCount + oldCompleted,
    open: projectTasks.filter(isTaskOpen).length,
    late: projectTasks.filter(isTaskOverdue).length,
    oldCompleted,
    oldCancelled
  };
}

/**
 * Computes workload statistics for a specific user ID.
 * @param {number|string} userId
 * @returns {Object}
 */
export function getUserWorkloadMetrics(userId) {
  const assignedTasks = (appStore.database.tasks || []).filter(task => isTaskAssignedToUser(task, userId));
  const archivedUserMetrics = getArchivedUserMetrics(userId);

  return {
    tasks: assignedTasks,
    open: assignedTasks.filter(isTaskOpen),
    done: assignedTasks.filter(task => task.status === "Completed"),
    oldDone: archivedUserMetrics.done || 0,
    oldProjects: archivedUserMetrics.projects || {},
    late: assignedTasks.filter(isTaskOverdue),
    hours: assignedTasks.reduce((sum, task) => sum + (Number(task.hours) || 0), 0) + (Number(archivedUserMetrics.hours) || 0)
  };
}

/* ==========================================================================
   PERMISSIONS & ACCESS CONTROL (Client-side button visibility)
   All critical operations are re-verified on the server.
   ========================================================================== */

export const isCurrentUserAdmin = () => Boolean(appStore.currentUser && (appStore.currentUser.role?.toLowerCase() === "admin" || appStore.currentUser.superAdmin || appStore.currentUser.isSuperAdmin));
export const isCurrentUserSuperAdmin = () => Boolean(appStore.currentUser && (appStore.currentUser.superAdmin || appStore.currentUser.isSuperAdmin));

export const canViewModule = (moduleSlug, user = appStore.currentUser) => {
  if (!user) return false;
  if (user.isSuperAdmin || user.superAdmin) return true;

  // Check structured modulePermissions object
  if (user.modulePermissions && user.modulePermissions[moduleSlug] !== undefined) {
    return Boolean(user.modulePermissions[moduleSlug].can_view);
  }

  // Check in perms array
  const perms = user.perms || user.permissions || [];
  if (perms.includes(`${moduleSlug}.view`) || perms.includes(`${moduleSlug}.edit`)) {
    return true;
  }

  // Check legacy aliases
  if (moduleSlug === "projects" && (perms.includes("projects.edit") || perms.includes("projects.update") || perms.includes("projects.view"))) return true;
  if (moduleSlug === "sales_pipeline" && perms.includes("deals.view")) return true;
  if (moduleSlug === "reports" && perms.includes("view_reports")) return true;
  if (moduleSlug === "members" && (perms.includes("users.edit") || perms.includes("members.view") || user.hasTeam || user.role === "Admin" || user.role === "Manager")) return true;
  if (moduleSlug === "audit_log" && (perms.includes("activity.all") || perms.includes("activity.team") || perms.includes("activity.own") || perms.includes("audit_log.view"))) return true;
  if (moduleSlug === "recycle_bin" && (perms.includes("recycle_restore") || perms.includes("recycle_bin.view"))) return true;
  if (moduleSlug === "my_tasks" && (perms.includes("tasks.edit") || perms.includes("tasks.update") || perms.includes("my_tasks.view"))) return true;

  return false;
};

export const hasPermission = (permissionKey) => {
  const user = appStore.currentUser;
  if (!user) return false;
  if (isCurrentUserSuperAdmin()) return true;
  const perms = user.perms || [];
  if (perms.includes(permissionKey)) return true;
  // Edit permission manages and allows update permission
  if (typeof permissionKey === "string" && permissionKey.endsWith(".update")) {
    const editKey = permissionKey.replace(/\.update$/, ".edit");
    if (perms.includes(editKey)) return true;
  }
  return false;
};

export const hasTeamView = () => {
  const user = appStore.currentUser;
  if (!user) return false;
  return isCurrentUserAdmin() || Boolean(user.seesAllTasks) || Boolean(user.hasTeam);
};

export const can = {
  createTask: () => hasPermission("tasks.add") || hasPermission("my_tasks.add") || hasPermission("tasks.edit"),
  assignOther: () => (appStore.database.assignable || []).length > 1 || Boolean(appStore.currentUser?.seesAllTasks),
  manageTask: task => Boolean(task?.can?.manage ?? (isCurrentUserAdmin() || isCurrentUserSuperAdmin())),
  editTask: task => Boolean(task?.can?.edit ?? (hasPermission("tasks.edit") && (isCurrentUserAdmin() || isCurrentUserSuperAdmin() || isTaskAssignedToUser(task, appStore.currentUser?.id) || isTaskRelatedToCurrentUser(task)))),
  updateTask: task => Boolean((task?.can && (task.can.update !== undefined ? task.can.update : task.can.edit)) ?? (hasPermission("tasks.update") && (isCurrentUserAdmin() || isCurrentUserSuperAdmin() || isTaskAssignedToUser(task, appStore.currentUser?.id) || isTaskRelatedToCurrentUser(task)))),
  deleteTask: task => Boolean(task?.can?.delete ?? (hasPermission("tasks.delete") && (isCurrentUserAdmin() || isCurrentUserSuperAdmin() || (task && Number(task.createdById || task.assignedByUserId) === Number(appStore.currentUser?.id))))),
  addTag: () => hasPermission("tags.edit"),
  removeTag: () => hasPermission("tags.delete"),
  projects: () => hasPermission("projects.add"),
  deals: () => hasPermission("deals.view"),
  createDeal: () => hasPermission("deals.view") && (hasPermission("deals.add") || hasPermission("sales_pipeline.add")),
  editDeal: () => hasPermission("deals.view") && hasPermission("deals.update"),
  deleteDeal: () => hasPermission("deals.view") && hasPermission("deals.delete"),
  reports: () => hasPermission("view_reports"),
  users: () => hasPermission("users.add") || hasPermission("members.add"),
  updateUser: () => hasPermission("users.update"),
  deleteUser: targetUser => {
    if (!targetUser || !hasPermission("users.delete") || targetUser.id === appStore.currentUser?.id) {
      return false;
    }
    return isCurrentUserAdmin() || (targetUser.inTeam && targetUser.role === "Employee");
  },
  editUser: targetUser => {
    if (!targetUser || targetUser.archived || !hasPermission("users.edit")) {
      return false;
    }
    return isCurrentUserAdmin() || (targetUser.id !== appStore.currentUser?.id && targetUser.inTeam && targetUser.role === "Employee");
  },
  files: () => hasPermission("files.view"),
  removeFile: (file, task) => {
    if (hasPermission("files.delete")) return true;
    if (!hasPermission("files.edit")) return false;
    if (!file || file.byId !== appStore.currentUser?.id) return false;
    if (can.manageTask(task)) return true;

    const allowedHours = Number(CONFIG.OWN_FILE_DELETE_HOURS) || 24;
    const uploadTimestamp = file.at ? new Date(String(file.at).replace(" ", "T")).getTime() : 0;
    const isWithinHours = uploadTimestamp > 0 && (Date.now() - uploadTimestamp) <= allowedHours * 3600000;
    return isWithinHours && Boolean(task && task.status !== "Completed" && task.status !== "Cancelled");
  },
  recycle: () => hasPermission("recycle_restore"),
  audit: () => hasPermission("activity.own") || hasPermission("activity.team") || hasPermission("activity.all"),
  workload: () => hasPermission("workload.own") || hasPermission("workload.team") || hasPermission("workload.all"),
  permissions: () => isCurrentUserSuperAdmin() || (isCurrentUserAdmin() && hasPermission("permissions.manage"))
};

export const canPerform = can;

/**
 * Checks whether the current user may modify a task's status.
 * Only Super Admin can reopen or cancel tasks.
 * @param {Object} task
 * @returns {boolean}
 */
export function canChangeTaskStatus(task) {
  return isCurrentUserSuperAdmin() || !task || task.status !== "Cancelled";
}

/**
 * Returns allowed status choices based on current status and user privileges.
 * @param {string} currentStatus
 * @returns {Array<string>}
 */
export function getAvailableStatusChoices(currentStatus) {
  return STATUSES.filter(status => status !== "Cancelled" || isCurrentUserSuperAdmin() || currentStatus === "Cancelled");
}

/* ==========================================================================
   INPUT VALIDATION RULES (Mirrors backend validation rules)
   ========================================================================== */

/**
 * Validates password complexity requirements: min 10 chars, uppercase, lowercase, number.
 * @param {string} password
 * @returns {string|null} Error message or null if valid
 */
export function validatePasswordStrength(password) {
  if (!password || password.length < 10) return "Password must be at least 10 characters.";
  if (!/[A-Z]/.test(password)) return "Password needs at least one capital letter.";
  if (!/[a-z]/.test(password)) return "Password needs at least one small letter.";
  if (!/[0-9]/.test(password)) return "Password needs at least one number.";
  return null;
}

/**
 * Validates Indian 10-digit mobile number starting with 6, 7, 8, or 9.
 * @param {string} phoneNumber
 * @returns {string} Error message or empty string if valid
 */
export function validatePhoneNumber(phoneNumber) {
  const cleanPhone = String(phoneNumber || "");
  if (!cleanPhone) return "";
  if (!/^[0-9]+$/.test(cleanPhone)) return "Phone number can contain digits only (no spaces, letters or +91).";
  if (cleanPhone.length !== 10) return "Phone number must be exactly 10 digits.";
  if (!/^[6-9]/.test(cleanPhone)) return "Please enter a valid Indian mobile number (it starts with 6, 7, 8 or 9).";
  return "";
}

/**
 * Validates email format and whitelist domain restrictions.
 * @param {string} email
 * @returns {string} Error message or empty string if valid
 */
export function validateEmailAddress(email) {
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) || /\.\./.test(cleanEmail)) {
    return "Please enter a valid email address.";
  }
  const emailDomain = cleanEmail.slice(cleanEmail.lastIndexOf("@") + 1);
  const allowedDomains = (appStore.database.emailDomains && appStore.database.emailDomains.length)
    ? appStore.database.emailDomains
    : ["gmail.com", "10xagency.in", "10xagency.co.in", "the10xagency.in", "fivermail.com"];

  if (!allowedDomains.includes(emailDomain)) {
    return "Only these email domains are allowed: " + allowedDomains.map(d => "@" + d).join(", ") + ".";
  }
  return "";
}

/**
 * Validates generic text field constraints (presence, min length, max length).
 * @param {string} value
 * @param {{ label?: string, required?: boolean, select?: boolean, min?: number, max?: number }} options
 * @returns {string}
 */
export function validateTextField(value, options = {}) {
  const textValue = String(value ?? "").trim();
  const fieldLabel = options.label || "This field";

  if (options.required && !textValue) {
    return (options.select ? "Please choose " : "Please enter ") + fieldLabel.toLowerCase() + ".";
  }
  if (textValue && options.min && textValue.length < options.min) {
    return `${fieldLabel} must be at least ${options.min} characters (now ${textValue.length}).`;
  }
  if (options.max && String(value || "").length > options.max) {
    return `${fieldLabel} can be at most ${options.max} characters.`;
  }
  return "";
}

/**
 * Validates numeric fields (presence, range).
 * @param {number|string} value
 * @param {{ label?: string, required?: boolean, min?: number, max?: number }} options
 * @returns {string}
 */
export function validateNumericField(value, options = {}) {
  const textValue = String(value ?? "").trim();
  const fieldLabel = options.label || "This field";

  if (textValue === "") {
    return options.required ? `${fieldLabel} is required.` : "";
  }
  const numericValue = Number(textValue);
  if (!isFinite(numericValue)) return `${fieldLabel} must be a number.`;
  if (options.min !== undefined && numericValue < options.min) {
    return `${fieldLabel} cannot be less than ${options.min}.`;
  }
  if (options.max !== undefined && numericValue > options.max) {
    return `${fieldLabel} cannot be more than ${options.max}.`;
  }
  return "";
}

/**
 * Measures character count safely handling multi-byte characters and emoji.
 * @param {string} text
 * @returns {number}
 */
export function getDescriptionCharacterLength(text) {
  return Array.from(String(text || "").trim()).length;
}

/**
 * Validates description fields against minimum and maximum length bounds.
 * @param {string} text
 * @returns {string}
 */
export function validateDescriptionField(text) {
  const charLength = getDescriptionCharacterLength(text);
  if (charLength === 0) return "Description is required.";
  if (charLength < DESCRIPTION_MIN_LENGTH) {
    return `Description must be at least ${DESCRIPTION_MIN_LENGTH} characters.`;
  }
  if (charLength > DESCRIPTION_MAX_LENGTH) {
    return `Description can be at most ${DESCRIPTION_MAX_LENGTH.toLocaleString("en-IN")} characters (now ${charLength.toLocaleString("en-IN")}).`;
  }
  return "";
}

/**
 * Generates a high-entropy temporary password adhering to complexity requirements.
 * @returns {string}
 */
export function suggestSecurePassword() {
  const uppercaseLetters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lowercaseLetters = "abcdefghijkmnpqrstuvwxyz";
  const numbers = "23456789";
  const symbols = "@#$%&*!?";

  const pickRandomCharacter = (charset) => {
    const randomArray = new Uint32Array(1);
    crypto.getRandomValues(randomArray);
    return charset[randomArray[0] % charset.length];
  };

  const passwordCharacters = [
    pickRandomCharacter(uppercaseLetters),
    pickRandomCharacter(lowercaseLetters),
    pickRandomCharacter(numbers),
    pickRandomCharacter(symbols)
  ];

  const fullCharset = uppercaseLetters + lowercaseLetters + numbers + symbols;
  while (passwordCharacters.length < 12) {
    passwordCharacters.push(pickRandomCharacter(fullCharset));
  }

  // Fisher-Yates shuffle
  for (let i = passwordCharacters.length - 1; i > 0; i--) {
    const randomArray = new Uint32Array(1);
    crypto.getRandomValues(randomArray);
    const j = randomArray[0] % (i + 1);
    [passwordCharacters[i], passwordCharacters[j]] = [passwordCharacters[j], passwordCharacters[i]];
  }
  return passwordCharacters.join("");
}

/* ==========================================================================
   FILE UPLOAD SECURITY VALIDATION (Mirrors lib/file_guard.php)
   ========================================================================== */

export const ALLOWED_UPLOAD_MIME_TYPES = {
  jpg: ["image/jpeg", "image/jpg"],
  jpeg: ["image/jpeg", "image/jpg"],
  png: ["image/png"],
  pdf: ["application/pdf"],
  mp4: ["video/mp4"],
  mov: ["video/quicktime"],
  webm: ["video/webm"]
};

export const UPLOAD_ACCEPT = ".jpg,.jpeg,.png,.pdf,.mp4,.mov,.webm";

export const BLOCKED_FILE_EXTENSIONS = [
  "php", "php3", "php4", "php5", "php7", "php8", "phtml", "pht", "phps", "phar",
  "inc", "cgi", "pl", "py", "sh", "bash", "asp", "aspx", "jsp", "exe", "bat",
  "cmd", "com", "msi", "dll", "scr", "vbs", "ps1", "jar", "htaccess", "ini",
  "shtml", "html", "htm", "svg", "js", "hta"
];

/**
 * Validates file security (extension whitelist, blocked script extensions, MIME match, file size).
 * @param {File} file
 * @returns {string} Error message or empty string if valid
 */
export function validateUploadFile(file) {
  const fileName = String(file?.name || "");
  const nameParts = fileName.toLowerCase().split(".");
  if (nameParts.length < 2) {
    return "Only JPG, JPEG, PNG, PDF, MP4, MOV and WEBM files are allowed.";
  }

  const extension = nameParts.pop();

  for (let i = 0; i < nameParts.length; i++) {
    const sanitizedPart = nameParts[i].replace(/[^a-z0-9]/g, "");
    if (BLOCKED_FILE_EXTENSIONS.includes(sanitizedPart)) {
      return "This file name is not allowed for security reasons.";
    }
  }

  if (!ALLOWED_UPLOAD_MIME_TYPES[extension]) {
    return "Only JPG, JPEG, PNG, PDF, MP4, MOV and WEBM files are allowed.";
  }

  const fileType = String(file.type || "").toLowerCase();
  if (fileType && fileType !== "application/octet-stream" && !ALLOWED_UPLOAD_MIME_TYPES[extension].includes(fileType)) {
    return `The file type does not match its extension (.${extension}).`;
  }

  if (file.size === 0) return "The file is empty.";

  const maxAllowedBytes = CONFIG.MAX_UPLOAD_MB * 1024 * 1024;
  if (file.size > maxAllowedBytes) {
    return `File size must be ${CONFIG.MAX_UPLOAD_MB} MB or less.`;
  }
  return "";
}

/**
 * Reads a File object as a base64 Data URL.
 * @param {File} file
 * @returns {Promise<string>}
 */
export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.readAsDataURL(file);
  });
}

/* ==========================================================================
   LEGACY COMPATIBILITY EXPORTS
   Guarantees non-breaking incremental transition while updating caller files.
   ========================================================================== */

export const T_STATUS = TASK_STATUS_BADGE_CLASSES;
export const P_STATUS = PROJECT_STATUS_BADGE_CLASSES;
export const D_STAGE = DEAL_STAGE_BADGE_CLASSES;
export const PRIO = PRIORITY_BADGE_CLASSES;
export const PRIO_RANK = PRIORITY_SORT_WEIGHTS;
export const SCOL = STATUS_HEX_COLORS;
export const AV = AVATAR_BACKGROUND_PALETTE;
export const DESC_MIN = DESCRIPTION_MIN_LENGTH;
export const DESC_MAX = DESCRIPTION_MAX_LENGTH;

export const hIdx = hashStringToIndex;
export const initials = getUserInitials;
export const isoOf = formatDateToISO;
export const todayISO = getTodayISO;
export const fmtDate = formatDisplayDate;
export const fmtShort = formatShortDisplayDate;
export const fmtDT = formatDateTime;
export const isOverdue = isTaskOverdue;
export const isOpen = isTaskOpen;
export const money = formatCurrencyINR;
export const plural = pluralize;
export const formatPlural = pluralize;
export const fmtBytes = formatByteSize;
export const userById = getUserById;
export const userByName = getUserByName;
export const resolveUser = resolveUserEntity;
export const uname = getUserNameById;
export const projById = getProjectById;
export const projName = getProjectNameById;
export const taskById = getTaskById;
export const liveUsers = getActiveUsers;
export const teamUsers = getTeamUsers;
export const isAssigned = isTaskAssignedToUser;
export const myTasks = getMyTasks;
export const relatedToMe = isTaskRelatedToCurrentUser;
export const canSeeUser = canViewUser;
export const lim = getFieldValidationLimit;
export const downlineOf = getReportingUserIds;
export const rankOf = getUserRoleRank;
export const scopedTasks = getTasksByCurrentScope;
export const roleLimits = getRoleCapacityLimits;
export const categoryList = getTaskCategories;
export const oldOfProject = getArchivedProjectMetrics;
export const oldOfUser = getArchivedUserMetrics;
export const projectStats = calculateProjectStatistics;
export const userLoad = getUserWorkloadMetrics;
export const isAdmin = isCurrentUserAdmin;
export const isAdminUser = isCurrentUserAdmin;
export const isSuper = isCurrentUserSuperAdmin;
export const isSuperAdminUser = isCurrentUserSuperAdmin;
export const hasPerm = hasPermission;
export const canChangeStatus = canChangeTaskStatus;
export const statusChoices = getAvailableStatusChoices;
export const pwProblem = validatePasswordStrength;
export const phoneProblem = validatePhoneNumber;
export const emailProblem = validateEmailAddress;
export const textProblem = validateTextField;
export const numberProblem = validateNumericField;
export const descLen = getDescriptionCharacterLength;
export const descProblem = validateDescriptionField;
export const suggestPassword = suggestSecurePassword;
export const UPLOAD_TYPES = ALLOWED_UPLOAD_MIME_TYPES;
export const UPLOAD_BLOCKED_PARTS = BLOCKED_FILE_EXTENSIONS;
export const checkUploadFile = validateUploadFile;
export const readAsDataURL = readFileAsDataUrl;

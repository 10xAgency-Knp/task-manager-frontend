/**
 * Server-Side Access Control & Business Logic Rules
 *
 * Implements authorization, scope hierarchies, and permission enforcement matching
 * the backend business logic (lib/access.php, lib/team.php, security/permissions.php).
 *
 * Ensures mock responses mirror real CRM access control guarantees.
 */

import { getDb } from "./mockDb.js";
import { PERM_KEYS, PERM_ALIASES, ROLE_DEFAULTS } from "../data/settings.js";

// ============================================================================
// USER IDENTIFICATION & ROLE CLASSIFICATION
// ============================================================================

/**
 * Finds user row in mock database by user ID.
 *
 * @param {number|string} id
 * @returns {Object|null}
 */
export const userRow = (id) => getDb().users.find((user) => user.id === Number(id)) || null;

/**
 * Returns user name or empty string.
 *
 * @param {number|string} id
 * @returns {string}
 */
export const userName = (id) => {
  const user = userRow(id);
  return user ? user.name : "";
};

/**
 * Checks if a user is not soft-deleted.
 *
 * @param {Object|null} user
 * @returns {boolean}
 */
export const isLive = (user) => Boolean(user && !user.deletedAt);

/**
 * Checks if a user is active and can be assigned tasks.
 *
 * @param {Object|null} user
 * @returns {boolean}
 */
export const isAssignableState = (user) => isLive(user) && user.status !== "Inactive";

/**
 * Checks if a user is an Admin.
 *
 * @param {Object|null} user
 * @returns {boolean}
 */
export const isAdmin = (user) => Boolean(user && user.role === "Admin");

/**
 * Checks if a user is at least Manager level (Manager or Admin).
 *
 * @param {Object|null} user
 * @returns {boolean}
 */
export const isManager = (user) => Boolean(user && (user.role === "Admin" || user.role === "Manager"));

/**
 * Checks if a user is an active Super Admin.
 *
 * @param {Object|null} user
 * @returns {boolean}
 */
export const isSuper = (user) => Boolean(user && user.isSuperAdmin && user.role === "Admin" && user.status !== "Inactive");

/**
 * Computes numeric rank weight for user hierarchy comparisons.
 * Super Admin = 4, Admin = 3, Manager = 2, Employee = 1.
 *
 * @param {Object|null} user
 * @returns {number}
 */
export function userRank(user) {
  if (!user) return 0;
  if (user.isSuperAdmin && user.role === "Admin") return 4;
  const roleWeights = { Admin: 3, Manager: 2, Employee: 1 };
  return roleWeights[user.role] || 1;
}

// ============================================================================
// PERMISSION CALCULATION
// ============================================================================

/**
 * Checks if a user has a specific permission key.
 *
 * @param {Object|null} user
 * @param {string} permissionKey
 * @returns {boolean}
 */
export function hasPerm(user, permissionKey) {
  if (!user) return false;
  if (isSuper(user)) return true;

  // Composite alias permissions (all sub-keys must be satisfied)
  if (PERM_ALIASES[permissionKey]) {
    return PERM_ALIASES[permissionKey].every((subKey) => hasPerm(user, subKey));
  }

  if (!PERM_KEYS.includes(permissionKey)) return false;

  const userOverrides = getDb().permOverrides[user.id] || {};
  if (permissionKey in userOverrides) {
    return Boolean(userOverrides[permissionKey]);
  }

  const roleDefaults = ROLE_DEFAULTS[user.role] || ROLE_DEFAULTS.Employee;
  return roleDefaults.includes(permissionKey);
}

/**
 * Returns full list of effective permission keys active for a user.
 *
 * @param {Object|null} user
 * @returns {string[]}
 */
export function effectivePerms(user) {
  return PERM_KEYS.filter((key) => hasPerm(user, key)).concat(
    Object.keys(PERM_ALIASES).filter((key) => hasPerm(user, key))
  );
}

// ============================================================================
// ORGANIZATIONAL HIERARCHY & TEAM DOWNLINES
// ============================================================================

/**
 * Returns array of user IDs who report directly or indirectly under the given user.
 *
 * @param {number|string} userId
 * @returns {number[]}
 */
export function downlineIds(userId) {
  const directReportsMap = {};
  getDb().users.forEach((person) => {
    if (person.reportsToId !== null && isLive(person)) {
      if (!directReportsMap[person.reportsToId]) {
        directReportsMap[person.reportsToId] = [];
      }
      directReportsMap[person.reportsToId].push(person.id);
    }
  });

  const resultIds = [];
  const visited = { [userId]: true };
  const traversalQueue = (directReportsMap[userId] || []).slice();

  while (traversalQueue.length > 0) {
    const currentId = traversalQueue.shift();
    if (visited[currentId]) continue; // Guard against cyclic reporting hierarchies

    visited[currentId] = true;
    resultIds.push(currentId);

    const subordinates = directReportsMap[currentId] || [];
    subordinates.forEach((subId) => traversalQueue.push(subId));
  }

  return resultIds;
}

/**
 * Returns array of user IDs comprising the user and all their subordinates.
 *
 * @param {Object} user
 * @returns {number[]}
 */
export const teamIds = (user) => Array.from(new Set([user.id, ...downlineIds(user.id)]));

/**
 * Checks if a given target user ID belongs to the user's team or downline.
 *
 * @param {Object} user
 * @param {number|string} targetUserId
 * @returns {boolean}
 */
export const inTeam = (user, targetUserId) => teamIds(user).includes(Number(targetUserId));

/**
 * Checks if a user has at least one subordinate.
 *
 * @param {Object} user
 * @returns {boolean}
 */
export const hasTeam = (user) => downlineIds(user.id).length > 0;

/**
 * Checks if a user has permission to see all people across the company.
 *
 * @param {Object} user
 * @returns {boolean}
 */
export const seesAllPeople = (user) => isAdmin(user);

/**
 * Returns array of user IDs visible to this user.
 *
 * @param {Object} user
 * @returns {number[]}
 */
export const visibleUserIds = (user) =>
  seesAllPeople(user) ? getDb().users.filter(isLive).map((person) => person.id) : teamIds(user);

/**
 * Checks if user is permitted to view all organization tasks.
 *
 * @param {Object} user
 * @returns {boolean}
 */
export const seesAllTasks = (user) => hasPerm(user, "tasks.view") && hasPerm(user, "all_tasks");

// ============================================================================
// TASK ACCESS & MANAGEMENT RULES
// ============================================================================

/**
 * Checks if user can access (view or open) a given task.
 *
 * @param {Object} user
 * @param {Object} task
 * @returns {boolean}
 */
export function canAccessTask(user, task) {
  if (!user || !task || !hasPerm(user, "tasks.view")) return false;
  if (seesAllTasks(user)) return true;

  const userTeam = teamIds(user);
  return (
    userTeam.includes(task.createdById) ||
    task.assigneeIds.some((assigneeId) => userTeam.includes(assigneeId))
  );
}

/**
 * Checks if user has manager-level control over a task.
 *
 * @param {Object} user
 * @param {Object} task
 * @returns {boolean}
 */
export const canManageTask = (user, task) =>
  canAccessTask(user, task) && (seesAllTasks(user) || inTeam(user, task.createdById));

/**
 * Checks if user is an assignee of a task.
 *
 * @param {Object} user
 * @param {Object} task
 * @returns {boolean}
 */
export const isTaskAssignee = (user, task) => task.assigneeIds.includes(user.id);

/**
 * Checks if user can edit a task (creator, manager, or direct assignee).
 *
 * @param {Object} user
 * @param {Object} task
 * @returns {boolean}
 */
export const canEditTask = (user, task) => canManageTask(user, task) || Boolean(task && isTaskAssignee(user, task));

/**
 * Checks if user can delete a task.
 *
 * @param {Object} user
 * @param {Object} task
 * @returns {boolean}
 */
export function canDeleteTask(user, task) {
  if (!canAccessTask(user, task) || !hasPerm(user, "tasks.delete")) return false;
  if (hasPerm(user, "delete_records")) return true;
  return inTeam(user, task.createdById);
}

/**
 * Full edit permission (title, fields, dates).
 */
export const canFullEditTask = (user, task) => hasPerm(user, "tasks.edit") && canEditTask(user, task);

/**
 * Update permission (status, progress).
 */
export const canUpdateTask = (user, task) => hasPerm(user, "tasks.update") && canEditTask(user, task);

/**
 * Checks if a user is permitted to assign a task to a target user.
 *
 * @param {Object} user
 * @param {number|string} targetId
 * @returns {boolean}
 */
export function canAssignTo(user, targetId) {
  const targetUser = userRow(targetId);
  if (!isAssignableState(targetUser)) return false;
  if (targetUser.id === user.id) return true;
  if (userRank(targetUser) > userRank(user)) return false; // Prohibit assigning upwards in hierarchy
  if (seesAllTasks(user)) return true;
  return downlineIds(user.id).includes(targetUser.id);
}

/**
 * Returns all user IDs that the user can assign tasks to.
 *
 * @param {Object} user
 * @returns {number[]}
 */
export const assignableIds = (user) =>
  getDb()
    .users.filter((target) => canAssignTo(user, target.id))
    .map((target) => target.id);

/**
 * Checks if user can assign tasks to people other than themselves.
 *
 * @param {Object} user
 * @returns {boolean}
 */
export const canAssignOthers = (user) => assignableIds(user).length > 1 || seesAllTasks(user);

// ============================================================================
// PROJECTS
// ============================================================================

/**
 * Checks if user can view a project.
 *
 * @param {Object} user
 * @param {Object} project
 * @returns {boolean}
 */
export function canSeeProject(user, project) {
  if (!hasPerm(user, "projects.view")) return false;
  if (isAdmin(user)) return true;

  const team = teamIds(user);
  const isInTeam = (id) => team.includes(id);

  return (
    isInTeam(project.ownerId) ||
    isInTeam(project.createdById) ||
    project.memberIds.some(isInTeam) ||
    getDb().tasks.some((task) => task.projectId === project.id && canAccessTask(user, task))
  );
}

export const projectInScope = (user, project) =>
  Boolean(user && project && (isAdmin(user) || inTeam(user, project.ownerId) || inTeam(user, project.createdById)));

export const canEditProject = (user, project) =>
  projectInScope(user, project) && (hasPerm(user, "projects.edit") || hasPerm(user, "projects.update"));

export const canDeleteProject = (user, project) =>
  projectInScope(user, project) && hasPerm(user, "projects.delete");

// ============================================================================
// DEALS
// ============================================================================

export function canSeeDeal(user, deal) {
  if (!hasPerm(user, "deals.view")) return false;
  if (isAdmin(user)) return true;
  return inTeam(user, deal.ownerId) || inTeam(user, deal.createdById);
}

export const canEditDeal = (user) => hasPerm(user, "deals.view") && hasPerm(user, "deals.update");
export const canDeleteDeal = (user) => hasPerm(user, "deals.view") && hasPerm(user, "deals.delete");

// ============================================================================
// USER MANAGEMENT & PERMISSIONS EDITING
// ============================================================================

export function canManageUser(user, targetUser) {
  if (!hasPerm(user, "users.edit")) return false;
  if (isAdmin(user)) return true;
  if (!targetUser) return true;
  return downlineIds(user.id).includes(targetUser.id);
}

export const canViewPrivateFields = (viewer) =>
  Boolean(viewer && (isAdmin(viewer) || hasPerm(viewer, "users.edit")) && hasPerm(viewer, "users.view"));

export function canEditPermsOf(actorUser, targetUser) {
  if (!actorUser || !targetUser || actorUser.id === targetUser.id || isSuper(targetUser)) {
    return false;
  }
  if (isSuper(actorUser)) return true;
  return (
    isAdmin(actorUser) &&
    hasPerm(actorUser, "permissions.manage") &&
    userRank(targetUser) < userRank(actorUser)
  );
}

export const canManagePerms = (user) => isSuper(user) || (isAdmin(user) && hasPerm(user, "permissions.manage"));

// ============================================================================
// AUDIT & WORKLOAD SCOPES
// ============================================================================

export function activityScopeIds(user) {
  if (hasPerm(user, "activity.all")) return null; // Unrestricted: all users
  let allowedIds = [];
  if (hasPerm(user, "activity.own")) allowedIds.push(user.id);
  if (hasPerm(user, "activity.team")) allowedIds = allowedIds.concat(downlineIds(user.id));
  return Array.from(new Set(allowedIds));
}

export function workloadScopeIds(user) {
  if (hasPerm(user, "workload.all")) {
    return getDb().users.filter(isAssignableState).map((person) => person.id);
  }
  let allowedIds = [];
  if (hasPerm(user, "workload.own")) allowedIds.push(user.id);
  if (hasPerm(user, "workload.team")) {
    allowedIds = allowedIds.concat(
      downlineIds(user.id).filter((id) => isAssignableState(userRow(id)))
    );
  }
  return Array.from(new Set(allowedIds));
}

// Semantic aliases
export {
  userRow as getUserRowById,
  userName as getUserNameById,
  isLive as isUserActiveAndNotDeleted,
  isAdmin as isUserAdmin,
  isSuper as isUserSuperAdmin,
  hasPerm as userHasPermission,
  effectivePerms as getEffectivePermissionsForUser,
  downlineIds as getSubordinateUserIds,
  teamIds as getTeamAndDownlineUserIds,
  canAccessTask as checkCanAccessTask,
  canManageTask as checkCanManageTask,
  canEditTask as checkCanEditTask,
  canDeleteTask as checkCanDeleteTask
};

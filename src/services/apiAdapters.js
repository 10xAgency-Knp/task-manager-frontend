/**
 * Human-Readable Bidirectional API Adapters & Transformers
 *
 * Translates between Laravel's prefixed database column format (usr_*, tsk_*, pro_*, ssp_*)
 * and the clean, descriptive, camelCase domain properties expected by the React UI.
 *
 * Eliminates cryptic single-letter variable names across all application views.
 */

import { appStore } from "../store/appStore.js";

/* ==========================================================================
   DICTIONARIES FOR ENUM MAPPING (BIDIRECTIONAL)
   ========================================================================== */

export const API_TO_UI_TASK_STATUS = {
  to_do: "To Do",
  in_progress: "In Progress",
  on_hold: "On Hold",
  in_review: "Review",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const UI_TO_API_TASK_STATUS = {
  "To Do": "to_do",
  "In Progress": "in_progress",
  "On Hold": "on_hold",
  "Review": "in_review",
  "In Review": "in_review",
  "Completed": "completed",
  "Cancelled": "cancelled",
};

export const API_TO_UI_TASK_PRIORITY = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

export const UI_TO_API_TASK_PRIORITY = {
  Low: "low",
  Medium: "medium",
  High: "high",
  Urgent: "urgent",
};

export const API_TO_UI_TASK_CATEGORY = {
  web_development: "Web development",
  smm: "SMM",
  e_commerce: "E commerce",
  video_editing: "Video editing/ graphic",
  human_resource: "Human resource",
  seo: "SEO",
  custom_remark: "Custom/ remark",
};

export const UI_TO_API_TASK_CATEGORY = {
  "Web development": "web_development",
  "SMM": "smm",
  "E commerce": "e_commerce",
  "Video editing/ graphic": "video_editing",
  "Human resource": "human_resource",
  "SEO": "seo",
  "Custom/ remark": "custom_remark",
  web_development: "web_development",
  smm: "smm",
  e_commerce: "e_commerce",
  video_editing: "video_editing",
  human_resource: "human_resource",
  seo: "seo",
  custom_remark: "custom_remark",
};

export const API_TO_UI_PROJECT_STATUS = {
  planning: "Planning",
  in_progress: "In Progress",
  at_risk: "At Risk",
  completed: "Completed",
  on_hold: "On Hold",
};

export const UI_TO_API_PROJECT_STATUS = {
  Planning: "planning",
  "In Progress": "in_progress",
  "At Risk": "at_risk",
  Completed: "completed",
  "On Hold": "on_hold",
};

export const API_TO_UI_DEAL_STAGE = {
  discovery: "Discovery",
  qualified: "Qualified",
  proposal: "Proposal",
  negotiation: "Negotiation",
  negotiable: "Negotiation",
  won: "Won",
  lost: "Lost",
};

export const UI_TO_API_DEAL_STAGE = {
  Discovery: "discovery",
  Qualified: "qualified",
  Proposal: "proposal",
  Negotiation: "negotiation",
  Won: "won",
  Lost: "lost",
};

/* ==========================================================================
   USER & MEMBER TRANSFORMERS
   ========================================================================== */

/**
 * Transforms a Laravel User model into a clean, human-readable user object.
 *
 * @param {Object|null} apiUser - Backend user record containing `usr_*` fields
 * @returns {Object|null}
 */
export function transformUserFromApi(apiUser, apiPermissions = null) {
  if (!apiUser) return null;

  const rawRole = (apiUser.usr_role || apiUser.role || "employee").toLowerCase();
  const normalizedRole = rawRole.charAt(0).toUpperCase() + rawRole.slice(1); // "Admin", "Manager", "Employee"
  const isSuper = Boolean(apiUser.usr_is_super_admin || apiUser.isSuperAdmin || apiUser.superAdmin);
  const isAdmin = rawRole === "admin";
  const isManager = rawRole === "manager";

  // Parse structured module permissions if provided
  const modulePermissions = {};
  const perms = [];

  const rawPerms = apiPermissions || apiUser.permissions || apiUser.modulePermissions;
  if (rawPerms && typeof rawPerms === "object" && !Array.isArray(rawPerms)) {
    Object.values(rawPerms).forEach((group) => {
      if (group && typeof group === "object") {
        Object.entries(group).forEach(([slug, modInfo]) => {
          if (modInfo && typeof modInfo === "object" && slug !== "parent_label") {
            const canView = Boolean(modInfo.can_view ?? modInfo.view);
            const canAdd = Boolean(modInfo.can_add ?? modInfo.add);
            const canEdit = Boolean(modInfo.can_edit ?? modInfo.edit);
            const canDelete = Boolean(modInfo.can_delete ?? modInfo.delete);

            modulePermissions[slug] = {
              can_view: canView,
              can_add: canAdd,
              can_edit: canEdit,
              can_delete: canDelete,
            };

            if (canView) perms.push(`${slug}.view`);
            if (canAdd) perms.push(`${slug}.add`);
            if (canEdit) {
              perms.push(`${slug}.edit`);
              perms.push(`${slug}.update`);
            }
            if (canDelete) perms.push(`${slug}.delete`);
          }
        });
      }
    });
  } else if (Array.isArray(rawPerms)) {
    perms.push(...rawPerms);
    rawPerms.forEach((k) => {
      if (typeof k === "string") {
        const parts = k.split(".");
        const slug = parts[0];
        const act = parts[1] || "view";
        if (!modulePermissions[slug]) {
          modulePermissions[slug] = { can_view: false, can_add: false, can_edit: false, can_delete: false };
        }
        if (act === "view") modulePermissions[slug].can_view = true;
        if (act === "add") modulePermissions[slug].can_add = true;
        if (act === "edit" || act === "update") modulePermissions[slug].can_edit = true;
        if (act === "delete") modulePermissions[slug].can_delete = true;
      }
    });
  } else if (Array.isArray(apiUser.perms)) {
    perms.push(...apiUser.perms);
  }

  // If super admin, ensure all capabilities are granted
  if (isSuper) {
    perms.push(
      "dashboard.view", "my_tasks.view", "my_tasks.add", "my_tasks.edit", "my_tasks.update", "my_tasks.delete",
      "assigned_by_me.view", "task_board.view", "calendar.view", "all_tasks.view", "team_tasks.view",
      "members.view", "members.add", "members.edit", "members.update", "members.delete",
      "projects.view", "projects.add", "projects.edit", "projects.update", "projects.delete",
      "sales_pipeline.view", "sales_pipeline.add", "sales_pipeline.edit", "sales_pipeline.update", "sales_pipeline.delete",
      "reports.view", "password_reset_request.view", "audit_log.view", "recycle_bin.view", "recycle_bin.add", "recycle_bin.delete",
      "notifications.view", "settings.view"
    );
  }

  // Legacy mappings for helper functions
  if (perms.includes("projects.add") || isSuper) perms.push("projects.add");
  if (perms.includes("projects.edit") || isSuper) perms.push("projects.update");
  if (perms.includes("sales_pipeline.view") || isSuper) perms.push("deals.view");
  if (perms.includes("sales_pipeline.add") || isSuper) perms.push("deals.add");
  if (perms.includes("sales_pipeline.edit") || isSuper) perms.push("deals.edit", "deals.update");
  if (perms.includes("sales_pipeline.delete") || isSuper) perms.push("deals.delete");
  if (perms.includes("reports.view") || isSuper) perms.push("view_reports");
  if (perms.includes("members.add") || isSuper) perms.push("users.add");
  if (perms.includes("members.edit") || isSuper) perms.push("users.edit", "users.update");
  if (perms.includes("members.delete") || isSuper) perms.push("users.delete");
  if (perms.includes("recycle_bin.view") || isSuper) perms.push("recycle_restore");
  if (perms.includes("audit_log.view") || isSuper) perms.push("activity.own", "activity.team", "activity.all");
  if (perms.includes("team_tasks.view") || isSuper) perms.push("workload.own", "workload.team", "workload.all");
  if (perms.includes("my_tasks.view") || perms.includes("all_tasks.view") || perms.includes("team_tasks.view") || isSuper) perms.push("files.view", "tags.view");
  if (perms.includes("my_tasks.add") || isSuper) perms.push("tasks.add", "tags.edit");
  if (perms.includes("my_tasks.edit") || isSuper) perms.push("tasks.edit", "tasks.update", "files.edit", "tags.edit", "tags.delete");
  if (perms.includes("my_tasks.delete") || isSuper) perms.push("tasks.delete", "files.delete", "tags.delete");
  if (isSuper || (isAdmin && perms.includes("password_reset_request.view"))) perms.push("permissions.manage");

  // Ensure edit permission always manages and grants update permission
  perms.forEach((key) => {
    if (typeof key === "string" && key.endsWith(".edit")) {
      const updateKey = key.replace(/\.edit$/, ".update");
      if (!perms.includes(updateKey)) {
        perms.push(updateKey);
      }
    }
  });

  const uniquePerms = Array.from(new Set(perms));

  return {
    id: apiUser.usr_id || apiUser.id,
    name: apiUser.usr_name || apiUser.name || "",
    email: apiUser.usr_email || apiUser.email || "",
    phone: apiUser.usr_phone || apiUser.phone || "",
    role: normalizedRole,
    rawRole: rawRole,
    designation: apiUser.usr_designation || apiUser.designation || "",
    dept: apiUser.usr_dept || apiUser.department || "General",
    department: apiUser.usr_dept || apiUser.department || "General",
    customDept: apiUser.usr_custom_dept || apiUser.customDept || "",
    customDepartment: apiUser.usr_custom_dept || apiUser.customDepartment || "",
    reportsTo: apiUser.usr_reporting_to || apiUser.reportsToId || apiUser.reportsTo || null,
    reportsToId: apiUser.usr_reporting_to || apiUser.reportsToId || null,
    city: apiUser.usr_city || apiUser.city || "",
    status: (apiUser.usr_status !== undefined ? (apiUser.usr_status ? "Active" : "Inactive") : (apiUser.status || "Active")),
    isActive: Boolean(apiUser.usr_status !== undefined ? apiUser.usr_status : apiUser.isActive),
    isOnline: Boolean(apiUser.usr_online !== undefined ? apiUser.usr_online : apiUser.isOnline),
    lastSeenAt: apiUser.usr_last_seen || apiUser.lastSeenAt || null,
    joinedOn: apiUser.usr_joined || apiUser.joinedOn || null,
    mustChangePassword: Boolean(apiUser.usr_must_change !== undefined ? apiUser.usr_must_change : apiUser.mustChange),
    mustChange: Boolean(apiUser.usr_must_change !== undefined ? apiUser.usr_must_change : apiUser.mustChange),
    isSuperAdmin: isSuper,
    superAdmin: isSuper,
    hasTeam: isAdmin || isManager,
    seesAllTasks: isSuper || uniquePerms.includes("all_tasks.view"),
    avatar: apiUser.usr_avatar || apiUser.avatar || "",
    modulePermissions,
    perms: uniquePerms,
    permissions: uniquePerms,
  };
}

/**
 * Transforms frontend user form values into the payload required by AuthController / User management.
 *
 * @param {Object} userForm - Frontend form state
 * @returns {Object}
 */
export function transformUserForApi(userForm) {
  const role = (userForm.role || "employee").toLowerCase();
  const status = userForm.status === "Inactive" ? 0 : 1;

  const isCustom = userForm.department === "Custom / remark" || Boolean(userForm.customDepartment || userForm.custom_dept || userForm.usr_custom_dept);
  const customDeptValue = (userForm.customDepartment || userForm.custom_dept || userForm.usr_custom_dept || userForm.dept || "").trim();
  const dept = isCustom
    ? (customDeptValue || "General")
    : (userForm.dept ? userForm.dept.trim() : (userForm.department ? userForm.department.trim() : "General"));

  const name = userForm.name ? userForm.name.trim() : "";
  const email = userForm.email ? userForm.email.trim().toLowerCase() : "";
  const phone = userForm.phone ? userForm.phone.trim() : "";
  const designation = userForm.designation ? userForm.designation.trim() : "";
  const city = userForm.city ? userForm.city.trim() : "";

  const payload = {
    // Prefixed keys expected by Laravel AuthController
    usr_name: name,
    usr_email: email,
    usr_role: role,
    usr_designation: designation,
    usr_dept: dept,
    usr_department: dept,
    usr_custom_dept: isCustom ? (customDeptValue || dept) : null,
    usr_city: city,
    usr_status: status,
    usr_phone: phone,

    // Also unprefixed keys for complete backward compatibility
    name,
    email,
    role,
    designation,
    dept,
    department: dept,
    customDepartment: isCustom ? (customDeptValue || dept) : null,
    custom_dept: isCustom ? (customDeptValue || dept) : null,
    city,
    status,
    phone,
  };

  if (userForm.reportsToId !== undefined && userForm.reportsToId !== null) {
    payload.usr_reporting_to = userForm.reportsToId;
    payload.reporting_to = userForm.reportsToId;
  }

  if (userForm.password) {
    payload.usr_password = userForm.password;
    payload.password = userForm.password;
    payload.password_confirmation = userForm.passwordConfirmation || userForm.password;
  }

  if (userForm.isSuperAdmin !== undefined) {
    payload.usr_is_super_admin = userForm.isSuperAdmin ? 1 : 0;
    payload.is_super_admin = Boolean(userForm.isSuperAdmin);
  }

  if (userForm.joined || userForm.joinedOn) {
    payload.usr_joined = userForm.joined || userForm.joinedOn;
    payload.usr_joined_on = userForm.joined || userForm.joinedOn;
  }

  return payload;
}

/**
 * Transforms a Laravel PasswordResetRequest model into a clean, human-readable object.
 *
 * @param {Object|null} apiReq
 * @returns {Object|null}
 */
export function transformPasswordResetRequestFromApi(apiReq) {
  if (!apiReq) return null;
  return {
    id: apiReq.prr_id || apiReq.id,
    code: apiReq.prr_code || (apiReq.prr_id ? `PR-${apiReq.prr_id}` : ""),
    userId: apiReq.prr_usr_id || apiReq.userId,
    name: apiReq.prr_usr_name || apiReq.name || "",
    email: apiReq.prr_usr_email || apiReq.email || "",
    status: apiReq.prr_status === "pending" ? "Pending" : (apiReq.prr_status === "reject" ? "Rejected" : "Completed"),
    rawStatus: apiReq.prr_status || "pending",
    priority: apiReq.prr_priority || "high",
    requestedAt: apiReq.prr_requested_at || apiReq.requestedAt || "",
    lastRequestedAt: apiReq.prr_last_requested_at || apiReq.lastRequestedAt || "",
    times: Number(apiReq.prr_request_count || apiReq.times) || 1,
    reminders: Number(apiReq.prr_reminder_count || apiReq.reminders) || 0,
    lastNotifiedAt: apiReq.prr_last_notified_at || null,
    openedAt: apiReq.prr_opened_at || null,
    openedBy: apiReq.opened_by?.usr_name || apiReq.openedBy || "",
    action: apiReq.prr_admin_action || apiReq.action || "",
    completedAt: apiReq.prr_completed_at || null,
    completedBy: apiReq.completed_by?.usr_name || apiReq.completedBy || "",
    note: apiReq.prr_note || apiReq.note || "",
  };
}

/* ==========================================================================
   TASK & SUBTASK TRANSFORMERS
   ========================================================================== */

/**
 * Transforms a Laravel Task model into a clean, human-readable task object.
 *
 * @param {Object|null} apiTask - Backend task record containing `tsk_*` fields
 * @returns {Object|null}
 */
export function transformTaskFromApi(apiTask) {
  if (!apiTask) return null;

  // Extract assignees from relations if present
  const assigneesList = Array.isArray(apiTask.assignees)
    ? apiTask.assignees.map((assigneeRelation) => {
        const assignedUser = assigneeRelation.assigned_user || assigneeRelation.assignedUser;
        return {
          id: assigneeRelation.tsa_id,
          userId: assigneeRelation.tsa_usr_id,
          name: assignedUser ? (assignedUser.usr_name || assignedUser.name || "") : "",
          avatar: assignedUser ? (assignedUser.usr_avatar || assignedUser.avatar || "") : "",
          designation: assignedUser ? (assignedUser.usr_designation || assignedUser.designation || "") : "",
          role: assignedUser ? (assignedUser.usr_role || assignedUser.role || "") : "",
        };
      })
    : [];

  const assigneeIds = assigneesList.map((assignee) => assignee.userId);

  // Extract subtasks checklist
  const subtasksList = Array.isArray(apiTask.subtasks)
    ? apiTask.subtasks.map((subtaskItem) => ({
        id: subtaskItem.stk_id || subtaskItem.id,
        taskId: subtaskItem.stk_tsk_id || subtaskItem.taskId,
        title: subtaskItem.stk_title || subtaskItem.title || "",
        isDone: Boolean(subtaskItem.stk_done || subtaskItem.isDone || subtaskItem.done),
        done: (subtaskItem.stk_done || subtaskItem.isDone || subtaskItem.done) ? 1 : 0,
      }))
    : [];

  // Extract comments (resolving integer mention IDs to { id, name } objects)
  const localMentionLookup = new Map();
  const registerMentionLookup = (entry) => {
    if (!entry) return;
    const id = Number(entry.usr_id ?? entry.userId ?? entry.id);
    const name = entry.usr_name ?? entry.member_name ?? entry.name;
    if (id && name) localMentionLookup.set(id, String(name));
  };
  (appStore.database?.users || []).forEach(registerMentionLookup);
  (appStore.database?.userDirectory || []).forEach(registerMentionLookup);
  if (apiTask.assigned_by || apiTask.assignedBy) registerMentionLookup(apiTask.assigned_by || apiTask.assignedBy);
  assigneesList.forEach(registerMentionLookup);

  const commentsList = Array.isArray(apiTask.comments)
    ? apiTask.comments.map((commentItem) => {
        const author = commentItem.comment_author || commentItem.commentAuthor;
        if (author) registerMentionLookup(author);
        const authorName = author ? (author.usr_name || author.name) : (commentItem.author || "User");
        const authorId = commentItem.tsc_author || commentItem.authorId;
        const body = commentItem.tsc_comment || commentItem.body || "";
        const createdAt = commentItem.tsc_updated_on || commentItem.tsc_created_at || commentItem.created_at || commentItem.at || "";
        const rawMentions = commentItem.tsc_mentions || commentItem.mentions || [];
        const normalizedMentions = Array.isArray(rawMentions)
          ? rawMentions
              .map((m) => {
                if (m && typeof m === "object") {
                  const id = Number(m.id ?? m.usr_id);
                  const name = m.name ?? m.usr_name ?? localMentionLookup.get(id) ?? "";
                  return name ? { id, name } : null;
                }
                const id = Number(m);
                const name = localMentionLookup.get(id);
                return name ? { id, name } : null;
              })
              .filter(Boolean)
          : [];
        return {
          id: commentItem.tsc_id || commentItem.id,
          taskId: commentItem.tsc_tsk_id || commentItem.taskId,
          authorUserId: authorId,
          authorId: authorId,
          authorName: authorName,
          author: authorName,
          commentText: body,
          body: body,
          mentions: normalizedMentions,
          createdAt: createdAt,
          at: createdAt,
        };
      })
    : [];

  // Extract attachments
  const attachmentsList = Array.isArray(apiTask.attachments)
    ? apiTask.attachments.map((attachmentItem) => {
        const uploader = attachmentItem.uploader;
        const by = uploader ? (uploader.usr_name || uploader.name) : (attachmentItem.by || "User");
        const byId = attachmentItem.atc_uploaded_by || attachmentItem.uploadedByUserId || attachmentItem.byId;
        const fileName = attachmentItem.atc_file_name || attachmentItem.fileName || attachmentItem.name || "attachment";
        const size = (attachmentItem.atc_size_kb ? attachmentItem.atc_size_kb * 1024 : attachmentItem.size) || 0;
        const createdAt = attachmentItem.atc_created_at || attachmentItem.createdAt || attachmentItem.at || "";
        return {
          id: attachmentItem.atc_id || attachmentItem.id,
          taskId: attachmentItem.atc_tsk_id || attachmentItem.taskId,
          fileName: fileName,
          name: fileName,
          storedAs: attachmentItem.atc_stored_as || attachmentItem.storedAs,
          mimeType: attachmentItem.atc_mime || attachmentItem.mimeType,
          sizeKb: attachmentItem.atc_size_kb || attachmentItem.sizeKb || Math.round(size / 1024),
          size: size,
          uploadedByUserId: byId,
          byId: byId,
          by: by,
          createdAt: createdAt,
          at: createdAt,
        };
      })
    : [];

  // Extract activity feed
  const activitiesList = Array.isArray(apiTask.activities)
    ? apiTask.activities.map((activityItem) => {
        const activist = activityItem.activist;
        const who = activist ? (activist.usr_name || activist.name) : (activityItem.who || "User");
        const at = activityItem.tct_updated_on || activityItem.tka_created_at || activityItem.createdAt || activityItem.at || "";
        return {
          id: activityItem.tct_id || activityItem.tka_id || activityItem.id,
          taskId: activityItem.tct_tsk_id || activityItem.tka_tsk_id || activityItem.taskId,
          userId: activityItem.tct_who || activityItem.tka_usr_id || activityItem.userId,
          userName: who,
          who: who,
          action: activityItem.tct_action || activityItem.tka_action || activityItem.action || "updated",
          detail: activityItem.tct_detail || activityItem.tka_detail || activityItem.detail || "",
          createdAt: at,
          at: at,
        };
      })
    : [];

  // Associated project
  let projectCode = "";
  let projectName = "";

  const projectRelation = apiTask.project;
  if (projectRelation && typeof projectRelation === "object") {
    projectCode = projectRelation.pro_code || (projectRelation.pro_id ? `P-${String(projectRelation.pro_id).padStart(2, "0")}` : "");
    projectName = projectRelation.pro_name || projectRelation.pro_title || "";
  }

  const rawProId = apiTask.tsk_pro_id ?? apiTask.projectId ?? (typeof apiTask.project === "string" || typeof apiTask.project === "number" ? apiTask.project : null);

  if (!projectCode && rawProId) {
    if (typeof rawProId === "string" && /^P-\d+/i.test(rawProId)) {
      const numPart = rawProId.replace(/^P-/i, "");
      projectCode = `P-${numPart.padStart(2, "0")}`;
    } else {
      const num = Number(rawProId);
      if (!isNaN(num) && num > 0) {
        const padded = `P-${String(num).padStart(2, "0")}`;
        const matched = (appStore.database?.projects || []).find(p => Number(p.numericId) === num || p.id === padded || p.code === padded);
        if (matched) {
          projectCode = matched.code || matched.id || padded;
          projectName = projectName || matched.name || matched.title || "";
        } else {
          projectCode = padded;
        }
      }
    }
  }

  if (!projectName && projectCode) {
    const matched = (appStore.database?.projects || []).find(p => p.id === projectCode || p.code === projectCode);
    if (matched) {
      projectName = matched.name || matched.title || "";
    }
  }

  // Normalize status, priority, and category for UI
  const rawStatus = apiTask.tsk_status || apiTask.status || "to_do";
  const uiStatus = API_TO_UI_TASK_STATUS[rawStatus] || (rawStatus ? rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1) : "To Do");

  const rawPriority = apiTask.tsk_priority || apiTask.priority || "medium";
  const uiPriority = API_TO_UI_TASK_PRIORITY[rawPriority] || (rawPriority ? rawPriority.charAt(0).toUpperCase() + rawPriority.slice(1) : "Medium");

  const rawCategory = apiTask.tsk_category || apiTask.category || "web_development";
  const uiCategory = API_TO_UI_TASK_CATEGORY[rawCategory] || rawCategory;

  const dueDate = apiTask.tsk_due_date || apiTask.dueDate || apiTask.due || "";
  const estHours = Number(apiTask.tsk_est_hours || apiTask.estimatedHours || apiTask.hours) || 0;
  const spentHours = Number(apiTask.tsk_spent_hours || apiTask.spentHours || apiTask.spent) || 0;
  const assignedBy = apiTask.tsk_assigned_by || apiTask.assignedByUserId || apiTask.createdById || null;

  // Compute permissions for task operations (Kanban drag-and-drop, Edit/Delete action buttons)
  const currentUserId = appStore.currentUser?.id;
  const isSuper = Boolean(appStore.currentUser?.isSuperAdmin || appStore.currentUser?.superAdmin);
  const isAdmin = appStore.currentUser?.role?.toLowerCase() === "admin";
  const isManager = appStore.currentUser?.role?.toLowerCase() === "manager";
  const userPerms = appStore.currentUser?.perms || [];
  const isAssigned = currentUserId ? assigneeIds.map(Number).includes(Number(currentUserId)) : false;
  const isCreator = currentUserId && assignedBy ? Number(assignedBy) === Number(currentUserId) : false;

  const hasTaskEdit = isSuper || userPerms.includes("my_tasks.edit") || userPerms.includes("tasks.edit") || userPerms.includes("tasks.update");
  const hasTaskDelete = isSuper || userPerms.includes("my_tasks.delete") || userPerms.includes("tasks.delete");

  const canManage = isSuper || isAdmin || (isManager && hasTaskEdit) || (isCreator && hasTaskEdit);
  const canEdit = hasTaskEdit && (isSuper || isAdmin || isManager || isCreator || isAssigned || userPerms.includes("all_tasks.edit"));
  const canUpdate = canEdit || (userPerms.includes("tasks.update") && (isAssigned || isCreator || isManager));
  const canDelete = hasTaskDelete && (isSuper || isAdmin || isManager || isCreator || isAssigned);
  const filesAllowed = isSuper || isAdmin || userPerms.includes("files.view") || userPerms.includes("my_tasks.view");
  const canUpload = filesAllowed && (canEdit || isSuper || isAdmin || userPerms.includes("files.edit"));

  const taskCan = apiTask.can || {
    manage: canManage,
    edit: canEdit,
    update: canUpdate,
    delete: canDelete,
    tagAdd: isSuper || isAdmin || userPerms.includes("tags.edit"),
    tagRemove: isSuper || isAdmin || userPerms.includes("tags.delete"),
    files: filesAllowed,
    upload: canUpload,
  };

  return {
    id: apiTask.tsk_code || (apiTask.tsk_id ? `TK-${apiTask.tsk_id}` : String(apiTask.id || "")),
    numericId: apiTask.tsk_id || apiTask.numericId || (typeof apiTask.id === "number" ? apiTask.id : null),
    code: apiTask.tsk_code || (apiTask.tsk_id ? `TK-${apiTask.tsk_id}` : String(apiTask.id || "")),
    title: apiTask.tsk_title || apiTask.title || "",
    description: apiTask.tsk_description || apiTask.description || "",
    projectId: apiTask.tsk_pro_id || apiTask.projectId || null,
    project: projectCode,
    projectName: projectName,
    category: uiCategory,
    categoryLabel: uiCategory,
    rawCategory: rawCategory,
    priority: uiPriority,
    rawPriority: rawPriority,
    status: uiStatus,
    rawStatus: rawStatus,
    startDate: apiTask.tsk_start_date || apiTask.startDate || "",
    dueDate: dueDate,
    due: dueDate, // Essential UI alias
    estimatedHours: estHours,
    hours: estHours, // Essential UI alias
    spentHours: spentHours,
    spent: spentHours, // Essential UI alias
    tags: apiTask.tsk_tags ? (typeof apiTask.tsk_tags === "string" ? apiTask.tsk_tags.split(",").map(t => t.trim()).filter(Boolean) : apiTask.tsk_tags) : (apiTask.tags || []),
    progressPercentage: Number(apiTask.tsk_progress !== undefined ? apiTask.tsk_progress : apiTask.progressPercentage) || 0,
    progress: Number(apiTask.tsk_progress !== undefined ? apiTask.tsk_progress : apiTask.progressPercentage) || 0, // Essential UI alias
    assignedByUserId: assignedBy,
    createdById: assignedBy, // Essential UI alias
    assignedByName: apiTask.assigned_by ? (apiTask.assigned_by.usr_name || apiTask.assigned_by.name) : (apiTask.assignedByName || ""),
    completedAt: apiTask.tsk_completed_at || apiTask.completedAt || "",
    createdAt: apiTask.tsk_created_on || apiTask.created_at || apiTask.createdAt || "",
    assignees: assigneesList,
    assigneeIds: assigneeIds,
    subtasks: subtasksList,
    comments: commentsList,
    commentCount: apiTask.comments_count !== undefined ? apiTask.comments_count : (apiTask.commentCount || commentsList.length),
    attachments: attachmentsList,
    activities: activitiesList,
    can: taskCan,
  };
}

/**
 * Transforms frontend TaskForm state into the payload expected by TaskController::saveTask / updateTask.
 *
 * @param {Object} taskForm - Frontend form values
 * @param {boolean} [isUpdate=false] - Whether this is an update mutation
 * @returns {Object}
 */
export function transformTaskForApi(taskForm, isUpdate = false) {
  const rawStatus = UI_TO_API_TASK_STATUS[taskForm.status] || (taskForm.status ? taskForm.status.toLowerCase().replace(/\s+/g, "_") : "to_do");
  const rawPriority = UI_TO_API_TASK_PRIORITY[taskForm.priority] || (taskForm.priority ? taskForm.priority.toLowerCase() : "medium");
  const rawCategory = UI_TO_API_TASK_CATEGORY[taskForm.category] || (taskForm.category ? taskForm.category.toLowerCase().replace(/[\s/]+/g, "_") : "web_development");

  let resolvedProjectName = taskForm.projectName || null;
  if (!resolvedProjectName && taskForm.project) {
    const list = appStore.database?.projects || [];
    const matched = list.find(p => p.id === taskForm.project || p.code === taskForm.project || Number(p.numericId) === Number(taskForm.project));
    resolvedProjectName = matched ? matched.name : taskForm.project;
  }

  const payload = {
    title: taskForm.title ? taskForm.title.trim() : "",
    description: taskForm.description ? taskForm.description.trim() : null,
    pro_name: resolvedProjectName,
    category: rawCategory,
    priority: rawPriority,
    status: rawStatus,
    start_date: taskForm.startDate || null,
    due_date: taskForm.dueDate || taskForm.due || null,
    est_hours: Number(taskForm.estimatedHours || taskForm.hours) || 0,
    spent_hours: Number(taskForm.spentHours || taskForm.spent) || 0,
    tags: Array.isArray(taskForm.tags) ? taskForm.tags.join(",") : (taskForm.tags || null),
    assignee_ids: Array.isArray(taskForm.assigneeIds)
      ? taskForm.assigneeIds.map(Number)
      : (taskForm.assigneeIds ? [Number(taskForm.assigneeIds)] : []),
  };

  if (rawCategory === "custom_remark" || taskForm.category === "custom_remark") {
    payload.custom_remark = taskForm.customRemark || taskForm.categoryNote || "Custom";
  }

  // Handle Checklists: updateTask differentiates between existing checklist map and new items
  if (isUpdate) {
    const existingChecklistMap = {};
    const newChecklistItems = [];

    (taskForm.subtasks || []).forEach((item) => {
      if (item.id && typeof item.id === "number") {
        existingChecklistMap[item.id] = {
          title: item.title,
          done: Boolean(item.done || item.isDone),
        };
      } else {
        newChecklistItems.push({
          title: item.title,
          done: Boolean(item.done || item.isDone),
        });
      }
    });

    payload.exist_checklist = existingChecklistMap;
    payload.checklist = newChecklistItems;
  } else {
    payload.checklist = (taskForm.subtasks || []).map((item) => ({
      title: item.title,
      done: Boolean(item.done || item.isDone),
    }));
  }

  return payload;
}

/* ==========================================================================
   PROJECT TRANSFORMERS
   ========================================================================== */

/**
 * Transforms a Laravel Project model into a clean, human-readable project object.
 *
 * @param {Object|null} apiProject - Backend project record containing `pro_*` fields
 * @returns {Object|null}
 */
export function transformProjectFromApi(apiProject) {
  if (!apiProject) return null;

  const rawStatus = apiProject.pro_status || "planning";
  const uiStatus = API_TO_UI_PROJECT_STATUS[rawStatus] || (rawStatus ? rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1) : "Planning");

  const currentUserId = appStore.currentUser?.id;
  const isSuper = Boolean(appStore.currentUser?.isSuperAdmin || appStore.currentUser?.superAdmin);
  const isAdmin = appStore.currentUser?.role?.toLowerCase() === "admin";
  const userPerms = appStore.currentUser?.perms || [];
  const managerId = apiProject.project_manager ? apiProject.project_manager.usr_id : (apiProject.pro_manager || null);
  const isManager = currentUserId && managerId ? Number(managerId) === Number(currentUserId) : false;

  const canEdit = isSuper || userPerms.includes("projects.edit") || userPerms.includes("projects.update");
  const canDelete = isSuper || userPerms.includes("projects.delete");

  return {
    id: apiProject.pro_code || `P-${apiProject.pro_id}`,
    numericId: apiProject.pro_id,
    code: apiProject.pro_code || `P-${apiProject.pro_id}`,
    title: apiProject.pro_title || apiProject.pro_name || "",
    name: apiProject.pro_name || apiProject.pro_title || "",
    description: apiProject.pro_description || "",
    status: uiStatus,
    rawStatus: rawStatus,
    statusLabel: apiProject.pro_status_label || (apiProject.pro_status ? apiProject.pro_status.replace(/_/g, " ") : uiStatus),
    progressPercentage: Number(apiProject.progress_percentage || apiProject.pro_progress) || 0,
    progress: Number(apiProject.progress_percentage || apiProject.pro_progress) || 0,
    startDate: apiProject.start_date || apiProject.pro_start_date || "",
    dueDate: apiProject.due_date || apiProject.pro_due_date || "",
    due: apiProject.due_date || apiProject.pro_due_date || "",
    budget: Number(apiProject.pro_budget) || 0,
    ownerId: managerId,
    managerUserId: managerId,
    manager: managerId,
    managerName: apiProject.project_manager ? apiProject.project_manager.usr_name : "",
    updatedAt: apiProject.pro_updated_on || apiProject.updated_at || apiProject.pro_created_on || apiProject.created_at || "",
    createdAt: apiProject.pro_created_on || apiProject.created_at || "",
    openTasksCount: Number(apiProject.open_tasks_count) || 0,
    doneSubtasksCount: Number(apiProject.done_subtasks_count) || 0,
    totalSubtasksCount: Number(apiProject.total_subtasks_count) || 0,
    overdueTasksCount: Number(apiProject.overdue_tasks_count) || 0,
    assignees: Array.isArray(apiProject.assignees) ? apiProject.assignees : [],
    memberIds: Array.isArray(apiProject.assignees)
      ? apiProject.assignees.map(a => a.usr_id)
      : (Array.isArray(apiProject.project_members) ? apiProject.project_members.map(m => m.pmb_usr_id) : []),
    tasks: Array.isArray(apiProject.tasks) ? apiProject.tasks.map(transformTaskFromApi) : [],
    canEdit: Boolean(apiProject.canEdit ?? canEdit),
    canDelete: Boolean(apiProject.canDelete ?? canDelete),
    can: {
      edit: Boolean(apiProject.canEdit ?? canEdit),
      delete: Boolean(apiProject.canDelete ?? canDelete),
    },
  };
}

/**
 * Transforms frontend ProjectForm state into the payload expected by ProjectController::storeProject / updateProject.
 *
 * @param {Object} projectForm - Frontend form values
 * @returns {Object}
 */
export function transformProjectForApi(projectForm) {
  const rawStatus = UI_TO_API_PROJECT_STATUS[projectForm.status] || (projectForm.status ? projectForm.status.toLowerCase().replace(/\s+/g, "_") : "planning");

  return {
    name: projectForm.name ? projectForm.name.trim() : "",
    description: projectForm.description ? projectForm.description.trim() : null,
    manager: Number(projectForm.managerUserId || projectForm.ownerId || projectForm.manager),
    status: rawStatus,
    progress: Number(projectForm.progressPercentage || projectForm.progress) || 0,
    start_date: projectForm.startDate || null,
    due_date: projectForm.dueDate || projectForm.due || null,
    budget: Number(projectForm.budget) || 0,
    project_members: Array.isArray(projectForm.memberIds)
      ? projectForm.memberIds.map(Number)
      : (projectForm.memberIds ? [Number(projectForm.memberIds)] : []),
  };
}

/* ==========================================================================
   SALES PIPELINE (DEAL) TRANSFORMERS
   ========================================================================== */

/**
 * Transforms a Laravel SalesPipeline deal into a clean, human-readable deal object.
 *
 * @param {Object|null} apiDeal - Backend deal record containing `ssp_*` fields
 * @returns {Object|null}
 */
export function transformDealFromApi(apiDeal) {
  if (!apiDeal) return null;

  const dealOwner = apiDeal.deal_owner || apiDeal.dealOwner;
  const rawStage = apiDeal.ssp_stage || "discovery";
  const uiStage = API_TO_UI_DEAL_STAGE[rawStage] || (rawStage ? rawStage.charAt(0).toUpperCase() + rawStage.slice(1) : "Discovery");

  const currentUserId = appStore.currentUser?.id;
  const isSuper = Boolean(appStore.currentUser?.isSuperAdmin || appStore.currentUser?.superAdmin);
  const isAdmin = appStore.currentUser?.role?.toLowerCase() === "admin";
  const userPerms = appStore.currentUser?.perms || [];
  const ownerId = apiDeal.ssp_owner_id || null;
  const isOwner = currentUserId && ownerId ? Number(ownerId) === Number(currentUserId) : false;

  const canEdit = isSuper || userPerms.includes("deals.edit") || userPerms.includes("deals.update");
  const canDelete = isSuper || userPerms.includes("deals.delete");

  return {
    id: apiDeal.ssp_code || `D-${apiDeal.ssp_id}`,
    numericId: apiDeal.ssp_id,
    code: apiDeal.ssp_code,
    name: apiDeal.ssp_name || "",
    title: apiDeal.ssp_name || "",
    stage: uiStage,
    rawStage: rawStage,
    account: apiDeal.ssp_account || "",
    ownerUserId: ownerId,
    ownerId: ownerId,
    ownerName: dealOwner ? (dealOwner.usr_name || dealOwner.name) : "",
    value: Number(apiDeal.ssp_value) || 0,
    probability: Number(apiDeal.ssp_probability) || 0,
    expectedCloseDate: apiDeal.ssp_close_date || "",
    close: apiDeal.ssp_close_date || "",
    createdAt: apiDeal.ssp_created_on || apiDeal.created_at || "",
    canEdit: Boolean(apiDeal.canEdit ?? canEdit),
    canDelete: Boolean(apiDeal.canDelete ?? canDelete),
    can: {
      edit: Boolean(apiDeal.canEdit ?? canEdit),
      delete: Boolean(apiDeal.canDelete ?? canDelete),
    },
  };
}

/**
 * Transforms frontend DealForm state into the payload expected by SalesPipelineController::saveDeal / updateDeal.
 *
 * @param {Object} dealForm - Frontend form values
 * @returns {Object}
 */
export function transformDealForApi(dealForm) {
  const rawStage = UI_TO_API_DEAL_STAGE[dealForm.stage] || (dealForm.stage ? dealForm.stage.toLowerCase() : "discovery");

  return {
    deal_name: (dealForm.dealName || dealForm.name || "").trim(),
    stage: rawStage,
    account_client: dealForm.account || dealForm.clientAccount || null,
    owner: dealForm.ownerUserId || dealForm.ownerId ? Number(dealForm.ownerUserId || dealForm.ownerId) : null,
    value: Number(dealForm.value) || 0,
    probability: Number(dealForm.probability) || 0,
    expected_close_date: dealForm.expectedCloseDate || dealForm.close || null,
  };
}

/* ==========================================================================
   DASHBOARD OVERVIEW TRANSFORMER
   ========================================================================== */

/**
 * Normalizes the response from GET /api/dashboard into the structure expected by Dashboard.jsx.
 *
 * @param {Object} rawDashboardResponse - Backend response from DashboardController@index
 * @returns {Object}
 */
export function transformDashboardFromApi(rawDashboardResponse) {
  const data = rawDashboardResponse?.data || rawDashboardResponse || {};

  return {
    banner: {
      userName: data.banner?.user_name || "User",
      myOpenTasksCount: Number(data.banner?.my_open_tasks) || 0,
      workspaceOpenTasksCount: Number(data.banner?.workspace_open_tasks) || 0,
      activeProjectsCount: Number(data.banner?.active_projects) || 0,
      completionPercentage: Number(data.banner?.completion_percentage) || 0,
    },
    metrics: {
      open: Number(data.metrics?.open_tasks) || 0,
      overdue: Number(data.metrics?.overdue) || 0,
      dueToday: Number(data.metrics?.due_today) || 0,
      inReview: Number(data.metrics?.in_review) || 0,
      doneThisWeek: Number(data.metrics?.done_this_week) || 0,
    },
    myFocusList: Array.isArray(data.my_focus_list)
      ? data.my_focus_list.map(transformTaskFromApi)
      : [],
    upcomingDeadlines: Array.isArray(data.upcoming_deadlines)
      ? data.upcoming_deadlines.map(transformTaskFromApi)
      : [],
    teamWorkload: Array.isArray(data.team_workload)
      ? data.team_workload.map((member) => ({
          userId: member.usr_id,
          userName: member.usr_name,
          openTasksCount: Number(member.open_tasks_count) || 0,
        }))
      : [],
    taskMix: data.task_mix || {},
    recentActivities: Array.isArray(data.recent_activities)
      ? data.recent_activities.map((log) => ({
          id: log.alg_id,
          userId: log.alg_usr_id,
          who: log.alg_actor_name || "System",
          text: log.alg_description || `${log.alg_action} on ${log.alg_module}`,
          when: log.alg_updated_on || log.alg_created_on || log.created_at || "",
          action: log.alg_action,
          module: log.alg_module,
          description: log.alg_description || `${log.alg_action} on ${log.alg_module}`,
          createdAt: log.alg_created_on || log.created_at || "",
        }))
      : [],
    userRole: data.user_role || "employee",
    hasChildren: Boolean(data.has_children),
  };
}

/**
 * Transforms incoming Laravel notification model JSON into the shape expected by React views.
 *
 * @param {Object} n - Raw API notification record
 * @returns {Object|null}
 */
export function transformNotificationFromApi(n) {
  if (!n) return null;
  let meta = n.not_meta_info || n.metaInfo || {};
  if (typeof meta === "string") {
    try {
      meta = JSON.parse(meta);
      if (typeof meta === "string") {
        meta = JSON.parse(meta);
      }
    } catch {
      meta = {};
    }
  }

  const isRead = Boolean(n.not_is_read ?? n.isRead ?? n.read);
  const time = n.not_updated_on || n.created_at || n.at || n.createdAt || "";
  const title = n.not_title ?? n.title ?? "";
  const body = n.not_body ?? n.body ?? "";

  const extra = meta.extra_params || {};

  // Extract task reference from meta, extra_params, or infer from title/body (e.g. "TK-01")
  const taskRef = meta.task_code || meta.task || meta.tsk_code || meta.taskId || meta.task_id ||
    extra.tsk_code || extra.task_code || extra.task || extra.tsk_id || extra.taskId ||
    (title.match(/\bTK-\d+\b/i) || [])[0] ||
    (body.match(/\bTK-\d+\b/i) || [])[0] || "";

  // Extract project reference from meta, extra_params, or infer from title/body (e.g. "P-01")
  const projectRef = meta.project_code || meta.project || meta.pro_code || meta.projectId || meta.project_id || meta.pro_id ||
    extra.pro_code || extra.project_code || extra.project || extra.pro_id || extra.projectId ||
    (title.match(/\bP-\d+\b/i) || [])[0] ||
    (body.match(/\bP-\d+\b/i) || [])[0] || "";

  // Extract deal reference from meta, extra_params, or infer from title/body (e.g. "D-01")
  const dealRef = meta.deal_code || meta.deal || meta.ssp_code || meta.dealId || meta.deal_id ||
    extra.ssp_code || extra.deal_code || extra.deal || extra.ssp_id ||
    (title.match(/\bD-\d+\b/i) || [])[0] ||
    (body.match(/\bD-\d+\b/i) || [])[0] || "";

  return {
    id: n.not_id ?? n.id,
    kind: n.not_kind ?? n.kind ?? "system",
    title,
    body,
    read: isRead ? 1 : 0,
    isRead,
    at: time,
    createdAt: time,
    actor: n.not_actor ?? n.actor ?? "System",
    actorRole: n.not_actor_role ?? n.actorRole ?? "",
    task: taskRef,
    taskTitle: meta.task_title || meta.taskTitle || extra.tsk_title || "",
    project: projectRef,
    projectName: meta.project_name || meta.projectName || extra.pro_name || "",
    deal: dealRef,
    dealName: meta.deal_name || meta.dealName || extra.ssp_name || "",
    resetId: meta.prr_id || meta.resetId || extra.prr_id || null,
    userId: meta.usr_id || meta.user_id || meta.userId || extra.usr_id || extra.prr_usr_id || null,
    external: meta.external || "",
    metaInfo: meta,
  };
}

/**
 * Merges user display entries (from team members, tasks, projects, assignable list)
 * into a unified directory list, keeping the richer metadata (avatar, designation, role)
 * for each user ID while setting inTeam=false for non-team entries.
 */
export function mergeUserDirectoryEntries(existingList = [], incomingEntries = []) {
  const map = new Map();

  const upsert = (entry) => {
    if (!entry) return;
    const id = Number(entry.usr_id ?? entry.userId ?? entry.id);
    if (!id || Number.isNaN(id)) return;

    const rawRole = entry.usr_role ?? entry.role ?? "";
    const formattedRole = rawRole
      ? rawRole.charAt(0).toUpperCase() + rawRole.slice(1)
      : "";
    const incoming = {
      id,
      name: entry.usr_name ?? entry.member_name ?? entry.name ?? "",
      avatar: entry.usr_avatar ?? entry.member_avatar ?? entry.avatar ?? "",
      designation: entry.usr_designation ?? entry.member_designation ?? entry.designation ?? "",
      role: formattedRole,
      status: entry.status || "Active",
      inTeam: Boolean(entry.inTeam),
    };

    const prev = map.get(id);
    if (!prev) {
      map.set(id, incoming);
      return;
    }

    map.set(id, {
      ...prev,
      name: incoming.name || prev.name,
      avatar: incoming.avatar || prev.avatar,
      designation: incoming.designation && incoming.designation !== "-" ? incoming.designation : prev.designation,
      role: incoming.role || prev.role,
      inTeam: Boolean(prev.inTeam || incoming.inTeam),
    });
  };

  existingList.forEach(upsert);
  incomingEntries.forEach(upsert);
  return Array.from(map.values());
}

/**
 * Extracts lightweight user display records from task, project, assignable, and team payloads
 * so assignees, task creators, commenters, and project managers always show real names & avatars
 * even when the logged-in user does not have access to the full /members directory.
 */
export function extractUserDirectoryFromPayloads({ tasks = [], projects = [], assignable = {}, users = [] } = {}) {
  const entries = [...(Array.isArray(users) ? users : [])];

  const collectFromTask = (t) => {
    if (!t || typeof t !== "object") return;
    const assignedBy = t.assigned_by || t.assignedBy;
    if (assignedBy && typeof assignedBy === "object") entries.push(assignedBy);
    if (Array.isArray(t.assignees)) {
      t.assignees.forEach((rel) => {
        const u = rel?.assigned_user || rel?.assignedUser;
        if (u && typeof u === "object") entries.push(u);
        else if (rel?.userId && rel?.name) entries.push({ id: rel.userId, name: rel.name, avatar: rel.avatar, designation: rel.designation, role: rel.role });
      });
    }
    if (Array.isArray(t.comments)) {
      t.comments.forEach((c) => {
        const author = c?.comment_author || c?.commentAuthor;
        if (author && typeof author === "object") entries.push(author);
      });
    }
    if (Array.isArray(t.activities)) {
      t.activities.forEach((a) => {
        const activist = a?.activist;
        if (activist && typeof activist === "object") entries.push(activist);
      });
    }
  };

  (Array.isArray(tasks) ? tasks : []).forEach(collectFromTask);

  (Array.isArray(projects) ? projects : []).forEach((p) => {
    if (!p || typeof p !== "object") return;
    const mgr = p.project_manager || p.projectManager;
    if (mgr && typeof mgr === "object") entries.push(mgr);
    const members = p.project_members || p.projectMembers;
    if (Array.isArray(members)) {
      members.forEach((pm) => {
        const m = pm?.member;
        if (m && typeof m === "object") entries.push(m);
      });
    }
    if (Array.isArray(p.tasks)) {
      p.tasks.forEach(collectFromTask);
    }
  });

  if (assignable && typeof assignable === "object" && !Array.isArray(assignable)) {
    Object.entries(assignable).forEach(([idKey, nameVal]) => {
      if (idKey && nameVal) {
        entries.push({ id: Number(idKey), name: String(nameVal) });
      }
    });
  }

  return mergeUserDirectoryEntries([], entries);
}


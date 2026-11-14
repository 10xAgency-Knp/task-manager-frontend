/**
 * CRM Views Configuration & Navigation Controller
 *
 * Defines application views, navigation categories, authorization guards,
 * and high-level routing methods decoupling UI components from direct router dependencies.
 */
import { appStore, emitStoreChange, showToast } from "../store/appStore.js";
import { can, hasTeamView, isCurrentUserAdmin, isCurrentUserSuperAdmin, canViewModule } from "../utils/helpers.js";

/**
 * Route View Definitions with display titles, icons, and authorization callbacks
 */
export const VIEWS = {
  dashboard: {
    label: "Dashboard",
    icon: "dash",
    sub: "Overview of your work",
    allow: () => canViewModule("dashboard")
  },
  mytasks: {
    label: "My Tasks",
    icon: "mytask",
    sub: "Tasks assigned to you",
    allow: () => canViewModule("my_tasks")
  },
  byme: {
    label: "Assigned by Me",
    icon: "out",
    sub: "Tasks you created",
    allow: () => canViewModule("assigned_by_me")
  },
  alltasks: {
    label: "All Tasks",
    icon: "list",
    sub: "",
    allow: () => canViewModule("all_tasks")
  },
  teamtasks: {
    label: "Team Workload",
    icon: "team",
    sub: "Assigned, pending, in progress, completed and overdue work",
    allow: () => canViewModule("team_tasks") || can.workload()
  },
  board: {
    label: "Task Board",
    icon: "board",
    sub: "Drag cards to change status",
    allow: () => canViewModule("task_board")
  },
  calendar: {
    label: "Calendar",
    icon: "cal",
    sub: "Tasks by due date",
    allow: () => canViewModule("calendar")
  },
  projects: {
    label: "Projects",
    icon: "proj",
    sub: "Projects you and your team work on",
    allow: () => canViewModule("projects")
  },
  deals: {
    label: "Sales Pipeline",
    icon: "deal",
    sub: "Open opportunities and closed deals",
    allow: () => canViewModule("sales_pipeline") || can.deals()
  },
  reports: {
    label: "Reports",
    icon: "report",
    sub: "Performance and project health",
    allow: () => canViewModule("reports") || can.reports()
  },
  members: {
    label: "Members",
    icon: "team",
    sub: "You and your team",
    allow: () => canViewModule("members")
  },
  notifications: {
    label: "Notifications",
    icon: "bell",
    sub: "Updates on your tasks",
    allow: () => canViewModule("notifications")
  },
  settings: {
    label: "Settings",
    icon: "gear",
    sub: "Your profile, photo, password and session"
  },
  permissions: {
    label: "Permissions",
    icon: "key",
    sub: "Super Admin: give people extra access",
    allow: () => isCurrentUserSuperAdmin() || (isCurrentUserAdmin() && can.permissions())
  },
  audit: {
    label: "Activity Log",
    icon: "eye",
    sub: "Who did what, and when (kept for 40 days)",
    allow: () => canViewModule("audit_log") || can.audit()
  },
  pwresets: {
    label: "Password Resets",
    icon: "key",
    sub: "Forgot-password requests waiting for an Admin",
    allow: () => isCurrentUserAdmin() && canViewModule("password_reset_request")
  },
  recycle: {
    label: "Recycle Bin",
    icon: "del",
    sub: "Deleted items are kept here for 30 days",
    allow: () => canViewModule("recycle_bin") || can.recycle()
  }
};

/**
 * Returns the first available view key that the current user has permission to open.
 * @returns {string}
 */
export function getFirstAllowedView() {
  const candidateViews = [
    "dashboard",
    "mytasks",
    "byme",
    "board",
    "calendar",
    "projects",
    "deals",
    "reports",
    "members",
    "teamtasks",
    "alltasks",
    "notifications",
    "settings"
  ];
  return candidateViews.find(v => isViewAllowed(v)) || "settings";
}

/**
 * Navigation Menu Sidebar Groups
 */
export const NAV_GROUPS = [
  { label: "Workspace", items: ["dashboard", "mytasks", "byme", "board", "calendar"] },
  { label: "Team", items: ["alltasks", "teamtasks", "members"] },
  { label: "Business", items: ["projects", "deals", "reports"] },
  { label: "Admin", items: ["pwresets", "permissions", "recycle"] },
  { label: "Account", items: ["notifications", "audit", "settings"] }
];

/**
 * Checks whether the current user is authorized to open a given view.
 * @param {string} viewKey
 * @returns {boolean}
 */
export function isViewAllowed(viewKey) {
  const viewDefinition = VIEWS[viewKey];
  if (!viewDefinition) return false;
  return viewDefinition.allow ? Boolean(viewDefinition.allow()) : true;
}

/**
 * Returns dynamic menu label for a view (e.g. "Members" vs "My Profile" for individual employees).
 * @param {string} viewKey
 * @returns {string}
 */
export function getViewLabel(viewKey) {
  if (viewKey === "members" && !hasTeamView() && !isCurrentUserAdmin()) {
    return "My Profile";
  }
  return VIEWS[viewKey]?.label || viewKey;
}

/**
 * Returns dynamic subtitle explanation for a view based on role context.
 * @param {string} viewKey
 * @returns {string}
 */
export function getViewSubtitle(viewKey) {
  const user = appStore.currentUser;

  if (viewKey === "alltasks") {
    return user?.seesAllTasks
      ? "Every task in the company"
      : "Tasks created by or assigned to you and your team";
  }

  if (viewKey === "members") {
    if (isCurrentUserAdmin()) return "Everyone in the workspace";
    return user?.hasTeam
      ? "You and the people who report to you"
      : "Your profile";
  }

  return VIEWS[viewKey]?.sub || "";
}

/**
 * Checks whether the current viewport width is mobile (<= 860px).
 * @returns {boolean}
 */
export function isMobileViewport() {
  return window.matchMedia("(max-width:860px)").matches;
}

/* ==========================================================================
   ROUTING & URL PATH HELPERS
   ========================================================================== */

export function pathForView(viewKey) {
  return "/" + viewKey;
}

export function pathForDetail(entityType, entityId) {
  let resolvedId = entityId;
  if (entityType === "project" && typeof entityId === "string" && /^P-\d+$/i.test(entityId)) {
    const num = parseInt(entityId.replace(/^P-/i, ""), 10);
    resolvedId = `P-${String(num).padStart(2, "0")}`;
  } else if (entityType === "task" && typeof entityId === "string" && /^TK-\d+$/i.test(entityId)) {
    const num = parseInt(entityId.replace(/^TK-/i, ""), 10);
    resolvedId = `TK-${String(num).padStart(2, "0")}`;
  }
  return "/" + entityType + "/" + encodeURIComponent(resolvedId);
}

export function pathFromHash(hashString) {
  return "/" + String(hashString || "").replace(/^#\/?/, "");
}

// Router navigation delegate registered during router startup
let routerNavigator = null;

export function setNavigator(navigateFunction) {
  routerNavigator = navigateFunction;
}

export function navigate(path, options) {
  if (routerNavigator) {
    routerNavigator(path, options);
  } else if (typeof window !== "undefined" && window.location) {
    if (options?.replace && window.history?.replaceState) {
      window.history.replaceState(null, "", path);
    } else {
      window.location.href = path;
    }
  }
}

/**
 * Closes the mobile sidebar drawer.
 */
export function closeSidebarMobile() {
  document.dispatchEvent(new CustomEvent("crm-sidebar", { detail: false }));
}

/**
 * Navigates to a top-level view and resets task filters when switching views.
 * @param {string} viewKey
 * @param {string} [initialTab]
 * @param {Object} [options]
 */
export function navigateToView(viewKey, initialTab, options = {}) {
  if (!isViewAllowed(viewKey)) {
    showToast("You do not have access to that page.", "err");
    return;
  }

  const targetPath = pathForView(viewKey);
  const currentPath = typeof window !== "undefined" ? window.location.pathname : "";
  const isPathDifferent = currentPath !== targetPath;
  const isViewChanging =
    viewKey !== appStore.currentView ||
    Boolean(appStore.focusedEntity) ||
    isPathDifferent;

  if (isViewChanging) {
    Object.assign(appStore.taskFilters, {
      searchQuery: "",
      activeTab: "all",
      projectFilter: "",
      assigneeFilter: "",
      priorityFilter: "",
      statusFilter: ""
    });
  }

  if (initialTab) {
    appStore.taskFilters.activeTab = initialTab;
  }

  closeSidebarMobile();

  if (!isViewChanging && !isPathDifferent) {
    emitStoreChange();
    return;
  }

  navigate(targetPath, options);
}

/**
 * Navigates to an entity detail view (e.g. task, project, or member profile).
 * @param {"task"|"project"|"user"} entityType
 * @param {string|number} entityId
 */
export function navigateToDetail(entityType, entityId) {
  closeSidebarMobile();
  navigate(pathForDetail(entityType, entityId));
}

export function openHash(hashString) {
  navigate(pathFromHash(hashString));
}

export function replaceWithDashboard() {
  const fallback = getFirstAllowedView();
  navigate(pathForView(fallback), { replace: true });
}

/**
 * Navigates back in browser history or falls back to a sensible parent screen.
 */
export function navigateBack() {
  if (window.history.state && window.history.state.idx > 0) {
    navigate(-1);
    return;
  }

  const focused = appStore.focusedEntity;
  let fallbackParent = "dashboard";

  if (focused?.type === "task") fallbackParent = "mytasks";
  else if (focused?.type === "project") fallbackParent = "projects";
  else if (focused?.type === "user") fallbackParent = "members";

  navigate(pathForView(isViewAllowed(fallbackParent) ? fallbackParent : "dashboard"), {
    replace: true
  });
}

/* ==========================================================================
   LEGACY COMPATIBILITY EXPORTS
   ========================================================================== */

export const viewAllowed = isViewAllowed;
export const viewLabel = getViewLabel;
export const viewSub = getViewSubtitle;
export const isMobile = isMobileViewport;
export const goView = navigateToView;
export const focusOn = navigateToDetail;
export const focusOnItem = navigateToDetail;
export const navBack = navigateBack;

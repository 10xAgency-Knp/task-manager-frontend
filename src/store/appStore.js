/**
 * Central Application State Store
 *
 * Provides a lightweight reactive state store for the entire 10X CRM frontend,
 * utilizing React 18's `useSyncExternalStore` for predictable re-renders.
 */
import { useSyncExternalStore } from "react";

/**
 * Initial task filter configuration
 */
export const initialTaskFilters = {
  searchQuery: "",
  activeTab: "all",
  projectFilter: "",
  assigneeFilter: "",
  priorityFilter: "",
  statusFilter: "",
  viewMode: "list",
  scope: "mine"
};

/**
 * Central application store state definition
 */
export const appStore = {
  // Navigation & Authentication screens: "boot" | "login" | "forgot" | "reset" | "force" | "app"
  currentScreen: "boot",
  authMessage: "",
  isAuthSuccess: false,
  resetToken: null,

  // In-memory workspace database cache
  database: {
    users: [],
    userDirectory: [],
    assignable: [],
    projects: [],
    tasks: [],
    deals: [],
    notifications: [],
    activity: [],
    currentUser: null,
    unreadCount: 0,
    limits: null,
    roleLimits: null,
    taskCategories: null,
    emailDomains: null,
    oldClosed: null,
    pwResets: null
  },

  // Active authenticated user profile
  currentUser: null,

  // Active top-level route view (e.g., "dashboard", "mytasks", "projects")
  currentView: "dashboard",

  // Focused entity for detail views: { type: "task" | "project" | "user", id }
  focusedEntity: null,

  // Global task filters used across list, board, and calendar views
  taskFilters: { ...initialTaskFilters },

  // Active calendar date selection
  calendarDate: new Date(),

  // Cached analytical reports payload
  reportsCache: null,

  // Dynamic header metadata set by detail pages: { title, subtitle }
  pageHeader: null,

  // Currently active modal dialog: { key, element, isForm, closing, dirty, owner }
  activeModal: null,

  // Stack of confirmation dialogs displayed on top of open modals
  confirmModalStack: [],

  // Active notification toast messages
  activeToasts: [],

  // Toggle state for the notification side drawer
  isNotificationPanelOpen: false,

  // Temporary popup notification bubbles displayed in screen corner
  notificationPopups: [],

  // Administrative views state (Permissions, Audit logs, Recycle bin)
  admin: {
    perm: null,
    permissionSummary: null,
    audit: {
      page: 1,
      mod: "",
      act: "",
      u: "",
      des: "",
      q: "",
      from: "",
      to: "",
      module: "",
      actionType: "",
      user: "",
      designation: "",
      open: {}
    },
    bin: {
      status: "deleted",
      mod: "",
      module: ""
    }
  },

  // Monotonically increasing sequence number triggering store subscribers
  renderSequence: 0
};

// Internal set of change listener callbacks
const storeSubscribers = new Set();

/**
 * Notifies all subscribed components that store state has changed.
 */
export function emitStoreChange() {
  appStore.renderSequence++;
  storeSubscribers.forEach(listener => listener());
}

/**
 * Merges partial state updates into the store and notifies subscribers.
 * @param {Partial<typeof appStore>} patch
 */
export function setStoreState(patch) {
  Object.assign(appStore, patch);
  emitStoreChange();
}

/**
 * React hook connecting components to store changes.
 * @returns {typeof appStore}
 */
export function useAppStore() {
  useSyncExternalStore(
    listener => {
      storeSubscribers.add(listener);
      return () => storeSubscribers.delete(listener);
    },
    () => appStore.renderSequence
  );
  return appStore;
}

/* ==========================================================================
   TOAST NOTIFICATIONS
   ========================================================================== */

let nextToastIdentifier = 0;

/**
 * Displays a toast notification in the application.
 * @param {string|Error} message - Message text
 * @param {"ok"|"err"} [kind="ok"] - Visual toast style
 */
export function showToast(message, kind = "ok") {
  const toastItem = {
    id: ++nextToastIdentifier,
    msg: String(message),
    kind: kind === "err" ? "err" : "ok",
    out: false
  };

  appStore.activeToasts = appStore.activeToasts.concat(toastItem);
  emitStoreChange();

  // Slide out after 3.8s, then remove 200ms later
  setTimeout(() => {
    toastItem.out = true;
    emitStoreChange();

    setTimeout(() => {
      appStore.activeToasts = appStore.activeToasts.filter(item => item !== toastItem);
      emitStoreChange();
    }, 200);
  }, 3800);
}

/**
 * Displays an error toast unless the error was marked as silent.
 * @param {Error|string} error
 */
export function showErrorToast(error) {
  if (error && !error.silent) {
    showToast(error.message || String(error), "err");
  }
}

/* ==========================================================================
   BACKWARD-COMPATIBILITY ACCESSORS & ALIASES
   These ensure zero regressions across existing modules while transitioning.
   ========================================================================== */

Object.defineProperties(appStore, {
  screen: {
    get() { return this.currentScreen; },
    set(value) { this.currentScreen = value; },
    enumerable: true,
    configurable: true
  },
  authMsg: {
    get() { return this.authMessage; },
    set(value) { this.authMessage = value; },
    enumerable: true,
    configurable: true
  },
  authGood: {
    get() { return this.isAuthSuccess; },
    set(value) { this.isAuthSuccess = value; },
    enumerable: true,
    configurable: true
  },
  DB: {
    get() { return this.database; },
    set(value) { this.database = value; },
    enumerable: true,
    configurable: true
  },
  ME: {
    get() { return this.currentUser; },
    set(value) { this.currentUser = value; },
    enumerable: true,
    configurable: true
  },
  VIEW: {
    get() { return this.currentView; },
    set(value) { this.currentView = value; },
    enumerable: true,
    configurable: true
  },
  FOCUS: {
    get() { return this.focusedEntity; },
    set(value) { this.focusedEntity = value; },
    enumerable: true,
    configurable: true
  },
  TF: {
    get() { return this.taskFilters; },
    set(value) { this.taskFilters = value; },
    enumerable: true,
    configurable: true
  },
  CAL: {
    get() { return this.calendarDate; },
    set(value) { this.calendarDate = value; },
    enumerable: true,
    configurable: true
  },
  REP: {
    get() { return this.reportsCache; },
    set(value) { this.reportsCache = value; },
    enumerable: true,
    configurable: true
  },
  head: {
    get() { return this.pageHeader; },
    set(value) { this.pageHeader = value; },
    enumerable: true,
    configurable: true
  },
  modal: {
    get() { return this.activeModal; },
    set(value) { this.activeModal = value; },
    enumerable: true,
    configurable: true
  },
  stack: {
    get() { return this.confirmModalStack; },
    set(value) { this.confirmModalStack = value; },
    enumerable: true,
    configurable: true
  },
  toasts: {
    get() { return this.activeToasts; },
    set(value) { this.activeToasts = value; },
    enumerable: true,
    configurable: true
  },
  notifPanel: {
    get() { return this.isNotificationPanelOpen; },
    set(value) { this.isNotificationPanelOpen = value; },
    enumerable: true,
    configurable: true
  },
  pops: {
    get() { return this.notificationPopups; },
    set(value) { this.notificationPopups = value; },
    enumerable: true,
    configurable: true
  },
  ADM: {
    get() { return this.admin; },
    set(value) { this.admin = value; },
    enumerable: true,
    configurable: true
  },
  adminState: {
    get() { return this.admin; },
    set(value) { this.admin = value; },
    enumerable: true,
    configurable: true
  },
  seq: {
    get() { return this.renderSequence; },
    set(value) { this.renderSequence = value; },
    enumerable: true,
    configurable: true
  }
});

// Provide getter/setter aliases inside taskFilters
Object.defineProperties(appStore.taskFilters, {
  q: {
    get() { return this.searchQuery; },
    set(v) { this.searchQuery = v; },
    enumerable: true,
    configurable: true
  },
  tab: {
    get() { return this.activeTab; },
    set(v) { this.activeTab = v; },
    enumerable: true,
    configurable: true
  },
  project: {
    get() { return this.projectFilter; },
    set(v) { this.projectFilter = v; },
    enumerable: true,
    configurable: true
  },
  assignee: {
    get() { return this.assigneeFilter; },
    set(v) { this.assigneeFilter = v; },
    enumerable: true,
    configurable: true
  },
  priority: {
    get() { return this.priorityFilter; },
    set(v) { this.priorityFilter = v; },
    enumerable: true,
    configurable: true
  },
  status: {
    get() { return this.statusFilter; },
    set(v) { this.statusFilter = v; },
    enumerable: true,
    configurable: true
  },
  view: {
    get() { return this.viewMode; },
    set(v) { this.viewMode = v; },
    enumerable: true,
    configurable: true
  }
});

// Backward-compatible named exports
export const S = appStore;
export const emit = emitStoreChange;
export const set = setStoreState;
export const useStore = useAppStore;
export const toast = showToast;
export const toastErr = showErrorToast;

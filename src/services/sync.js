/**
 * Real-time Background Synchronization & Polling
 *
 * Coordinates data synchronization cycles:
 * 1. Full CRM workspace refresh (every 45s while browser tab is visible)
 * 2. Real-time notifications check (every 15s, triggers transient toast popups & push alerts)
 * 3. High-priority admin password reset requests check (every 15s for Admins)
 * 4. User access fingerprint comparison (re-evaluates navigation permissions if role/privileges change)
 * 5. Page scroll restoration across silent refreshes (`safeRefresh`)
 */

import { appStore, emitStoreChange, showToast, showErrorToast } from "../store/appStore.js";
import { API } from "./api.js";
import { isAdminUser, canViewModule } from "../utils/helpers.js";
import { isViewAllowed, replaceWithDashboard } from "../routes/navigation.js";
import { pushInit, pushLocalNotify, PUSH } from "./push.js";
import {
  initNotificationAudioUnlock,
  isNotificationSoundEnabled,
  playNotificationAlarm
} from "./notificationSound.js";

let workspacePollIntervalId = null;
let notificationPollIntervalId = null;
let passwordResetPollIntervalId = null;
let isPushInitialized = false;

export let NOTIF_LAST = 0;

/**
 * Generates a stable fingerprint of the user's role and effective permissions
 * to detect server-side privilege modifications without requiring re-login.
 *
 * @param {Object|null} user
 * @returns {string}
 */
function computeAccessFingerprint(user) {
  if (!user) return "";
  return [
    user.role,
    user.superAdmin ? 1 : 0,
    (user.perms || []).slice().sort().join(","),
    user.hasTeam ? 1 : 0,
    user.seesAllTasks ? 1 : 0
  ].join("|");
}

/**
 * Applies fresh server data snapshot to local appStore.
 * Detects administrative permission adjustments and notifies the user.
 *
 * @param {Object} freshData
 * @returns {boolean} True if access privileges changed
 */
export function applyLoad(freshData) {
  const previousFingerprint = computeAccessFingerprint(appStore.currentUser);

  appStore.database = freshData;
  if (freshData.me) {
    appStore.currentUser = freshData.me;
  }

  const currentFingerprint = computeAccessFingerprint(appStore.currentUser);
  if (previousFingerprint && previousFingerprint !== currentFingerprint) {
    showToast(
      `An administrator updated your access (${appStore.currentUser.role}${
        appStore.currentUser.superAdmin ? ", Super Admin" : ""
      }). Your menu has been updated.`
    );
    appStore.reports = null;

    if (!appStore.focusedEntity && !isViewAllowed(appStore.currentView)) {
      replaceWithDashboard();
    }
    return true;
  }

  return false;
}

/**
 * Reloads all workspace data silently and maintains the user's vertical scroll position.
 */
export async function safeRefresh() {
  const preservedScrollY = window.scrollY;

  try {
    const response = await API.load();
    applyLoad(response.data);
    appStore.reports = null;
  } catch (err) {
    showErrorToast(err);
    if (err && err.silent) return;
  }

  appStore.refreshTick = (appStore.refreshTick || 0) + 1;
  emitStoreChange();

  if (!appStore.focusedEntity) {
    requestAnimationFrame(() => window.scrollTo(0, preservedScrollY));
  }
}

/**
 * Calculates the highest notification ID currently held in memory.
 *
 * @returns {number}
 */
export function notifMaxId() {
  return (appStore.database.notifications || []).reduce(
    (maxId, item) => Math.max(maxId, Number(item.id) || 0),
    0
  );
}

/**
 * Single execution cycle for 45s workspace polling.
 */
async function pollWorkspaceOnce() {
  if (!API.authed || !appStore.currentUser || appStore.screen !== "app") return;

  try {
    // Background load does not extend idle session timeout
    const response = await API.load(true);
    const hasPrivilegeChanges = applyLoad(response.data);

    if (NOTIF_LAST < notifMaxId()) {
      NOTIF_LAST = notifMaxId();
    }

    const isUserInputActive =
      appStore.activeModal ||
      (document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName));

    if (!isUserInputActive || hasPrivilegeChanges) {
      appStore.pollTick = (appStore.pollTick || 0) + 1;
      emitStoreChange();
    }
  } catch (err) {
    // Next poll cycle will retry automatically
  }
}

/**
 * Cache of notification IDs that have already triggered a desktop notification.
 */
const NOTIFIED_NOTIFICATION_IDS = new Set();
let hasInitializedNotifiedCache = false;

/**
 * Polls for new unread notifications and triggers toast popups.
 */
export async function notifPollOnce() {
  const isBackgroundPushEnabled =
    Boolean(PUSH.active) && "Notification" in window && Notification.permission === "granted";

  if (
    !API.authed ||
    !appStore.currentUser ||
    !canViewModule("notifications") ||
    appStore.screen !== "app" ||
    (document.hidden && !isBackgroundPushEnabled && !isNotificationSoundEnabled())
  ) {
    return;
  }

  const latestKnownId = Math.max(NOTIF_LAST, notifMaxId());

  try {
    const response = await API.notifPoll(latestKnownId);
    const existingNotificationIds = (appStore.database.notifications || []).map((n) => n.id);

    // Seed notified cache on first poll with currently loaded notifications to avoid initial barrage
    if (!hasInitializedNotifiedCache && Array.isArray(appStore.database.notifications)) {
      appStore.database.notifications.forEach((n) => {
        if (n && n.id) NOTIFIED_NOTIFICATION_IDS.add(Number(n.id));
      });
      hasInitializedNotifiedCache = true;
    }

    const unreadNum = Number(response.unread) || 0;
    appStore.database.unread = unreadNum;
    appStore.database.unreadCount = unreadNum;

    const brandNewNotifications = (response.items || []).filter(
      (item) => item.id > latestKnownId && !existingNotificationIds.includes(item.id)
    );

    const newlyUnreadToNotify = [];

    // 1. Detect brand new notifications
    brandNewNotifications.forEach((item) => {
      if (!item.read && !NOTIFIED_NOTIFICATION_IDS.has(Number(item.id))) {
        newlyUnreadToNotify.push(item);
        NOTIFIED_NOTIFICATION_IDS.add(Number(item.id));
      }
    });

    // 2. Detect existing notifications whose read status changed (e.g. manually set not_is_read = 0 in database)
    if (Array.isArray(response.items) && Array.isArray(appStore.database.notifications)) {
      const itemsMap = new Map(response.items.map((item) => [item.id, item]));
      appStore.database.notifications.forEach((existing) => {
        const remote = itemsMap.get(existing.id);
        if (remote) {
          const wasRead = existing.read && !remote.read;
          if (remote.read !== existing.read) {
            existing.read = remote.read;
            existing.isRead = remote.isRead;
          }

          // If the notification became unread or is unread and not yet notified
          if (wasRead || (!remote.read && !NOTIFIED_NOTIFICATION_IDS.has(Number(existing.id)))) {
            newlyUnreadToNotify.push(remote);
            NOTIFIED_NOTIFICATION_IDS.add(Number(existing.id));
          } else if (remote.read) {
            // When read, remove from cache so it can be re-notified if ever toggled back to 0
            NOTIFIED_NOTIFICATION_IDS.delete(Number(existing.id));
          }
        }
      });
    }

    if (brandNewNotifications.length > 0) {
      appStore.database.notifications = [
        ...brandNewNotifications,
        ...(appStore.database.notifications || [])
      ].slice(0, 100);

      NOTIF_LAST = Math.max(latestKnownId, brandNewNotifications[0].id);
    }

    // Trigger in-app transient popup, alarm sound, and OS / Windows desktop notification (if push active)
    if (newlyUnreadToNotify.length > 0) {
      newlyUnreadToNotify.slice(0, 3).reverse().forEach(showNotificationToastPopup);
      playNotificationAlarm(newlyUnreadToNotify[0]);
      if (PUSH.active) {
        newlyUnreadToNotify.slice(0, 3).forEach(pushLocalNotify);
      }
    }

    emitStoreChange();
  } catch (err) {
    // Next check will retry
  }
}

let notificationPopupSequence = 0;

/**
 * Displays an ephemeral corner toast card for an incoming notification.
 */
function showNotificationToastPopup(notificationItem) {
  const popupItem = {
    key: ++notificationPopupSequence,
    n: notificationItem,
    notification: notificationItem,
    out: false
  };

  appStore.notificationPopups = [...(appStore.notificationPopups || []), popupItem].slice(-3);
  emitStoreChange();

  setTimeout(() => dismissPop(popupItem), 8000);
}

/**
 * Dismisses a notification toast card with exit animation.
 */
export function dismissPop(popupItem) {
  if (popupItem.out) return;
  popupItem.out = true;
  emitStoreChange();

  setTimeout(() => {
    appStore.notificationPopups = (appStore.notificationPopups || []).filter((item) => item !== popupItem);
    emitStoreChange();
  }, 220);
}

/**
 * Quick 15s poll checking pending password reset requests for Admins.
 */
async function pollPasswordResetsQuickCheck() {
  if (
    !API.authed ||
    !appStore.currentUser ||
    !isAdminUser() ||
    !canViewModule("password_reset_request") ||
    document.hidden ||
    appStore.screen !== "app"
  ) {
    return;
  }

  try {
    const response = await API.pwPending();
    if (response.pending === null || response.pending === undefined) return;

    appStore.database.pwResets = response.pending;
    emitStoreChange();
  } catch (err) {
    // Retried next cycle
  }
}

/**
 * Handler triggered when the browser tab gains visibility.
 */
function handleTabVisibilityChange() {
  if (!document.hidden && workspacePollIntervalId) {
    pollWorkspaceOnce();
    pollPasswordResetsQuickCheck();
    notifPollOnce();
  }
}

/**
 * Activates background polling timers.
 */
export function startPoll() {
  stopPoll();
  initNotificationAudioUnlock();

  workspacePollIntervalId = setInterval(() => {
    if (!document.hidden) {
      pollWorkspaceOnce();
    }
  }, 45000);

  passwordResetPollIntervalId = setInterval(pollPasswordResetsQuickCheck, 15000);
  NOTIF_LAST = notifMaxId();
  notificationPollIntervalId = setInterval(notifPollOnce, 15000);

  document.addEventListener("visibilitychange", handleTabVisibilityChange);

  if (!isPushInitialized) {
    isPushInitialized = true;
    pushInit().then(() => emitStoreChange());
  }
}

/**
 * Deactivates all background polling timers.
 */
export function stopPoll() {
  if (workspacePollIntervalId) {
    clearInterval(workspacePollIntervalId);
    workspacePollIntervalId = null;
  }
  if (passwordResetPollIntervalId) {
    clearInterval(passwordResetPollIntervalId);
    passwordResetPollIntervalId = null;
  }
  if (notificationPollIntervalId) {
    clearInterval(notificationPollIntervalId);
    notificationPollIntervalId = null;
  }

  document.removeEventListener("visibilitychange", handleTabVisibilityChange);
  isPushInitialized = false;
}

// Backward compatibility aliases
export {
  pollWorkspaceOnce as pollOnce,
  dismissPop as dismissNotificationPopup,
  startPoll as startBackgroundPolling,
  stopPoll as stopBackgroundPolling
};

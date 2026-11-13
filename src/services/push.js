/**
 * Push Notifications & Service Worker Integration
 *
 * Manages Web Push API lifecycle, local notification fallback for demo mode,
 * iOS PWA standalone detection, and bidirectional messaging with `sw.js`.
 */

import { API, CONFIG } from "./api.js";
import { appStore } from "../store/appStore.js";

/**
 * Global push state singleton.
 */
export const PUSH = {
  supported: false,
  ready: false,
  active: false,
  endpoint: "",
  reg: null,
  publicKey: "",
  reason: ""
};

const DEMO_ENDPOINT_IDENTIFIER = "demo-device";

/**
 * Checks whether the browser and environment support Web Push notifications.
 *
 * @returns {boolean}
 */
function isPushSupported() {
  return Boolean(
    typeof window !== "undefined" &&
      window.isSecureContext &&
      "serviceWorker" in navigator &&
      "Notification" in window
  );
}

/**
 * Detects iOS devices (iPhone, iPad, iPod).
 *
 * @returns {boolean}
 */
export function pushIsIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

/**
 * Checks if the web app is running as an installed PWA (standalone mode).
 *
 * @returns {boolean}
 */
export function pushIsStandalone() {
  return (
    (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
    window.navigator.standalone === true
  );
}

/**
 * Initializes push services after user authentication.
 */
export async function pushInit() {
  PUSH.supported = isPushSupported();

  if (!PUSH.supported) {
    PUSH.reason = window.isSecureContext
      ? "This browser does not support push notifications."
      : "Push notifications need the secure (https) address of the CRM.";
    return;
  }

  try {
    if ("serviceWorker" in navigator) {
      try {
        PUSH.reg = await navigator.serviceWorker.register("sw.js", { updateViaCache: "none" });
      } catch (swErr) {
        console.warn("ServiceWorker registration skipped or failed:", swErr);
      }
    }
    const serverConfig = await API.pushConfig();
    PUSH.ready = Boolean(serverConfig.ready);
    PUSH.reason = serverConfig.reason || "";

    if (PUSH.ready && serverConfig.devices > 0 && Notification.permission === "granted") {
      PUSH.active = true;
      PUSH.endpoint = DEMO_ENDPOINT_IDENTIFIER;
    } else {
      PUSH.active = false;
      PUSH.endpoint = "";
    }
  } catch (err) {
    PUSH.reason = `Push notifications could not start: ${err.message || err}`;
  }
}

/**
 * Requests notification permission from user and activates push subscription.
 */
export async function pushEnable() {
  if (!PUSH.supported) {
    throw new Error(PUSH.reason || "This browser does not support push notifications.");
  }
  if (pushIsIOS() && !pushIsStandalone()) {
    throw new Error(
      "On iPhone / iPad: open the CRM in Safari, tap Share > Add to Home Screen, open it from the Home Screen and turn notifications on there."
    );
  }
  if (!PUSH.reg) {
    await pushInit();
  }
  if (!PUSH.ready) {
    throw new Error(PUSH.reason || "Push notifications are not set up yet.");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error(
      permission === "denied"
        ? "Notifications are blocked for this site. Click the lock icon next to the address, set Notifications to Allow, then try again."
        : "Notifications were not allowed."
    );
  }

  await API.pushSubscribe({ endpoint: DEMO_ENDPOINT_IDENTIFIER });
  PUSH.active = true;
  PUSH.endpoint = DEMO_ENDPOINT_IDENTIFIER;
}

/**
 * Unsubscribes current device from push notifications.
 */
export async function pushDisable() {
  try {
    await API.pushUnsubscribe(DEMO_ENDPOINT_IDENTIFIER).catch(() => {});
  } finally {
    PUSH.active = false;
    PUSH.endpoint = "";
  }
}

/**
 * Displays a system/desktop notification on this device.
 *
 * @param {string} title
 * @param {string} body
 * @param {string} url
 * @param {string} tag
 */
export function showDeviceNotification(title, body, url, tag, force = false) {
  if (!force && !PUSH.active) return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;

  try {
    if (PUSH.reg && typeof PUSH.reg.showNotification === "function") {
      PUSH.reg
        .showNotification(title, {
          body,
          tag,
          icon: "/assets/img/icon-192.png",
          badge: "/assets/img/badge-72.png",
          data: { url }
        })
        .catch(() => {
          try {
            const notification = new Notification(title, {
              body,
              tag,
              icon: "/assets/img/icon-192.png"
            });
            notification.onclick = () => {
              window.focus();
              if (url) location.hash = url;
              notification.close();
            };
          } catch (e) {}
        });
    } else {
      const notification = new Notification(title, {
        body,
        tag,
        icon: "/assets/img/icon-192.png"
      });
      notification.onclick = () => {
        window.focus();
        if (url) location.hash = url;
        notification.close();
      };
    }
  } catch (err) {
    try {
      const notification = new Notification(title, {
        body,
        tag,
        icon: "/assets/img/icon-192.png"
      });
      notification.onclick = () => {
        window.focus();
        if (url) location.hash = url;
        notification.close();
      };
    } catch (e) {}
  }
}

/**
 * Emits a local device notification when a CRM event arrives.
 *
 * @param {Object} notificationItem
 */
export function pushLocalNotify(notificationItem) {
  if (!PUSH.active) return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;

  const title = notificationItem.actor ? `${notificationItem.actor} · 10X CRM` : (CONFIG.APP_NAME || "10X Agency CRM");
  const bodyText = `${notificationItem.title || ""}${notificationItem.body ? `\n${notificationItem.body}` : ""}`;
  let targetUrl = "#/notifications";
  if (notificationItem.task) {
    targetUrl = `#/task/${notificationItem.task}`;
  } else if (notificationItem.project) {
    targetUrl = `#/project/${notificationItem.project}`;
  } else if (notificationItem.deal) {
    targetUrl = `#/deals`;
  }

  showDeviceNotification(title, bodyText, targetUrl, `crm-n-${notificationItem.id}-${Date.now()}`);
}

/**
 * Listens for messages sent from the Service Worker (e.g. notification click events).
 *
 * @param {Function} onOpen - Callback with target URL
 * @param {Function} onPush - Callback on push event
 * @returns {Function} Unsubscribe cleanup function
 */
export function listenServiceWorker(onOpen, onPush) {
  if (!("serviceWorker" in navigator)) return () => {};

  const messageHandler = (event) => {
    const data = event.data || {};
    if (!appStore.currentUser) return;

    if (data.type === "crm-open") {
      window.focus();
      onOpen(data.url);
    } else if (data.type === "crm-push") {
      onPush();
    }
  };

  navigator.serviceWorker.addEventListener("message", messageHandler);
  return () => navigator.serviceWorker.removeEventListener("message", messageHandler);
}

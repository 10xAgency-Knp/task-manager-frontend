/**
 * Notifications Page & Feed Component
 *
 * Displays personal notifications feed, categorized by urgency:
 * - Direct task assignments
 * - Task overdue alerts
 * - Task due soon warnings
 * - @mentions in comments
 * - Status transitions
 * - File attachments
 * - Password reset requests (urgent for Admins)
 */

import { appStore, emitStoreChange, showToast, showErrorToast } from "../store/appStore.js";
import { API } from "../services/api.js";
import { Icon } from "../components/Icon.jsx";
import { formatPlural, formatDateTime, isAdminUser } from "../utils/helpers.js";
import { focusOnItem, navigateToDetail, navigateToView } from "../routes/navigation.js";
import { EmptyStateBox } from "../components/ui.jsx";
import { openPwReset } from "./Admin.jsx";

/**
 * Visual styling configuration for notification types (icon name, accent color, background color).
 *
 * @param {string} notificationKind
 * @returns {{ i: string, icon: string, c: string, color: string, bg: string, background: string }}
 */
export function notifLook(notificationKind) {
  const styleMap = {
    assigned: { icon: "plus", color: "#0b3d91", background: "#e8eefc" },
    overdue: { icon: "alert", color: "#d94b4b", background: "#fdeaea" },
    due_soon: { icon: "clock", color: "#e0a13a", background: "#fdf3e2" },
    mention: { icon: "chat", color: "#7a5af8", background: "#f0ecff" },
    status: { icon: "refresh", color: "#2e75b6", background: "#e8f1fa" },
    file: { icon: "file", color: "#5aa236", background: "#eef7e8" },
    comment: { icon: "chat", color: "#2e75b6", background: "#e8f1fa" },
    task_comment: { icon: "chat", color: "#2e75b6", background: "#e8f1fa" },
    pwreset: { icon: "key", color: "#d94b4b", background: "#fdeaea" },
    account: { icon: "lock", color: "#0b3d91", background: "#e8eefc" },
    external: { icon: "team", color: "#c2410c", background: "#fff1e6" }
  };

  const selected = styleMap[notificationKind] || { icon: "bell", color: "#8894ac", background: "#eef1f7" };

  return {
    i: selected.icon,
    icon: selected.icon,
    c: selected.color,
    color: selected.color,
    bg: selected.background,
    background: selected.background
  };
}

/**
 * Renders associated metadata badges for a notification (task key, project name, outside contact).
 */
export function NotifContext({ n: notification }) {
  const item = notification;
  return (
    <>
      {item.task && (
        <span className="np-ctx">
          {item.task}
          {item.taskTitle && <> &middot; {item.taskTitle}</>}
        </span>
      )}
      {item.projectName && (
        <span className="np-ctx">
          <Icon name="proj" />
          {item.projectName}
        </span>
      )}
      {item.external && (
        <span className="ext-tag" title="Not a CRM user. Shown by name only.">
          Outside contact: {item.external}
        </span>
      )}
    </>
  );
}

/**
 * Main Notifications view component.
 */
export function Notifications() {
  const pendingPasswordResetIds =
    isAdminUser() && appStore.database.pwResets ? appStore.database.pwResets.map((req) => req.id) : [];

  const isUrgentNotification = (notification) =>
    notification.kind === "pwreset" && pendingPasswordResetIds.includes(notification.resetId);

  const notificationsList = (appStore.database.notifications || []).slice().sort((itemA, itemB) => {
    const isAUrgent = isUrgentNotification(itemA);
    const isBUrgent = isUrgentNotification(itemB);
    return (isBUrgent ? 1 : 0) - (isAUrgent ? 1 : 0);
  });

  const handleMarkAllAsRead = async () => {
    try {
      await API.notifRead();
      (appStore.database.notifications || []).forEach((item) => {
        item.read = 1;
        item.isRead = true;
      });
      appStore.database.unread = 0;
      appStore.database.unreadCount = 0;
      emitStoreChange();
      showToast("All notifications marked as read");
    } catch (err) {
      showErrorToast(err);
    }
  };

  const handleNotificationClick = (notification) => {
    if (!notification.read) {
      notification.read = 1;
      notification.isRead = true;
      const newCount = Math.max(0, (Number(appStore.database.unreadCount ?? appStore.database.unread) || 0) - 1);
      appStore.database.unread = newCount;
      appStore.database.unreadCount = newCount;
      emitStoreChange();
      API.notifRead(notification.id).catch(() => {});
    }

    if (notification.kind === "pwreset" || notification.resetId) {
      if (notification.resetId) {
        openPwReset(notification.resetId);
      } else {
        navigateToView("admin");
      }
      return;
    }

    if (notification.task) {
      navigateToDetail("task", notification.task);
      return;
    }

    if (notification.project) {
      navigateToDetail("project", notification.project);
      return;
    }

    if (notification.deal) {
      navigateToView("deals");
      return;
    }

    if (notification.userId && notification.kind === "user") {
      navigateToDetail("user", notification.userId);
      return;
    }

    // No directed module: normally get readed (already marked as read above)
  };

  const unreadCount = Number(appStore.database.unread) || 0;

  return (
    <>
      <div className="page-head">
        <span className="info">
          {formatPlural(notificationsList.length, "notification")}
          {unreadCount > 0 && (
            <>
              {" "}
              &middot; <b style={{ color: "#d94b4b" }}>{unreadCount} unread</b>
            </>
          )}
        </span>
        <span className="spacer" />
        {unreadCount > 0 && (
          <button className="btn btn-ghost btn-sm" id="markAll" onClick={handleMarkAllAsRead}>
            <Icon name="check" /> Mark all as read
          </button>
        )}
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        {notificationsList.length > 0 ? (
          notificationsList.map((notification) => {
            const visualStyle = notifLook(notification.kind);
            const isUrgent = isUrgentNotification(notification);

            return (
              <div
                key={notification.id}
                className={`notif ${notification.read ? "" : "unread"}${isUrgent ? " notif-urgent" : ""}`}
                data-notif={notification.id}
                onClick={() => handleNotificationClick(notification)}
              >
                <span className="notif-ico" style={{ background: visualStyle.bg, color: visualStyle.c }}>
                  <Icon name={visualStyle.i} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {isUrgent && <span className="urgent-tag">HIGH PRIORITY &middot; Pending</span>}
                  <div className="t">{notification.title}</div>
                  <div className="b">{notification.body || ""}</div>
                  {(notification.task || notification.projectName || notification.external) && (
                    <div className="np-meta" style={{ marginTop: 4 }}>
                      <NotifContext n={notification} />
                    </div>
                  )}
                  <div className="w">
                    {notification.actor && (
                      <>
                        {notification.actor}
                        {notification.actorRole ? ` (${notification.actorRole})` : ""} &middot;{" "}
                      </>
                    )}
                    {formatDateTime(notification.at)}
                  </div>
                </div>
                {notification.task && (
                  <span className="go">
                    <Icon name="chev" />
                  </span>
                )}
              </div>
            );
          })
        ) : (
          <EmptyStateBox
            icon="bell"
            title="No notifications"
            subtitle="You will be notified here when tasks are assigned to you or someone mentions you"
          />
        )}
      </div>
    </>
  );
}

// Backward compatibility exports
export {
  Notifications as NotificationsPage,
  notifLook as getNotificationStyleConfig,
  NotifContext as NotificationContextDetails
};

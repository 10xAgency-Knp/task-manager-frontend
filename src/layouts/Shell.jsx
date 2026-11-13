/**
 * Application Frame Layout Shell
 *
 * Provides the main master layout containing:
 * - Collapsible navigation sidebar (responsive mobile drawer)
 * - Top header bar with dynamic page title, global search, and action buttons
 * - Global Ctrl+K full-text search with debounce & keyboard arrow navigation
 * - Notification dropdown drawer and transient corner popups
 * - Global modal host and toast notification overlay container
 */
import { useEffect, useRef, useState } from "react";
import { Outlet, useBlocker, useLocation, useMatches, useNavigationType, useParams } from "react-router-dom";
import {
  appStore,
  setStoreState,
  emitStoreChange,
  showToast,
  showErrorToast,
  useAppStore
} from "../store/appStore.js";
import { API, CONFIG } from "../services/api.js";
import { Icon } from "../components/Icon.jsx";
import {
  VIEWS,
  NAV_GROUPS,
  isViewAllowed,
  getViewLabel,
  getViewSubtitle,
  navigateToView,
  navigateToDetail,
  openHash,
  isMobileViewport
} from "../routes/navigation.js";
import {
  isTaskOpen,
  isTaskAssignedToUser,
  isTaskOverdue,
  isCurrentUserAdmin,
  can,
  debounce,
  formatDateTime,
  getUserById,
  PRIORITY_BADGE_CLASSES
} from "../utils/helpers.js";
import { dismissPop, notifPollOnce } from "../services/sync.js";
import { PUSH, pushEnable, listenServiceWorker } from "../services/push.js";
import {
  isNotificationSoundEnabled,
  toggleNotificationSound,
  playNotificationAlarm
} from "../services/notificationSound.js";
import { Avatar } from "../components/ui.jsx";
import { ModalHost, requestCloseModal, closeModal } from "../components/Modal.jsx";
import { askSignOut } from "../pages/Auth.jsx";
import { openTask } from "../components/forms/TaskForm.jsx";
import { notifLook, NotifContext } from "../pages/Notifications.jsx";
import { PwBanner, openPwReset } from "../pages/Admin.jsx";

const SIDEBAR_COLLAPSED_STORAGE_KEY = "crm10x_sb_collapsed";

/**
 * Resolves current route target from URL parameters
 * @returns {{ view?: string, focus?: { type: string, id: any }, notFound?: boolean }}
 */
function useCurrentRoute() {
  const matches = useMatches();
  const routeParams = useParams();
  const routeHandle = (matches[matches.length - 1] || {}).handle || {};

  if (routeHandle.detail) {
    const rawEntityId = routeParams[routeHandle.param];
    const resolvedId =
      routeHandle.detail === "user"
        ? Number(rawEntityId) || rawEntityId
        : rawEntityId;
    return {
      focus: {
        type: routeHandle.detail,
        id: resolvedId
      }
    };
  }

  if (routeHandle.notFound || (routeParams.view && !VIEWS[routeParams.view])) {
    return { notFound: true };
  }

  return { view: routeParams.view || "dashboard" };
}

/**
 * Master Application Shell Layout Component
 */
export function Shell() {
  useAppStore(); // Re-render when store updates (sidebar counts, page title, notifications)

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "1";
    } catch (storageError) {
      return false;
    }
  });

  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const mainContentRef = useRef(null);

  // Listen for mobile sidebar toggle requests
  useEffect(() => {
    const handleSidebarToggleEvent = event => {
      setIsMobileDrawerOpen(Boolean(event.detail));
    };
    document.addEventListener("crm-sidebar", handleSidebarToggleEvent);
    return () => document.removeEventListener("crm-sidebar", handleSidebarToggleEvent);
  }, []);

  // Synchronize route state with global store
  const activeRoute = useCurrentRoute();
  const currentLocation = useLocation();
  const navigationType = useNavigationType();

  if (appStore.routeKey !== currentLocation.pathname) {
    appStore.routeKey = currentLocation.pathname;
    appStore.pageHeader = null;
    appStore.focusedEntity = activeRoute.focus || null;
    appStore.isNotFound = Boolean(activeRoute.notFound);
    if (activeRoute.view) {
      appStore.currentView = activeRoute.view;
    }
  }

  const previousPathnameRef = useRef(currentLocation.pathname);

  useEffect(() => {
    if (previousPathnameRef.current === currentLocation.pathname) return;
    previousPathnameRef.current = currentLocation.pathname;
    window.scrollTo(0, 0);

    // Close any non-closing modal on browser history navigation
    if (navigationType === "POP" && appStore.activeModal && !appStore.activeModal.closing) {
      closeModal();
    }
  }, [currentLocation.pathname, navigationType]);

  // Global Keyboard Shortcuts (Escape to dismiss, Ctrl+K for search)
  useEffect(() => {
    const handleGlobalKeyDown = event => {
      if ((event.ctrlKey || event.metaKey) && (event.key === "k" || event.key === "K")) {
        const searchInputElement = document.getElementById("gSearch");
        if (searchInputElement && searchInputElement.offsetParent !== null) {
          event.preventDefault();
          searchInputElement.focus();
          searchInputElement.select();
        }
      }

      if (event.key === "Escape") {
        if (appStore.confirmModalStack.length > 0) {
          event.preventDefault();
          const topConfirmItem = appStore.confirmModalStack[appStore.confirmModalStack.length - 1];
          appStore.confirmModalStack = appStore.confirmModalStack.slice(0, -1);
          emitStoreChange();
          if (topConfirmItem.opts?.onCancel) {
            topConfirmItem.opts.onCancel();
          }
          return;
        }

        if (appStore.activeModal) {
          requestCloseModal();
        }

        if (appStore.isNotificationPanelOpen) {
          appStore.isNotificationPanelOpen = false;
          emitStoreChange();
        }

        setIsMobileDrawerOpen(false);
      }
    };

    document.addEventListener("keydown", handleGlobalKeyDown);

    const unsubscribePushWorker = listenServiceWorker(
      targetUrl => openHash(targetUrl || "#/notifications"),
      () => notifPollOnce()
    );

    return () => {
      document.removeEventListener("keydown", handleGlobalKeyDown);
      unsubscribePushWorker();
    };
  }, []);

  // Metric counts for sidebar badges
  const currentUser = appStore.currentUser;
  const database = appStore.database;

  const myOpenTaskCount = (database.tasks || []).filter(
    task => isTaskOpen(task) && isTaskAssignedToUser(task, currentUser?.id)
  ).length;

  const overdueTaskCount = (database.tasks || []).filter(
    task => isTaskOverdue(task) && isTaskAssignedToUser(task, currentUser?.id)
  ).length;

  const unreadNotificationCount = Number(database.unreadCount) || 0;
  const pendingPasswordResetsCount =
    isCurrentUserAdmin() && database.pwResets ? database.pwResets.length : 0;

  // Browser document title reflecting unread notifications
  useEffect(() => {
    document.title =
      (unreadNotificationCount ? `(${unreadNotificationCount}) ` : "") + CONFIG.APP_NAME;
  }, [unreadNotificationCount]);

  // Compute active page title and subtitle
  let pageTitle = "";
  let pageSubtitle = "";

  if (appStore.focusedEntity) {
    const focused = appStore.focusedEntity;
    pageTitle =
      appStore.pageHeader?.title ||
      (focused.type === "task" ? "Task" : focused.type === "project" ? "Project" : "Member");
    pageSubtitle =
      appStore.pageHeader?.subtitle || (focused.type === "task" ? String(focused.id) : "");
  } else if (appStore.isNotFound) {
    pageTitle = "Page not found";
    pageSubtitle = "";
  } else {
    pageTitle = getViewLabel(appStore.currentView);
    pageSubtitle = getViewSubtitle(appStore.currentView);
  }

  const toggleSidebar = () => {
    if (isMobileViewport()) {
      setIsMobileDrawerOpen(previous => !previous);
    } else {
      const nextCollapsedState = !isSidebarCollapsed;
      setIsSidebarCollapsed(nextCollapsedState);
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, nextCollapsedState ? "1" : "0");
      } catch (storageError) {
        // Handled in incognito mode
      }
    }
  };

  const handleCreateNewTask = () => {
    if (!can.createTask()) {
      showToast("You do not have permission to create tasks.", "err");
      return;
    }
    openTask(null, {});
  };

  return (
    <div className="app">
      {/* Navigation Sidebar */}
      <aside
        className={
          "sidebar" +
          (isSidebarCollapsed ? " collapsed" : "") +
          (isMobileDrawerOpen ? " open" : "")
        }
        id="sidebar"
      >
        <div className="sb-head">
          <div
            className="logo-plate"
            role="button"
            tabIndex={0}
            title="Go to Dashboard"
            style={{ cursor: "pointer" }}
            onClick={() => navigateToView("dashboard")}
            onKeyDown={event => {
              if (event.key === "Enter") navigateToView("dashboard");
            }}
          >
            <img src={CONFIG.LOGO} alt={CONFIG.ORG} />
          </div>
        </div>

        <div className="sb-name">{CONFIG.APP_NAME}</div>

        <nav className="nav" id="nav">
          {NAV_GROUPS.map(group => {
            const allowedViewItems = group.items.filter(isViewAllowed);
            if (!allowedViewItems.length) return null;

            return [
              <div className="nav-label" key={group.label}>
                {group.label}
              </div>
            ].concat(
              allowedViewItems.map(viewKey => {
                const label = getViewLabel(viewKey);
                let badgeElement = null;

                if (viewKey === "mytasks" && myOpenTaskCount) {
                  badgeElement = <span className="nav-count">{myOpenTaskCount}</span>;
                }
                if (viewKey === "notifications" && unreadNotificationCount) {
                  badgeElement = <span className="nav-count">{unreadNotificationCount}</span>;
                }
                if (viewKey === "dashboard" && overdueTaskCount) {
                  badgeElement = (
                    <span className="nav-dot" title={`${overdueTaskCount} overdue`} />
                  );
                }
                if (viewKey === "pwresets" && pendingPasswordResetsCount) {
                  badgeElement = (
                    <span className="nav-count" style={{ background: "var(--red)" }}>
                      {pendingPasswordResetsCount}
                    </span>
                  );
                }

                const isItemActive =
                  viewKey === appStore.currentView &&
                  !appStore.focusedEntity &&
                  !appStore.isNotFound;

                return (
                  <button
                    key={viewKey}
                    className={
                      "nav-item" +
                      (isItemActive ? " active" : "") +
                      (viewKey === "notifications" && pendingPasswordResetsCount ? " nav-urgent" : "")
                    }
                    data-nav={viewKey}
                    title={label}
                    onClick={() => navigateToView(viewKey)}
                  >
                    <span className="nav-ico">
                      <Icon name={VIEWS[viewKey].icon} />
                    </span>
                    <span className="lbl">{label}</span>
                    {badgeElement}
                  </button>
                );
              })
            );
          })}
        </nav>

        {/* Current User Profile Footer */}
        <div className="sb-foot" id="sbFoot">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              className="me"
              id="meBox"
              title="My settings"
              onClick={() => navigateToView("settings")}
            >
              <Avatar user={currentUser?.id} className="sm" />
              <div className="me-txt">
                <strong>{currentUser?.name}</strong>
                <span>
                  <i className="on-dot" />
                  {currentUser?.role || ""}
                  {currentUser?.superAdmin ? " (Super Admin)" : ""}
                </span>
              </div>
            </div>

            <button
              className="sb-btn"
              id="sbOut"
              title="Sign out"
              onClick={askSignOut}
            >
              <Icon name="out" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Sidebar Backdrop */}
      <div
        className={"sb-backdrop" + (isMobileDrawerOpen ? " show" : "")}
        id="sbBackdrop"
        onClick={() => setIsMobileDrawerOpen(false)}
      />

      {/* Main View Area */}
      <div className="main">
        <header className="topbar">
          <button
            className="icon-sq"
            id="sbToggle"
            title="Menu"
            onClick={toggleSidebar}
          >
            <Icon name="menu" />
          </button>

          <div className="title-wrap">
            <div className="page-title" id="pTitle">
              {pageTitle}
            </div>
            <div className="page-sub" id="pSub">
              {pageSubtitle}
            </div>
          </div>

          <div className="top-actions">
            <GlobalSearch />

            <button
              className="btn btn-primary btn-sm"
              id="topNewTask"
              onClick={handleCreateNewTask}
            >
              <Icon name="plus" />
              <span className="hide-sm"> Create Task</span>
            </button>

            <button
              className={
                "icon-sq" + (pendingPasswordResetsCount ? " bell-urgent" : "")
              }
              id="topBell"
              title="Notifications"
              style={{ position: "relative" }}
              onClick={event => {
                event.stopPropagation();
                setStoreState({
                  isNotificationPanelOpen: !appStore.isNotificationPanelOpen
                });
              }}
            >
              <Icon name="bell" />
              {unreadNotificationCount ? (
                <span className="badge bell-count" id="bellCount">
                  {unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}
                </span>
              ) : null}
            </button>
          </div>
        </header>

        <div id="pwBanner">
          <PwBanner />
        </div>

        <main
          className="content page-in"
          id="content"
          key={currentLocation.pathname}
          ref={mainContentRef}
        >
          <Outlet />
        </main>
      </div>

      {appStore.activeModal?.form ? <UnsavedFormGuard /> : null}
      {appStore.isNotificationPanelOpen ? <NotificationPanelDrawer /> : null}
      <NotificationPopupsContainer />
    </div>
  );
}

/**
 * Guard preventing accidental browser Back navigation when active form has unsaved modifications
 */
function UnsavedFormGuard() {
  const navigationBlocker = useBlocker(
    ({ historyAction }) =>
      historyAction === "POP" &&
      Boolean(
        appStore.activeModal &&
          !appStore.activeModal.closing &&
          appStore.activeModal.dirty &&
          appStore.activeModal.dirty()
      )
  );

  useEffect(() => {
    if (navigationBlocker.state === "blocked") {
      navigationBlocker.reset();
      requestCloseModal();
    }
  }, [navigationBlocker.state]);

  return null;
}

/* ==========================================================================
   GLOBAL SEARCH COMPONENT
   ========================================================================== */

function GlobalSearch() {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isResultsDropdownOpen, setIsResultsDropdownOpen] = useState(false);
  const [selectedResultIndex, setSelectedResultIndex] = useState(-1);

  const lastTypedTimestampRef = useRef(0);
  const searchWrapperRef = useRef(null);
  const searchInputRef = useRef(null);

  const executeDebouncedSearch = useRef(
    debounce(async queryText => {
      if (queryText.length < 2) {
        setIsResultsDropdownOpen(false);
        return;
      }
      try {
        const response = await API.search(queryText);
        if (searchInputRef.current && searchInputRef.current.value.trim() !== queryText) {
          return;
        }
        setSearchResults(response.results || []);
        setSelectedResultIndex(-1);
        setIsResultsDropdownOpen(true);
      } catch (searchError) {
        showErrorToast(searchError);
      }
    }, 250)
  ).current;

  useEffect(() => {
    const handleOutsideClick = event => {
      if (searchWrapperRef.current && !searchWrapperRef.current.contains(event.target)) {
        setIsResultsDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);

    // Safeguard against browser autofill populating search input with user email
    const clearAutofilledSearch = () => {
      const inputElement = searchInputRef.current;
      if (
        inputElement &&
        inputElement.value &&
        Date.now() - lastTypedTimestampRef.current > 1500 &&
        inputElement.value.trim().toLowerCase() ===
          String(appStore.currentUser?.email || "").toLowerCase()
      ) {
        setSearchQuery("");
        setIsResultsDropdownOpen(false);
      }
    };

    const autofillCheckTimers = [300, 1200, 3000].map(delayMs =>
      setTimeout(clearAutofilledSearch, delayMs)
    );
    window.clearSearchAutofill = clearAutofilledSearch;

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      autofillCheckTimers.forEach(clearTimeout);
    };
  }, []);

  const handleSelectResult = index => {
    const selectedItem = searchResults[index];
    if (!selectedItem) return;

    setSearchQuery("");
    setIsResultsDropdownOpen(false);
    setSearchResults([]);

    if (searchInputRef.current) {
      searchInputRef.current.blur();
    }

    navigateToDetail(
      selectedItem.type === "person" ? "user" : selectedItem.type,
      selectedItem.id
    );
  };

  const groupHeaders = { task: "Tasks", project: "Projects", person: "People" };
  const groupIcons = { task: "list", project: "proj", person: "team" };
  let previousResultGroup = "";

  return (
    <div className="gsearch" id="gWrap" ref={searchWrapperRef}>
      <Icon name="search" />
      <input
        id="gSearch"
        ref={searchInputRef}
        type="search"
        name="crm-global-search"
        placeholder="Search tasks, projects, people"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck="false"
        data-lpignore="true"
        data-1p-ignore="true"
        data-form-type="other"
        aria-label="Search"
        maxLength={80}
        value={searchQuery}
        onKeyDown={event => {
          lastTypedTimestampRef.current = Date.now();
          if (!isResultsDropdownOpen || !searchResults.length) return;

          if (event.key === "ArrowDown") {
            event.preventDefault();
            setSelectedResultIndex(previousIndex =>
              Math.min(searchResults.length - 1, previousIndex + 1)
            );
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setSelectedResultIndex(previousIndex => Math.max(0, previousIndex - 1));
          } else if (event.key === "Enter") {
            event.preventDefault();
            handleSelectResult(selectedResultIndex < 0 ? 0 : selectedResultIndex);
          }
        }}
        onPaste={() => {
          lastTypedTimestampRef.current = Date.now();
        }}
        onChange={event => {
          const isUserTyping =
            (event.nativeEvent?.inputType &&
              event.nativeEvent.inputType !== "insertReplacementText") ||
            Date.now() - lastTypedTimestampRef.current < 1500;

          if (!isUserTyping) {
            setSearchQuery("");
            setIsResultsDropdownOpen(false);
            return;
          }

          setSearchQuery(event.target.value);
          executeDebouncedSearch(event.target.value.trim());
        }}
        onFocus={() => {
          if (searchQuery.trim().length >= 2 && searchResults.length > 0) {
            setIsResultsDropdownOpen(true);
          }
        }}
      />
      <kbd>Ctrl K</kbd>

      {isResultsDropdownOpen ? (
        <div className="sres" id="sres">
          {!searchResults.length ? (
            <div className="sres-head">No results</div>
          ) : (
            searchResults.map((item, index) => {
              const shouldRenderHeader = item.type !== previousResultGroup;
              previousResultGroup = item.type;

              return (
                <div key={item.type + item.id}>
                  {shouldRenderHeader ? (
                    <div className="sres-head">
                      {groupHeaders[item.type] || item.type}
                    </div>
                  ) : null}

                  <div
                    className={"sres-item" + (index === selectedResultIndex ? " sel" : "")}
                    data-si={index}
                    onMouseDown={event => {
                      event.preventDefault();
                      handleSelectResult(index);
                    }}
                  >
                    {item.type === "person" ? (
                      <Avatar user={item.id} className="sm" />
                    ) : (
                      <span className="nav-ico">
                        <Icon name={groupIcons[item.type] || "search"} />
                      </span>
                    )}

                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="tt ellipsis">{item.title}</div>
                      <div className="ss ellipsis">{item.sub || ""}</div>
                    </div>

                    {item.badge ? (
                      <span className={"badge " + (PRIORITY_BADGE_CLASSES[item.badge] || "b-grey")}>
                        {item.badge}
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}

/* ==========================================================================
   NOTIFICATIONS PANEL & POPUPS
   ========================================================================== */

/**
 * Handles clicking a notification item by marking it read and navigating to its target entity.
 * If no directed module is available or needed, the notification is simply marked as read.
 * @param {string|number} notificationId
 */
export function openNotificationById(notificationId) {
  const targetNotification = (appStore.database.notifications || []).find(
    item => String(item.id) === String(notificationId)
  );

  if (!targetNotification) return;

  if (!targetNotification.read) {
    targetNotification.read = 1;
    targetNotification.isRead = true;
    const newCount = Math.max(
      0,
      (Number(appStore.database.unreadCount ?? appStore.database.unread) || 0) - 1
    );
    appStore.database.unreadCount = newCount;
    appStore.database.unread = newCount;
    emitStoreChange();
    API.notifRead(targetNotification.id).catch(() => {});
  }

  // Password reset request
  if (targetNotification.kind === "pwreset" || targetNotification.resetId) {
    if (targetNotification.resetId) {
      openPwReset(targetNotification.resetId);
    } else {
      navigateToView("admin");
    }
    return;
  }

  // Task-related notification
  if (targetNotification.task) {
    navigateToDetail("task", targetNotification.task);
    return;
  }

  // Project-related notification
  if (targetNotification.project) {
    navigateToDetail("project", targetNotification.project);
    return;
  }

  // Deal-related notification
  if (targetNotification.deal) {
    navigateToView("deals");
    return;
  }

  // User-related notification
  if (targetNotification.userId && targetNotification.kind === "user") {
    navigateToDetail("user", targetNotification.userId);
    return;
  }

  // If no directed module is available or needed, the notification was already marked as read above.
}

function NotificationRowItem({ notification, compact, onOpen }) {
  const actorUser = notification.actorId ? getUserById(notification.actorId) : null;
  const visualConfig = notifLook(notification.kind);

  return (
    <div
      className={"np-item" + (notification.read ? "" : " unread")}
      data-npid={notification.id}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={event => {
        if (event.key === "Enter") onOpen();
      }}
    >
      <div className="np-av">
        {actorUser ? (
          <Avatar user={actorUser} className="sm" />
        ) : (
          <span
            className="notif-ico sm"
            style={{ background: visualConfig.bg, color: visualConfig.c }}
          >
            <Icon name={visualConfig.i} />
          </span>
        )}
      </div>

      <div className="np-main">
        <div className="np-top">
          <b>{notification.actor || "System"}</b>
          {notification.actorRole ? (
            <span className="np-role">{notification.actorRole}</span>
          ) : null}
          <span className="np-time">{formatDateTime(notification.at)}</span>
        </div>
        <div className="np-title">{notification.title}</div>
        {notification.body && !compact ? (
          <div className="np-body">{notification.body}</div>
        ) : null}
        <div className="np-meta">
          <NotifContext n={notification} />
        </div>
      </div>
    </div>
  );
}

function NotificationPanelDrawer() {
  const drawerContainerRef = useRef(null);
  const [dropdownPosition, setDropdownPosition] = useState(null);
  const [isPushSubscribing, setIsPushSubscribing] = useState(false);

  useEffect(() => {
    const bellButton = document.getElementById("topBell");
    if (bellButton && !isMobileViewport()) {
      const bellRect = bellButton.getBoundingClientRect();
      setDropdownPosition({
        top: bellRect.bottom + 8,
        right: Math.max(8, window.innerWidth - bellRect.right)
      });
    }

    const handleOutsideClick = event => {
      if (
        drawerContainerRef.current &&
        !drawerContainerRef.current.contains(event.target) &&
        !event.target.closest("#topBell")
      ) {
        setStoreState({ isNotificationPanelOpen: false });
      }
    };

    const outsideListenerTimeout = setTimeout(() => {
      document.addEventListener("mousedown", handleOutsideClick, true);
    }, 0);

    return () => {
      clearTimeout(outsideListenerTimeout);
      document.removeEventListener("mousedown", handleOutsideClick, true);
    };
  }, []);

  const notificationsList = (appStore.database.notifications || []).slice(0, 15);
  const unreadCount = appStore.database.unreadCount;

  const isWebPushAvailable =
    PUSH.supported &&
    PUSH.ready &&
    !PUSH.active &&
    "Notification" in window &&
    Notification.permission !== "denied";

  const handleMarkAllNotificationsRead = async () => {
    try {
      await API.notifRead();
      (appStore.database.notifications || []).forEach(notif => {
        notif.read = 1;
        notif.isRead = true;
      });
      appStore.database.unreadCount = 0;
      appStore.database.unread = 0;
      emitStoreChange();
    } catch (markError) {
      showErrorToast(markError);
    }
  };

  const handleEnablePushNotifications = async () => {
    setIsPushSubscribing(true);
    try {
      await pushEnable();
      showToast("Notifications are on for this device");
      emitStoreChange();
    } catch (pushError) {
      setIsPushSubscribing(false);
      showToast(pushError.message || String(pushError), "err");
    }
  };

  return (
    <div
      id="notifPanel"
      className="notif-panel"
      role="dialog"
      aria-label="Notifications"
      ref={drawerContainerRef}
      style={
        dropdownPosition
          ? { top: dropdownPosition.top, right: dropdownPosition.right }
          : undefined
      }
    >
      <div className="np-head">
        <b>Notifications</b>
        {unreadCount ? (
          <span className="badge b-red" style={{ marginLeft: 6 }}>
            {unreadCount} new
          </span>
        ) : null}

        <span className="spacer" />

        {unreadCount ? (
          <button
            className="btn btn-ghost btn-sm"
            id="npAll"
            onClick={handleMarkAllNotificationsRead}
          >
            Mark all read
          </button>
        ) : null}

        <button
          className="x"
          id="npSoundBtn"
          title={
            isNotificationSoundEnabled()
              ? "Notification alarm sound: On (click to mute)"
              : "Notification alarm sound: Muted (click to turn on)"
          }
          aria-label="Toggle notification alarm sound"
          style={{ display: "inline-flex", alignItems: "center" }}
          onClick={() => {
            const nextMode = toggleNotificationSound();
            emitStoreChange();
            if (nextMode !== "off") {
              playNotificationAlarm({ title: "Notification alarm enabled" }, { force: true });
              showToast("Notification alarm sound turned on");
            } else {
              showToast("Notification alarm sound muted");
            }
          }}
        >
          <Icon name={isNotificationSoundEnabled() ? "volOn" : "volOff"} />
        </button>

        <button
          className="x"
          id="npX"
          title="Close"
          aria-label="Close"
          onClick={() => setStoreState({ isNotificationPanelOpen: false })}
        >
          &#10005;
        </button>
      </div>

      {isWebPushAvailable ? (
        <div className="np-push">
          <span>Get these as pop-ups on this device, even when the CRM is closed.</span>
          <button
            className="btn btn-primary btn-sm"
            id="npPushOn"
            disabled={isPushSubscribing}
            onClick={handleEnablePushNotifications}
          >
            Turn on
          </button>
        </div>
      ) : null}

      <div className="np-list">
        {notificationsList.length ? (
          notificationsList.map(item => (
            <NotificationRowItem
              key={item.id}
              notification={item}
              onOpen={() => {
                setStoreState({ isNotificationPanelOpen: false });
                openNotificationById(item.id);
              }}
            />
          ))
        ) : (
          <div
            className="muted"
            style={{ padding: 22, textAlign: "center", fontSize: 12.6 }}
          >
            No notifications yet
          </div>
        )}
      </div>

      <button
        className="np-foot"
        id="npOpen"
        onClick={() => {
          setStoreState({ isNotificationPanelOpen: false });
          navigateToView("notifications");
        }}
      >
        Open all notifications
      </button>
    </div>
  );
}

function NotificationPopupsContainer() {
  if (!appStore.notificationPopups.length) return null;

  return (
    <div id="npPop" className="np-pop-wrap" aria-live="polite">
      {appStore.notificationPopups.map(popupItem => (
        <div
          key={popupItem.key}
          className={"np-pop" + (popupItem.out ? " out" : "")}
        >
          <NotificationRowItem
            notification={popupItem.n}
            onOpen={() => {
              dismissPop(popupItem);
              openNotificationById(popupItem.n.id);
            }}
          />
          <button
            className="np-pop-x"
            title="Dismiss"
            aria-label="Dismiss"
            onClick={event => {
              event.stopPropagation();
              dismissPop(popupItem);
            }}
          >
            &#10005;
          </button>
        </div>
      ))}
    </div>
  );
}

/**
 * Global Overlays Host (Modals, Confirmation Dialogs, and Toasts)
 */
export function Overlays() {
  useAppStore();

  return (
    <>
      <ModalHost />

      {appStore.activeToasts.length ? (
        <div className="toast-wrap">
          {appStore.activeToasts.map(toastItem => (
            <div
              key={toastItem.id}
              className={"toast " + toastItem.kind + (toastItem.out ? " out" : "")}
            >
              <Icon name={toastItem.kind === "err" ? "alert" : "check"} />
              <div>{toastItem.msg}</div>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}

// Backward-compatible exports
export const openNotifById = openNotificationById;

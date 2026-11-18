/**
 * Application Root Component
 *
 * Directs between authentication screens (Login, Forgot Password, Reset Password, Force Password Change)
 * and the authenticated CRM Workspace Shell Layout. Renders global overlays (modals and toasts).
 */
import { useEffect } from "react";
import { Outlet, useLocation, useMatches } from "react-router-dom";
import { useAppStore } from "./store/appStore.js";
import { boot, Login, Forgot, Reset, ForceChange } from "./pages/Auth.jsx";
import { Overlays } from "./layouts/Shell.jsx";
import { initNotificationAudioUnlock } from "./services/notificationSound.js";

const AUTHENTICATION_SCREENS = {
  login: Login,
  forgot: Forgot,
  reset: Reset,
  force: ForceChange
};

export default function App() {
  const store = useAppStore();

  useEffect(() => {
    boot();
    initNotificationAudioUnlock();
  }, []);

  const location = useLocation();
  const viewParam = location.pathname.slice(1).split("/")[0];
  const knownPrefixes = [
    "dashboard", "mytasks", "byme", "alltasks", "teamtasks", "board", "calendar",
    "projects", "deals", "reports", "members", "notifications", "settings",
    "permissions", "audit", "pwresets", "recycle",
    "task", "project", "user", "people", "login", "admin", ""
  ];
  const isUnknownPath = Boolean(viewParam && !knownPrefixes.includes(viewParam));

  const isDirectErrorPath = [
    "/404", "/not-found",
    "/403", "/access-denied", "/forbidden",
    "/500", "/server-error",
    "/503", "/offline", "/service-unavailable"
  ].includes(location.pathname) || isUnknownPath;

  let activeScreenElement;

  if ((store.currentScreen === "app" && store.currentUser) || isDirectErrorPath) {
    activeScreenElement = <Outlet />;
  } else if (AUTHENTICATION_SCREENS[store.currentScreen]) {
    const ScreenComponent = AUTHENTICATION_SCREENS[store.currentScreen];
    activeScreenElement = <ScreenComponent />;
  } else {
    activeScreenElement = (
      <div className="loader">
        <div className="spinner" />
        <div>Loading 10X Agency CRM...</div>
      </div>
    );
  }

  return (
    <>
      {activeScreenElement}
      <Overlays />
    </>
  );
}

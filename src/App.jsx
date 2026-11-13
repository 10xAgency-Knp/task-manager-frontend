/**
 * Application Root Component
 *
 * Directs between authentication screens (Login, Forgot Password, Reset Password, Force Password Change)
 * and the authenticated CRM Workspace Shell Layout. Renders global overlays (modals and toasts).
 */
import { useEffect } from "react";
import { Outlet } from "react-router-dom";
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

  let activeScreenElement;

  if (store.currentScreen === "app" && store.currentUser) {
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

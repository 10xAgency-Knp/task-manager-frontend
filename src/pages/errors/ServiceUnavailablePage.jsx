/**
 * 503 Service Unavailable / Offline Page Component
 *
 * Rendered when the browser is disconnected from the internet or when
 * the Laravel backend API cannot be reached or is undergoing maintenance.
 */
import { useState, useEffect } from "react";
import { usePageHeader } from "../../hooks/useHead.js";
import { safeRefresh } from "../../services/sync.js";
import { ErrorFrame } from "./ErrorFrame.jsx";

export function ServiceUnavailablePage({
  isOffline: initialIsOffline,
  message,
  onRetry,
  isStandalone
}) {
  const [isOffline, setIsOffline] = useState(() => {
    if (typeof initialIsOffline === "boolean") return initialIsOffline;
    return typeof navigator !== "undefined" && !navigator.onLine;
  });
  const [isChecking, setIsChecking] = useState(false);
  const [checkResult, setCheckResult] = useState(null);

  usePageHeader(
    isOffline ? "Network Offline" : "Service Unavailable",
    isOffline ? "Check your connection" : "503 - API Unreachable"
  );

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const handleCheckConnection = async () => {
    setIsChecking(true);
    setCheckResult(null);

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setIsOffline(true);
      setIsChecking(false);
      setCheckResult("Your device is still offline. Please verify your internet connection.");
      return;
    }

    try {
      if (onRetry) {
        await onRetry();
      } else {
        await safeRefresh();
      }
      setCheckResult("Connected successfully! Reloading...");
      setTimeout(() => {
        if (typeof window !== "undefined") {
          window.location.reload();
        }
      }, 500);
    } catch (err) {
      setIsChecking(false);
      setCheckResult("Server is still unreachable. Please try again shortly.");
    }
  };

  const title = isOffline ? "You are currently offline" : "Service Temporarily Unavailable";
  const subtitle =
    message ||
    (isOffline
      ? "Your internet connection appears to be offline. Reconnect to resume managing your tasks."
      : "The Task Manager service is temporarily unreachable or undergoing scheduled maintenance. Please wait a moment and try again.");

  const metaBox = checkResult ? (
    <div style={{ textAlign: "center", color: checkResult.includes("successfully") ? "var(--green)" : "var(--red)" }}>
      {checkResult}
    </div>
  ) : null;

  const primaryAction = {
    label: isChecking ? "Checking..." : "Retry Connection",
    icon: "refresh",
    onClick: handleCheckConnection
  };

  const secondaryAction = {
    label: "Reload App",
    icon: "dash",
    onClick: () => {
      if (typeof window !== "undefined") {
        window.location.reload();
      }
    }
  };

  return (
    <ErrorFrame
      statusCode={503}
      badgeText={isOffline ? "Offline • No Connection" : "503 • Service Unavailable"}
      icon={isOffline ? "wifiOff" : "server"}
      title={title}
      subtitle={subtitle}
      metaBox={metaBox}
      primaryAction={primaryAction}
      secondaryAction={secondaryAction}
      ghostAction={null}
      isStandalone={isStandalone}
      id="serviceUnavailable"
    />
  );
}

/**
 * 500 Internal Server / Application Error Page Component
 *
 * Rendered when an unhandled JavaScript exception or render failure occurs,
 * or when the backend returns a 500 internal server error.
 */
import { useState } from "react";
import { usePageHeader } from "../../hooks/useHead.js";
import { Icon } from "../../components/Icon.jsx";
import { CopyButton } from "../../components/ui.jsx";
import { safeRefresh } from "../../services/sync.js";
import { ErrorFrame } from "./ErrorFrame.jsx";

export function ServerErrorPage({
  error,
  errorInfo,
  onReset,
  message,
  isStandalone
}) {
  const [showDetails, setShowDetails] = useState(false);

  usePageHeader("Application Error", "500 - Internal Error");

  const title = "Something went wrong";
  const subtitle =
    message ||
    "An unexpected error occurred while processing your request. The application caught this issue to protect your data integrity.";

  const errorMessage = error?.message || (typeof error === "string" ? error : "Unknown application error");
  const errorStack = error?.stack || (errorInfo?.componentStack ? String(errorInfo.componentStack) : "");

  const handleRetry = () => {
    if (onReset) {
      onReset();
    } else {
      safeRefresh();
      if (typeof window !== "undefined") {
        window.location.reload();
      }
    }
  };

  const primaryAction = {
    label: "Try Again",
    icon: "refresh",
    onClick: handleRetry
  };

  return (
    <ErrorFrame
      statusCode={500}
      badgeText="500 • Application Error"
      icon="server"
      title={title}
      subtitle={subtitle}
      primaryAction={primaryAction}
      isStandalone={isStandalone}
      id="serverError"
    >
      <div style={{ margin: "14px 0" }}>
        <button
          type="button"
          className="error-tech-toggle"
          onClick={() => setShowDetails(prev => !prev)}
          title="Toggle technical diagnostics"
        >
          <Icon name={showDetails ? "up" : "down"} />
          {showDetails ? "Hide technical details" : "Show technical details"}
        </button>

        {showDetails && (
          <div className="error-tech-details">
            <div style={{ color: "var(--amber)", fontWeight: 700, marginBottom: 6 }}>
              {errorMessage}
            </div>
            {errorStack ? (
              <pre>{errorStack}</pre>
            ) : (
              <div style={{ color: "var(--muted)", fontStyle: "italic" }}>
                No stack trace available.
              </div>
            )}
            <div className="error-tech-copy">
              <CopyButton text={`${errorMessage}\n\n${errorStack}`} label="Copy diagnostic log" />
            </div>
          </div>
        )}
      </div>
    </ErrorFrame>
  );
}

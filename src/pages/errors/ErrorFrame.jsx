/**
 * Shared Error Page Layout Frame
 *
 * Renders a consistent, polished error presentation inside the CRM Shell
 * or standalone when unauthenticated or during a full application crash.
 */
import { Icon } from "../../components/Icon.jsx";
import { CONFIG } from "../../services/api.js";
import { useAppStore } from "../../store/appStore.js";
import { navigateToView, navBack } from "../../routes/navigation.js";

export function ErrorFrame({
  statusCode = 404,
  badgeText,
  icon = "search",
  title,
  subtitle,
  metaBox,
  children,
  primaryAction,
  secondaryAction,
  ghostAction,
  isStandalone,
  id
}) {
  const store = useAppStore();
  const showStandalone = isStandalone ?? (!store?.currentUser);

  const defaultPrimary = {
    label: "Go to Dashboard",
    icon: "dash",
    onClick: () => navigateToView("dashboard")
  };

  const defaultSecondary = {
    label: "View My Tasks",
    icon: "mytask",
    onClick: () => navigateToView("mytasks")
  };

  const defaultGhost = {
    label: "Go Back",
    icon: "back",
    onClick: () => navBack()
  };

  const primary = primaryAction === null ? null : (primaryAction || defaultPrimary);
  const secondary = secondaryAction === null ? null : (secondaryAction || defaultSecondary);
  const ghost = ghostAction === null ? null : (ghostAction || defaultGhost);

  const badgeClass = `error-badge error-badge-${statusCode}`;

  const content = (
    <div className={`error-card ${showStandalone ? "standalone" : ""}`} id={id}>
      {showStandalone && (
        <div className="login-logo-plate" style={{ marginBottom: 24 }}>
          <img className="login-logo" src={CONFIG.LOGO} alt={CONFIG.ORG || "10X Agency"} />
        </div>
      )}

      <div className={badgeClass}>
        {icon && <Icon name={icon} />}
        <span>{badgeText || `${statusCode} Error`}</span>
      </div>

      <h1 className="error-title">{title}</h1>
      {subtitle && <p className="error-desc">{subtitle}</p>}

      {metaBox && <div className="error-meta-box">{metaBox}</div>}

      {children}

      <div className="error-actions">
        {primary && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={primary.onClick}
          >
            {primary.icon && <Icon name={primary.icon} />}
            {primary.label}
          </button>
        )}

        {secondary && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={secondary.onClick}
          >
            {secondary.icon && <Icon name={secondary.icon} />}
            {secondary.label}
          </button>
        )}

        {ghost && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={ghost.onClick}
          >
            {ghost.icon && <Icon name={ghost.icon} />}
            {ghost.label}
          </button>
        )}
      </div>
    </div>
  );

  if (showStandalone) {
    return <div className="error-page-standalone">{content}</div>;
  }

  return <div className="error-page-container">{content}</div>;
}

/**
 * 403 Access Denied / Forbidden Page Component
 *
 * Rendered when a user tries to access a module, page, or record
 * that requires higher role privileges or specific module permissions.
 */
import { useAppStore } from "../../store/appStore.js";
import { usePageHeader } from "../../hooks/useHead.js";
import { RolePill } from "../../components/ui.jsx";
import { ErrorFrame } from "./ErrorFrame.jsx";

export function AccessDeniedPage({
  module,
  resource,
  message,
  requiredRole,
  isStandalone
}) {
  const store = useAppStore();
  const currentUser = store?.currentUser;

  usePageHeader("Access Denied", "403 - Forbidden");

  const moduleNames = {
    permissions: "Access Permissions Management",
    audit: "Activity Audit Logs",
    pwresets: "Password Reset Administration",
    recycle: "Recycle Bin",
    settings: "Workspace Settings",
    deals: "Sales Pipeline",
    reports: "Analytical Reports",
    teamtasks: "Team Workload"
  };

  const friendlyModuleName = module ? (moduleNames[module] || module) : "";

  const title = "Access Denied";
  const subtitle =
    message ||
    (friendlyModuleName
      ? `You do not have permission to view or manage ${friendlyModuleName}.`
      : "You do not have the required permissions to access this page or resource.");

  const metaBox = (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontWeight: 650 }}>Your Current Role:</span>
        <RolePill role={currentUser?.role || "Employee"} />
      </div>
      {requiredRole && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontWeight: 650 }}>Required Role:</span>
          <span className="badge b-amber">{requiredRole}</span>
        </div>
      )}
      <div style={{ fontSize: 11.8, color: "var(--muted)", marginTop: 8, lineHeight: 1.5 }}>
        If you require access to this section, please contact your workspace Administrator to request permission.
      </div>
    </div>
  );

  return (
    <ErrorFrame
      statusCode={403}
      badgeText="403 • Access Denied"
      icon="shield"
      title={title}
      subtitle={subtitle}
      metaBox={metaBox}
      isStandalone={isStandalone}
      id="accessDenied"
    />
  );
}

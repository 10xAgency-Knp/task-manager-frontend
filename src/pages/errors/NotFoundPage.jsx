/**
 * 404 Not Found Page Component
 *
 * Rendered when a route does not match or when a specific resource
 * (task, project, user, deal) is not found in the database.
 */
import { usePageHeader } from "../../hooks/useHead.js";
import { ErrorFrame } from "./ErrorFrame.jsx";

export function NotFoundPage({
  resource,
  id,
  title,
  subtitle,
  primaryAction,
  secondaryAction,
  ghostAction,
  isStandalone
}) {
  let displayTitle = title;
  let displaySubtitle = subtitle;

  if (!displayTitle) {
    if (resource === "task") {
      displayTitle = id ? `Task ${id} Not Found` : "Task Not Found";
      displaySubtitle =
        "The requested task could not be found. It may have been completed, moved to another workspace, or permanently deleted.";
    } else if (resource === "project") {
      displayTitle = id ? `Project ${id} Not Found` : "Project Not Found";
      displaySubtitle =
        "The requested project was not found. It may have been archived, deleted, or you might not be assigned to its team.";
    } else if (resource === "user" || resource === "member") {
      displayTitle = "Team Member Not Found";
      displaySubtitle =
        "The requested user profile does not exist or has been removed from the directory.";
    } else if (resource === "deal") {
      displayTitle = id ? `Deal ${id} Not Found` : "Deal Not Found";
      displaySubtitle =
        "The sales opportunity you are looking for does not exist or has been deleted.";
    } else {
      displayTitle = "Page Not Found";
      displaySubtitle =
        "The address you entered does not match any page in the CRM. The link may be incomplete, expired, or the page was moved.";
    }
  }

  usePageHeader(
    resource ? `${resource.toUpperCase()} - Not Found` : "Page Not Found",
    id ? `ID: ${id}` : "404"
  );

  return (
    <ErrorFrame
      statusCode={404}
      badgeText="404 • Not Found"
      icon="compass"
      title={displayTitle}
      subtitle={displaySubtitle}
      primaryAction={primaryAction}
      secondaryAction={secondaryAction}
      ghostAction={ghostAction}
      isStandalone={isStandalone}
      id="notFound"
    />
  );
}

// Backward compatibility export
export { NotFoundPage as NotFound };

/**
 * Root Route Error Boundary Component
 *
 * Catch-all React Router error element for unexpected routing errors,
 * 404 route responses, 403 authorization rejections, and uncaught render crashes.
 */
import { useRouteError, isRouteErrorResponse } from "react-router-dom";
import { NotFoundPage } from "./NotFoundPage.jsx";
import { AccessDeniedPage } from "./AccessDeniedPage.jsx";
import { ServerErrorPage } from "./ServerErrorPage.jsx";
import { ServiceUnavailablePage } from "./ServiceUnavailablePage.jsx";

export function RootErrorBoundary() {
  const error = useRouteError();

  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      return <NotFoundPage isStandalone={true} />;
    }
    if (error.status === 403) {
      return <AccessDeniedPage message={error.statusText || error.data?.message} isStandalone={true} />;
    }
    if (error.status === 503) {
      return <ServiceUnavailablePage message={error.statusText || error.data?.message} isStandalone={true} />;
    }
    return (
      <ServerErrorPage
        error={{ message: `${error.status} ${error.statusText}: ${JSON.stringify(error.data || "")}` }}
        isStandalone={true}
      />
    );
  }

  // Check if error is network offline
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return <ServiceUnavailablePage isOffline={true} isStandalone={true} />;
  }

  return <ServerErrorPage error={error} isStandalone={true} />;
}

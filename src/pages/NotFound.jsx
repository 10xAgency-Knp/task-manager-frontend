/**
 * 404 Not Found Page
 *
 * Rendered when a route or view does not match any registered navigation targets.
 * Matches the application empty-state design language.
 */

import { EmptyStateBox } from "../components/ui.jsx";
import { navigateToView } from "../routes/navigation.js";

export function NotFound() {
  return (
    <div className="card" id="notFound">
      <EmptyStateBox
        icon="search"
        title="Page not found"
        subtitle="This address is not a page of the CRM. The link may be incomplete or the page was moved."
      />
      <div style={{ textAlign: "center", paddingBottom: 22 }}>
        <button className="btn btn-primary btn-sm" onClick={() => navigateToView("dashboard")}>
          Go to the dashboard
        </button>
      </div>
    </div>
  );
}

// Backward compatibility export
export { NotFound as NotFoundPage };

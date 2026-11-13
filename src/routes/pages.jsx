/**
 * View Routing & Page Error Boundary
 *
 * Dynamically resolves URL view parameters to their corresponding page components,
 * enforces route-level access rules, and wraps each screen in a fault-tolerant error boundary.
 */
import { Component } from "react";
import { Navigate, useParams } from "react-router-dom";
import { VIEWS, isViewAllowed, getFirstAllowedView } from "./navigation.js";
import { AccessDeniedBox } from "../components/ui.jsx";
import { NotFound } from "../pages/NotFound.jsx";
import { useAppStore } from "../store/appStore.js";
import { Dashboard } from "../pages/Dashboard.jsx";
import { TaskList, Board, Calendar, TeamWorkload } from "../pages/Tasks.jsx";
import { Projects, Deals } from "../pages/Projects.jsx";
import { Members, Reports, Settings } from "../pages/People.jsx";
import { Notifications } from "../pages/Notifications.jsx";
import { Permissions, Audit, Recycle, PwResets } from "../pages/Admin.jsx";

/**
 * Mapping of route keys to page component factories
 */
const VIEW_PAGE_COMPONENTS = {
  dashboard: Dashboard,
  mytasks: () => <TaskList scope="mine" />,
  byme: () => <TaskList scope="byMe" />,
  alltasks: () => <TaskList scope="all" />,
  teamtasks: TeamWorkload,
  board: Board,
  calendar: Calendar,
  projects: Projects,
  deals: Deals,
  reports: Reports,
  members: Members,
  notifications: Notifications,
  settings: Settings,
  permissions: Permissions,
  audit: Audit,
  pwresets: PwResets,
  recycle: Recycle
};

/**
 * Fault-Tolerant Page Error Boundary
 * Prevents whole-app white screen crashes by rendering a friendly diagnostic box.
 */
export class PageErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Page rendering error caught by boundary:", error, errorInfo);
  }

  render() {
    if (this.state.error) {
      return (
        <AccessDeniedBox
          message={`Something went wrong while showing this page: ${this.state.error.message}`}
        />
      );
    }
    return this.props.children;
  }
}

/**
 * Active View Route Resolver Component
 */
export function ViewPage() {
  useAppStore(); // Re-render view whenever store data updates
  const { view: activeViewKey } = useParams();

  if (!VIEWS[activeViewKey] || !VIEW_PAGE_COMPONENTS[activeViewKey]) {
    return <NotFound />;
  }

  // Redirect to first permitted view if the user cannot view this screen
  if (!isViewAllowed(activeViewKey)) {
    const fallback = getFirstAllowedView();
    if (fallback && fallback !== activeViewKey) {
      return <Navigate to={`/${fallback}`} replace />;
    }
    return <AccessDeniedBox message="You do not have permission to view this module." />;
  }

  const ResolvedPageComponent = VIEW_PAGE_COMPONENTS[activeViewKey];

  return (
    <PageErrorBoundary key={activeViewKey}>
      <ResolvedPageComponent />
    </PageErrorBoundary>
  );
}

// Backward-compatible exports
export const PageGuard = PageErrorBoundary;

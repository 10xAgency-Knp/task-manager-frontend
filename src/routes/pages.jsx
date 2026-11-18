/**
 * View Routing & Page Error Boundary
 *
 * Dynamically resolves URL view parameters to their corresponding page components,
 * enforces route-level access rules, and wraps each screen in a fault-tolerant error boundary.
 */
import { Component } from "react";
import { useParams } from "react-router-dom";
import { VIEWS, isViewAllowed } from "./navigation.js";
import { useAppStore } from "../store/appStore.js";
import { Dashboard } from "../pages/Dashboard.jsx";
import { TaskList, Board, Calendar, TeamWorkload } from "../pages/Tasks.jsx";
import { Projects, Deals } from "../pages/Projects.jsx";
import { Members, Reports, Settings } from "../pages/People.jsx";
import { Notifications } from "../pages/Notifications.jsx";
import { Permissions, Audit, Recycle, PwResets } from "../pages/Admin.jsx";
import {
  NotFoundPage,
  AccessDeniedPage,
  ServerErrorPage,
  ServiceUnavailablePage
} from "../pages/errors/index.js";

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
 * Explicit Error View Component Mappings
 */
const ERROR_VIEW_COMPONENTS = {
  "404": NotFoundPage,
  "not-found": NotFoundPage,
  "403": AccessDeniedPage,
  "forbidden": AccessDeniedPage,
  "access-denied": AccessDeniedPage,
  "500": ServerErrorPage,
  "server-error": ServerErrorPage,
  "503": ServiceUnavailablePage,
  "offline": ServiceUnavailablePage,
  "service-unavailable": ServiceUnavailablePage
};

/**
 * Fault-Tolerant Page Error Boundary
 * Prevents whole-app white screen crashes by rendering a friendly diagnostic 500 error box.
 */
export class PageErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Page rendering error caught by boundary:", error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.error) {
      return (
        <ServerErrorPage
          error={this.state.error}
          errorInfo={this.state.errorInfo}
          onReset={() => this.setState({ error: null, errorInfo: null })}
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

  // Handle direct navigation to error pages
  if (activeViewKey && ERROR_VIEW_COMPONENTS[activeViewKey]) {
    const ErrorComponent = ERROR_VIEW_COMPONENTS[activeViewKey];
    return <ErrorComponent />;
  }

  if (!VIEWS[activeViewKey] || !VIEW_PAGE_COMPONENTS[activeViewKey]) {
    return <NotFoundPage />;
  }

  // Display dedicated Access Denied (403) page when user lacks permission
  if (!isViewAllowed(activeViewKey)) {
    return <AccessDeniedPage module={activeViewKey} />;
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

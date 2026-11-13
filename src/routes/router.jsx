/**
 * React Hash Router Configuration
 *
 * Configures the application route tree using hash routing (#/...) for universal
 * static host compatibility without requiring server-side URL rewrite configuration.
 */
import { createHashRouter, Navigate, useParams } from "react-router-dom";
import App from "../App.jsx";
import { Shell } from "../layouts/Shell.jsx";
import { PageErrorBoundary, ViewPage } from "./pages.jsx";
import { TaskDetail } from "../pages/TaskDetail.jsx";
import { ProjectDetail } from "../pages/Projects.jsx";
import { UserPage } from "../pages/People.jsx";
import { NotFound } from "../pages/NotFound.jsx";
import { setNavigator, getFirstAllowedView } from "./navigation.js";
import { useAppStore } from "../store/appStore.js";

function DefaultIndexRedirect() {
  useAppStore();
  return <Navigate to={`/${getFirstAllowedView()}`} replace />;
}

/**
 * Route Wrappers subscribing to store updates
 */
function TaskDetailRoute() {
  useAppStore();
  const { taskId } = useParams();
  return (
    <PageErrorBoundary key={taskId}>
      <TaskDetail id={taskId} />
    </PageErrorBoundary>
  );
}

function ProjectDetailRoute() {
  useAppStore();
  const { projectId } = useParams();
  return (
    <PageErrorBoundary key={projectId}>
      <ProjectDetail id={projectId} />
    </PageErrorBoundary>
  );
}

function UserProfileRoute() {
  useAppStore();
  const { userId } = useParams();
  return (
    <PageErrorBoundary key={userId}>
      <UserPage id={Number(userId) || userId} />
    </PageErrorBoundary>
  );
}

export const router = createHashRouter(
  [
    {
      path: "/",
      element: <App />,
      children: [
        {
          element: <Shell />,
          children: [
            {
              index: true,
              element: <DefaultIndexRedirect />
            },
            {
              path: "task/:taskId",
              element: <TaskDetailRoute />,
              handle: { detail: "task", param: "taskId" }
            },
            {
              path: "project/:projectId",
              element: <ProjectDetailRoute />,
              handle: { detail: "project", param: "projectId" }
            },
            {
              path: "user/:userId",
              element: <UserProfileRoute />,
              handle: { detail: "user", param: "userId" }
            },
            {
              path: "people",
              element: <Navigate to="/members" replace />
            },
            {
              path: "login",
              element: <Navigate to="/dashboard" replace />
            },
            {
              path: "admin",
              element: <Navigate to="/permissions" replace />
            },
            {
              path: ":view",
              element: <ViewPage />
            },
            {
              path: "*",
              element: <NotFound />,
              handle: { notFound: true }
            }
          ]
        }
      ]
    }
  ],
  {
    future: {
      v7_relativeSplatPath: true,
      v7_fetcherPersist: true,
      v7_normalizeFormMethod: true,
      v7_partialHydration: true,
      v7_skipActionErrorRevalidation: true
    }
  }
);

// Register navigator delegate for programmatic transitions
setNavigator(router.navigate);

/**
 * React Browser Router Configuration
 *
 * Configures the application route tree using HTML5 History API (BrowserRouter)
 * for clean, modern URLs without '#' symbols.
 */
import { createBrowserRouter, Navigate, useParams } from "react-router-dom";
import App from "../App.jsx";
import { Shell } from "../layouts/Shell.jsx";
import { PageErrorBoundary, ViewPage } from "./pages.jsx";
import { TaskDetail } from "../pages/TaskDetail.jsx";
import { ProjectDetail } from "../pages/Projects.jsx";
import { UserPage } from "../pages/People.jsx";
import { NotFound } from "../pages/NotFound.jsx";
import {
  RootErrorBoundary,
  NotFoundPage,
  AccessDeniedPage,
  ServerErrorPage,
  ServiceUnavailablePage
} from "../pages/errors/index.js";
import { setNavigator, getFirstAllowedView, pathFromHash } from "./navigation.js";
import { useAppStore } from "../store/appStore.js";

// Handle backward compatibility for legacy hash links (e.g. bookmarks or notification clicks #/dashboard)
if (typeof window !== "undefined" && window.location.hash && window.location.hash.startsWith("#/")) {
  const legacyHash = window.location.hash;
  const cleanPath = pathFromHash(legacyHash);
  window.history.replaceState(null, "", cleanPath);
}

function DefaultIndexRedirect() {
  const store = useAppStore();
  if (!store.currentUser) {
    return null;
  }
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

export const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <App />,
      errorElement: <RootErrorBoundary />,
      children: [
        {
          element: <Shell />,
          errorElement: <RootErrorBoundary />,
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
              element: <DefaultIndexRedirect />
            },
            {
              path: "admin",
              element: <Navigate to="/permissions" replace />
            },
            {
              path: "404",
              element: <NotFoundPage />,
              handle: { notFound: true }
            },
            {
              path: "403",
              element: <AccessDeniedPage />
            },
            {
              path: "access-denied",
              element: <AccessDeniedPage />
            },
            {
              path: "500",
              element: <ServerErrorPage />
            },
            {
              path: "503",
              element: <ServiceUnavailablePage />
            },
            {
              path: "offline",
              element: <ServiceUnavailablePage />
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

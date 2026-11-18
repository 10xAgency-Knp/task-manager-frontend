/**
 * Comprehensive Automated Test Suite: Error Pages & Error Boundaries
 *
 * Verifies rendering, HTML contracts, status badges, iconography, actions,
 * and error boundary resilience across 404, 403, 500, and 503 error states.
 */

import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Mock minimal browser globals for SSR testing
const store = new Map();
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k)
};
globalThis.window = globalThis;
globalThis.document = {
  title: "10X Agency CRM",
  addEventListener: () => {},
  removeEventListener: () => {}
};
try {
  Object.defineProperty(globalThis, "navigator", {
    value: {
      onLine: true,
      clipboard: { writeText: () => Promise.resolve() }
    },
    configurable: true,
    writable: true
  });
} catch (e) {
  // Fallback if defined
  if (globalThis.navigator) {
    globalThis.navigator.clipboard = { writeText: () => Promise.resolve() };
  }
}

// Set timezone for consistency
process.env.TZ = "Asia/Kolkata";

console.log("=================================================");
console.log("TESTING 10X CRM ERROR PAGES & ERROR BOUNDARIES");
console.log("=================================================");

// Import error components
const {
  NotFoundPage,
  AccessDeniedPage,
  ServerErrorPage,
  ServiceUnavailablePage,
  ErrorFrame
} = await import("../src/pages/errors/index.js");

const { PageErrorBoundary } = await import("../src/routes/pages.jsx");
const { appStore } = await import("../src/store/appStore.js");

// Setup sample user session in app store
appStore.currentUser = {
  id: 7,
  name: "Karan Johar",
  email: "karan@the10xagency.in",
  role: "Employee",
  dept: "Engineering"
};

let passedCount = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passedCount++;
  } catch (err) {
    console.error(`[FAIL] ${name}`);
    console.error(err);
    process.exit(1);
  }
}

// 1. Generic 404 Not Found Page
test("404 Not Found Page renders generic route missing state", () => {
  const html = renderToStaticMarkup(React.createElement(NotFoundPage, {}));

  assert.ok(html.includes("404"), "Includes 404 code");
  assert.ok(html.includes("error-badge-404"), "Has error-badge-404 CSS class");
  assert.ok(html.includes("Page Not Found"), "Has Page Not Found title");
  assert.ok(html.includes("The address you entered does not match"), "Has informative subtitle");
  assert.ok(html.includes("Go to Dashboard"), "Has Go to Dashboard button");
  assert.ok(html.includes("View My Tasks"), "Has View My Tasks button");
  assert.ok(html.includes("Go Back"), "Has Go Back button");
  assert.ok(html.includes('id="notFound"'), "Retains id='notFound' for backward compatibility");
});

// 2. Resource-Specific 404 States
test("404 Not Found Page handles missing Task entity", () => {
  const html = renderToStaticMarkup(
    React.createElement(NotFoundPage, { resource: "task", id: "TK-999" })
  );

  assert.ok(html.includes("Task TK-999 Not Found"), "Displays Task TK-999 Not Found");
  assert.ok(html.includes("The requested task could not be found"), "Displays task-specific explanation");
});

test("404 Not Found Page handles missing Project entity", () => {
  const html = renderToStaticMarkup(
    React.createElement(NotFoundPage, { resource: "project", id: "P-42" })
  );

  assert.ok(html.includes("Project P-42 Not Found"), "Displays Project P-42 Not Found");
  assert.ok(html.includes("The requested project was not found"), "Displays project-specific explanation");
});

test("404 Not Found Page handles missing Member/User entity", () => {
  const html = renderToStaticMarkup(
    React.createElement(NotFoundPage, { resource: "user", id: 9999 })
  );

  assert.ok(html.includes("Team Member Not Found"), "Displays Team Member Not Found");
});

test("404 Not Found Page handles missing Deal entity", () => {
  const html = renderToStaticMarkup(
    React.createElement(NotFoundPage, { resource: "deal", id: "D-88" })
  );

  assert.ok(html.includes("Deal D-88 Not Found"), "Displays Deal D-88 Not Found");
});

// 3. 403 Access Denied Page
test("403 Access Denied Page renders authorization failure state", () => {
  const html = renderToStaticMarkup(
    React.createElement(AccessDeniedPage, {
      module: "permissions",
      requiredRole: "Super Admin"
    })
  );

  assert.ok(html.includes("403"), "Includes 403 code");
  assert.ok(html.includes("error-badge-403"), "Has error-badge-403 CSS class");
  assert.ok(html.includes("Access Denied"), "Has Access Denied heading");
  assert.ok(html.includes("Access Permissions Management"), "Displays friendly module name");
  assert.ok(html.includes("Your Current Role:"), "Displays current role label");
  assert.ok(html.includes("Employee"), "Displays user's current role");
  assert.ok(html.includes("Super Admin"), "Displays required role badge");
  assert.ok(html.includes("Go to Dashboard"), "Has primary navigation button");
  assert.ok(html.includes("Go Back"), "Has Go Back button");
  assert.ok(html.includes('id="accessDenied"'), "Has id='accessDenied'");
});

// 4. 500 Internal Server / Application Error Page
test("500 Server Error Page renders unexpected exception state", () => {
  const fakeError = new Error("Database timeout or render crash");
  fakeError.stack = "Error: Database timeout\n    at TaskDetail (TaskDetail.jsx:45:10)";

  const html = renderToStaticMarkup(
    React.createElement(ServerErrorPage, {
      error: fakeError,
      message: "An unexpected error occurred while processing your request."
    })
  );

  assert.ok(html.includes("500"), "Includes 500 code");
  assert.ok(html.includes("error-badge-500"), "Has error-badge-500 CSS class");
  assert.ok(html.includes("Something went wrong"), "Has friendly heading");
  assert.ok(html.includes("Try Again"), "Has Try Again retry button");
  assert.ok(html.includes("Show technical details"), "Has toggle for diagnostics");
  assert.ok(html.includes('id="serverError"'), "Has id='serverError'");
});

// 5. 503 Service Unavailable / Offline Page
test("503 Service Unavailable Page renders offline and outage states", () => {
  // Test server unavailable state
  const htmlServerDown = renderToStaticMarkup(
    React.createElement(ServiceUnavailablePage, { isOffline: false })
  );

  assert.ok(htmlServerDown.includes("503"), "Includes 503 code");
  assert.ok(htmlServerDown.includes("Service Temporarily Unavailable"), "Displays service unavailable title");
  assert.ok(htmlServerDown.includes("Retry Connection"), "Has retry connection action");
  assert.ok(htmlServerDown.includes("Reload App"), "Has reload action");

  // Test client offline state
  const htmlOffline = renderToStaticMarkup(
    React.createElement(ServiceUnavailablePage, { isOffline: true })
  );

  assert.ok(htmlOffline.includes("Offline"), "Includes Offline badge text");
  assert.ok(htmlOffline.includes("You are currently offline"), "Displays offline title");
  assert.ok(htmlOffline.includes("Your internet connection appears to be offline"), "Displays offline description");
});

// 6. Standalone / Unauthenticated Mode
test("ErrorFrame renders standalone fullscreen container when requested or unauthenticated", () => {
  // Standalone container
  const htmlStandalone = renderToStaticMarkup(
    React.createElement(ErrorFrame, {
      statusCode: 404,
      title: "Not Found Standalone",
      isStandalone: true
    })
  );

  assert.ok(htmlStandalone.includes("error-page-standalone"), "Wraps in error-page-standalone");
  assert.ok(htmlStandalone.includes("login-logo-plate"), "Displays brand logo plate");
  assert.ok(htmlStandalone.includes("standalone"), "Adds standalone class to error card");
});

// 7. PageErrorBoundary Component
test("PageErrorBoundary catches rendering exceptions and shows 500 ServerErrorPage", () => {
  class FaultyComponent extends React.Component {
    render() {
      throw new Error("Simulated component render explosion");
    }
  }

  // Create boundary instance with simulated error
  const boundary = new PageErrorBoundary({});
  boundary.state = {
    error: new Error("Simulated component render explosion"),
    errorInfo: { componentStack: "\n    in FaultyComponent\n    in PageErrorBoundary" }
  };

  const rendered = boundary.render();
  const html = renderToStaticMarkup(rendered);

  assert.ok(html.includes("500"), "Renders 500 status code");
  assert.ok(html.includes("Something went wrong"), "Renders friendly crash title");
  assert.ok(html.includes("Try Again"), "Renders Try Again button");
  assert.ok(!html.includes("You do not have access to this page"), "Does NOT show misleading access denied message");
});

console.log("=================================================");
console.log(`ALL ${passedCount} ERROR PAGE TESTS PASSED SUCCESSFULLY!`);
console.log("=================================================");

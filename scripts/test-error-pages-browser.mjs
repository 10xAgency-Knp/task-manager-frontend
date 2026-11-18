/**
 * End-to-End Automated Browser Test Suite for Error Pages & Boundaries
 *
 * Runs headless Chrome via puppeteer-core against a live Vite instance,
 * thoroughly testing standalone and shell-integrated error pages (404, 403, 500, 503).
 */

import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
];
const CHROME_PATH = CHROME_PATHS.find(p => fs.existsSync(p));

if (!CHROME_PATH) {
  console.error("ERROR: No compatible Chrome/Edge executable found on system.");
  process.exit(1);
}

const TEST_PORT = 5198;
const BASE_URL = `http://localhost:${TEST_PORT}`;

console.log("==================================================================");
console.log("  10X CRM ERROR PAGES & ERROR BOUNDARIES AUTOMATED BROWSER TESTS  ");
console.log("==================================================================");
console.log(`Browser executable: ${CHROME_PATH}`);
console.log(`Target Base URL:    ${BASE_URL}`);

let viteServer = null;
let browser = null;
let passedCount = 0;

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTests() {
  // 1. Start Vite development server
  console.log("\n[SETUP] Starting Vite test server on port " + TEST_PORT + "...");
  viteServer = await createServer({
    root: path.resolve(__dirname, '..'),
    server: { port: TEST_PORT, strictPort: true }
  });
  await viteServer.listen();
  console.log("[SETUP] Vite test server ready at " + BASE_URL);

  // 2. Launch headless browser
  console.log("[SETUP] Launching Chromium instance...");
  browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1440,960'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 960 });

  page.on('console', msg => console.log('BROWSER LOG:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));

  // Enable request interception for API mocks
  await page.setRequestInterception(true);
  page.on('request', interceptedRequest => {
    const url = interceptedRequest.url();
    const method = interceptedRequest.method();

    // Only intercept external or backend API requests
    const isApiRequest = url.includes('/api/') || url.includes('api-task-manager');

    if (isApiRequest && method === 'OPTIONS') {
      interceptedRequest.respond({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'access-control-allow-headers': '*'
        }
      });
      return;
    }

    const corsHeaders = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*'
    };

    if (isApiRequest && url.includes('/login') && method === 'POST') {
      interceptedRequest.respond({
        status: 200,
        contentType: 'application/json',
        headers: corsHeaders,
        body: JSON.stringify({
          ok: true,
          access_token: 'mock_bearer_token_xyz',
          user: {
            id: 1,
            usr_id: 1,
            usr_name: 'Super Admin',
            usr_email: 'admin@example.com',
            usr_role: 'admin',
            usr_is_super_admin: 1,
            usr_dept: 'Leadership'
          },
          permissions: {
            dashboard: { can_view: true },
            my_tasks: { can_view: true, can_add: true, can_edit: true, can_delete: true },
            all_tasks: { can_view: true },
            projects: { can_view: true },
            members: { can_view: true }
          }
        })
      });
      return;
    }

    if (isApiRequest && (url.includes('/user') || url.includes('/profile') || url.includes('/session'))) {
      interceptedRequest.respond({
        status: 200,
        contentType: 'application/json',
        headers: corsHeaders,
        body: JSON.stringify({
          authed: true,
          user: {
            id: 1,
            usr_id: 1,
            usr_name: 'Super Admin',
            usr_email: 'admin@example.com',
            usr_role: 'admin',
            usr_is_super_admin: 1,
            usr_dept: 'Leadership'
          },
          permissions: {
            dashboard: { can_view: true },
            my_tasks: { can_view: true }
          }
        })
      });
      return;
    }

    if (isApiRequest && url.includes('/dashboard')) {
      interceptedRequest.respond({
        status: 200,
        contentType: 'application/json',
        headers: corsHeaders,
        body: JSON.stringify({
          kpis: { openTasks: 5, completedTasks: 12, overdueTasks: 1, teamMembers: 8 },
          tasks: [],
          recentActivities: []
        })
      });
      return;
    }

    if (isApiRequest && url.includes('/workspace')) {
      interceptedRequest.respond({
        status: 200,
        contentType: 'application/json',
        headers: corsHeaders,
        body: JSON.stringify({
          tasks: [],
          projects: [],
          users: [],
          userDirectory: []
        })
      });
      return;
    }

    if (isApiRequest && (url.includes('/task/') || url.includes('/tasks/'))) {
      interceptedRequest.respond({
        status: 404,
        contentType: 'application/json',
        headers: corsHeaders,
        body: JSON.stringify({ message: 'Task not found' })
      });
      return;
    }

    interceptedRequest.continue();
  });

  // -------------------------------------------------------------
  // TEST 1: Standalone 404 (Not Found)
  // -------------------------------------------------------------
  console.log("\n[TEST 1] Testing Standalone 404 (Not Found) page...");
  await page.goto(`${BASE_URL}/404`, { waitUntil: 'networkidle0' });
  
  const notFoundCard = await page.$('#notFound');
  assert(notFoundCard !== null, "#notFound element exists");

  const badgeText404 = await page.$eval('.error-badge-404', el => el.textContent);
  assert(badgeText404.includes("404"), `Badge includes 404: got "${badgeText404}"`);

  const title404 = await page.$eval('.error-title', el => el.textContent);
  assert(title404.includes("Page Not Found"), `Title is Page Not Found: got "${title404}"`);

  const hasStandaloneClass = await page.$('.error-page-standalone') !== null;
  assert(hasStandaloneClass, "Wraps in standalone gradient container when unauthenticated");

  const hasLogoPlate = await page.$('.login-logo-plate') !== null;
  assert(hasLogoPlate, "Includes 10X Agency logo plate");
  console.log("  -> [PASS] Standalone 404 page verified successfully.");
  passedCount++;

  // -------------------------------------------------------------
  // TEST 2: Standalone 403 (Access Denied)
  // -------------------------------------------------------------
  console.log("\n[TEST 2] Testing Standalone 403 (Access Denied) page...");
  await page.goto(`${BASE_URL}/403`, { waitUntil: 'networkidle0' });

  const accessDeniedCard = await page.$('#accessDenied');
  assert(accessDeniedCard !== null, "#accessDenied element exists");

  const badgeText403 = await page.$eval('.error-badge-403', el => el.textContent);
  assert(badgeText403.includes("403"), `Badge includes 403: got "${badgeText403}"`);

  const title403 = await page.$eval('.error-title', el => el.textContent);
  assert(title403.includes("Access Denied"), `Title is Access Denied: got "${title403}"`);
  console.log("  -> [PASS] Standalone 403 page verified successfully.");
  passedCount++;

  // -------------------------------------------------------------
  // TEST 3: Standalone 500 (Internal Server Error) & Diagnostics Toggle
  // -------------------------------------------------------------
  console.log("\n[TEST 3] Testing Standalone 500 (Server Error) & Technical Details toggle...");
  await page.goto(`${BASE_URL}/500`, { waitUntil: 'networkidle0' });

  const serverErrorCard = await page.$('#serverError');
  assert(serverErrorCard !== null, "#serverError element exists");

  const badgeText500 = await page.$eval('.error-badge-500', el => el.textContent);
  assert(badgeText500.includes("500"), `Badge includes 500: got "${badgeText500}"`);

  const title500 = await page.$eval('.error-title', el => el.textContent);
  assert(title500.includes("Something went wrong"), `Title is Something went wrong: got "${title500}"`);

  // Test expanding technical details
  let detailsVisible = await page.$('.error-tech-details') !== null;
  assert(!detailsVisible, "Technical details initially collapsed");

  await page.click('.error-tech-toggle');
  await new Promise(r => setTimeout(r, 200));

  detailsVisible = await page.$('.error-tech-details') !== null;
  assert(detailsVisible, "Technical details expanded after toggle click");
  console.log("  -> [PASS] Standalone 500 page and diagnostics toggle verified.");
  passedCount++;

  // -------------------------------------------------------------
  // TEST 4: Standalone 503 (Service Unavailable / Offline)
  // -------------------------------------------------------------
  console.log("\n[TEST 4] Testing Standalone 503 (Service Unavailable) page...");
  await page.goto(`${BASE_URL}/503`, { waitUntil: 'networkidle0' });

  const serviceUnavailableCard = await page.$('#serviceUnavailable');
  assert(serviceUnavailableCard !== null, "#serviceUnavailable element exists");

  const badgeText503 = await page.$eval('.error-badge-503', el => el.textContent);
  assert(badgeText503.includes("503") || badgeText503.includes("Offline"), `Badge includes 503/Offline: got "${badgeText503}"`);

  const hasRetryBtn = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('Retry Connection'));
  });
  assert(hasRetryBtn, "Includes 'Retry Connection' button");
  console.log("  -> [PASS] Standalone 503 page verified successfully.");
  passedCount++;

  // -------------------------------------------------------------
  // TEST 5: Wildcard 404 for Unauthenticated User
  // -------------------------------------------------------------
  console.log("\n[TEST 5] Testing Wildcard 404 when unauthenticated...");
  await page.goto(`${BASE_URL}/nonexistent-page-url-random`, { waitUntil: 'networkidle0' });

  const wildcard404 = await page.$('#notFound');
  assert(wildcard404 !== null, "Wildcard route renders #notFound for unauthenticated user");
  console.log("  -> [PASS] Unauthenticated wildcard route renders 404 page.");
  passedCount++;

  // -------------------------------------------------------------
  // TEST 6: Real Login Flow & Shell-Integrated 404
  // -------------------------------------------------------------
  console.log("\n[TEST 6] Logging in through Login Form to test Shell Integration...");
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle0' });

  await page.waitForSelector('#liEmail');
  await page.type('#liEmail', 'admin@example.com');
  await page.type('#liPass', 'Password123');
  await page.click('#liBtn');

  // Wait for shell navigation
  await page.waitForSelector('#sidebar', { timeout: 10000 });
  console.log("  -> Authenticated successfully. Shell loaded.");

  // Navigate to unknown route within the authenticated app
  await page.goto(`${BASE_URL}/nonexistent-authenticated-route-777`, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 400));

  const sidebarExists = await page.$('#sidebar') !== null;
  assert(sidebarExists, "App Shell sidebar is present inside authenticated session");

  const shell404Card = await page.$('#notFound');
  assert(shell404Card !== null, "#notFound is rendered inside the authenticated Shell");
  console.log("  -> [PASS] Shell-integrated 404 page verified successfully.");
  passedCount++;

  // -------------------------------------------------------------
  // TEST 7: Missing Resource Entity 404s (Task, Project, User)
  // -------------------------------------------------------------
  console.log("\n[TEST 7] Testing Resource-specific 404s (Task, Project, Member)...");
  
  // 7a. Non-existent Task
  await page.goto(`${BASE_URL}/task/TK-99999`, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 600));
  const taskTitle = await page.$eval('.error-title', el => el.textContent);
  assert(taskTitle.includes("Task TK-99999 Not Found") || taskTitle.includes("Task Not Found"), `Task 404 title verified: got "${taskTitle}"`);

  // 7b. Non-existent Project
  await page.goto(`${BASE_URL}/project/P-NONEXISTENT`, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 600));
  const projectTitle = await page.$eval('.error-title', el => el.textContent);
  assert(projectTitle.includes("Project P-NONEXISTENT Not Found") || projectTitle.includes("Project Not Found"), `Project 404 title verified: got "${projectTitle}"`);

  // 7c. Non-existent Member
  await page.goto(`${BASE_URL}/user/99999`, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 600));
  const memberTitle = await page.$eval('.error-title', el => el.textContent);
  assert(memberTitle.includes("Team Member Not Found"), `Member 404 title verified: got "${memberTitle}"`);
  console.log("  -> [PASS] Entity-specific 404 pages (Task, Project, Member) verified.");
  passedCount++;

  // -------------------------------------------------------------
  // TEST 8: Authenticated Access Denied (403) inside Shell
  // -------------------------------------------------------------
  console.log("\n[TEST 8] Testing Access Denied (403) inside Shell layout...");
  await page.goto(`${BASE_URL}/access-denied`, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 600));

  const auth403Card = await page.$('#accessDenied');
  assert(auth403Card !== null, "#accessDenied rendered inside Shell");

  const hasRolePill = await page.$('.role-pill') !== null;
  assert(hasRolePill, "Renders RolePill component indicating user's permissions");
  console.log("  -> [PASS] Shell-integrated 403 Access Denied page verified.");
  passedCount++;

  console.log("\n==================================================================");
  console.log(`  ALL ${passedCount} BROWSER E2E TESTS PASSED WITH ZERO ERRORS!  `);
  console.log("==================================================================");
}

try {
  await runTests();
} catch (err) {
  console.error("\n❌ E2E Browser Test Failed:");
  console.error(err);
  process.exitCode = 1;
} finally {
  if (browser) {
    await browser.close();
  }
  if (viteServer) {
    await viteServer.close();
  }
}

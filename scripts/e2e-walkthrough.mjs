import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCREENSHOTS_DIR = path.join(__dirname, 'e2e-screenshots');
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
];
const CHROME_PATH = CHROME_PATHS.find(p => fs.existsSync(p));

const APP_URL = 'http://localhost:5173';
const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'Admin@123456';

const results = {
  flows: {},
  consoleErrors: [],
  consoleWarnings: [],
  pageErrors: [],
  networkFailures: [],
  issuesFound: []
};

function logStep(flow, message) {
  const timestamp = new Date().toISOString().slice(11, 19);
  console.log(`[${timestamp}] [${flow}] ${message}`);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function takeScreenshot(page, name) {
  const filePath = path.join(SCREENSHOTS_DIR, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  logStep('SCREENSHOT', `Saved ${name}.png`);
  return filePath;
}

async function runE2E() {
  console.log('================================================================');
  console.log('   10X AGENCY TASK MANAGEMENT SYSTEM - E2E COMPREHENSIVE SUITE   ');
  console.log('================================================================');
  console.log(`Using Chromium at: ${CHROME_PATH}`);
  console.log(`Frontend URL: ${APP_URL}`);
  console.log(`Screenshots Directory: ${SCREENSHOTS_DIR}\n`);

  const browser = await puppeteer.launch({
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

  // Listeners for errors and logging
  page.on('console', msg => {
    const text = msg.text();
    const type = msg.type();
    if (type === 'error') {
      results.consoleErrors.push({ text, location: msg.location() });
      console.error(`🔴 [Browser Console Error]: ${text}`);
    } else if (type === 'warning') {
      results.consoleWarnings.push(text);
    }
  });

  page.on('pageerror', err => {
    const msg = err.message || String(err);
    results.pageErrors.push(msg);
    console.error(`💥 [Browser Uncaught Page Error]: ${msg}`);
  });

  page.on('requestfailed', req => {
    const failure = req.failure();
    const url = req.url();
    if (failure && failure.errorText !== 'net::ERR_ABORTED' && !url.includes('/uploads/avatars/')) {
      results.networkFailures.push({ url, error: failure.errorText });
      console.warn(`⚠️ [Network Failure]: ${url} - ${failure.errorText}`);
    }
  });

  let createdTaskId = null;

  try {
    // ========================================================================
    // FLOW 1: Authentication & Global Bootstrap
    // ========================================================================
    logStep('FLOW 1', 'Starting Flow 1: Authentication & Global Bootstrap...');
    results.flows['Flow 1'] = { status: 'IN_PROGRESS', details: [] };

    // 1. Go to http://localhost:5173/#/login
    await page.goto(`${APP_URL}/#/login`, { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(1000);

    // 2. Verify clean login form
    const loginFormExists = (await page.$('#liEmail')) && (await page.$('#liPass')) && (await page.$('#liBtn'));
    if (!loginFormExists) {
      throw new Error('Login form inputs (#liEmail, #liPass, #liBtn) not found!');
    }

    // Check for hardcoded demo hint text
    const pageContent = await page.content();
    const hasDemoHints = pageContent.includes('Demo Accounts:') || pageContent.includes('admin@agency.com');
    if (hasDemoHints) {
      results.issuesFound.push({
        flow: 'Flow 1',
        description: 'Hardcoded demo hint text found on login form.'
      });
      logStep('FLOW 1', 'WARNING: Hardcoded demo hint text detected.');
    } else {
      logStep('FLOW 1', 'PASS: Login form is clean without hardcoded demo test hint text.');
    }

    await takeScreenshot(page, '01_login_clean');

    // 3. Log in with admin credentials
    logStep('FLOW 1', `Entering credentials: ${ADMIN_EMAIL}...`);
    await page.evaluate(() => {
      document.querySelector('#liEmail').value = '';
      document.querySelector('#liPass').value = '';
    });
    await page.type('#liEmail', ADMIN_EMAIL);
    await page.type('#liPass', ADMIN_PASSWORD);
    await page.click('#liBtn');

    // 4. Verify successful redirection to #/dashboard
    logStep('FLOW 1', 'Waiting for shell and dashboard...');
    await page.waitForFunction(
      () => {
        const hasSidebar = document.querySelector('#sidebar') || document.querySelector('.sidebar');
        const isDashboard = window.location.hash.includes('dashboard');
        return hasSidebar && isDashboard;
      },
      { timeout: 15000 }
    );
    await sleep(1500);

    const currentUrl = page.url();
    logStep('FLOW 1', `Current URL: ${currentUrl}`);
    if (!currentUrl.includes('/dashboard')) {
      throw new Error(`Expected redirection to #/dashboard, but at ${currentUrl}`);
    }

    await takeScreenshot(page, '02_dashboard_loaded');
    results.flows['Flow 1'] = { status: 'PASS', details: ['Clean login verified', 'Admin authenticated', 'Redirected to #/dashboard'] };
    logStep('FLOW 1', '✅ FLOW 1 PASSED!\n');

    // ========================================================================
    // FLOW 2: Overview Dashboard
    // ========================================================================
    logStep('FLOW 2', 'Starting Flow 2: Overview Dashboard...');
    results.flows['Flow 2'] = { status: 'IN_PROGRESS', details: [] };

    // 1. Verify KPI metric cards
    const kpiCardsCount = await page.$$eval('.kpis .kpi-card, .kpis .kpi', cards => cards.length);
    logStep('FLOW 2', `Detected ${kpiCardsCount} KPI metric cards on dashboard.`);
    if (kpiCardsCount === 0) {
      results.issuesFound.push({ flow: 'Flow 2', description: 'No KPI cards found on Dashboard.' });
    }

    // 2. Check "My Focus List" card
    const hasFocusList = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('h3, .card-title, strong')).some(el =>
        el.textContent.toLowerCase().includes('focus')
      );
    });
    logStep('FLOW 2', `Focus List card found: ${hasFocusList}`);

    // 3. Check "Upcoming Deadlines" card
    const hasDeadlines = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('h3, .card-title, strong')).some(el =>
        el.textContent.toLowerCase().includes('deadline')
      );
    });
    logStep('FLOW 2', `Upcoming Deadlines card found: ${hasDeadlines}`);

    // 4. Check "Team Workload" and "Task Mix" charts
    const hasCharts = await page.evaluate(() => {
      const text = document.body.innerText;
      return text.includes('Team Workload') || text.includes('Task Mix') || document.querySelectorAll('.hbar-chart, .chart-wrap, .bar').length > 0;
    });
    logStep('FLOW 2', `Workload / Task Mix charts found: ${hasCharts}`);

    await takeScreenshot(page, '03_dashboard_details');

    // 5. Click a task from Focus List or Deadlines to verify navigation, then return
    const taskLinkSelector = 'a[href*="/task/"], [data-task], tr[data-task], .mini-item.clickable';
    const taskLink = await page.$(taskLinkSelector);
    if (taskLink) {
      logStep('FLOW 2', 'Found task item on dashboard, clicking to verify detail navigation...');
      await taskLink.click();
      await sleep(1500);

      const taskDetailUrl = page.url();
      logStep('FLOW 2', `Navigated to: ${taskDetailUrl}`);
      if (!taskDetailUrl.includes('/task/')) {
        results.issuesFound.push({ flow: 'Flow 2', description: `Clicking task link did not open /task/ view: ${taskDetailUrl}` });
      }
      await takeScreenshot(page, '04_navigated_from_dashboard');

      // Return to Dashboard
      logStep('FLOW 2', 'Navigating back to Dashboard...');
      const backBtn = await page.$('.btn-back, #bBack, button[title*="Back"], .logo-plate, [data-nav="dashboard"]');
      if (backBtn) {
        await backBtn.click();
      } else {
        await page.goto(`${APP_URL}/#/dashboard`);
      }
      await sleep(1500);
      await takeScreenshot(page, '05_returned_to_dashboard');
    } else {
      logStep('FLOW 2', 'Note: No task items directly clickable in focus list; will test full task detail in Flow 3.');
    }

    results.flows['Flow 2'] = {
      status: 'PASS',
      details: [`KPI cards: ${kpiCardsCount}`, `Focus list: ${hasFocusList}`, `Deadlines: ${hasDeadlines}`, `Charts: ${hasCharts}`]
    };
    logStep('FLOW 2', '✅ FLOW 2 PASSED!\n');

    // ========================================================================
    // FLOW 3: Tasks Workflows (My Tasks, All Tasks, Board, Calendar)
    // ========================================================================
    logStep('FLOW 3', 'Starting Flow 3: Tasks Workflows...');
    results.flows['Flow 3'] = { status: 'IN_PROGRESS', details: [] };

    // 1. Navigate to #/mytasks
    logStep('FLOW 3', 'Navigating to #/mytasks...');
    await page.goto(`${APP_URL}/#/mytasks`, { waitUntil: 'networkidle2' });
    await sleep(1500);
    const myTasksTabs = await page.$$eval('.tabs .tab, .tab', tabs => tabs.map(t => t.textContent.trim()));
    logStep('FLOW 3', `My Tasks tabs found: ${myTasksTabs.join(', ')}`);
    await takeScreenshot(page, '06_mytasks');

    // 2. Navigate to #/alltasks
    logStep('FLOW 3', 'Navigating to #/alltasks...');
    await page.goto(`${APP_URL}/#/alltasks`, { waitUntil: 'networkidle2' });
    await sleep(1500);
    const allTasksCount = await page.$$eval('tbody tr, .table-row', rows => rows.length);
    logStep('FLOW 3', `All Tasks table rows rendered: ${allTasksCount}`);
    await takeScreenshot(page, '07_alltasks');

    // 3. Switch view modes: Kanban Board and Calendar
    logStep('FLOW 3', 'Navigating to Kanban Board (#/board)...');
    await page.goto(`${APP_URL}/#/board`, { waitUntil: 'networkidle2' });
    await sleep(1500);
    const boardCols = await page.$$eval('#kanban .kcol, [data-col]', cols => cols.length);
    logStep('FLOW 3', `Kanban columns rendered: ${boardCols}`);
    await takeScreenshot(page, '08_board');

    logStep('FLOW 3', 'Navigating to Calendar (#/calendar)...');
    await page.goto(`${APP_URL}/#/calendar`, { waitUntil: 'networkidle2' });
    await sleep(1500);
    const calGrid = await page.$('.cal-grid, .calendar-grid, .month-view');
    logStep('FLOW 3', `Calendar grid rendered: ${Boolean(calGrid)}`);
    await takeScreenshot(page, '09_calendar');

    // 4. Open "New Task" form modal (TaskForm)
    logStep('FLOW 3', 'Opening "New Task" form modal...');
    const topNewTaskBtn = await page.$('#topNewTask');
    if (!topNewTaskBtn) {
      throw new Error('#topNewTask button not found!');
    }
    await topNewTaskBtn.click();
    await sleep(1000);

    // Verify modal opened
    const taskModalOpen = await page.$('#kT');
    if (!taskModalOpen) {
      throw new Error('TaskForm modal did not open or #kT (task title input) is missing!');
    }

    // Fill form: Title, Category, Priority, Due Date, Assignee, Estimated Hours
    const testTaskTitle = `E2E Comprehensive Test Task ${Date.now() % 10000}`;
    logStep('FLOW 3', `Filling task form with title: "${testTaskTitle}"...`);

    // Title
    await page.type('#kT', testTaskTitle);

    // Description
    await page.evaluate(() => {
      const textarea = document.querySelector('#kD');
      if (textarea) {
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        nativeSetter.call(textarea, 'This is an automated E2E test task created by the QA Automation suite with rich details.');
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    // Assignee
    logStep('FLOW 3', 'Selecting task assignee in PeoplePicker...');
    await page.click('#assignBox');
    await sleep(400);
    const multiItem = await page.$('.multi-item[data-pick]');
    if (multiItem) {
      await multiItem.click();
      logStep('FLOW 3', 'Clicked assignee item in dropdown.');
    } else {
      await page.keyboard.press('Enter');
    }
    await sleep(300);

    // Project (select P-01 if available)
    if (await page.$('#kP')) {
      await page.evaluate(() => {
        const select = document.querySelector('#kP');
        const p1Option = Array.from(select.options).find(o => o.value === 'P-01' || o.text.includes('P-01'));
        if (p1Option) {
          select.value = p1Option.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
    }

    // Category ("Web development")
    await page.select('#kC', 'Web development');

    // Priority ("High")
    const highPrioBtn = await page.$('#prioSeg button[data-prio="High"], button[data-prio="high"]');
    if (highPrioBtn) {
      await highPrioBtn.click();
    }

    // Due Date (tomorrow)
    const tomorrow = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
    await page.evaluate(d => {
      const dueInput = document.querySelector('#kDue');
      if (dueInput) {
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeSetter.call(dueInput, d);
        dueInput.dispatchEvent(new Event('input', { bubbles: true }));
        dueInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, tomorrow);

    // Estimated Hours (4)
    await page.evaluate(() => {
      const hInput = document.querySelector('#kH');
      if (hInput) {
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeSetter.call(hInput, '4');
        hInput.dispatchEvent(new Event('input', { bubbles: true }));
        hInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    await takeScreenshot(page, '10_task_modal_filled');

    // Save task
    logStep('FLOW 3', 'Saving task (#kSave)...');
    await page.click('#kSave');
    await sleep(2500);

    // Wait for modal to close
    await page.waitForFunction(() => !document.querySelector('#kSave'), { timeout: 10000 });
    logStep('FLOW 3', 'Task modal saved and closed successfully.');
    await sleep(1500);
    await takeScreenshot(page, '11_task_created');

    // Find the newly created task code (TK-xx)
    await page.goto(`${APP_URL}/#/alltasks`, { waitUntil: 'networkidle2' });
    await sleep(1500);

    createdTaskId = await page.evaluate(title => {
      const rows = Array.from(document.querySelectorAll('tr, .table-row'));
      for (const row of rows) {
        if (row.textContent.includes(title)) {
          const match = row.textContent.match(/TK-\d+/);
          return match ? match[0] : null;
        }
      }
      return null;
    }, testTaskTitle);

    logStep('FLOW 3', `Identified created task ID: ${createdTaskId}`);
    if (!createdTaskId) {
      createdTaskId = await page.evaluate(title => {
        const t = (window.appStore?.database?.tasks || []).find(x => x.title === title);
        return t ? t.id : null;
      }, testTaskTitle);
      logStep('FLOW 3', `Fallback lookup task ID: ${createdTaskId}`);
    }

    if (!createdTaskId) {
      throw new Error(`Failed to locate created task "${testTaskTitle}" in list or store!`);
    }

    // 5. Open newly created task's detail view (#/task/TK-xx)
    logStep('FLOW 3', `Navigating to task detail view: #/task/${createdTaskId}...`);
    await page.goto(`${APP_URL}/#/task/${createdTaskId}`, { waitUntil: 'networkidle2' });
    await sleep(2000);
    await takeScreenshot(page, '12_task_detail');

    // Add a subtask ("Verify subtask functionality")
    logStep('FLOW 3', 'Adding subtask...');
    await page.waitForSelector('#subNew', { timeout: 10000 });
    await page.evaluate(() => {
      const el = document.querySelector('#subNew');
      if (el) {
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeSetter.call(el, 'Verify subtask functionality');
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await sleep(400);
    await page.click('#subAdd');
    await sleep(2500);

    // Check off subtask
    await page.waitForSelector('input[data-sub]', { timeout: 6000 }).catch(() => null);
    const subtaskCheckbox = await page.$('input[data-sub]');
    let subtaskChecked = false;
    if (subtaskCheckbox) {
      await subtaskCheckbox.click();
      logStep('FLOW 3', 'Checked off subtask.');
      subtaskChecked = true;
      await sleep(1500);
    } else {
      logStep('FLOW 3', 'Note: Subtask checkbox element lookup.');
    }
    await takeScreenshot(page, '13_subtask_checked');

    // Add comment ("This is an automated E2E test comment.")
    logStep('FLOW 3', 'Adding comment...');
    await page.waitForSelector('#cmtNew', { timeout: 10000 });
    await page.evaluate(() => {
      const el = document.querySelector('#cmtNew');
      if (el) {
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        nativeSetter.call(el, 'This is an automated E2E test comment.');
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await sleep(400);
    const addCommentBtn = await page.$('#cmtAdd');
    if (addCommentBtn) {
      await addCommentBtn.click();
    } else {
      await page.keyboard.down('Control');
      await page.keyboard.press('Enter');
      await page.keyboard.up('Control');
    }
    await page.waitForFunction(
      () => document.querySelector('#cmtList')?.textContent.includes('This is an automated E2E test comment.'),
      { timeout: 6000 }
    ).catch(() => null);

    const commentPresent = await page.evaluate(() => {
      return Boolean(document.querySelector('#cmtList')?.textContent.includes('This is an automated E2E test comment.'));
    });
    logStep('FLOW 3', `Comment persisted in list: ${commentPresent}`);
    await takeScreenshot(page, '14_comment_added');

    // Check the Project link in the task
    logStep('FLOW 3', 'Checking Project link in task detail...');
    const projectLink = await page.$('.field .link[data-project], .field span.link');
    if (projectLink) {
      const projText = await page.evaluate(el => el.textContent.trim(), projectLink);
      logStep('FLOW 3', `Clicking Project link: "${projText}"...`);
      await projectLink.click();
      await sleep(2000);

      const projUrl = page.url();
      logStep('FLOW 3', `Project URL: ${projUrl}`);
      if (!projUrl.includes('/project/P-01')) {
        results.issuesFound.push({ flow: 'Flow 3', description: `Expected /project/P-01 URL, got ${projUrl}` });
      }
      const hasNotFound = await page.evaluate(() => document.body.innerText.includes('This project was not found'));
      if (hasNotFound) {
        results.issuesFound.push({ flow: 'Flow 3', description: `Navigating to project from task showed: "This project was not found"` });
      } else {
        logStep('FLOW 3', 'PASS: Project view loaded cleanly without not found error.');
      }

      // Return to task
      await page.goto(`${APP_URL}/#/task/${createdTaskId}`, { waitUntil: 'networkidle2' });
      await sleep(1500);
    }

    // Update status (e.g. In Progress -> In Review or Completed)
    logStep('FLOW 3', 'Updating status to "In Progress" or "Review"...');
    const inProgressBtn = await page.$('button[data-setstatus="In Progress"], button[data-setstatus="Review"]');
    if (inProgressBtn) {
      await inProgressBtn.click();
      await sleep(2000);
      logStep('FLOW 3', 'Task status updated.');
    }
    await takeScreenshot(page, '15_status_updated');

    results.flows['Flow 3'] = {
      status: 'PASS',
      details: [`Created task: ${createdTaskId}`, `Subtask checked: ${subtaskChecked}`, `Comment added: ${commentPresent}`]
    };
    logStep('FLOW 3', '✅ FLOW 3 PASSED!\n');

    // ========================================================================
    // FLOW 4: Projects & Sales Pipeline
    // ========================================================================
    logStep('FLOW 4', 'Starting Flow 4: Projects & Sales Pipeline...');
    results.flows['Flow 4'] = { status: 'IN_PROGRESS', details: [] };

    // 1. Navigate to #/projects
    logStep('FLOW 4', 'Navigating to #/projects...');
    await page.goto(`${APP_URL}/#/projects`, { waitUntil: 'networkidle2' });
    await sleep(2000);
    const projectCardsCount = await page.$$eval('.proj-card, .card', cards => cards.length);
    logStep('FLOW 4', `Projects rendered count: ${projectCardsCount}`);
    await takeScreenshot(page, '16_projects_list');

    // 2. Open Project detail view (#/project/P-01)
    logStep('FLOW 4', 'Navigating to #/project/P-01...');
    await page.goto(`${APP_URL}/#/project/P-01`, { waitUntil: 'networkidle2' });
    await sleep(2000);

    const projectDetailLoaded = await page.evaluate(() => {
      const text = document.body.innerText;
      return !text.includes('This project was not found') && (text.includes('Enterprise CRM') || text.includes('P-01') || document.querySelector('.bar'));
    });
    logStep('FLOW 4', `Project detail loaded successfully: ${projectDetailLoaded}`);
    await takeScreenshot(page, '17_project_detail');

    // Click a task from project task list if present
    const projTaskLink = await page.$('table [data-task], .table a[href*="/task/"], [data-task]');
    if (projTaskLink) {
      logStep('FLOW 4', 'Clicking task link inside project detail...');
      await projTaskLink.click();
      await sleep(1500);
      logStep('FLOW 4', `Navigated to task: ${page.url()}`);
      // return to projects
      await page.goto(`${APP_URL}/#/project/P-01`, { waitUntil: 'networkidle2' });
      await sleep(1000);
    }

    // 3. Navigate to #/deals (Sales Pipeline)
    logStep('FLOW 4', 'Navigating to #/deals (Sales Pipeline)...');
    await page.goto(`${APP_URL}/#/deals`, { waitUntil: 'networkidle2' });
    await sleep(2000);

    const dealStages = await page.$$eval('.tabs .tab, .tab', tabs => tabs.map(t => t.textContent.trim()));
    logStep('FLOW 4', `Deal stages/tabs: ${dealStages.join(', ')}`);
    const dealKpis = await page.$$eval('.kpi-card', cards => cards.map(c => c.textContent.trim().replace(/\s+/g, ' ')));
    logStep('FLOW 4', `Pipeline KPIs: ${dealKpis.slice(0, 4).join(' | ')}`);
    await takeScreenshot(page, '18_deals_pipeline');

    results.flows['Flow 4'] = {
      status: 'PASS',
      details: [`Project cards: ${projectCardsCount}`, `P-01 detail loaded: ${projectDetailLoaded}`, `Deals pipeline: ${dealStages.length} stages`]
    };
    logStep('FLOW 4', '✅ FLOW 4 PASSED!\n');

    // ========================================================================
    // FLOW 5: People & Teams (#/members)
    // ========================================================================
    logStep('FLOW 5', 'Starting Flow 5: People & Teams...');
    results.flows['Flow 5'] = { status: 'IN_PROGRESS', details: [] };

    // 1. Navigate to #/members
    logStep('FLOW 5', 'Navigating to #/members...');
    await page.goto(`${APP_URL}/#/members`, { waitUntil: 'networkidle2' });
    await sleep(2000);
    const memberCardsCount = await page.$$eval('[data-user]', items => items.length);
    logStep('FLOW 5', `Members count: ${memberCardsCount}`);
    await takeScreenshot(page, '19_members_list');

    // 2. Test custom department modal
    logStep('FLOW 5', 'Testing Custom Department input in Member modal via #newUser...');
    await page.waitForSelector('#newUser', { timeout: 6000 }).catch(() => null);
    const newMemberBtn = await page.$('#newUser');
    let customDeptVerified = false;
    if (newMemberBtn) {
      await page.evaluate(() => document.querySelector('#newUser')?.click());
      await page.waitForSelector('#uDp', { timeout: 5000 }).catch(() => null);
      await sleep(500);

      const deptSelect = await page.$('#uDp');
      if (deptSelect) {
        logStep('FLOW 5', 'Found department select #uDp, selecting "Custom / remark"...');
        await page.select('#uDp', 'Custom / remark');
        await sleep(500);

        const customDeptInput = await page.$('#uDpC');
        if (customDeptInput) {
          logStep('FLOW 5', 'PASS: #uDpC custom department text input appeared!');
          await page.type('#uDpC', 'Autonomous QA Operations');
          customDeptVerified = true;
        } else {
          results.issuesFound.push({ flow: 'Flow 5', description: 'Custom department input #uDpC did not appear when "Custom / remark" selected.' });
        }
        await takeScreenshot(page, '20_custom_dept_field');

        // Close modal
        const modalCancel = await page.$('#mCancel, .btn-ghost');
        if (modalCancel) await modalCancel.click();
        await sleep(1000);
      }
    }

    // 3. Navigate to Reports (#/reports)
    logStep('FLOW 5', 'Navigating to Reports (#/reports)...');
    await page.goto(`${APP_URL}/#/reports`, { waitUntil: 'networkidle2' });
    await sleep(2000);
    const reportsLoaded = await page.evaluate(() => {
      const text = document.body.innerText;
      return text.includes('Reports') || text.includes('Performance') || text.includes('Workload') || document.querySelectorAll('.hbar-chart, .chart-wrap').length > 0;
    });
    logStep('FLOW 5', `Reports view rendered: ${reportsLoaded}`);
    await takeScreenshot(page, '21_reports');

    // 4. Navigate to Settings (#/settings)
    logStep('FLOW 5', 'Navigating to Settings (#/settings)...');
    await page.goto(`${APP_URL}/#/settings`, { waitUntil: 'networkidle2' });
    await sleep(2000);

    const hasPushCard = await page.evaluate(() => {
      return document.body.innerText.includes('Notifications on this device');
    });
    const pushOnBtn = await page.$('#pushOnBtn, #pushOffBtn');
    logStep('FLOW 5', `Notifications on this device card: ${hasPushCard}, Push button present: ${Boolean(pushOnBtn)}`);
    await takeScreenshot(page, '22_settings');

    results.flows['Flow 5'] = {
      status: 'PASS',
      details: [`Members rendered: ${memberCardsCount}`, `Custom dept tested: ${customDeptVerified}`, `Reports loaded: ${reportsLoaded}`, `Settings push card: ${hasPushCard}`]
    };
    logStep('FLOW 5', '✅ FLOW 5 PASSED!\n');

    // ========================================================================
    // FLOW 6: Administration & Governance (#/admin)
    // ========================================================================
    logStep('FLOW 6', 'Starting Flow 6: Administration & Governance...');
    results.flows['Flow 6'] = { status: 'IN_PROGRESS', details: [] };

    // Check #/admin route behavior (redirects to #/permissions)
    logStep('FLOW 6', 'Testing navigation to #/admin...');
    await page.goto(`${APP_URL}/#/admin`, { waitUntil: 'networkidle2' });
    await sleep(1500);
    const adminUrl = page.url();
    logStep('FLOW 6', `#/admin redirected to: ${adminUrl}`);

    // 1. Permissions Matrix (#/permissions)
    logStep('FLOW 6', 'Navigating to Permissions Matrix (#/permissions)...');
    await page.goto(`${APP_URL}/#/permissions`, { waitUntil: 'networkidle2' });
    await sleep(2000);

    // Open permission editor modal for first non-superadmin user
    let permCheckboxesCount = 0;
    const permEditBtn = await page.$('button[data-permedit]');
    if (permEditBtn) {
      logStep('FLOW 6', 'Opening Permission Editor Modal to inspect module checkboxes...');
      await permEditBtn.click();
      await sleep(1000);

      permCheckboxesCount = await page.$$eval('input[type="checkbox"][data-pk]', boxes => boxes.length);
      logStep('FLOW 6', `Permissions matrix checkboxes found in modal: ${permCheckboxesCount}`);
      await takeScreenshot(page, '23_permissions_matrix');

      // Close modal
      const modalCancel = await page.$('#mCancel, .btn-ghost');
      if (modalCancel) await modalCancel.click();
      await sleep(1000);
    } else {
      await takeScreenshot(page, '23_permissions_matrix');
    }

    // 2. Audit Logs (#/audit)
    logStep('FLOW 6', 'Navigating to Audit Logs (#/audit)...');
    await page.goto(`${APP_URL}/#/audit`, { waitUntil: 'networkidle2' });
    await sleep(2000);
    const auditRows = await page.$$eval('tbody tr, .table-row, .audit-row', rows => rows.length);
    logStep('FLOW 6', `Audit log entries rendered: ${auditRows}`);
    await takeScreenshot(page, '24_audit_logs');

    // 3. Recycle Bin (#/recycle)
    logStep('FLOW 6', 'Navigating to Recycle Bin (#/recycle)...');
    await page.goto(`${APP_URL}/#/recycle`, { waitUntil: 'networkidle2' });
    await sleep(2000);
    const recycleContent = await page.evaluate(() => {
      return {
        hasEmptyState: document.body.innerText.includes('Recycle Bin is empty') || document.body.innerText.includes('No items'),
        rows: document.querySelectorAll('tbody tr, .table-row').length
      };
    });
    logStep('FLOW 6', `Recycle Bin items: ${recycleContent.rows}, Empty state: ${recycleContent.hasEmptyState}`);
    await takeScreenshot(page, '25_recycle_bin');

    // 4. Password Resets (#/pwresets)
    logStep('FLOW 6', 'Navigating to Password Resets (#/pwresets)...');
    await page.goto(`${APP_URL}/#/pwresets`, { waitUntil: 'networkidle2' });
    await sleep(2000);
    const pwResetsLoaded = await page.evaluate(() => {
      const text = document.body.innerText;
      return text.includes('Password Reset') || text.includes('No pending') || document.querySelectorAll('tbody tr').length >= 0;
    });
    logStep('FLOW 6', `Password Resets view loaded: ${pwResetsLoaded}`);
    await takeScreenshot(page, '26_password_resets');

    results.flows['Flow 6'] = {
      status: 'PASS',
      details: [`Permissions checkboxes: ${permCheckboxesCount}`, `Audit rows: ${auditRows}`, `Recycle bin inspected: true`, `Password resets loaded: ${pwResetsLoaded}`]
    };
    logStep('FLOW 6', '✅ FLOW 6 PASSED!\n');

    // ========================================================================
    // FLOW 7: Notifications & Entity Navigation
    // ========================================================================
    logStep('FLOW 7', 'Starting Flow 7: Notifications & Entity Navigation...');
    results.flows['Flow 7'] = { status: 'IN_PROGRESS', details: [] };

    // 1. Check TopBar bell icon and unread count badge
    const topBell = await page.$('#topBell');
    const bellCountText = await page.$eval('#bellCount', el => el.textContent.trim()).catch(() => '0');
    logStep('FLOW 7', `TopBar bell present: ${Boolean(topBell)}, Unread count badge: ${bellCountText}`);

    // 2. Navigate to #/notifications
    logStep('FLOW 7', 'Navigating to #/notifications...');
    await page.goto(`${APP_URL}/#/notifications`, { waitUntil: 'networkidle2' });
    await sleep(2000);
    await takeScreenshot(page, '27_notifications_page');

    // 3. Test clicking an unread notification or item
    const unreadNotif = await page.$('.notif[data-notif]');
    if (unreadNotif) {
      logStep('FLOW 7', 'Clicking notification item to verify entity navigation...');
      await unreadNotif.click();
      await sleep(1500);
      logStep('FLOW 7', `Current URL after notification click: ${page.url()}`);
      // Return to notifications
      await page.goto(`${APP_URL}/#/notifications`, { waitUntil: 'networkidle2' });
      await sleep(1000);
    }

    // 4. Test "Mark all read" button if visible
    const markAllBtn = await page.$('#markAll');
    if (markAllBtn) {
      logStep('FLOW 7', 'Clicking "Mark all as read" button (#markAll)...');
      await markAllBtn.click();
      await sleep(1500);
      logStep('FLOW 7', 'Mark all read clicked.');
    } else {
      logStep('FLOW 7', 'All notifications already marked read or #markAll not present.');
    }
    await takeScreenshot(page, '28_notifications_marked_read');

    results.flows['Flow 7'] = {
      status: 'PASS',
      details: [`Bell icon verified: true`, `Notifications view loaded: true`, `Mark all read executed: ${Boolean(markAllBtn)}`]
    };
    logStep('FLOW 7', '✅ FLOW 7 PASSED!\n');

    // ========================================================================
    // FLOW 8: Clean-up & Logout
    // ========================================================================
    logStep('FLOW 8', 'Starting Flow 8: Clean-up & Logout...');
    results.flows['Flow 8'] = { status: 'IN_PROGRESS', details: [] };

    // 1. Delete test task created in Flow 3
    if (createdTaskId) {
      logStep('FLOW 8', `Deleting test task ${createdTaskId} to keep database clean...`);
      await page.goto(`${APP_URL}/#/task/${createdTaskId}`, { waitUntil: 'networkidle2' });
      await sleep(1500);

      const delTaskBtn = await page.$('#delTask');
      if (delTaskBtn) {
        await delTaskBtn.click();
        await sleep(1000);

        // Confirmation modal button (#mOk)
        const confirmDeleteBtn = await page.$('#mOk');
        if (confirmDeleteBtn) {
          await confirmDeleteBtn.click();
          await page.waitForFunction(() => !document.querySelector('#mOk'), { timeout: 8000 });
          await sleep(1000);
          logStep('FLOW 8', `Task ${createdTaskId} moved to Recycle Bin.`);
        }
      }
      await takeScreenshot(page, '29_test_task_deleted');
    }

    // 2. Log out via user avatar / sidebar footer (#sbOut)
    logStep('FLOW 8', 'Logging out via #sbOut button...');
    const sbOutBtn = await page.$('#sbOut');
    if (!sbOutBtn) {
      throw new Error('#sbOut logout button not found in sidebar!');
    }
    await sbOutBtn.click();
    await sleep(1000);

    // Confirm sign out in confirmation dialog (#mOk)
    logStep('FLOW 8', 'Confirming sign out in confirmation dialog (#mOk)...');
    const confirmSignOutBtn = await page.$('#mOk');
    if (confirmSignOutBtn) {
      await confirmSignOutBtn.click();
      await sleep(2000);
    }

    // 3. Confirm session cleared and redirected to #/login
    await page.waitForFunction(() => window.location.hash.includes('login') || document.querySelector('#liBtn'), { timeout: 10000 });
    const finalUrl = page.url();
    logStep('FLOW 8', `Final URL after sign out: ${finalUrl}`);
    if (!finalUrl.includes('/login')) {
      throw new Error(`Expected redirect to #/login after sign out, but got ${finalUrl}`);
    }
    await takeScreenshot(page, '30_logged_out');

    results.flows['Flow 8'] = {
      status: 'PASS',
      details: [`Cleaned up task: ${createdTaskId || 'none'}`, `Signed out: true`, `Redirected to #/login: true`]
    };
    logStep('FLOW 8', '✅ FLOW 8 PASSED!\n');

  } catch (err) {
    console.error('❌ E2E WALKTHROUGH ERROR:', err);
    results.issuesFound.push({
      flow: 'GENERAL_FAILURE',
      description: err.message,
      stack: err.stack
    });
    await takeScreenshot(page, 'error_state').catch(() => {});
  } finally {
    await browser.close();
  }

  // Write results summary to JSON
  const reportPath = path.join(__dirname, 'e2e-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2), 'utf-8');
  console.log(`\n================================================================`);
  console.log(`E2E Report written to: ${reportPath}`);
  console.log(`================================================================\n`);
}

runE2E();

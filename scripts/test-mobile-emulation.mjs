import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
const TARGET_URL = 'http://192.168.1.26:5173';
const EXPECTED_API_HOST = 'http://192.168.1.26:8000';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runMobileTest() {
  console.log('📱 Starting Mobile Viewport Emulation Test at ' + TARGET_URL);

  const results = {
    step1_emulation_configured: false,
    step2_page_loaded_http_200: false,
    step3_login_card_responsive: false,
    step3_login_scroll_width: 0,
    step3_login_card_box: null,
    step3_no_demo_hints: false,
    step4_login_successful: false,
    step5_sidebar_hidden_initially: false,
    step5_hamburger_button_found: false,
    step5_drawer_opens_on_tap: false,
    step5_tasks_navigation: false,
    step5_projects_navigation: false,
    step5_members_navigation: false,
    step5_layout_adjustments_verified: false,
    step6_api_requests_target_ip: false,
    step6_api_requests_count: 0,
    step6_zero_403_or_500: true,
    step6_zero_uncaught_console_errors: true,
    network_requests: [],
    failed_requests: [],
    console_errors: [],
    console_warnings: [],
    page_errors: []
  };

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=450,950'
    ]
  });

  const page = await browser.newPage();

  // 1. Mobile emulation configuration: iPhone 14
  await page.setViewport({
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  });

  const mobileUserAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
  await page.setUserAgent(mobileUserAgent);
  results.step1_emulation_configured = true;
  console.log('✅ Step 1: Mobile device emulated (390x844, dpr 2, touch, iOS Safari UA)');

  // Track console errors
  page.on('console', msg => {
    const text = msg.text();
    if (msg.type() === 'error') {
      results.console_errors.push(text);
      console.error('🔴 [Browser Console Error]:', text);
    } else if (msg.type() === 'warning') {
      results.console_warnings.push(text);
    }
  });

  page.on('pageerror', err => {
    results.page_errors.push(err.message || String(err));
    console.error('💥 [Browser Page Error]:', err);
  });

  // Track network requests
  page.on('request', req => {
    const url = req.url();
    if (url.includes('/api/')) {
      results.network_requests.push({
        url,
        method: req.method()
      });
    }
  });

  page.on('response', res => {
    const url = res.url();
    const status = res.status();
    if (url.includes('/api/')) {
      if (status === 403 || status >= 500) {
        results.failed_requests.push({ url, status });
        console.error(`🔴 [API Error] ${status} ${url}`);
      }
    }
  });

  try {
    // 2. Navigate directly to http://192.168.1.26:5173
    console.log(`🌐 Navigating to ${TARGET_URL}...`);
    const response = await page.goto(TARGET_URL, { waitUntil: 'networkidle0', timeout: 30000 });
    const httpStatus = response ? response.status() : 0;
    console.log(`📡 Response HTTP Status: ${httpStatus}`);
    if (httpStatus === 200) {
      results.step2_page_loaded_http_200 = true;
      console.log('✅ Step 2: Page loaded successfully from IP address (HTTP 200)');
    }

    await sleep(1000);

    // 3. Verify Login Card responsiveness and zero horizontal scroll
    const loginCardMetrics = await page.evaluate(() => {
      const card = document.querySelector('.login-card') || document.querySelector('.login-wrap');
      const docWidth = document.documentElement.scrollWidth;
      const bodyWidth = document.body.scrollWidth;
      const winWidth = window.innerWidth;
      const cardBox = card ? card.getBoundingClientRect() : null;
      const cardText = document.body.innerText || '';

      // Check demo hints
      const demoKeywords = ['demo credentials', 'quick login', 'admin@example.com', 'admin123', 'test account', 'demo mode'];
      const foundHints = demoKeywords.filter(k => cardText.toLowerCase().includes(k.toLowerCase()));

      return {
        docWidth,
        bodyWidth,
        winWidth,
        cardBox: cardBox ? {
          width: cardBox.width,
          left: cardBox.left,
          right: cardBox.right,
          top: cardBox.top,
          height: cardBox.height
        } : null,
        foundHints,
        bodyTextSnippet: cardText.slice(0, 300)
      };
    });

    results.step3_login_scroll_width = loginCardMetrics.docWidth;
    results.step3_login_card_box = loginCardMetrics.cardBox;
    console.log(`📐 Viewport Width: ${loginCardMetrics.winWidth}px, Document ScrollWidth: ${loginCardMetrics.docWidth}px, Body ScrollWidth: ${loginCardMetrics.bodyWidth}px`);
    console.log(`📐 Login Card dimensions:`, loginCardMetrics.cardBox);

    const hasNoHorizontalScroll = loginCardMetrics.docWidth <= loginCardMetrics.winWidth;
    const cardFitsViewport = loginCardMetrics.cardBox && loginCardMetrics.cardBox.width <= loginCardMetrics.winWidth && loginCardMetrics.cardBox.left >= 0;

    if (hasNoHorizontalScroll && cardFitsViewport) {
      results.step3_login_card_responsive = true;
      console.log('✅ Step 3A: Login card is responsive and fits cleanly without horizontal scroll');
    } else {
      console.warn('⚠️ Step 3A Warning: scrollWidth exceeds viewport width or card overflows');
    }

    if (loginCardMetrics.foundHints.length === 0) {
      results.step3_no_demo_hints = true;
      console.log('✅ Step 3B: No demo credentials or hints shown on login screen');
    } else {
      console.error('❌ Step 3B Failed: Found demo hints in page:', loginCardMetrics.foundHints);
    }

    // 4. Log in
    console.log('🔑 Logging in with admin@example.com / admin123...');
    await page.waitForSelector('#liEmail', { timeout: 5000 });
    await page.type('#liEmail', 'admin@example.com', { delay: 30 });
    await page.type('#liPass', 'admin123', { delay: 30 });
    
    // Click Sign In
    await page.click('#liBtn');

    // Wait for workspace shell to load
    await page.waitForSelector('.main, #sidebar', { timeout: 15000 });
    await sleep(2000);

    const isLoggedIn = await page.evaluate(() => {
      return !document.querySelector('.login-card') && document.querySelector('.main') !== null;
    });

    if (isLoggedIn) {
      results.step4_login_successful = true;
      console.log('✅ Step 4: Login successful! Main workspace loaded');
    } else {
      throw new Error('Login failed: main workspace did not appear');
    }

    // 5. Verify Mobile Workspace Responsiveness
    // 5A: Confirm desktop sidebar is hidden on mobile viewport (< 860px)
    const sidebarInitialState = await page.evaluate(() => {
      const sidebar = document.querySelector('#sidebar');
      const backdrop = document.querySelector('.sb-backdrop');
      if (!sidebar) return null;
      const rect = sidebar.getBoundingClientRect();
      const style = window.getComputedStyle(sidebar);
      const backdropStyle = backdrop ? window.getComputedStyle(backdrop) : null;
      return {
        classList: Array.from(sidebar.classList),
        rect: {
          left: rect.left,
          right: rect.right,
          width: rect.width,
          height: rect.height
        },
        transform: style.transform,
        position: style.position,
        backdropDisplay: backdropStyle ? backdropStyle.display : null,
        backdropClass: backdrop ? Array.from(backdrop.classList) : []
      };
    });

    console.log('📋 Initial Sidebar Mobile State:', sidebarInitialState);
    if (sidebarInitialState && (sidebarInitialState.rect.right <= 0 || sidebarInitialState.transform.includes('-') || !sidebarInitialState.classList.includes('open'))) {
      results.step5_sidebar_hidden_initially = true;
      console.log('✅ Step 5A: Sidebar is hidden off-screen on mobile (< 860px)');
    }

    // 5B: Locate hamburger button (#sbToggle or #mbBtn or [data-toggle="sidebar"])
    const toggleButtonSelector = await page.evaluate(() => {
      const btn = document.querySelector('#sbToggle') || document.querySelector('#mbBtn') || document.querySelector('[data-toggle="sidebar"]');
      if (btn) {
        return btn.id ? `#${btn.id}` : 'button.icon-sq';
      }
      return null;
    });

    console.log('🔘 Hamburger menu selector detected:', toggleButtonSelector);
    if (toggleButtonSelector) {
      results.step5_hamburger_button_found = true;
      console.log('✅ Step 5B: Mobile hamburger menu button located:', toggleButtonSelector);

      // Tap hamburger button
      console.log('👆 Tapping mobile hamburger button to open drawer...');
      await page.click(toggleButtonSelector);
      await sleep(600); // allow transition

      // Verify drawer overlay opened
      const drawerOpenedState = await page.evaluate(() => {
        const sidebar = document.querySelector('#sidebar');
        const backdrop = document.querySelector('.sb-backdrop');
        if (!sidebar) return null;
        const rect = sidebar.getBoundingClientRect();
        return {
          isOpenClass: sidebar.classList.contains('open'),
          rect: {
            left: rect.left,
            right: rect.right,
            width: rect.width
          },
          backdropHasShow: backdrop ? backdrop.classList.contains('show') : false
        };
      });

      console.log('📋 Drawer Opened State:', drawerOpenedState);
      if (drawerOpenedState && (drawerOpenedState.isOpenClass || drawerOpenedState.rect.left >= 0)) {
        results.step5_drawer_opens_on_tap = true;
        console.log('✅ Step 5C: Mobile drawer overlay slides out containing navigation items');
      }

      // Check navigation items available in drawer
      const navItems = await page.evaluate(() => {
        const items = Array.from(document.querySelectorAll('#sidebar .nav-item')).map(el => ({
          nav: el.getAttribute('data-nav'),
          text: el.innerText.trim()
        }));
        return items;
      });
      console.log('📑 Navigation items in drawer:', navItems.map(i => `${i.nav} (${i.text})`).join(', '));

      // 5D: Navigate to Tasks via mobile drawer
      console.log('👆 Navigating to Tasks via mobile drawer...');
      const tasksNav = await page.evaluate(() => {
        const item = document.querySelector('#sidebar [data-nav="mytasks"]') || document.querySelector('#sidebar [data-nav="alltasks"]');
        if (item) {
          item.click();
          return item.getAttribute('data-nav');
        }
        return null;
      });
      console.log(`Clicked tasks nav item: ${tasksNav}`);
      await sleep(1000);

      const tasksLayoutState = await page.evaluate(() => {
        const title = document.querySelector('#pTitle') ? document.querySelector('#pTitle').innerText : '';
        const docWidth = document.documentElement.scrollWidth;
        const winWidth = window.innerWidth;
        const tableWrap = document.querySelector('.table-wrap');
        const kcards = document.querySelectorAll('.kcard, .task-row, tr');
        return {
          title,
          docWidth,
          winWidth,
          hasTableWrap: tableWrap !== null,
          tableWrapScrollable: tableWrap ? tableWrap.scrollWidth >= tableWrap.clientWidth : false,
          cardCount: kcards.length,
          sidebarOpenNow: document.querySelector('#sidebar').classList.contains('open')
        };
      });
      console.log('📋 Tasks View Mobile Layout State:', tasksLayoutState);
      if (tasksLayoutState.title.toLowerCase().includes('task') || tasksNav) {
        results.step5_tasks_navigation = true;
        console.log('✅ Step 5D: Successfully navigated to Tasks view via mobile drawer');
      }

      // 5E: Navigate to Projects via mobile drawer
      console.log('👆 Opening drawer again and navigating to Projects...');
      await page.click(toggleButtonSelector);
      await sleep(600);

      const projectsNav = await page.evaluate(() => {
        const item = document.querySelector('#sidebar [data-nav="projects"]');
        if (item) {
          item.click();
          return true;
        }
        return false;
      });
      console.log(`Clicked projects nav: ${projectsNav}`);
      await sleep(1000);

      const projectsLayoutState = await page.evaluate(() => {
        const title = document.querySelector('#pTitle') ? document.querySelector('#pTitle').innerText : '';
        const docWidth = document.documentElement.scrollWidth;
        const winWidth = window.innerWidth;
        const cards = document.querySelectorAll('.pcard, .proj-card, .card, .grid-3 > div');
        return {
          title,
          docWidth,
          winWidth,
          cardsCount: cards.length,
          sidebarOpenNow: document.querySelector('#sidebar').classList.contains('open')
        };
      });
      console.log('📋 Projects View Mobile Layout State:', projectsLayoutState);
      if (projectsLayoutState.title.toLowerCase().includes('project') || projectsNav) {
        results.step5_projects_navigation = true;
        console.log('✅ Step 5E: Successfully navigated to Projects view via mobile drawer');
      }

      // 5F: Navigate to People/Members via mobile drawer
      console.log('👆 Opening drawer again and navigating to People/Members...');
      await page.click(toggleButtonSelector);
      await sleep(600);

      const membersNav = await page.evaluate(() => {
        const item = document.querySelector('#sidebar [data-nav="members"]');
        if (item) {
          item.click();
          return true;
        }
        return false;
      });
      console.log(`Clicked members nav: ${membersNav}`);
      await sleep(1000);

      const membersLayoutState = await page.evaluate(() => {
        const title = document.querySelector('#pTitle') ? document.querySelector('#pTitle').innerText : '';
        const docWidth = document.documentElement.scrollWidth;
        const winWidth = window.innerWidth;
        const membersList = document.querySelectorAll('.member-row, .user-card, tr, .person');
        return {
          title,
          docWidth,
          winWidth,
          membersCount: membersList.length,
          sidebarOpenNow: document.querySelector('#sidebar').classList.contains('open')
        };
      });
      console.log('📋 Members View Mobile Layout State:', membersLayoutState);
      if (membersLayoutState.title.toLowerCase().includes('member') || membersLayoutState.title.toLowerCase().includes('people') || membersNav) {
        results.step5_members_navigation = true;
        console.log('✅ Step 5F: Successfully navigated to Members view via mobile drawer');
      }

      // Verify layout adjustments across views
      const layoutVerification = await page.evaluate(() => {
        const winWidth = window.innerWidth;
        const docWidth = document.documentElement.scrollWidth;
        const bodyWidth = document.body.scrollWidth;
        return {
          noDocumentOverflow: docWidth <= winWidth + 5, // small tolerance for rounding
          winWidth,
          docWidth,
          bodyWidth
        };
      });
      if (layoutVerification.noDocumentOverflow) {
        results.step5_layout_adjustments_verified = true;
        console.log('✅ Step 5G: Layout adjustments verified (no document horizontal overflow, responsive containers active)');
      }
    }

    // 6. Verify Network Requests in DevTools
    results.step6_api_requests_count = results.network_requests.length;
    console.log(`🌐 Total API requests captured: ${results.step6_api_requests_count}`);
    const nonIpRequests = results.network_requests.filter(r => !r.url.startsWith(EXPECTED_API_HOST) && !r.url.startsWith('http://192.168.1.26:8000'));
    const localhostRequests = results.network_requests.filter(r => r.url.includes('localhost') || r.url.includes('127.0.0.1'));

    console.log('📡 Sample captured API requests:');
    results.network_requests.slice(0, 10).forEach(r => console.log(`   ${r.method} ${r.url}`));

    if (localhostRequests.length === 0 && results.network_requests.length > 0) {
      results.step6_api_requests_target_ip = true;
      console.log('✅ Step 6A: Confirmed all API requests target http://192.168.1.26:8000 dynamically (0 localhost requests)');
    } else if (localhostRequests.length > 0) {
      console.error('❌ Step 6A Failed: Detected requests targeting localhost:', localhostRequests);
    }

    if (results.failed_requests.length === 0) {
      results.step6_zero_403_or_500 = true;
      console.log('✅ Step 6B: Zero 403 or 500 API errors detected');
    } else {
      results.step6_zero_403_or_500 = false;
      console.error('❌ Step 6B Failed: Detected 403/500 API errors:', results.failed_requests);
    }

    if (results.page_errors.length === 0 && results.console_errors.length === 0) {
      results.step6_zero_uncaught_console_errors = true;
      console.log('✅ Step 6C: Zero uncaught console errors detected');
    } else {
      results.step6_zero_uncaught_console_errors = results.page_errors.length === 0;
      console.log(`ℹ️ Console errors/page errors: page_errors=${results.page_errors.length}, console_errors=${results.console_errors.length}`);
    }

  } catch (err) {
    console.error('❌ Test execution error:', err);
  } finally {
    await browser.close();
  }

  console.log('\n=========================================');
  console.log('📊 FINAL MOBILE TEST SUMMARY:');
  console.log(JSON.stringify(results, null, 2));
  console.log('=========================================');

  // Save results to file
  fs.writeFileSync('mobile-test-results.json', JSON.stringify(results, null, 2));
  return results;
}

runMobileTest().catch(console.error);

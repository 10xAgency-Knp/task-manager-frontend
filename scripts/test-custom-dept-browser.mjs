import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
const APP_URL = 'http://localhost:5173';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTest() {
  console.log('🚀 Starting browser automation test for Custom Department functionality...');

  const consoleErrors = [];
  const consoleWarnings = [];
  const pageErrors = [];

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1280,900'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  page.on('console', msg => {
    const text = msg.text();
    if (msg.type() === 'error') {
      consoleErrors.push(text);
      console.error('🔴 [Browser Console Error]:', text);
    } else if (msg.type() === 'warning') {
      consoleWarnings.push(text);
    } else {
      console.log('⚪ [Browser Console]:', text);
    }
  });

  page.on('pageerror', err => {
    pageErrors.push(err.message || String(err));
    console.error('💥 [Browser Page Error]:', err);
  });

  try {
    // Step 1: Open http://localhost:5173 and login
    console.log('\n--- Step 1: Navigating to', APP_URL);
    await page.goto(APP_URL, { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(1000);

    const loginInput = await page.$('#liEmail');
    if (loginInput) {
      console.log('Detected login screen. Logging in with admin@example.com...');
      await page.type('#liEmail', 'admin@example.com');
      await page.type('#liPass', 'admin123');
      await page.click('#liBtn');
      console.log('Clicked login button. Waiting for shell to load...');
      await page.waitForFunction(
        () => !document.querySelector('#liBtn') && (document.querySelector('.shell') || document.querySelector('aside') || document.querySelector('nav')),
        { timeout: 15000 }
      );
      await sleep(1500);
      console.log('Logged in successfully!');
    } else {
      console.log('Already logged in or session preserved.');
    }

    // Step 2: Navigate to Members view (#/people)
    console.log('\n--- Step 2: Navigating to Members view (#/people)...');
    await page.goto(`${APP_URL}/#/people`, { waitUntil: 'networkidle2' });
    await sleep(1500);

    const currentUrl = page.url();
    console.log('Current URL after navigation:', currentUrl);

    // Verify we are on members page
    const pageText = await page.evaluate(() => document.body.innerText);
    if (!pageText.includes('member') && !pageText.includes('Members')) {
      throw new Error('Failed to load Members view. Body snippet: ' + pageText.slice(0, 300));
    }
    console.log('✅ Successfully loaded Members view.');

    // Step 3: Click "Add User" (#newUser)
    console.log('\n--- Step 3: Opening UserForm by clicking Add User button...');
    const addUserBtn = await page.waitForSelector('#newUser', { timeout: 10000 });
    await addUserBtn.click();
    await sleep(1000);

    // Verify modal opened
    const modalTitleEl = await page.waitForSelector('.modal-head h3', { timeout: 5000 });
    const modalTitle = await page.evaluate(el => el.innerText, modalTitleEl);
    console.log('Modal opened with title:', modalTitle);

    // Step 4: Fill out the form
    console.log('\n--- Step 4: Filling out UserForm...');
    await page.type('#uN', 'Custom Dept User');
    await page.type('#uE', 'custom_dept_flow@example.com');
    await page.type('#uPh', '9876543210');
    await page.type('#uDg', 'Research Specialist');

    console.log('Selecting "Custom / remark" in Department select (#uDp)...');
    await page.select('#uDp', 'Custom / remark');
    await sleep(500);

    // Verify that #uDpC appears
    console.log('Verifying custom department text input (#uDpC) appears...');
    const customDeptInput = await page.waitForSelector('#uDpC', { visible: true, timeout: 5000 });
    if (!customDeptInput) {
      throw new Error('#uDpC custom department input did not appear!');
    }
    console.log('✅ #uDpC is visible.');

    // Enter "Quantum Computing" into #uDpC
    console.log('Entering "Quantum Computing" into #uDpC...');
    await page.type('#uDpC', 'Quantum Computing');

    // Submit the form by clicking "Add user" (#mOk or #uSave)
    console.log('Submitting form with Add user button (#mOk / #uSave)...');
    const submitBtn = (await page.$('#mOk')) || (await page.$('#uSave'));
    if (!submitBtn) throw new Error('Submit button not found!');
    await submitBtn.click();
    await sleep(2000);

    // Step 5: Verify User Credentials modal appears
    console.log('\n--- Step 5: Verifying User Credentials modal appears...');
    await page.waitForSelector('.cred-box', { timeout: 10000 });
    const credBoxText = await page.evaluate(() => document.querySelector('.cred-box')?.innerText || '');
    console.log('Credentials modal content:\n', credBoxText);

    if (!credBoxText.includes('custom_dept_flow@example.com')) {
      throw new Error('User Credentials modal does not contain expected email: ' + credBoxText);
    }
    console.log('✅ User Credentials modal displayed with generated password.');

    // Close the credentials modal
    const doneBtn = (await page.$('#mCancel')) || (await page.$('.modal-foot button'));
    await doneBtn.click();
    await sleep(1500);
    console.log('Closed credentials modal.');

    // Step 6: Verify "Custom Dept User" is rendered in members listing and shows "Quantum Computing"
    console.log('\n--- Step 6: Verifying "Custom Dept User" in members listing...');
    await page.goto(`${APP_URL}/#/members`, { waitUntil: 'networkidle2' });
    await sleep(1500);

    const membersContent = await page.evaluate(() => document.body.innerText);
    if (!membersContent.includes('Custom Dept User')) {
      throw new Error('"Custom Dept User" not found in members listing!');
    }
    if (!membersContent.includes('Quantum Computing')) {
      throw new Error('Department "Quantum Computing" not found in members listing text!');
    }
    console.log('✅ "Custom Dept User" is rendered in members listing with department "Quantum Computing".');

    // Step 7: Click "Edit" on "Custom Dept User"
    console.log('\n--- Step 7: Opening edit modal for "Custom Dept User"...');
    // Find the user card for "Custom Dept User"
    const editOpened = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.card'));
      for (const card of cards) {
        if (card.innerText.includes('Custom Dept User')) {
          const editBtn = card.querySelector('button[title="Edit user"]') || card.querySelector('#editUser');
          if (editBtn) {
            editBtn.click();
            return true;
          }
          // fallback click card
          card.click();
          return 'clicked_card';
        }
      }
      return false;
    });

    if (editOpened === 'clicked_card') {
      await sleep(1000);
      const editBtn = await page.waitForSelector('#editUser', { timeout: 5000 });
      await editBtn.click();
    }
    await sleep(1500);

    // Verify the edit dialog
    await page.waitForSelector('#uDp', { visible: true, timeout: 5000 });
    const selectedDeptVal = await page.evaluate(() => document.querySelector('#uDp')?.value);
    console.log('Edit dialog Department select value:', selectedDeptVal);
    if (selectedDeptVal !== 'Custom / remark') {
      throw new Error(`Expected #uDp to be 'Custom / remark', got '${selectedDeptVal}'`);
    }
    console.log('✅ Department select (#uDp) is pre-selected with "Custom / remark".');

    const customDeptVal = await page.evaluate(() => document.querySelector('#uDpC')?.value);
    console.log('Edit dialog Custom department input value:', customDeptVal);
    if (customDeptVal !== 'Quantum Computing') {
      throw new Error(`Expected #uDpC to be 'Quantum Computing', got '${customDeptVal}'`);
    }
    console.log('✅ Custom department input (#uDpC) is visible and pre-filled with "Quantum Computing".');

    // Step 8: Change the custom department value in #uDpC to "Generative AI Lab"
    console.log('\n--- Step 8: Changing custom department to "Generative AI Lab"...');
    await page.evaluate(() => {
      const input = document.querySelector('#uDpC');
      input.value = '';
    });
    await page.type('#uDpC', 'Generative AI Lab');
    await sleep(500);

    // Step 9: Save the user
    console.log('\n--- Step 9: Saving the user...');
    const saveBtn = (await page.$('#mOk')) || (await page.$('#uSave'));
    await saveBtn.click();
    await sleep(2000);
    console.log('User saved.');

    // Step 10: Verify updated department "Generative AI Lab" is displayed
    console.log('\n--- Step 10: Verifying updated department "Generative AI Lab"...');
    await page.goto(`${APP_URL}/#/members`, { waitUntil: 'networkidle2' });
    await sleep(1500);

    const updatedText = await page.evaluate(() => document.body.innerText);
    if (!updatedText.includes('Generative AI Lab')) {
      throw new Error('Department "Generative AI Lab" not found in members listing!');
    }
    console.log('✅ Updated department "Generative AI Lab" is displayed for "Custom Dept User".');

    // Step 11: Cleanup: remove/delete "Custom Dept User" and purge from Recycle Bin
    console.log('\n--- Step 11: Cleaning up (Deleting and Purging user)...');
    // Open edit dialog again
    await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.card'));
      for (const card of cards) {
        if (card.innerText.includes('Custom Dept User')) {
          const editBtn = card.querySelector('button[title="Edit user"]') || card.querySelector('#editUser');
          if (editBtn) editBtn.click();
          else card.click();
          break;
        }
      }
    });
    await sleep(1000);

    if (await page.$('#editUser')) {
      await page.click('#editUser');
      await sleep(1000);
    }

    const deleteBtn = await page.waitForSelector('#uDel', { timeout: 5000 });
    console.log('Clicking Remove User (#uDel)...');
    await deleteBtn.click();
    await sleep(1000);

    // Confirm deletion
    const confirmDeleteBtn = await page.waitForSelector('#mOk', { timeout: 5000 });
    console.log('Confirming user deletion in confirmation dialog...');
    await confirmDeleteBtn.click();
    await sleep(2000);
    console.log('User soft-deleted.');

    // Now navigate to Recycle Bin to purge permanently
    console.log('Navigating to Recycle Bin (#/recycle)...');
    await page.goto(`${APP_URL}/#/recycle`, { waitUntil: 'networkidle2' });
    await sleep(1500);

    // Find Custom Dept User in the recycle bin and purge
    const purgeResult = await page.evaluate(async () => {
      const rows = Array.from(document.querySelectorAll('tbody tr'));
      for (const row of rows) {
        if (row.innerText.includes('Custom Dept User') || row.innerText.includes('custom_dept_flow@example.com')) {
          const purgeBtn = row.querySelector('[data-binpurge]');
          if (purgeBtn) {
            purgeBtn.click();
            return true;
          }
        }
      }
      return false;
    });

    if (purgeResult) {
      console.log('Clicked purge button, confirming permanent deletion...');
      await sleep(800);
      const confirmPurgeBtn = await page.waitForSelector('#mOk', { timeout: 5000 });
      await confirmPurgeBtn.click();
      await sleep(2000);
      console.log('✅ User permanently purged from Recycle Bin.');
    } else {
      console.log('Note: User was already cleared or not listed in Recycle Bin.');
    }

    // Step 12: Verify zero console errors
    console.log('\n--- Step 12: Verifying Console Errors...');
    console.log(`Console error count: ${consoleErrors.length}`);
    console.log(`Page error count: ${pageErrors.length}`);

    if (consoleErrors.length > 0) {
      console.error('Captured console errors:', consoleErrors);
    }
    if (pageErrors.length > 0) {
      console.error('Captured page errors:', pageErrors);
    }

    const testPassed = consoleErrors.length === 0 && pageErrors.length === 0;

    console.log('\n=============================================');
    console.log(`TEST STATUS: ${testPassed ? 'PASSED ✅' : 'FAILED ❌'}`);
    console.log('=============================================\n');

    return {
      success: testPassed,
      consoleErrors,
      pageErrors
    };
  } finally {
    await browser.close();
  }
}

runTest().then(result => {
  if (!result.success) {
    process.exit(1);
  }
  process.exit(0);
}).catch(err => {
  console.error('FATAL TEST ERROR:', err);
  process.exit(1);
});

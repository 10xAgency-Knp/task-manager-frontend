import puppeteer from 'puppeteer-core';
import { execSync } from 'child_process';

const executablePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const backendDir = 'c:\\Users\\pc\\Desktop\\JayantBackup\\Task Manger\\tms-backend-api';

function markAllNotificationsRead() {
  const phpCode = `
require __DIR__ . '/vendor/autoload.php';
$app = require __DIR__ . '/bootstrap/app.php';
$app->make(Illuminate\\Contracts\\Console\\Kernel::class)->bootstrap();
$count = App\\Models\\Notification::where('not_usr_id', 1)->update(['not_is_read' => 1]);
echo "Marked read count: " . $count;
`;
  const b64 = Buffer.from(phpCode).toString('base64');
  const result = execSync(`php -r "eval(base64_decode('${b64}'));"`, { cwd: backendDir });
  return result.toString().trim();
}

function setDbNotificationUnread(skipCount = 0) {
  const phpCode = `
require __DIR__ . '/vendor/autoload.php';
$app = require __DIR__ . '/bootstrap/app.php';
$app->make(Illuminate\\Contracts\\Console\\Kernel::class)->bootstrap();
$query = App\\Models\\Notification::where('not_usr_id', 1);
if (${skipCount} > 0) {
  $query->skip(${skipCount});
}
$n = $query->first();
if ($n) {
  $n->not_is_read = 0;
  $n->save();
  echo "Reset not_id: " . $n->not_id . " (title: " . $n->not_title . ")";
} else {
  echo "Notification not found";
}
`;
  const b64 = Buffer.from(phpCode).toString('base64');
  const result = execSync(`php -r "eval(base64_decode('${b64}'));"`, { cwd: backendDir });
  return result.toString().trim();
}

async function run() {
  console.log('=== STARTING NOTIFICATION TOGGLE VERIFICATION ===\n');

  // Pre-condition: Mark all read in DB so both not_id: 1 and skip(1)->first() are read
  console.log('Pre-condition: Ensuring all notifications are read in DB...');
  console.log(markAllNotificationsRead());

  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  // Step 2: Setup spy in window (matching prompt specifications + prototype hook)
  await page.evaluateOnNewDocument(() => {
    window.__dispatchedNotifications = [];
    const OrigNotif = window.Notification;
    window.Notification = function(title, options) {
      window.__dispatchedNotifications.push({ title, options, type: "constructor", timestamp: Date.now() });
      try {
        return new OrigNotif(title, options);
      } catch (e) {
        return { title, options, close: () => {} };
      }
    };
    if (OrigNotif) {
      Object.assign(window.Notification, OrigNotif);
    }
    window.Notification.permission = "granted";
    window.Notification.requestPermission = async () => "granted";

    if (window.ServiceWorkerRegistration && window.ServiceWorkerRegistration.prototype) {
      const origProtoShow = window.ServiceWorkerRegistration.prototype.showNotification;
      window.ServiceWorkerRegistration.prototype.showNotification = function(title, options) {
        window.__dispatchedNotifications.push({ title, options, type: "serviceWorkerPrototype", timestamp: Date.now() });
        try {
          return origProtoShow.call(this, title, options);
        } catch (e) {
          return Promise.resolve();
        }
      };
    }

    if (navigator.serviceWorker && navigator.serviceWorker.ready) {
      navigator.serviceWorker.ready.then(reg => {
        const origShow = reg.showNotification.bind(reg);
        reg.showNotification = function(title, options) {
          window.__dispatchedNotifications.push({ title, options, type: "serviceWorker", timestamp: Date.now() });
          return origShow(title, options);
        };
      }).catch(() => {});
    }
  });

  // Step 1: Open login page and sign in
  console.log('Step 1: Opening http://localhost:5173/#/auth/login');
  await page.goto('http://localhost:5173/#/auth/login', { waitUntil: 'networkidle0' });

  await page.waitForSelector('#liEmail', { timeout: 5000 }).catch(() => {});
  const emailInput = await page.$('#liEmail');
  if (emailInput) {
    console.log('Logging in with admin@example.com / admin123...');
    await page.type('#liEmail', 'admin@example.com');
    await page.type('#liPass', 'admin123');
    await page.click('#liBtn');
    await page.waitForSelector('.shell-nav, .nav, .sidebar, #topBar, .main', { timeout: 10000 });
    console.log('Successfully authenticated and entered app workspace.');
  }

  // Ensure initial poll completed
  await page.evaluate(async () => {
    const syncMod = await import('/src/services/sync.js');
    await syncMod.notifPollOnce();
  });
  await new Promise(r => setTimeout(r, 500));

  // Step 3: Navigate to http://localhost:5173/#/settings
  console.log('\nStep 3: Navigating to http://localhost:5173/#/settings...');
  await page.evaluate(() => { window.location.hash = '#/settings'; });
  await page.waitForSelector('#pushStatus', { timeout: 10000 });

  let pushBadge = await page.evaluate(() => {
    const card = document.querySelector('#pushStatus')?.closest('.card');
    const badge = card?.querySelector('.badge');
    return badge ? badge.textContent.trim() : null;
  });
  console.log('Current Push Notification Badge in Settings:', pushBadge);

  if (pushBadge === 'On' || (await page.$('#pushOffBtn'))) {
    console.log('Badge is "On". Clicking "#pushOffBtn" to turn it "Off"...');
    await page.click('#pushOffBtn');
    await new Promise(r => setTimeout(r, 1000));
  }

  pushBadge = await page.evaluate(() => {
    const card = document.querySelector('#pushStatus')?.closest('.card');
    const badge = card?.querySelector('.badge');
    return badge ? badge.textContent.trim() : null;
  });
  const hasPushOnBtn = (await page.$('#pushOnBtn')) !== null;
  console.log(`Verified badge after turn off: "${pushBadge}"`);
  console.log(`Verified #pushOnBtn is displayed: ${hasPushOnBtn}`);

  if (pushBadge !== 'Off' || !hasPushOnBtn) {
    throw new Error('Failed to turn push notifications Off!');
  }

  // Step 4: Clear window.__dispatchedNotifications = []
  console.log('\nStep 4: Clearing window.__dispatchedNotifications...');
  await page.evaluate(() => {
    window.__dispatchedNotifications = [];
  });

  // Step 5: In database, set notification 1 to not_is_read = 0
  console.log('\nStep 5: Updating database (first notification) not_is_read = 0...');
  const reset1 = setDbNotificationUnread(0);
  console.log('Database Result:', reset1);

  // Step 6: Trigger notifPollOnce
  console.log('\nStep 6: Triggering notifPollOnce()...');
  await page.evaluate(async () => {
    const syncMod = await import('/src/services/sync.js');
    await syncMod.notifPollOnce();
  });
  await new Promise(r => setTimeout(r, 1500));

  // Step 7: Verify:
  // - window.__dispatchedNotifications.length === 0 (CONFIRMED: NO desktop/windows notification popups when Off).
  // - In UI, the item still shows in the notification listing as unread.
  const notifsWhenOff = await page.evaluate(() => window.__dispatchedNotifications);
  console.log('\nStep 7 Verification:');
  console.log(`window.__dispatchedNotifications.length: ${notifsWhenOff.length}`);
  if (notifsWhenOff.length === 0) {
    console.log('>> CONFIRMED: NO desktop/windows notification popups fired when notifications are Off.');
  } else {
    throw new Error(`FAILURE: Desktop notifications fired when Off! Count: ${notifsWhenOff.length}`);
  }

  console.log('Navigating to http://localhost:5173/#/notifications to check UI listing...');
  await page.evaluate(() => { window.location.hash = '#/notifications'; });
  await page.waitForSelector('.notif', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 500));

  const uiListingState = await page.evaluate(() => {
    const unreadElements = Array.from(document.querySelectorAll('.notif.unread'));
    const unreadBadgeText = document.querySelector('.page-head .info b')?.textContent?.trim() || '';
    return {
      unreadBadgeText,
      unreadCount: unreadElements.length,
      unreadIds: unreadElements.map(el => el.getAttribute('data-notif'))
    };
  });
  console.log('Notifications UI Verification:');
  console.log(`- Page header unread indicator: "${uiListingState.unreadBadgeText}"`);
  console.log(`- Total unread cards rendered: ${uiListingState.unreadCount}`);
  console.log(`- Unread item IDs: ${uiListingState.unreadIds.join(', ')}`);
  if (uiListingState.unreadCount >= 1 && uiListingState.unreadIds.includes('1')) {
    console.log('>> CONFIRMED: Item shows in UI notification listing as unread.');
  } else {
    throw new Error('FAILURE: Unread item not displayed in UI!');
  }

  // Step 8: Now click "#pushOnBtn" in Settings to turn it back "On".
  console.log('\nStep 8: Navigating back to http://localhost:5173/#/settings to turn notifications back On...');
  await page.evaluate(() => { window.location.hash = '#/settings'; });
  await page.waitForSelector('#pushOnBtn', { timeout: 10000 });

  console.log('Clicking "#pushOnBtn"...');
  await page.click('#pushOnBtn');
  await new Promise(r => setTimeout(r, 1500));

  const pushBadgeOn = await page.evaluate(() => {
    const card = document.querySelector('#pushStatus')?.closest('.card');
    const badge = card?.querySelector('.badge');
    return badge ? badge.textContent.trim() : null;
  });
  const hasPushOffBtn = (await page.$('#pushOffBtn')) !== null;
  console.log(`Verified badge after turn on: "${pushBadgeOn}"`);
  console.log(`Verified #pushOffBtn is displayed: ${hasPushOffBtn}`);

  if (pushBadgeOn !== 'On' || !hasPushOffBtn) {
    throw new Error('Failed to turn push notifications On!');
  }

  // Clear spy before polling for next notification
  await page.evaluate(() => {
    window.__dispatchedNotifications = [];
  });

  // Step 9: Set another notification not_is_read = 0 (skip 1)
  console.log('\nStep 9: Setting another notification (skip 1) not_is_read = 0 in database...');
  const reset2 = setDbNotificationUnread(1);
  console.log('Database Result:', reset2);

  // Step 10: Trigger poll
  console.log('\nStep 10: Triggering notifPollOnce() with push active...');
  await page.evaluate(async () => {
    const syncMod = await import('/src/services/sync.js');
    await syncMod.notifPollOnce();
  });
  await new Promise(r => setTimeout(r, 2000));

  // Step 11: Verify window.__dispatchedNotifications.length > 0 (CONFIRMED: Desktop notification popups fire when On)
  const notifsWhenOn = await page.evaluate(() => window.__dispatchedNotifications);
  console.log('\nStep 11 Verification:');
  console.log(`window.__dispatchedNotifications.length: ${notifsWhenOn.length}`);
  if (notifsWhenOn.length > 0) {
    console.log('Dispatched Notification Details:');
    notifsWhenOn.forEach((n, i) => {
      console.log(`  [${i + 1}] Type: ${n.type}, Title: "${n.title}", Body: "${n.options?.body || ''}"`);
    });
    console.log('>> CONFIRMED: Desktop notification popups fire when On.');
  } else {
    throw new Error('FAILURE: Expected desktop notifications to fire when On, but none were dispatched!');
  }

  await browser.close();
  console.log('\n=== ALL VERIFICATION TESTS COMPLETED AND CONFIRMED ===');
}

run().catch(err => {
  console.error('\nVerification Error:', err);
  process.exit(1);
});

import axios from 'axios';

const BASE_URL = 'http://localhost:8000/api';

async function run() {
  console.log('--- 1. Login as Super Admin ---');
  const loginRes = await axios.post(`${BASE_URL}/login`, {
    usr_email: 'admin@example.com',
    usr_password: 'admin123',
  });
  const token = loginRes.data.access_token;
  const adminId = loginRes.data.user.usr_id;
  console.log('Admin logged in:', loginRes.data.user.usr_name, 'ID:', adminId);

  console.log('\n--- 2. Mark All Existing Notifications as Read ---');
  const markAllRes = await axios.post(
    `${BASE_URL}/notifications/mark-all-read`,
    {},
    { headers: { Authorization: `Bearer ${token}` } }
  );
  console.log('markAllAsRead response:', markAllRes.data);

  console.log('\n--- 3. Fetch Notifications to verify unread_count is 0 ---');
  const checkRes = await axios.get(`${BASE_URL}/notifications`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log('Unread count after mark all:', checkRes.data.unread_count);
  if (checkRes.data.unread_count !== 0) {
    throw new Error(`Expected unread_count 0, got ${checkRes.data.unread_count}`);
  }
  console.log('=> SUCCESS: unread_count is 0!');

  console.log('\n--- 4. Verify Single Notification Click Read Flow ---');
  // If there are notifications, unread one or test mark read on first notification
  const firstNotif = checkRes.data.notifications[0];
  if (firstNotif) {
    const clickRes = await axios.put(
      `${BASE_URL}/notification/${firstNotif.not_id}/read`,
      {},
      { headers: { Authorization: `Bearer ${token}` } }
    );
    console.log('Click response for notif #' + firstNotif.not_id + ':', clickRes.data);
    if (clickRes.data.status !== 'success') {
      throw new Error('Failed to process click event');
    }
    console.log('=> SUCCESS: Single notification read endpoint verified!');
  }

  console.log('\n🎉 ALL NOTIFICATIONS READ FLOW API CHECKS PASSED! 🎉');
}

run().catch((err) => {
  console.error('Test failed:', err.response?.data || err.message);
  process.exit(1);
});

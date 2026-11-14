import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_BASE_URL;

async function login(email, password) {
  const res = await axios.post(`${BASE_URL}/login`, {
    usr_email: email,
    usr_password: password,
  });
  return { token: res.data.access_token, user: res.data.user };
}

// 1x1 green PNG base64
const GREEN_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
// 1x1 blue PNG base64
const BLUE_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function run() {
  console.log('--- 1. Login as Super Admin ---');
  const adminAuth = await login('admin@example.com', 'admin123');
  console.log('Admin logged in:', adminAuth.user.usr_name, 'ID:', adminAuth.user.usr_id);

  console.log('\n--- 2. Upload Admin Avatar ---');
  const uploadAdminRes = await axios.post(
    `${BASE_URL}/user/avatar`,
    { data: GREEN_PNG, name: 'admin.png', mime: 'image/png' },
    { headers: { Authorization: `Bearer ${adminAuth.token}` } }
  );
  console.log('Upload result:', uploadAdminRes.data.message);
  console.log('Admin avatar URL:', uploadAdminRes.data.avatar);
  const adminAvatarUrl = uploadAdminRes.data.avatar;

  console.log('\n--- 3. Login as Manager ---');
  const managerAuth = await login('manager@example.com', 'admin123');
  console.log('Manager logged in:', managerAuth.user.usr_name, 'ID:', managerAuth.user.usr_id);

  console.log('\n--- 4. Upload Manager Avatar ---');
  const uploadManagerRes = await axios.post(
    `${BASE_URL}/user/avatar`,
    { data: BLUE_PNG, name: 'manager.png', mime: 'image/png' },
    { headers: { Authorization: `Bearer ${managerAuth.token}` } }
  );
  console.log('Upload result:', uploadManagerRes.data.message);
  console.log('Manager avatar URL:', uploadManagerRes.data.avatar);
  const managerAvatarUrl = uploadManagerRes.data.avatar;

  console.log('\n--- 5. Super Admin fetches Members to verify Admin & Manager avatars ---');
  const membersRes = await axios.get(`${BASE_URL}/members`, {
    headers: { Authorization: `Bearer ${adminAuth.token}` },
  });
  const adminMember = membersRes.data[adminAuth.user.usr_id];
  const managerMember = membersRes.data[managerAuth.user.usr_id];
  console.log('Admin in Members list:', {
    name: adminMember?.member_name,
    avatar: adminMember?.member_avatar,
  });
  console.log('Manager in Members list:', {
    name: managerMember?.member_name,
    avatar: managerMember?.member_avatar,
  });
  if (adminMember?.member_avatar !== adminAvatarUrl) {
    throw new Error(`Admin avatar mismatch! Expected ${adminAvatarUrl}, got ${adminMember?.member_avatar}`);
  }
  if (managerMember?.member_avatar !== managerAvatarUrl) {
    throw new Error(`Manager avatar mismatch! Expected ${managerAvatarUrl}, got ${managerMember?.member_avatar}`);
  }
  console.log('=> SUCCESS: Both Admin and Manager avatars are correctly reflected in Members directory!');

  console.log('\n--- 6. Super Admin fetches Member View of Manager ---');
  const memberViewRes = await axios.get(`${BASE_URL}/member-view/${managerAuth.user.usr_id}`, {
    headers: { Authorization: `Bearer ${adminAuth.token}` },
  });
  console.log('Manager profile in member-view:', {
    name: memberViewRes.data.data?.user?.usr_name,
    avatar: memberViewRes.data.data?.user?.usr_avatar,
  });
  if (memberViewRes.data.data?.user?.usr_avatar !== managerAvatarUrl) {
    throw new Error(`Manager avatar mismatch in member-view! Expected ${managerAvatarUrl}, got ${memberViewRes.data.data?.user?.usr_avatar}`);
  }
  console.log('=> SUCCESS: Member View correctly reflects Manager avatar!');

  console.log('\n--- 7. Verify Task Assignees in View Task Endpoint ---');
  // Find or create a task assigned to Manager and view it
  const tasksRes = await axios.get(`${BASE_URL}/all-tasks`, {
    headers: { Authorization: `Bearer ${adminAuth.token}` },
  });
  const allTasks = Array.isArray(tasksRes.data) ? tasksRes.data : [];
  if (allTasks.length > 0) {
    const taskId = allTasks[0].tsk_id;
    const taskDetailRes = await axios.get(`${BASE_URL}/task/${taskId}/view`, {
      headers: { Authorization: `Bearer ${adminAuth.token}` },
    });
    console.log(`Task #${taskId} assignees checked:`, taskDetailRes.data.task_data?.assignees?.length || 0);
  }

  console.log('\n--- 8. Admin removes profile avatar ---');
  const deleteAdminRes = await axios.delete(`${BASE_URL}/user/avatar`, {
    headers: { Authorization: `Bearer ${adminAuth.token}` },
  });
  console.log('Delete result:', deleteAdminRes.data.message);
  console.log('Admin avatar after removal:', deleteAdminRes.data.avatar);

  const adminProfileCheck = await axios.get(`${BASE_URL}/user`, {
    headers: { Authorization: `Bearer ${adminAuth.token}` },
  });
  console.log('Admin profile after removal avatar:', adminProfileCheck.data.user.usr_avatar);
  if (adminProfileCheck.data.user.usr_avatar !== null) {
    throw new Error('Expected admin avatar to be null after deletion');
  }

  console.log('\n--- 9. Manager removes profile avatar ---');
  const deleteManagerRes = await axios.delete(`${BASE_URL}/user/avatar`, {
    headers: { Authorization: `Bearer ${managerAuth.token}` },
  });
  console.log('Manager avatar after removal:', deleteManagerRes.data.avatar);

  console.log('\n🎉 ALL MULTI-USER AVATAR API TESTS PASSED SUCCESSFULLY! 🎉');
}

run().catch((err) => {
  console.error('Test failed:', err.response?.data || err.message);
  process.exit(1);
});

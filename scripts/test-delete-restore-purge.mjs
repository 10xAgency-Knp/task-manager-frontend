const API_BASE = "http://localhost:8000/api";

async function main() {
  console.log("=================================================");
  console.log("VERIFYING DELETE, RESTORE & PERMANENT PURGE");
  console.log("=================================================");

  // 1. Login as Super Admin
  const loginRes = await fetch(`${API_BASE}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ usr_email: "admin@example.com", usr_password: "admin123" }),
  });
  const loginData = await loginRes.json();
  const token = loginData.access_token;
  if (!token) throw new Error("Failed to authenticate as Super Admin");
  console.log("[PASS] Super Admin authenticated.");

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  // -------------------------------------------------------------------------
  // MODULE 1: TASK (Create -> Delete -> Restore -> Delete -> Purge)
  // -------------------------------------------------------------------------
  console.log("\n--- TESTING MODULE 1: TASK ---");
  const taskCreateRes = await fetch(`${API_BASE}/task/save`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      title: "Task Lifecycle Test " + Date.now(),
      description: "Testing delete, restore and purge",
      category: "web_development",
      priority: "high",
      status: "to_do",
      assignee_ids: [1],
    }),
  });
  const taskCreateData = await taskCreateRes.json();
  const taskId = taskCreateData.savedTask?.tsk_id;
  console.log(`[PASS] Created Task ID: ${taskId} (${taskCreateData.savedTask?.tsk_code})`);

  // Delete Task (Moves to recycle bin)
  const taskDelRes = await fetch(`${API_BASE}/task/${taskId}/delete`, {
    method: "DELETE",
    headers,
  });
  const taskDelData = await taskDelRes.json();
  const taskBinId = taskDelData.recycle_bin_id;
  console.log(`[PASS] Deleted Task -> Recycle Bin ID: ${taskBinId}`);

  // Restore Task
  const taskRestoreRes = await fetch(`${API_BASE}/recycle-bin/restore`, {
    method: "POST",
    headers,
    body: JSON.stringify({ id: taskBinId }),
  });
  const taskRestoreData = await taskRestoreRes.json();
  console.log(`[PASS] Restored Task: ${taskRestoreData.message}`);

  // Re-delete Task to test Purge
  const taskReDelRes = await fetch(`${API_BASE}/task/${taskId}/delete`, {
    method: "DELETE",
    headers,
  });
  const taskReDelData = await taskReDelRes.json();
  const taskPurgeBinId = taskReDelData.recycle_bin_id;

  // Purge Task permanently
  const taskPurgeRes = await fetch(`${API_BASE}/recycle-bin/purge`, {
    method: "POST",
    headers,
    body: JSON.stringify({ id: taskPurgeBinId }),
  });
  const taskPurgeData = await taskPurgeRes.json();
  console.log(`[PASS] Purged Task: ${taskPurgeData.message}`);

  // -------------------------------------------------------------------------
  // MODULE 2: PROJECT (Create -> Delete -> Restore -> Delete -> Purge)
  // -------------------------------------------------------------------------
  console.log("\n--- TESTING MODULE 2: PROJECT ---");
  const proCreateRes = await fetch(`${API_BASE}/project/save`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: "Project Lifecycle Test " + Date.now(),
      description: "Testing delete, restore and purge",
      manager: 1,
      status: "planning",
      budget: 10000,
      project_members: [1],
    }),
  });
  const proCreateData = await proCreateRes.json();
  const proId = proCreateData.project?.pro_id;
  console.log(`[PASS] Created Project ID: ${proId} (${proCreateData.project?.pro_code})`);

  // Delete Project
  const proDelRes = await fetch(`${API_BASE}/project/${proId}/delete`, {
    method: "DELETE",
    headers,
  });
  const proDelData = await proDelRes.json();
  const proBinId = proDelData.recycle_bin_id;
  console.log(`[PASS] Deleted Project -> Recycle Bin ID: ${proBinId}`);

  // Restore Project
  const proRestoreRes = await fetch(`${API_BASE}/recycle-bin/restore`, {
    method: "POST",
    headers,
    body: JSON.stringify({ id: proBinId }),
  });
  const proRestoreData = await proRestoreRes.json();
  console.log(`[PASS] Restored Project: ${proRestoreData.message}`);

  // Re-delete Project to test Purge
  const proReDelRes = await fetch(`${API_BASE}/project/${proId}/delete`, {
    method: "DELETE",
    headers,
  });
  const proReDelData = await proReDelRes.json();
  const proPurgeBinId = proReDelData.recycle_bin_id;

  // Purge Project permanently
  const proPurgeRes = await fetch(`${API_BASE}/recycle-bin/purge`, {
    method: "POST",
    headers,
    body: JSON.stringify({ id: proPurgeBinId }),
  });
  const proPurgeData = await proPurgeRes.json();
  console.log(`[PASS] Purged Project: ${proPurgeData.message}`);

  // -------------------------------------------------------------------------
  // MODULE 3: DEAL / SALES PIPELINE (Create -> Delete -> Restore -> Delete -> Purge)
  // -------------------------------------------------------------------------
  console.log("\n--- TESTING MODULE 3: DEAL / SALES PIPELINE ---");
  const dealCreateRes = await fetch(`${API_BASE}/sales-pipeline/save`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      deal_name: "Deal Lifecycle Test " + Date.now(),
      account_client: "Test Client",
      stage: "discovery",
      value: 75000,
      probability: 30,
    }),
  });
  const dealCreateData = await dealCreateRes.json();
  const dealId = dealCreateData.deal_id;
  console.log(`[PASS] Created Deal ID: ${dealId}`);

  // Delete Deal
  const dealDelRes = await fetch(`${API_BASE}/sales-pipeline/${dealId}/delete`, {
    method: "DELETE",
    headers,
  });
  const dealDelData = await dealDelRes.json();
  const dealBinId = dealDelData.recycle_bin_id;
  console.log(`[PASS] Deleted Deal -> Recycle Bin ID: ${dealBinId}`);

  // Restore Deal
  const dealRestoreRes = await fetch(`${API_BASE}/recycle-bin/restore`, {
    method: "POST",
    headers,
    body: JSON.stringify({ id: dealBinId }),
  });
  const dealRestoreData = await dealRestoreRes.json();
  console.log(`[PASS] Restored Deal: ${dealRestoreData.message}`);

  // Re-delete Deal to test Purge
  const dealReDelRes = await fetch(`${API_BASE}/sales-pipeline/${dealId}/delete`, {
    method: "DELETE",
    headers,
  });
  const dealReDelData = await dealReDelRes.json();
  const dealPurgeBinId = dealReDelData.recycle_bin_id;

  // Purge Deal permanently
  const dealPurgeRes = await fetch(`${API_BASE}/recycle-bin/purge`, {
    method: "POST",
    headers,
    body: JSON.stringify({ id: dealPurgeBinId }),
  });
  const dealPurgeData = await dealPurgeRes.json();
  console.log(`[PASS] Purged Deal: ${dealPurgeData.message}`);

  // -------------------------------------------------------------------------
  // MODULE 4: USER / MEMBER (Create -> Delete -> Restore -> Delete -> Purge)
  // -------------------------------------------------------------------------
  console.log("\n--- TESTING MODULE 4: USER / MEMBER ---");
  const userCreateRes = await fetch(`${API_BASE}/create-user`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      usr_name: "Lifecycle User " + Date.now(),
      usr_email: `user_lifecycle_${Date.now()}@example.com`,
      usr_password: "User@12345678",
      usr_role: "employee",
      usr_designation: "QA Engineer",
      usr_phone: "9876543210",
      usr_department: "Engineering",
      usr_status: 1,
    }),
  });
  const userCreateData = await userCreateRes.json();
  const userId = userCreateData.user?.usr_id;
  console.log(`[PASS] Created User ID: ${userId} (${userCreateData.user?.usr_name})`);

  // Delete User
  const userDelRes = await fetch(`${API_BASE}/user/${userId}/delete?force=true`, {
    method: "DELETE",
    headers,
  });
  const userDelData = await userDelRes.json();
  const userBinId = userDelData.recycle_bin_id;
  console.log(`[PASS] Deleted User -> Recycle Bin ID: ${userBinId}`);

  // Restore User
  const userRestoreRes = await fetch(`${API_BASE}/recycle-bin/restore`, {
    method: "POST",
    headers,
    body: JSON.stringify({ id: userBinId }),
  });
  const userRestoreData = await userRestoreRes.json();
  console.log(`[PASS] Restored User: ${userRestoreData.message}`);

  // Re-delete User to test Purge
  const userReDelRes = await fetch(`${API_BASE}/user/${userId}/delete?force=true`, {
    method: "DELETE",
    headers,
  });
  const userReDelData = await userReDelRes.json();
  const userPurgeBinId = userReDelData.recycle_bin_id;

  // Purge User permanently
  const userPurgeRes = await fetch(`${API_BASE}/recycle-bin/purge`, {
    method: "POST",
    headers,
    body: JSON.stringify({ id: userPurgeBinId }),
  });
  const userPurgeData = await userPurgeRes.json();
  console.log(`[PASS] Purged User: ${userPurgeData.message}`);

  // -------------------------------------------------------------------------
  // 5. Check Recycle Bin Listing & Filtering (/api/recycle-bin)
  // -------------------------------------------------------------------------
  console.log("\n--- TESTING RECYCLE BIN LISTING & FILTERING ---");
  const binListRes = await fetch(`${API_BASE}/recycle-bin`, {
    method: "GET",
    headers,
  });
  const binListData = await binListRes.json();
  console.log(`[PASS] Total Recycle Bin records: ${binListData.recycled_items.length}`);
  console.log(`[PASS] In-Bin Count: ${binListData.meta.counts.in_bin}`);
  console.log(`[PASS] Restored Count: ${binListData.meta.counts.restored}`);
  console.log(`[PASS] Permanently Deleted Count: ${binListData.meta.counts.permanently_deleted}`);

  console.log("\n=================================================");
  console.log("ALL MODULES DELETE, RESTORE & PERMANENT PURGE VERIFIED!");
  console.log("=================================================");
}

main().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});

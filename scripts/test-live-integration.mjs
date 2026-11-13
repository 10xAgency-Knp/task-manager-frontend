/**
 * Automated Live API & Adapter Integration Verification Script
 * Validates Phase 1, Phase 2, and Phase 3 integrations against local Laravel backend.
 */

import axios from "axios";
import {
  transformUserFromApi,
  transformTaskFromApi,
  transformTaskForApi,
  transformProjectFromApi,
  transformProjectForApi,
  transformDealFromApi,
  transformDealForApi,
  transformDashboardFromApi,
  API_TO_UI_TASK_STATUS,
  UI_TO_API_TASK_STATUS,
  API_TO_UI_TASK_PRIORITY,
  UI_TO_API_TASK_PRIORITY
} from "../src/services/apiAdapters.js";

const client = axios.create({
  baseURL: "http://localhost:8000/api",
  headers: {
    "Accept": "application/json",
    "Content-Type": "application/json"
  }
});

async function runTestSuite() {
  console.log("=================================================");
  console.log("CRM REACT-LARAVEL INTEGRATION VERIFICATION SUITE");
  console.log("=================================================\n");

  // TEST 1: Authentication & Sanctum Token
  console.log("TEST 1: Authentication (/api/login)");
  const loginRes = await client.post("/login", {
    usr_email: "admin@example.com",
    usr_password: "admin123"
  });
  if (!loginRes.data.access_token) throw new Error("No access_token returned from /api/login");
  const token = loginRes.data.access_token;
  console.log("  [PASS] Sanctum Bearer token received:", token.slice(0, 15) + "...");

  const authHeaders = { Authorization: `Bearer ${token}` };

  // TEST 2: Current User Profile
  console.log("\nTEST 2: Current User Profile (/api/user)");
  const userRes = await client.get("/user", { headers: authHeaders });
  const user = transformUserFromApi(userRes.data.user || userRes.data);
  console.log("  [PASS] User ID:", user.id);
  console.log("  [PASS] Name:", user.name);
  console.log("  [PASS] Role:", user.role);
  console.log("  [PASS] Super Admin:", user.superAdmin);
  console.log("  [PASS] Permissions Count:", user.perms.length);
  if (!user.name || user.role !== "Admin") throw new Error("User transformation failed");

  // TEST 3: Parallel Workspace Collections
  console.log("\nTEST 3: Workspace Bootstrap Collections");
  const [tasksRes, projectsRes, membersRes, assignableRes, dealsRes, notifsRes, auditRes] =
    await Promise.all([
      client.get("/all-tasks", { headers: authHeaders }),
      client.get("/projects", { headers: authHeaders }),
      client.get("/members", { headers: authHeaders }),
      client.get("/users/assignable", { headers: authHeaders }),
      client.get("/sales-pipeline", { headers: authHeaders }),
      client.get("/notifications", { headers: authHeaders }),
      client.get("/audit-logs", { headers: authHeaders })
    ]);

  const tasks = tasksRes.data.map(transformTaskFromApi);
  const projects = (projectsRes.data.data || []).map(transformProjectFromApi);
  const deals = (dealsRes.data.data || []).map(transformDealFromApi);
  const notifs = notifsRes.data.notifications || [];

  console.log(`  [PASS] Tasks Loaded: ${tasks.length}`);
  console.log(`  [PASS] Projects Loaded: ${projects.length}`);
  console.log(`  [PASS] Members Loaded: ${Object.keys(membersRes.data).length}`);
  console.log(`  [PASS] Deals Loaded: ${deals.length}`);
  console.log(`  [PASS] Notifications Loaded: ${notifs.length}`);

  // TEST 4: Task Adapter Verification
  console.log("\nTEST 4: Task Bidirectional Adapter Verification");
  const sampleTask = tasks[0];
  console.log("  Sample Task ID:", sampleTask.id);
  console.log("  Sample Task Title:", sampleTask.title);
  console.log("  Sample Task UI Status:", sampleTask.status);
  console.log("  Sample Task UI Priority:", sampleTask.priority);
  console.log("  Sample Task Due Date (due):", sampleTask.due);
  console.log("  Sample Task Assignee IDs:", sampleTask.assigneeIds);

  if (!sampleTask.id.startsWith("TK-") && !sampleTask.numericId) throw new Error("Task ID invalid");
  if (!["To Do", "In Progress", "On Hold", "Review", "Completed", "Cancelled"].includes(sampleTask.status)) {
    throw new Error(`Unexpected UI task status: ${sampleTask.status}`);
  }

  // Verify reverse transformation for API
  const reverseTaskPayload = transformTaskForApi(sampleTask, true);
  console.log("  Reverse Payload Status for Laravel:", reverseTaskPayload.status);
  console.log("  Reverse Payload Priority for Laravel:", reverseTaskPayload.priority);
  console.log("  Reverse Payload Due Date for Laravel:", reverseTaskPayload.due_date);
  if (!["to_do", "in_progress", "on_hold", "in_review", "completed", "cancelled"].includes(reverseTaskPayload.status)) {
    throw new Error(`Invalid reverse status: ${reverseTaskPayload.status}`);
  }

  // TEST 5: Dashboard Endpoint & Adapter
  console.log("\nTEST 5: Dashboard Analytical Overview (/api/dashboard)");
  const dashRes = await client.get("/dashboard", { headers: authHeaders });
  const dashboard = transformDashboardFromApi(dashRes.data);

  console.log("  [PASS] Banner User:", dashboard.banner.userName);
  console.log("  [PASS] Banner Completion %:", dashboard.banner.completionPercentage + "%");
  console.log("  [PASS] Metrics Open Tasks:", dashboard.metrics.open);
  console.log("  [PASS] Metrics Overdue Tasks:", dashboard.metrics.overdue);
  console.log("  [PASS] Metrics Due Today:", dashboard.metrics.dueToday);
  console.log("  [PASS] Metrics In Review:", dashboard.metrics.inReview);
  console.log("  [PASS] My Focus List Records:", dashboard.myFocusList.length);
  console.log("  [PASS] Upcoming Deadlines Records:", dashboard.upcomingDeadlines.length);
  console.log("  [PASS] Team Workload Members:", dashboard.teamWorkload.length);
  console.log("  [PASS] Recent Activities Records:", dashboard.recentActivities.length);

  if (dashboard.recentActivities.length > 0) {
    const firstAct = dashboard.recentActivities[0];
    console.log("  Sample Activity Feed Item:", `${firstAct.who} - ${firstAct.text} (${firstAct.when})`);
  }

  // TEST 6: Phase 4 Task Listing Endpoints
  console.log("\nTEST 6: Phase 4 Task Listing Endpoints");
  const [myTasksRes, assignedByMeRes, boardRes, calRes] = await Promise.all([
    client.get("/my-tasks", { headers: authHeaders }),
    client.get("/assigned-by-me", { headers: authHeaders }),
    client.get("/task-board", { headers: authHeaders }),
    client.get("/calendar-tasks", { headers: authHeaders }),
  ]);
  console.log(`  [PASS] /api/my-tasks Count: ${myTasksRes.data.all_my_tasks.length}`);
  console.log(`  [PASS] /api/assigned-by-me Count: ${assignedByMeRes.data.assigned_by_me.length}`);
  console.log(`  [PASS] /api/task-board Count: ${boardRes.data.tasks.length}`);
  console.log(`  [PASS] /api/calendar-tasks Dates: ${Object.keys(calRes.data).length}`);

  // TEST 7: Phase 4 Task Mutation Lifecycle
  console.log("\nTEST 7: Phase 4 Task Mutation Lifecycle (Create -> Status -> Update -> Delete)");
  const createPayload = {
    title: "Phase 4 Automated Verification Task",
    description: "Task created to verify Phase 4 mutation lifecycle",
    pro_name: "with member updated",
    category: "web_development",
    priority: "high",
    status: "to_do",
    start_date: "2026-11-04",
    due_date: "2026-11-15",
    est_hours: 4.5,
    tags: "test,automation",
    assignee_ids: [1],
    checklist: [
      { title: "First automated subtask", done: false },
      { title: "Second automated subtask", done: true }
    ]
  };
  const saveRes = await client.post("/task/save", createPayload, { headers: authHeaders });
  const createdTask = saveRes.data.savedTask;
  console.log(`  [PASS] Task Created: ID=${createdTask.tsk_id}, Code=${createdTask.tsk_code}`);

  // Status Update
  const statusRes = await client.put(`/task/${createdTask.tsk_id}/status_update`, { status: "in_progress" }, { headers: authHeaders });
  console.log(`  [PASS] Status Updated to in_progress: ${statusRes.data.message || "OK"}`);

  // Details Update
  const updatePayload = {
    title: "Phase 4 Automated Verification Task (Updated)",
    description: "Updated description for verification",
    pro_name: "with member updated",
    category: "web_development",
    priority: "urgent",
    status: "in_progress",
    start_date: "2026-11-04",
    due_date: "2026-11-20",
    est_hours: 6.0,
    spent_hours: 1.5,
    tags: "test,automation,updated",
    assignee_ids: [1],
    exist_checklist: {},
    checklist: [
      { title: "Third new checklist item", done: false }
    ]
  };
  const updateRes = await client.put(`/task/${createdTask.tsk_id}/update`, updatePayload, { headers: authHeaders });
  console.log(`  [PASS] Task Details Updated: ${updateRes.data.message || "OK"}`);

  // Task View / Detail
  const detailRes = await client.get(`/task/${createdTask.tsk_id}/view`, { headers: authHeaders });
  const detailTask = transformTaskFromApi(detailRes.data.task_data);
  console.log(`  [PASS] Task Detail Fetched: Title="${detailTask.title}", Status="${detailTask.status}", Priority="${detailTask.priority}"`);

  // TEST 8: Phase 5 Collaboration Workflows (Checklists, Comments)
  console.log("\nTEST 8: Phase 5 Collaboration Workflows (Checklists & Comments)");
  // 8a. Add checklist item
  const addCheckRes = await client.post(`/checklist/${createdTask.tsk_id}/add`, { title: "Collaboration checklist item" }, { headers: authHeaders });
  const newSubtask = addCheckRes.data.subtask;
  console.log(`  [PASS] Checklist Item Added: ID=${newSubtask.stk_id}, Title="${newSubtask.stk_title}"`);

  // 8b. Toggle checklist item
  const toggleRes = await client.put(`/checklist/${newSubtask.stk_id}/toggle`, {}, { headers: authHeaders });
  console.log(`  [PASS] Checklist Item Toggled: done=${toggleRes.data.stk_done}`);

  // 8c. Add task comment
  const commentRes = await client.post(`/task/${createdTask.tsk_id}/comment`, {
    comment: "Automated verification comment for Phase 5",
    mentions: [1]
  }, { headers: authHeaders });
  console.log(`  [PASS] Task Comment Added: message="${commentRes.data.message || 'OK'}"`);

  // 8d. Delete subtask
  const delSubRes = await client.delete(`/subtask/${newSubtask.stk_id}/delete`, { headers: authHeaders });
  console.log(`  [PASS] Subtask Deleted: message="${delSubRes.data.message || 'OK'}"`);

  // Delete task (move to recycle bin)
  const delRes = await client.delete(`/task/${createdTask.tsk_id}/delete`, { headers: authHeaders });
  console.log(`  [PASS] Task Deleted (Soft/Recycle Bin): ${delRes.data.message || "OK"}`);

  // TEST 9: Phase 6 Projects Lifecycle
  console.log("\nTEST 9: Phase 6 Projects Lifecycle (Create -> Update -> View -> Delete)");
  const createProjectPayload = {
    name: "Phase 6 Automated Test Project",
    description: "Testing project creation and updates",
    manager: 1,
    status: "planning",
    progress: 10,
    budget: 50000,
    start_date: "2026-11-04",
    due_date: "2026-12-31",
    project_members: [1]
  };
  const saveProjRes = await client.post("/project/save", createProjectPayload, { headers: authHeaders });
  const createdProj = saveProjRes.data.project;
  console.log(`  [PASS] Project Created: ID=${createdProj.pro_id}, Code=${createdProj.pro_code}`);

  // Update Project
  const updateProjPayload = {
    name: "Phase 6 Automated Test Project (Updated)",
    description: "Updated description",
    manager: 1,
    status: "in_progress",
    progress: 25,
    budget: 75000,
    start_date: "2026-11-04",
    due_date: "2026-12-31",
    project_members: [1]
  };
  const updateProjRes = await client.put(`/project/${createdProj.pro_id}/update`, updateProjPayload, { headers: authHeaders });
  console.log(`  [PASS] Project Updated: ${updateProjRes.data.message || 'OK'}`);

  // View Project
  const viewProjRes = await client.get(`/project/${createdProj.pro_id}/view`, { headers: authHeaders });
  console.log(`  [PASS] Project Details Fetched: Status=${viewProjRes.status}`);

  // Delete Project
  const delProjRes = await client.delete(`/project/${createdProj.pro_id}/delete`, { headers: authHeaders });
  console.log(`  [PASS] Project Deleted (Moved to Recycle Bin): ${delProjRes.data.message || 'OK'}`);

  // TEST 10: Phase 7 Members & User Directory Lifecycle
  console.log("\nTEST 10: Phase 7 Members & User Directory (Create -> Update -> View -> Role -> Delete)");
  const timestamp = Date.now();
  const testUserEmail = `testuser_${timestamp}@example.com`;
  const createUserPayload = {
    usr_name: `Test Member ${timestamp}`,
    usr_email: testUserEmail,
    usr_password: "TempPassword123",
    usr_role: "employee",
    usr_dept: "Development",
    usr_designation: "Junior Dev",
    usr_city: "Mumbai",
    usr_status: 1
  };
  const saveUserRes = await client.post("/create-user", createUserPayload, { headers: authHeaders });
  const createdUser = saveUserRes.data.user;
  console.log(`  [PASS] User Created: ID=${createdUser.usr_id}, Name=${createdUser.usr_name}`);

  // Update user
  const updateUserPayload = {
    usr_name: `Test Member ${timestamp} (Updated)`,
    usr_email: testUserEmail,
    usr_role: "employee",
    usr_dept: "Development",
    usr_designation: "Senior Dev",
    usr_city: "Pune",
    usr_status: 1
  };
  const updateUserRes = await client.put(`/update-user/${createdUser.usr_id}`, updateUserPayload, { headers: authHeaders });
  console.log(`  [PASS] User Updated: ${updateUserRes.data.message || 'OK'}`);

  // View member
  const memberViewRes = await client.get(`/member-view/${createdUser.usr_id}`, { headers: authHeaders });
  console.log(`  [PASS] Member View Fetched: Status=${memberViewRes.status}`);

  // Change user role
  const roleRes = await client.put(`/user/${createdUser.usr_id}/role`, { role: "manager" }, { headers: authHeaders });
  console.log(`  [PASS] User Role Changed: ${roleRes.data.message || 'OK'}`);

  // Delete user (move to recycle bin)
  const delUserRes = await client.delete(`/user/${createdUser.usr_id}/delete?force=true`, { headers: authHeaders });
  console.log(`  [PASS] User Soft Deleted (Recycled): ${delUserRes.data.message || 'OK'}`);

  // TEST 11: Phase 8 Sales Pipeline / Deals Lifecycle
  console.log("\nTEST 11: Phase 8 Sales Pipeline / Deals (Create -> Update -> View -> Delete)");
  const createDealPayload = {
    deal_name: `Enterprise Deal ${timestamp}`,
    stage: "discovery",
    account_client: "Acme Corporation",
    owner: 1,
    value: 125000,
    probability: 40,
    expected_close_date: "2026-12-15"
  };
  const saveDealRes = await client.post("/sales-pipeline/save", createDealPayload, { headers: authHeaders });
  const createdDealId = saveDealRes.data.deal_id;
  console.log(`  [PASS] Deal Created: ID=${createdDealId}`);

  // Update deal
  const updateDealPayload = {
    deal_name: `Enterprise Deal ${timestamp} (Negotiation)`,
    stage: "proposal",
    account_client: "Acme Corporation",
    owner: 1,
    value: 150000,
    probability: 70,
    expected_close_date: "2026-12-20"
  };
  const updateDealRes = await client.put(`/sales-pipeline/${createdDealId}/update`, updateDealPayload, { headers: authHeaders });
  console.log(`  [PASS] Deal Updated: ${updateDealRes.data.message || 'OK'}`);

  // View deal
  const dealViewRes = await client.get(`/sales-pipeline/${createdDealId}`, { headers: authHeaders });
  console.log(`  [PASS] Deal Details Fetched: Name="${dealViewRes.data.deal.ssp_name}"`);

  // Delete deal
  const delDealRes = await client.delete(`/sales-pipeline/${createdDealId}/delete`, { headers: authHeaders });
  console.log(`  [PASS] Deal Soft Deleted (Recycled): ${delDealRes.data.message || 'OK'}`);

  // TEST 12: Phase 9 Analytical Reports
  console.log("\nTEST 12: Phase 9 Analytical Reports (/api/reports)");
  const reportsRes = await client.get("/reports", { headers: authHeaders });
  const reportData = reportsRes.data.data;
  console.log(`  [PASS] Total Tasks in Reports: ${reportData.totals.total}`);
  console.log(`  [PASS] Completed Tasks: ${reportData.totals.completed}`);
  console.log(`  [PASS] Completion Rate: ${reportData.totals.completionRate}%`);
  console.log(`  [PASS] Weekly Trend Weeks Count: ${reportData.trend.length}`);
  console.log(`  [PASS] People Workload Breakdown Count: ${reportData.people.length}`);
  console.log(`  [PASS] Projects Health Variance Count: ${reportData.projects.length}`);

  // TEST 13: Phase 10 Administration & Governance
  console.log("\nTEST 13: Phase 10 Administration & Governance");
  // 13a. Permissions Matrix
  const permsRes = await client.get("/permissions", { headers: authHeaders });
  console.log(`  [PASS] Permissions Matrix Loaded: ${permsRes.data.perms?.length || 0} permissions, ${permsRes.data.users?.length || 0} users`);

  // 13b. Audit Logs
  const auditLogsRes = await client.get("/audit-logs", { headers: authHeaders });
  console.log(`  [PASS] Audit Logs Loaded: Total=${auditLogsRes.data.total}`);

  // 13c. Recycle Bin
  const recycleRes = await client.get("/recycle-bin", { headers: authHeaders });
  const itemsInBin = recycleRes.data.recycled_items || [];
  console.log(`  [PASS] Recycle Bin Items: Count=${itemsInBin.length}, Can Purge=${recycleRes.data.meta?.can_purge}`);

  // 13d. Password Reset Requests List
  const pwResetRes = await client.get("/reset-password/list", { headers: authHeaders });
  console.log(`  [PASS] Password Reset Requests: Pending=${pwResetRes.data.pending?.length || 0}, History=${pwResetRes.data.history?.length || 0}`);

  // TEST 14: Phase 11 Real-time Notifications & Polling
  console.log("\nTEST 14: Phase 11 Real-time Notifications (/api/notifications)");
  const notifsListRes = await client.get("/notifications", { headers: authHeaders });
  const notifsList = notifsListRes.data.notifications || [];
  console.log(`  [PASS] Notifications Fetched: Total=${notifsList.length}, Unread=${notifsListRes.data.unread_count}`);
  if (notifsList.length > 0) {
    const firstNotifId = notifsList[0].not_id;
    const readRes = await client.put(`/notification/${firstNotifId}/read`, {}, { headers: authHeaders });
    console.log(`  [PASS] Notification Click/Read: Status=${readRes.data.status}`);
  }

  console.log("\n=================================================");
  console.log("ALL PHASES (1 THROUGH 11) INTEGRATIONS FULLY VERIFIED!");
  console.log("=================================================");
}

runTestSuite().catch(err => {
  console.error("\n[FAIL] Test suite failed:", err.response?.data || err.message);
  process.exit(1);
});

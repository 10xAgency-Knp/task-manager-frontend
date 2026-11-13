import axios from "axios";

const API_BASE = "http://localhost:8000/api";

const USERS = [
  {
    role: "Admin (Super Admin)",
    email: "admin@example.com",
    password: "admin123",
    expectedAllow: [
      "/dashboard",
      "/my-tasks",
      "/all-tasks",
      "/projects",
      "/members",
      "/sales-pipeline",
      "/reports",
      "/permissions",
      "/audit-logs",
      "/recycle-bin",
      "/reset-password/list"
    ],
    expectedDeny: []
  },
  {
    role: "Manager",
    email: "manager@example.com",
    password: "manager123",
    expectedAllow: [
      "/dashboard",
      "/my-tasks",
      "/all-tasks",
      "/projects",
      "/members",
      "/sales-pipeline",
      "/reports"
    ],
    expectedDeny: [
      "/permissions",
      "/audit-logs",
      "/recycle-bin",
      "/reset-password/list"
    ]
  },
  {
    role: "Employee",
    email: "employee@example.com",
    password: "employee123",
    expectedAllow: [
      "/dashboard",
      "/my-tasks",
      "/projects",
      "/members"
    ],
    expectedDeny: [
      "/sales-pipeline",
      "/reports",
      "/permissions",
      "/audit-logs",
      "/recycle-bin",
      "/reset-password/list"
    ]
  }
];

async function runTest() {
  console.log("=================================================");
  console.log("TESTING API ENDPOINTS & RBAC PERMISSION GATES");
  console.log("=================================================\n");

  const results = [];

  for (const userConfig of USERS) {
    console.log(`\n--- Testing Role: ${userConfig.role} (${userConfig.email}) ---`);
    let token = null;

    try {
      const loginRes = await axios.post(`${API_BASE}/login`, {
        usr_email: userConfig.email,
        usr_password: userConfig.password
      }, {
        headers: { Accept: "application/json" }
      });
      token = loginRes.data.access_token;
      console.log(`  [PASS] Login successful. Bearer token acquired.`);
    } catch (err) {
      console.error(`  [FAIL] Login failed for ${userConfig.email}:`, err.response?.data || err.message);
      results.push({ role: userConfig.role, status: "FAIL", error: "Login failed" });
      continue;
    }

    const authHeaders = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json"
    };

    // Test Allowed Endpoints
    for (const ep of userConfig.expectedAllow) {
      try {
        const res = await axios.get(`${API_BASE}${ep}`, { headers: authHeaders });
        if (res.status === 200) {
          console.log(`  [PASS] Allowed: GET ${ep} -> 200 OK`);
        } else {
          console.warn(`  [WARN] GET ${ep} returned status ${res.status}`);
        }
      } catch (err) {
        console.error(`  [FAIL] Expected 200 for GET ${ep}, got ${err.response?.status}:`, err.response?.data?.message || err.message);
        results.push({ role: userConfig.role, endpoint: ep, expected: 200, actual: err.response?.status });
      }
    }

    // Test Denied Endpoints
    for (const ep of userConfig.expectedDeny) {
      try {
        const res = await axios.get(`${API_BASE}${ep}`, { headers: authHeaders });
        console.error(`  [FAIL] Security breach! GET ${ep} should be forbidden (403), but returned 200 OK!`);
        results.push({ role: userConfig.role, endpoint: ep, expected: 403, actual: res.status });
      } catch (err) {
        if (err.response?.status === 403) {
          console.log(`  [PASS] Correctly Forbidden: GET ${ep} -> 403 Access Denied`);
        } else {
          console.warn(`  [INFO] GET ${ep} returned ${err.response?.status} (${err.response?.data?.message || err.message})`);
        }
      }
    }
  }

  console.log("\n=================================================");
  console.log("RBAC PERMISSION GATES SUMMARY");
  console.log("=================================================");
  if (results.length === 0) {
    console.log("All permission boundaries and RBAC gates verified successfully with ZERO security violations!");
  } else {
    console.log(`Found ${results.length} issues in permission gates:`, JSON.stringify(results, null, 2));
  }
}

runTest();

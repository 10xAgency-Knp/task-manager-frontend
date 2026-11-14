/**
 * End-to-End Automated Verification: Password Reset & Force Password Change Flow
 * 
 * Verifies the complete lifecycle:
 * 1. Ensure test employee exists with known credentials
 * 2. Unauthenticated user submits Forgot Password request (POST /api/reset_password/through-mail)
 * 3. Super Admin lists pending password reset requests (GET /api/reset-password/list)
 * 4. Super Admin opens request (GET /api/reset-password/reset-request-opened/{prr_id})
 * 5. Super Admin completes request with generated temporary password (POST /api/reset-password/reset-request-success/{prr_id})
 * 6. User logs in with temporary password -> Verifies forcePasswordReset === true
 * 7. User submits forced password change with validation tests (POST /api/reset-password)
 * 8. User profile confirms forcePasswordReset === false (GET /api/user)
 * 9. User logs in with brand new password -> Verifies clean login & old password rejection
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL;

function assert(condition, message) {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    process.exit(1);
  }
  console.log(`[PASS] ${message}`);
}

async function main() {
  console.log("=================================================");
  console.log("TESTING PASSWORD RESET & FORCED CHANGE FLOW");
  console.log("=================================================\n");

  // Step 1: Login as Super Admin to ensure clean test user exists
  console.log("--- STEP 1: AUTHENTICATING ADMIN & PREPARING TEST USER ---");
  const adminLoginRes = await fetch(`${API_BASE}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      usr_email: "admin@example.com",
      usr_password: "admin123",
    }),
  });
  const adminData = await adminLoginRes.json();
  assert(adminLoginRes.status === 200 && adminData.access_token, "Super Admin authenticated.");
  const adminToken = adminData.access_token;
  const adminHeaders = {
    Authorization: `Bearer ${adminToken}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  const testEmail = `pw_reset_user_${Date.now()}@example.com`;
  const initialPassword = "Initial@12345678";
  const newSecretPassword = "BrandNew@Secure9988";

  const createUserRes = await fetch(`${API_BASE}/create-user`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      usr_name: "Reset Flow User " + Date.now(),
      usr_email: testEmail,
      usr_password: initialPassword,
      usr_role: "employee",
      usr_designation: "Frontend Tester",
      usr_phone: "9876543210",
      usr_department: "Engineering",
      usr_status: 1,
    }),
  });
  const createdUserData = await createUserRes.json();
  if (createUserRes.status !== 200) {
    console.error("Create user failed:", createdUserData);
  }
  assert(createUserRes.status === 200, `Created test user: ${testEmail}`);
  const testUserId = createdUserData.user.usr_id;

  // Step 2: Unauthenticated user submits Forgot Password request
  console.log("\n--- STEP 2: FORGOT PASSWORD REQUEST (PUBLIC ENDPOINT) ---");
  const forgotRes = await fetch(`${API_BASE}/reset_password/through-mail`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ requested_mail: testEmail }),
  });
  const forgotData = await forgotRes.json();
  assert(forgotRes.status === 201, `Forgot password request succeeded: ${forgotData.message}`);
  const requestId = forgotData.reset_request?.prr_id;
  assert(requestId, `Captured Reset Request ID: ${requestId} (${forgotData.reset_request?.prr_code})`);

  // Step 3: Admin lists pending reset requests
  console.log("\n--- STEP 3: ADMIN LISTS PENDING RESET REQUESTS ---");
  const listRes = await fetch(`${API_BASE}/reset-password/list`, {
    headers: adminHeaders,
  });
  const listData = await listRes.json();
  assert(listRes.status === 200, "Admin retrieved reset requests list.");
  const pendingRequests = listData.pending || [];
  const matchedRequest = pendingRequests.find((r) => r.prr_usr_email === testEmail || r.prr_id === requestId);
  assert(matchedRequest, `Pending request found in queue for ${testEmail}`);

  // Step 4: Admin opens reset request
  console.log("\n--- STEP 4: ADMIN OPENS RESET REQUEST ---");
  const openRes = await fetch(`${API_BASE}/reset-password/reset-request-opened/${requestId}`, {
    headers: adminHeaders,
  });
  const openData = await openRes.json();
  assert(openRes.status === 200 && openData.status, `Admin opened request: ${requestId}`);

  // Step 5: Admin completes reset with generated temporary password
  console.log("\n--- STEP 5: ADMIN COMPLETES RESET WITH TEMPORARY PASSWORD ---");
  const completeRes = await fetch(`${API_BASE}/reset-password/reset-request-success/${requestId}`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      is_system_generated: true,
      is_manually_generated: false,
    }),
  });
  const completeData = await completeRes.json();
  assert(completeRes.status === 200 && completeData.status, "Reset completed successfully.");
  const tempPassword = completeData.password_reset_data?.temporary_password;
  assert(tempPassword && tempPassword.length >= 8, `Temporary password generated: ${tempPassword}`);

  // Step 6: User logs in with temporary password -> MUST enforce forcePasswordReset
  console.log("\n--- STEP 6: USER LOGS IN WITH TEMPORARY PASSWORD ---");
  const tempLoginRes = await fetch(`${API_BASE}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      usr_email: testEmail,
      usr_password: tempPassword,
    }),
  });
  const tempLoginData = await tempLoginRes.json();
  assert(tempLoginRes.status === 200, "User logged in with temporary password.");
  assert(tempLoginData.forcePasswordReset === true, "Login response enforces forcePasswordReset === true.");
  const userToken = tempLoginData.access_token;
  const userHeaders = {
    Authorization: `Bearer ${userToken}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  // Step 7: Forced Password Change with Validations
  console.log("\n--- STEP 7: FORCED PASSWORD CHANGE SUBMISSION ---");
  // Test mismatch failure
  const mismatchRes = await fetch(`${API_BASE}/reset-password`, {
    method: "POST",
    headers: userHeaders,
    body: JSON.stringify({
      usr_password: tempPassword,
      new_password: newSecretPassword,
      new_password_confirmation: "DifferentPassword@123",
    }),
  });
  assert(mismatchRes.status === 422, "Mismatched passwords rejected with 422 Unprocessable Entity.");

  // Test wrong current password
  const wrongCurrentRes = await fetch(`${API_BASE}/reset-password`, {
    method: "POST",
    headers: userHeaders,
    body: JSON.stringify({
      usr_password: "WrongTemporaryPassword",
      new_password: newSecretPassword,
      new_password_confirmation: newSecretPassword,
    }),
  });
  assert(wrongCurrentRes.status === 422, "Incorrect current password rejected with 422.");

  // Submit valid password change
  const validChangeRes = await fetch(`${API_BASE}/reset-password`, {
    method: "POST",
    headers: userHeaders,
    body: JSON.stringify({
      usr_password: tempPassword,
      new_password: newSecretPassword,
      new_password_confirmation: newSecretPassword,
    }),
  });
  const validChangeData = await validChangeRes.json();
  assert(validChangeRes.status === 200, `Forced password change succeeded: ${validChangeData.message}`);
  const freshToken = validChangeData.access_token;
  assert(freshToken, "Received fresh Bearer token after password change.");

  // Step 8: User Profile check verifies forcePasswordReset === false
  console.log("\n--- STEP 8: VERIFYING USER PROFILE PRIVILEGES & FLAGS ---");
  const profileRes = await fetch(`${API_BASE}/user`, {
    headers: {
      Authorization: `Bearer ${freshToken}`,
      Accept: "application/json",
    },
  });
  const profileData = await profileRes.json();
  assert(profileRes.status === 200, "Fetched updated profile.");
  assert(profileData.forcePasswordReset === false, "Profile confirms forcePasswordReset === false.");
  assert(profileData.user.usr_must_change === 0 || profileData.user.usr_must_change === false, "Database column usr_must_change is 0/false.");

  // Step 9: User logs in with new password & verifies old temporary password rejection
  console.log("\n--- STEP 9: VERIFYING LOGIN WITH NEW PASSWORD & OLD REJECTION ---");
  // Old temporary password rejection
  const oldLoginRes = await fetch(`${API_BASE}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      usr_email: testEmail,
      usr_password: tempPassword,
    }),
  });
  assert(oldLoginRes.status === 422, "Old temporary password was successfully rejected.");

  // New password login
  const newLoginRes = await fetch(`${API_BASE}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      usr_email: testEmail,
      usr_password: newSecretPassword,
    }),
  });
  const newLoginData = await newLoginRes.json();
  assert(newLoginRes.status === 200, "Successfully logged in with brand new password!");
  assert(newLoginData.forcePasswordReset === false, "New session does not require password reset.");

  // Cleanup: Delete the test user via Admin
  console.log("\n--- CLEANUP ---");
  const delUserRes = await fetch(`${API_BASE}/user/${testUserId}/delete?force=true`, {
    method: "DELETE",
    headers: adminHeaders,
  });
  assert(delUserRes.status === 200, `Cleaned up test user ${testEmail}.`);

  console.log("\n=================================================");
  console.log("PASSWORD RESET & FORCED CHANGE FLOW FULLY VERIFIED!");
  console.log("=================================================");
}

main().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});

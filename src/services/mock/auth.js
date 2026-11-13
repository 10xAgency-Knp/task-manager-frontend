/* Sign-in, sign-out, session, password change and the forgot-password flow (mock). */
import { getDb, nextId, nowStamp, setSession } from "../mockDb.js";
import { ADMIN_RESET_MINUTES } from "../../data/settings.js";
import * as rules from "../rules.js";
import { fail, cleanText, passwordProblem, logActivity, audit, notify, userPayload } from "./shared.js";

const GENERIC_LOGIN_ERROR = "Invalid email or password.";
const RESET_MESSAGE = "Your password reset request has been received. Admins: a reset link has been sent to your registered email (check spam too). Everyone else: your administrator will set a new password for you shortly.";
const randomToken = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, "0")).join("");

export function login({ email, password }) {
  const address = String(email || "").trim().toLowerCase();
  const user = getDb().users.find(u => u.email.toLowerCase() === address && !u.deletedAt);
  if (!user || user.password !== String(password || "") || user.status === "Inactive") fail(GENERIC_LOGIN_ERROR);
  user.isOnline = true; user.lastSeenAt = nowStamp();
  setSession(user.id);
  logActivity(user, "signed in");
  audit(user, "login", "auth", user.id, null, null, "Signed in");
  return { ok: true, mustChange: user.mustChange ? 1 : 0, user: userPayload(user) };
}
export function logout(payload, me) {
  me.isOnline = false;
  delete getDb().pushDevices[me.id];
  setSession(null);
  audit(me, "logout", "auth", me.id, null, null, "Signed out");
  return { ok: true };
}
export const session = (payload, me) => ({ ok: true, authed: true, user: userPayload(me), mustChange: me.mustChange ? 1 : 0 });
export const me = (payload, user) => ({ ok: true, user: userPayload(user) });

export function changePassword({ oldPassword, newPassword }, user) {
  if (String(oldPassword || "") !== user.password) fail("Your current password is not correct.", { field: "old" });
  const problem = passwordProblem(newPassword);
  if (problem) fail(problem, { field: "new" });
  if (oldPassword === newPassword) fail("The new password must be different from the current one.", { field: "new" });
  user.password = String(newPassword); user.mustChange = false; user.updatedAt = nowStamp();
  logActivity(user, "changed their password");
  audit(user, "password_change", "auth", user.id, null, null, "Changed own password");
  return { ok: true, message: "Password changed." };
}

/* Admins get a one-time link (in the demo it is printed in the browser console instead of emailed);
   everyone else creates a request that an Admin handles on the Password Resets page. */
export function forgotPassword({ email }) {
  const address = String(email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) fail("Please enter a valid email address.");
  const db = getDb(), user = db.users.find(u => u.email.toLowerCase() === address && !u.deletedAt);
  if (!user || user.status === "Inactive") return { ok: true, sent: true, message: RESET_MESSAGE };

  if (user.role === "Admin") {
    const token = randomToken();
    user.resetToken = token; user.resetExpiresAt = Date.now() + ADMIN_RESET_MINUTES * 60000;
    const link = location.href.split(/[?#]/)[0] + "?reset=" + token;
    console.info("[Demo] Password reset email for " + user.email + ":\n" + link);
    logActivity(user, "requested a password reset link by email");
    return { ok: true, sent: true, message: RESET_MESSAGE };
  }
  const open = db.pwResets.find(r => r.userId === user.id && r.status === "Pending");
  if (open) { open.requestCount++; open.lastRequestedAt = nowStamp(); return { ok: true, sent: true, message: RESET_MESSAGE }; }
  const request = { id: nextId("pwResets"), userId: user.id, status: "Pending", priority: "High", requestCount: 1, requestedAt: nowStamp(), lastRequestedAt: nowStamp(),
    lastNotifiedAt: nowStamp(), reminderCount: 0, openedAt: null, openedById: null, adminAction: "", completedAt: null, completedById: null, note: "" };
  db.pwResets.push(request);
  db.users.filter(u => rules.isAdmin(u) && u.status === "Active" && !u.deletedAt).forEach(admin =>
    notify(admin.id, "pwreset", "HIGH PRIORITY: Password reset request", user.name + " (" + user.email + ") requested a password reset.", null, user.id, { resetId: request.id }));
  logActivity(user, "requested a password reset (waiting for Admin)");
  audit(null, "password_reset_request", "auth", "PR-" + request.id, null, { status: "Pending", priority: "High" }, "Password reset requested", user);
  return { ok: true, sent: true, message: RESET_MESSAGE };
}
function findResetUser(token) {
  const raw = cleanText(token);
  const user = /^[a-f0-9]{64}$/.test(raw) ? getDb().users.find(u => u.resetToken === raw && !u.deletedAt) : null;
  if (!user || user.role !== "Admin") fail("This reset link is not valid. Please request a new one.");
  if (!user.resetExpiresAt || user.resetExpiresAt < Date.now()) fail("This link has expired. Please request a new one.");
  if (user.status === "Inactive") fail("This account is inactive. Please contact your Admin.");
  return user;
}
export function checkReset({ reset }) { const user = findResetUser(reset); return { ok: true, name: user.name, email: user.email }; }
export function resetPassword({ reset, password }) {
  const user = findResetUser(reset);
  const problem = passwordProblem(password);
  if (problem) fail(problem);
  user.password = String(password); user.resetToken = null; user.resetExpiresAt = null; user.mustChange = false;
  getDb().pwResets.filter(r => r.userId === user.id && r.status === "Pending").forEach(r => Object.assign(r, { status: "Completed", adminAction: "email_link", completedAt: nowStamp(), completedById: user.id }));
  logActivity(user, "reset their password");
  audit(null, "password_reset", "auth", user.id, null, null, "Password reset through the emailed link", user);
  return { ok: true, message: "Your password has been set. Please sign in with the new password." };
}

/* Admin areas: activity log, Recycle Bin, and "forgot password" requests handled by an Admin. */
import { getDb, nextId, nowStamp } from "../mockDb.js";
import { RECYCLE_DAYS, ACTIVITY_LOG_KEEP_DAYS, PW_RESET_REMINDER_MINUTES, ROLE_LIMITS } from "../../data/settings.js";
import * as rules from "../rules.js";
import { fail, deny, cleanText, dateOrNull, passwordProblem, logActivity, audit, projectById } from "./shared.js";

/* ---------------- activity log (read only) ---------------- */
const PER_PAGE = 50;
export function auditLog(filters, user) {
  const scope = rules.activityScopeIds(user);
  if (scope !== null && !scope.length) deny("You do not have permission to view activity logs.");
  const inScope = row => scope === null || scope.indexOf(row.userId) !== -1;
  const personId = Number(filters.user) || 0;
  if (personId && scope !== null && scope.indexOf(personId) === -1) deny("You do not have permission to view this person's activity.");
  const from = dateOrNull(filters.from), to = dateOrNull(filters.to), query = cleanText(filters.q).toLowerCase().slice(0, 80);
  const matches = getDb().audit.filter(row => inScope(row)
    && (!filters.designation || row.userDesignation === filters.designation) && (!filters.module || row.module === filters.module)
    && (!filters.actionType || row.action === filters.actionType) && (!personId || row.userId === personId)
    && (!from || row.createdAt >= from + " 00:00:00") && (!to || row.createdAt <= to + " 23:59:59")
    && (!query || [row.description, row.recordId, row.userEmail].some(v => String(v || "").toLowerCase().indexOf(query) !== -1)))
    .sort((a, b) => b.id - a.id);
  const pages = Math.max(1, Math.ceil(matches.length / PER_PAGE));
  const page = Math.min(pages, Math.max(1, Number(filters.page) || 1));
  const visible = getDb().audit.filter(inScope);
  const distinct = key => Array.from(new Set(visible.map(r => r[key]).filter(Boolean))).sort();
  const people = (scope === null ? getDb().users.map(u => u.id) : scope).map(id => rules.userRow(id)).filter(Boolean)
    .map(u => ({ id: u.id, name: u.name + (u.deletedAt ? " (removed)" : "") })).sort((a, b) => a.name.localeCompare(b.name));
  return { ok: true, total: matches.length, page, pages, perPage: PER_PAGE, people, keepDays: ACTIVITY_LOG_KEEP_DAYS,
    modules: distinct("module"), actions: distinct("action"), designations: distinct("userDesignation"),
    scope: scope === null ? "all" : (scope.length > 1 ? "team" : "own"),
    rows: matches.slice((page - 1) * PER_PAGE, page * PER_PAGE).map(r => ({ id: r.id, user_id: r.userId, user_name: r.userName, user_email: r.userEmail,
      user_role: r.userRole, user_designation: r.userDesignation, action: r.action, module: r.module, record_id: r.recordId,
      old_value: r.oldValue, new_value: r.newValue, ip_address: r.ip, description: r.description, at: r.createdAt })) };
}

/* ---------------- Recycle Bin ---------------- */
const MODULES = ["task", "project", "user", "deal", "attachment"];
const minuteStamp = value => value ? value.slice(0, 16) : null;
export function recycleList({ status, module }, user) {
  if (!rules.hasPerm(user, "recycle_restore")) deny("You do not have permission to open the Recycle Bin.");
  const wantStatus = ["deleted", "restored", "purged", "all"].indexOf(status) !== -1 ? status : "deleted";
  const wantModule = MODULES.indexOf(module) !== -1 ? module : "";
  const rows = getDb().recycle.filter(r => (wantStatus === "all" || r.restoreStatus === wantStatus) && (!wantModule || r.module === wantModule))
    .sort((a, b) => b.id - a.id).slice(0, 300).map(r => ({
      id: r.id, module: r.module, original_id: r.originalId, label: r.label, file_count: r.fileCount, deleted_by_id: r.deletedById, deletion_reason: r.deletionReason,
      restore_status: r.restoreStatus, purge_error: null, deleted_at: minuteStamp(r.deletedAt), purge_at: minuteStamp(r.purgeAt),
      restored_at: minuteStamp(r.restoredAt), restored_by_id: r.restoredById, purged_at: minuteStamp(r.purgedAt), purged_by_id: r.purgedById,
      deleted_by_name: rules.userName(r.deletedById), restored_by: r.restoredById ? rules.userName(r.restoredById) : "",
      purged_by: r.purgedById ? rules.userName(r.purgedById) : (r.restoreStatus === "purged" ? "System (30-day cleanup)" : "") }));
  return { ok: true, rows, days: RECYCLE_DAYS, canPurge: rules.isSuper(user) };
}

function freeCode(prefix, list, wanted, pad) {
  if (!list.some(x => x.code === wanted)) return wanted;
  const next = Math.max(0, ...list.map(x => Number(x.code.slice(prefix.length)) || 0)) + 1;
  return prefix + (pad ? String(next).padStart(pad, "0") : next);
}
function restoreTask(snapshot, projectId) {
  const db = getDb(), task = Object.assign({}, snapshot.task);
  task.code = freeCode("TK-", db.tasks, task.code, 0);
  if (projectId !== undefined) task.projectId = projectId;
  else if (task.projectId && !projectById(task.projectId)) task.projectId = null;
  if (db.tasks.some(t => t.id === task.id)) task.id = nextId("tasks");
  task.assigneeIds = (task.assigneeIds || []).filter(id => rules.isLive(rules.userRow(id)));
  db.tasks.push(task);
  const back = (table, rows) => (rows || []).forEach(r => db[table].push(Object.assign({}, r, { id: db[table].some(x => x.id === r.id) ? nextId(table) : r.id, taskId: task.id })));
  back("subtasks", snapshot.subtasks); back("comments", snapshot.comments); back("attachments", snapshot.attachments); back("taskActivity", snapshot.timeline);
  return task.code;
}
function restoreItem(entry) {
  const db = getDb(), snap = entry.snapshot;
  switch (entry.module) {
    case "task": {
      if (!snap.task || !snap.task.title) fail("This item cannot be restored (its saved copy is missing).");
      return "Task " + restoreTask(snap) + " restored.";
    }
    case "project": {
      if (!snap.project || !snap.project.name) fail("This item cannot be restored (its saved copy is missing).");
      const project = Object.assign({}, snap.project);
      project.code = freeCode("P-", db.projects, project.code, 2);
      if (db.projects.some(p => p.name.toLowerCase() === project.name.toLowerCase())) project.name = (project.name + " (restored)").slice(0, 120);
      if (db.projects.some(p => p.id === project.id)) project.id = nextId("projects");
      db.projects.push(project);
      (snap.tasks || []).forEach(t => restoreTask(t, project.id));
      return "Project " + project.code + " restored with " + (snap.tasks || []).length + " tasks.";
    }
    case "user": {
      const target = db.users.find(u => u.id === snap.user.id);
      if (!target) fail("This item cannot be restored (its saved copy is missing).");
      if (!target.deletedAt) fail("This user is already active.");
      const limit = ROLE_LIMITS[target.role];
      const used = db.users.filter(u => !u.deletedAt && u.role === target.role && !(target.role === "Admin" && u.isSuperAdmin)).length;
      if (limit && used >= limit) fail("Maximum account limit reached: only " + limit + " " + target.role + " accounts are allowed and " + used + " already exist. Change the role of an existing " + target.role + " first, then restore.");
      if (db.users.some(u => u.id !== target.id && u.email.toLowerCase() === target.email.toLowerCase())) fail("Another user now uses the email " + target.email + ".");
      const manager = rules.userRow(snap.user.reportsToId);
      Object.assign(target, { deletedAt: null, status: snap.user.status === "Inactive" ? "Inactive" : "Active", reportsToId: rules.isLive(manager) ? manager.id : null,
        mustChange: true, password: "Restored@" + Math.floor(10000 + Math.random() * 89999) });   // nobody knows it: an Admin sets a new one
      (snap.members || []).forEach(pid => { const p = projectById(pid); if (p && p.memberIds.indexOf(target.id) === -1) p.memberIds.push(target.id); });
      if (snap.permissions && Object.keys(snap.permissions).length) db.permOverrides[target.id] = snap.permissions;
      return "User " + target.name + " restored. Set a new temporary password for them (Members > Edit) before they sign in.";
    }
    case "deal": {
      const deal = Object.assign({}, snap.deal);
      deal.code = freeCode("D-", db.deals, deal.code, 0);
      if (db.deals.some(d => d.id === deal.id)) deal.id = nextId("deals");
      db.deals.push(deal);
      return "Deal " + deal.code + " restored.";
    }
    case "attachment": {
      const file = Object.assign({}, snap.attachment);
      if (!db.tasks.some(t => t.id === file.taskId)) fail("The task this file belonged to no longer exists. Restore the task first.");
      if (db.attachments.some(a => a.id === file.id)) file.id = nextId("attachments");
      db.attachments.push(file);
      return "File " + file.fileName + " restored.";
    }
    default: fail("Unknown item type.");
  }
}
export function recycleRestore({ id }, user) {
  if (!rules.hasPerm(user, "recycle_restore")) deny("You do not have permission to restore items.");
  const entry = getDb().recycle.find(r => r.id === Number(id));
  if (!entry) fail("Item not found in the Recycle Bin.");
  if (entry.restoreStatus !== "deleted") fail("This item was already " + entry.restoreStatus + ".");
  if (entry.module === "user" && !rules.isAdmin(user)) deny("Only an Admin can restore a user.");
  const message = restoreItem(entry);
  Object.assign(entry, { restoreStatus: "restored", restoredAt: nowStamp(), restoredById: user.id });
  audit(user, "restore", entry.module, entry.originalId, null, { bin_id: entry.id }, "Restored " + entry.label + " from the Recycle Bin");
  logActivity(user, "restored " + entry.label);
  return { ok: true, message };
}
export function recyclePurge({ id }, user) {
  if (!rules.isSuper(user)) deny("Only the Super Admin can permanently delete.");
  const db = getDb(), entry = db.recycle.find(r => r.id === Number(id));
  if (!entry) fail("Item not found in the Recycle Bin.");
  if (entry.restoreStatus !== "deleted") fail("This item is not in the Recycle Bin any more.");
  if (entry.module === "user") {
    const target = db.users.find(u => u.id === Number(entry.originalId));
    if (target) Object.assign(target, { name: "Removed user #" + target.id, email: "removed-" + target.id + "@deleted.invalid", phone: "", city: "", avatar: "" });   // anonymised like the real CRM
  }
  Object.assign(entry, { restoreStatus: "purged", purgedAt: nowStamp(), purgedById: user.id, snapshot: {} });
  audit(user, "permanent_delete", entry.module, entry.originalId, { label: entry.label, files: entry.fileCount }, null, "Permanently deleted " + entry.label);
  logActivity(user, "permanently deleted " + entry.label);
  return { ok: true };
}

/* ---------------- password reset requests ---------------- */
const canHandle = user => rules.isAdmin(user) && user.status === "Active";
function requestOut(r) {
  const person = rules.userRow(r.userId) || {};
  return { id: r.id, code: "PR-" + r.id, userId: r.userId, name: person.name || "", email: person.email || "", status: r.status, priority: r.priority,
    requestedAt: r.requestedAt, lastRequestedAt: r.lastRequestedAt, times: r.requestCount, reminders: r.reminderCount, lastNotifiedAt: r.lastNotifiedAt,
    openedBy: r.openedById ? rules.userName(r.openedById) : "", action: r.adminAction, completedAt: r.completedAt,
    completedBy: r.completedById ? rules.userName(r.completedById) : "", note: r.note };
}
const pendingRows = () => getDb().pwResets.filter(r => r.status === "Pending").sort((a, b) => a.requestedAt < b.requestedAt ? -1 : 1).map(requestOut);
export const pendingResetsFor = user => canHandle(user) ? pendingRows() : null;
function requireHandler(user) { if (!canHandle(user)) deny("Only an Admin or the Super Admin can handle password reset requests."); }
const findRequest = id => getDb().pwResets.find(r => r.id === Number(id)) || fail("Request not found.");
function resolveNotifications(request, text) {
  const person = rules.userRow(request.userId) || {};
  getDb().notifications.forEach(n => { if (n.kind === "pwreset" && n.resetId === request.id) Object.assign(n, { isRead: true, title: "Resolved: password reset for " + person.name, body: text }); });
}
/* also used when an Admin sets a password in the Edit User form */
export function completeResetsFor(admin, userId, action, requestId) {
  getDb().pwResets.filter(r => r.userId === userId && r.status === "Pending" && (!requestId || r.id === requestId)).forEach(r => {
    Object.assign(r, { status: "Completed", adminAction: action, completedAt: nowStamp(), completedById: admin.id });
    resolveNotifications(r, "Password reset completed by " + admin.name + ".");
    audit(admin, "password_reset_completed", "auth", "PR-" + r.id, { status: "Pending" }, { status: "Completed", method: action },
      "Reset the password of " + rules.userName(r.userId) + " (request completed, reminders stopped)");
  });
}
export function pwResets(payload, user) {
  requireHandler(user);
  const history = getDb().pwResets.filter(r => r.status !== "Pending").sort((a, b) => b.id - a.id).slice(0, 50).map(requestOut);
  return { ok: true, pending: pendingRows(), history, reminderMinutes: PW_RESET_REMINDER_MINUTES };
}
export const pwPending = (payload, user) => ({ ok: true, pending: pendingResetsFor(user) });
export function pwResetOpen({ id }, user) {
  requireHandler(user);
  const request = findRequest(id);
  if (request.status === "Pending" && !request.openedAt) {
    Object.assign(request, { openedAt: nowStamp(), openedById: user.id });
    audit(user, "password_reset_opened", "auth", "PR-" + request.id, null, null, "Opened the password reset request of " + rules.userName(request.userId));
  }
  return { ok: true, request: requestOut(request) };
}
function temporaryPassword() {
  const sets = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnpqrstuvwxyz", "23456789", "@#$%&*!?"], all = sets.join("");
  const random = n => crypto.getRandomValues(new Uint32Array(1))[0] % n;
  const chars = sets.map(s => s[random(s.length)]);
  while (chars.length < 12) chars.push(all[random(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) { const j = random(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join("");
}
export function pwResetComplete({ id, mode, password }, user) {
  requireHandler(user);
  const request = findRequest(id);
  if (request.status !== "Pending") fail("This request is already " + request.status.toLowerCase() + ".");
  const target = getDb().users.find(u => u.id === request.userId && !u.deletedAt);
  if (!target) fail("This user no longer exists. Reject the request instead.");
  if (target.status === "Inactive") fail("This user is inactive. Reactivate them first, or reject the request.");
  if (rules.isSuper(target) && !rules.isSuper(user) && target.id !== user.id) fail("Only a Super Admin can reset a Super Admin's password.");
  const manual = mode === "manual";
  let newPassword;
  if (manual) { newPassword = String(password || ""); const problem = passwordProblem(newPassword); if (problem) fail(problem); }
  else newPassword = temporaryPassword();
  Object.assign(target, { password: newPassword, mustChange: true, resetToken: null });
  completeResetsFor(user, target.id, manual ? "manual_password" : "temporary_password", request.id);
  logActivity(user, "reset the password of " + target.name);
  return { ok: true, name: target.name, email: target.email, tempPassword: manual ? null : newPassword };
}
export function pwResetReject({ id, note }, user) {
  requireHandler(user);
  const request = findRequest(id);
  if (request.status !== "Pending") fail("This request is already " + request.status.toLowerCase() + ".");
  const reason = cleanText(note).slice(0, 255);
  Object.assign(request, { status: "Rejected", adminAction: "rejected", note: reason, completedAt: nowStamp(), completedById: user.id });
  resolveNotifications(request, "Request rejected by " + user.name + (reason ? ": " + reason : "."));
  audit(user, "password_reset_rejected", "auth", "PR-" + request.id, { status: "Pending" }, { status: "Rejected", note: reason }, "Rejected the password reset request of " + rules.userName(request.userId));
  return { ok: true };
}

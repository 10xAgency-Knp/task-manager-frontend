/* Shared pieces of the mock backend: errors, input checks (same messages as the PHP CRM),
   history writers (activity, audit log, notifications) and the shapes the screens expect. */
import { getDb, nextId, nowStamp } from "../mockDb.js";
import { EMAIL_DOMAINS, TASK_STATUSES } from "../../data/settings.js";
import * as rules from "../rules.js";

/* ---------------- errors: thrown here, turned into { ok:false, ... } by mockApi.js ---------------- */
export class ApiError extends Error {
  constructor(message, extra) { super(message); this.payload = Object.assign({ ok: false, error: message }, extra || {}); }
}
export function fail(message, extra) { throw new ApiError(message, extra); }
export const deny = message => fail(message || "You do not have permission to do this.");

/* ---------------- input checks ---------------- */
export function cleanText(value) {
  const text = typeof value === "string" || typeof value === "number" ? String(value) : "";
  return text.replace(/\r\n?/g, "\n").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").trim();
}
export function textField(value, label, min, max, field) {
  const text = cleanText(value), length = Array.from(text).length;
  if (min > 0 && length === 0) fail(label + " is required.", { field });
  if (length > 0 && length < min) fail(label + " must be at least " + min + " characters.", { field });
  if (length > max) fail(label + " can be at most " + max + " characters (now " + length + ").", { field });
  return text;
}
export function numberField(value, label, min, max, field) {
  if (value === null || value === undefined || value === "") { if (min > 0) fail(label + " is required.", { field }); return 0; }
  const n = Number(value);
  if (!isFinite(n)) fail(label + " must be a number.", { field });
  if (n < min) fail(label + " cannot be less than " + min + ".", { field });
  if (n > max) fail(label + " cannot be more than " + max + ".", { field });
  return n;
}
export const pick = (value, list, fallback) => list.indexOf(value) !== -1 ? value : fallback;
export function dateOrNull(value) {
  const t = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const d = new Date(t + "T00:00:00");
  return !isNaN(d) && t === [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-") ? t : null;
}
export const idList = list => Array.isArray(list) ? Array.from(new Set(list.map(Number).filter(n => n > 0))) : [];
export function passwordProblem(password) {
  const p = String(password || "");
  if (p.length < 10) return "Password must be at least 10 characters.";
  if (p.length > 72) return "Password must be 72 characters (bytes) or fewer.";
  if (!/[A-Z]/.test(p)) return "Password needs at least one capital letter.";
  if (!/[a-z]/.test(p)) return "Password needs at least one small letter.";
  if (!/[0-9]/.test(p)) return "Password needs at least one number.";
  return null;
}
export function phoneProblem(phone) {
  const p = String(phone || "");
  if (!p) return null;
  if (!/^[0-9]+$/.test(p)) return "Phone number can contain digits only (no spaces, letters or +91).";
  if (p.length !== 10) return "Phone number must be exactly 10 digits.";
  if (!/^[6-9]/.test(p)) return "Please enter a valid Indian mobile number (it starts with 6, 7, 8 or 9).";
  return null;
}
export function emailProblem(email) {
  const e = String(email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || e.length > 160 || /\.\./.test(e)) return "Please enter a valid email address.";
  if (EMAIL_DOMAINS.indexOf(e.slice(e.lastIndexOf("@") + 1)) === -1) return "Only these email domains are allowed: " + EMAIL_DOMAINS.map(d => "@" + d).join(", ") + ".";
  return null;
}
/* the real type of a file from its first bytes (a renamed .exe is not a .png) */
export function sniffMime(dataUrl) {
  let head;
  try { head = atob(String(dataUrl).split(",")[1].slice(0, 200)); } catch (e) { return ""; }
  if (head.startsWith("\xFF\xD8\xFF")) return "image/jpeg";
  if (head.startsWith("\x89PNG\r\n\x1A\n")) return "image/png";
  if (head.startsWith("%PDF-")) return "application/pdf";
  if (head.startsWith("\x1A\x45\xDF\xA3")) return head.indexOf("webm") !== -1 ? "video/webm" : "";
  if (head.slice(4, 8) === "ftyp") return head.slice(8, 12) === "qt  " ? "video/quicktime" : "video/mp4";
  if (["moov", "mdat", "wide", "free", "skip", "pnot"].indexOf(head.slice(4, 8)) !== -1) return "video/quicktime";
  return "";
}
/* same checks and messages as lib/file_guard.php
   shortcut: images are checked by their first bytes only (the server also decodes them), enough for a demo */
const UPLOAD_TYPES = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", pdf: "application/pdf", mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm" };
const BLOCKED_NAME_PARTS = ["php", "php2", "php3", "php4", "php5", "php6", "php7", "php8", "phtml", "pht", "phps", "phar", "inc", "cgi", "pl", "py", "rb", "sh", "bash",
  "asp", "aspx", "ashx", "asmx", "jsp", "jspx", "exe", "bat", "cmd", "com", "msi", "dll", "scr", "vbs", "vbe", "ps1", "jar", "htaccess", "htpasswd", "ini", "shtml",
  "html", "htm", "xhtml", "svg", "js", "mjs", "hta", "wsf"];
export function validateUpload(originalName, clientMime, dataUrl, maxBytes) {
  const name = String(originalName || "").replace(/[\x00-\x1F\x7F]/g, "").replace(/[\\/:*?"<>|]+/g, "_").replace(/^[ .\t]+|[ .\t]+$/g, "").slice(0, 200);
  if (!name || name === "." || name === "..") fail("The file name is not valid.");
  const parts = name.toLowerCase().split(".");
  if (parts.length < 2) fail("Only JPG, JPEG, PNG, PDF, MP4, MOV and WEBM files are allowed.");
  const ext = parts.pop();
  if (parts.some(p => BLOCKED_NAME_PARTS.indexOf(p.replace(/[^a-z0-9]/g, "")) !== -1)) fail("This file name is not allowed for security reasons.");
  const want = UPLOAD_TYPES[ext];
  if (!want) fail("Only JPG, JPEG, PNG, PDF, MP4, MOV and WEBM files are allowed.");
  const sent = String(clientMime || "").toLowerCase().trim();
  if (sent && sent !== "application/octet-stream" && sent !== want && !(want === "image/jpeg" && sent === "image/jpg")) fail("The file type does not match its extension (." + ext + ").");
  const bytes = dataUrl && String(dataUrl).includes(",") ? dataUrlBytes(dataUrl) : 0;
  if (!bytes) fail("The file is empty.");
  if (bytes > maxBytes) fail("File size must be 5 MB or less.");
  const real = sniffMime(dataUrl);
  if (!real) fail("The file content is not a valid JPG, PNG, PDF, MP4, MOV or WEBM file.");
  if (real !== want) fail("The file content does not match its extension (." + ext + ").");
  return { name, mime: real, bytes };
}
export const dataUrlBytes = dataUrl => { const s = String(dataUrl); const b64 = s.slice(s.indexOf(",") + 1); return Math.floor(b64.length * 3 / 4) - (b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0); };
export const isOpenStatus = status => status !== "Completed" && status !== "Cancelled";
export const validStatus = status => TASK_STATUSES.indexOf(status) !== -1;

/* ---------------- history writers ---------------- */
export function logActivity(user, text) {
  const db = getDb();
  db.activity.push({ id: nextId("activity"), userId: user.id, description: String(text).slice(0, 300), createdAt: nowStamp() });
  if (db.activity.length > 2000) db.activity.splice(0, db.activity.length - 2000);
}
export function audit(user, action, module, recordId, oldValue, newValue, description, who) {
  const person = user || who || {};
  getDb().audit.push({ id: nextId("audit"), userId: user ? user.id : null, userName: person.name || "", userEmail: person.email || "",
    userRole: user ? user.role + (rules.isSuper(user) ? " (Super Admin)" : "") : "", userDesignation: person.designation || "",
    action, module, recordId: String(recordId === undefined || recordId === null ? "" : recordId), oldValue: oldValue || null, newValue: newValue || null,
    ip: "127.0.0.1 (demo)", description, createdAt: nowStamp() });
}
export function taskEvent(taskId, user, action, detail) {
  getDb().taskActivity.push({ id: nextId("taskActivity"), taskId, userId: user.id, action, detail: String(detail).slice(0, 300), createdAt: nowStamp() });
}
export function notify(userId, kind, title, body, taskId, actorId, extra) {
  if (!rules.isLive(rules.userRow(userId))) return;
  getDb().notifications.push(Object.assign({ id: nextId("notifications"), userId: Number(userId), kind, title: String(title).slice(0, 160), body: String(body || "").slice(0, 300),
    taskId: taskId || null, resetId: null, actorId: actorId || null, isRead: false, external: "", createdAt: nowStamp() }, extra || {}));
}
/* only the fields that changed, for the activity log */
export function auditDiff(before, after) {
  const oldValue = {}, newValue = {};
  Object.keys(after).forEach(k => { if (JSON.stringify(before[k] === undefined ? null : before[k]) !== JSON.stringify(after[k])) { oldValue[k] = before[k] === undefined ? null : before[k]; newValue[k] = after[k]; } });
  return [Object.keys(oldValue).length ? oldValue : null, Object.keys(newValue).length ? newValue : null];
}

/* ---------------- lookups ---------------- */
export function findTaskForUser(code, user) {
  const task = getDb().tasks.find(t => t.code === String(code || ""));
  if (!task) fail("Task not found. It may have been deleted.");
  if (!rules.canAccessTask(user, task)) deny("This task is not assigned to you or your team.");
  return task;
}
export const projectById = id => getDb().projects.find(p => p.id === id) || null;
export const categoryLabel = (category, note) => category === "Custom/ remark" && note ? note : category;
export function recalcProgress(task) {
  const items = getDb().subtasks.filter(s => s.taskId === task.id);
  if (items.length) task.progress = Math.round(items.filter(s => s.isDone).length / items.length * 100);
  else task.progress = task.status === "Completed" ? 100 : task.progress === 100 ? 0 : task.progress;
}

/* ---------------- shapes sent to the screens ---------------- */
export function attachmentOut(a) {
  return { id: a.id, name: a.fileName, mime: a.mime, size: a.size, sizeKb: Math.ceil(a.size / 1024), byId: a.uploadedById, by: rules.userName(a.uploadedById), at: a.createdAt };
}
export function userPayload(u) {
  return { id: u.id, name: u.name, email: u.email, role: u.role, dept: u.department, designation: u.designation, mustChange: u.mustChange ? 1 : 0,
    superAdmin: rules.isSuper(u), perms: rules.effectivePerms(u), avatar: u.avatar || "", hasTeam: rules.hasTeam(u),
    seesAllTasks: rules.seesAllTasks(u), seesAllPeople: rules.seesAllPeople(u), reportsTo: u.reportsToId };
}
/* what one person may see of another (contact details only for their team or Admins) */
export function safeUser(viewer, x, teamIds) {
  const self = viewer.id === x.id, inTeam = teamIds.indexOf(x.id) !== -1;
  const recent = x.lastSeenAt && Date.now() - new Date(x.lastSeenAt.replace(" ", "T")).getTime() < 300000;
  const base = { id: x.id, name: x.name, role: x.role, designation: x.designation || "", dept: x.department || "", status: x.status,
    online: recent && x.isOnline ? 1 : 0, avatar: x.avatar || "", archived: !!x.deletedAt, inTeam,
    superAdmin: !!x.isSuperAdmin && x.role === "Admin", reportsTo: x.reportsToId };
  if (x.deletedAt) return base;
  const dates = { email: x.email, lastSeen: x.lastSeenAt || "", joined: x.joinedOn || "", createdAt: x.createdAt || "", updatedAt: x.updatedAt || "" };
  if (self || (rules.canViewPrivateFields(viewer) && inTeam) || (rules.isAdmin(viewer) && rules.hasPerm(viewer, "users.view")))
    return Object.assign(base, dates, { phone: x.phone || "", city: x.city || "" });
  if (inTeam && rules.hasPerm(viewer, "users.view")) return Object.assign(base, dates);
  return base;
}
export function notificationRows(user, afterId, limit) {
  const db = getDb();
  return db.notifications.filter(n => n.userId === user.id && n.id > (afterId || 0)).sort((a, b) => b.id - a.id).slice(0, limit || 60).map(n => {
    const task = n.taskId ? db.tasks.find(t => t.id === n.taskId) : null;
    const open = !!task && rules.canAccessTask(user, task);           // only link what this person may open
    const project = open && task.projectId ? projectById(task.projectId) : null;
    const actor = n.actorId ? rules.userRow(n.actorId) : null;
    return { id: n.id, kind: n.kind, title: n.title, body: n.body, task: open ? task.code : "", taskTitle: open ? task.title : "",
      project: project ? project.code : "", projectName: project ? project.name : "", resetId: n.resetId || null,
      actorId: n.actorId || null, actor: actor ? actor.name : "System", actorRole: actor ? (actor.designation || actor.role) : "",
      external: n.external || "", read: n.isRead ? 1 : 0, at: n.createdAt.slice(0, 16) };
  });
}
export const unreadCount = user => getDb().notifications.filter(n => n.userId === user.id && !n.isRead).length;

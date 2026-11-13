/* The data every screen starts from (load), plus search, reports, workload, notifications,
   push notifications on this device and the profile photo. */
import { getDb, nowStamp, today } from "../mockDb.js";
import { TASK_CATEGORIES, LIMITS, EMAIL_DOMAINS, SESSION, OWN_FILE_DELETE_HOURS, ROLE_LIMITS, MAX_AVATAR_BYTES } from "../../data/settings.js";
import * as rules from "../rules.js";
import { fail, notify, audit, attachmentOut, userPayload, safeUser, notificationRows, unreadCount, categoryLabel, projectById, isOpenStatus, validateUpload, dataUrlBytes } from "./shared.js";
import { pendingResetsFor } from "./admin.js";
import { dbDate } from "../../data/seed.js";

const PRIORITY_ORDER = { Urgent: 0, High: 1, Medium: 2, Low: 3 };
const PROJECT_ORDER = ["At Risk", "In Progress", "Planning", "On Hold", "Completed"];
const DEAL_ORDER = ["Negotiation", "Proposal", "Qualified", "Discovery", "Won", "Lost"];
/* date n days after an ISO date, in local time (toISOString would give the UTC date: a day early in India) */
export const addDays = (iso, n) => { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return dbDate(d); };

export function visibleTasks(user) { return getDb().tasks.filter(t => rules.canAccessTask(user, t)); }

/* one task as the lists and the board need it */
export function taskOut(task, user) {
  const db = getDb(), team = rules.teamIds(user), all = rules.seesAllTasks(user);
  const manage = all || team.indexOf(task.createdById) !== -1;
  const mine = manage || task.assigneeIds.indexOf(user.id) !== -1;
  const project = task.projectId ? projectById(task.projectId) : null;
  return {
    id: task.code, dbId: task.id, title: task.title, description: task.description || "", project: project ? project.code : "", projectId: task.projectId,
    category: task.category, categoryNote: task.categoryNote || "", categoryLabel: categoryLabel(task.category, task.categoryNote),
    assigneeIds: task.assigneeIds.slice(), createdById: task.createdById, priority: task.priority, status: task.status,
    startDate: task.startDate || "", due: task.dueDate || "", hours: task.estimatedHours, spent: task.spentHours,
    tags: rules.hasPerm(user, "tags.view") ? task.tags.slice() : [], progress: task.progress, completedAt: task.completedAt || "",
    createdAt: task.createdAt, updatedAt: task.updatedAt,
    subtasks: db.subtasks.filter(s => s.taskId === task.id).map(s => ({ id: s.id, title: s.title, done: s.isDone ? 1 : 0 })),
    attachments: db.attachments.filter(a => a.taskId === task.id).sort((a, b) => b.id - a.id).map(attachmentOut),
    commentCount: db.comments.filter(c => c.taskId === task.id).length,
    can: { manage: manage && rules.hasPerm(user, "tasks.edit"), edit: mine && rules.hasPerm(user, "tasks.edit"), update: mine && rules.hasPerm(user, "tasks.update"),
      delete: rules.hasPerm(user, "tasks.delete") && (rules.hasPerm(user, "delete_records") || team.indexOf(task.createdById) !== -1),
      tagAdd: rules.hasPerm(user, "tags.edit"), tagRemove: rules.hasPerm(user, "tags.delete") }
  };
}

/* once a day: "task is overdue / due soon" reminders for the person's own tasks */
function dueReminders(user) {
  const db = getDb(), day = today();
  if (db.notifications.some(n => n.userId === user.id && (n.kind === "overdue" || n.kind === "due_soon") && n.createdAt.slice(0, 10) === day)) return;
  db.tasks.filter(t => t.assigneeIds.indexOf(user.id) !== -1 && isOpenStatus(t.status) && t.dueDate && t.dueDate <= addDays(day, 1))
    .sort((a, b) => a.dueDate < b.dueDate ? -1 : 1).slice(0, 10).forEach(t => {
      const late = t.dueDate < day;
      const due = new Date(t.dueDate + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
      notify(user.id, late ? "overdue" : "due_soon", late ? "Task is overdue" : "Task is due soon", t.title + " - due " + due, t.id, null);
    });
}

export function load(payload, user) {
  const db = getDb();
  dueReminders(user);
  user.lastSeenAt = nowStamp(); user.isOnline = true;
  const team = rules.teamIds(user), viewerTeam = rules.seesAllPeople(user) ? db.users.map(x => x.id) : team;
  const tasks = visibleTasks(user).sort((a, b) =>
    (a.status === "Completed") - (b.status === "Completed") || (!a.dueDate) - (!b.dueDate) || (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0) ||
    PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  const projects = db.projects.filter(p => rules.canSeeProject(user, p))
    .sort((a, b) => PROJECT_ORDER.indexOf(a.status) - PROJECT_ORDER.indexOf(b.status) || a.name.localeCompare(b.name));
  const deals = rules.hasPerm(user, "deals.view") ? db.deals.filter(d => rules.canSeeDeal(user, d))
    .sort((a, b) => DEAL_ORDER.indexOf(a.stage) - DEAL_ORDER.indexOf(b.stage) || (a.closeDate < b.closeDate ? -1 : 1)) : [];
  const scope = rules.activityScopeIds(user);
  const activity = db.activity.filter(a => scope === null || scope.indexOf(a.userId) !== -1).sort((a, b) => b.id - a.id).slice(0, 60);
  return { ok: true, data: {
    oldClosed: { projects: {}, users: {} },     // shortcut: the demo sends every task, so there are no "old closed" counts
    users: db.users.map(x => safeUser(user, x, viewerTeam)),
    assignable: rules.assignableIds(user),
    roleLimits: { Admin: { max: ROLE_LIMITS.Admin }, Manager: { max: ROLE_LIMITS.Manager } },
    projects: projects.map(p => ({ id: p.code, dbId: p.id, name: p.name, description: p.description, ownerId: p.ownerId, createdById: p.createdById,
      status: p.status, progress: p.progress, startDate: p.startDate || "", due: p.dueDate || "", budget: rules.hasPerm(user, "projects.edit") ? p.budget : 0,
      memberIds: p.memberIds.slice(), createdAt: p.createdAt, updatedAt: p.updatedAt, canEdit: rules.canEditProject(user, p),
      canEditDetails: rules.projectInScope(user, p) && rules.hasPerm(user, "projects.edit"), canUpdate: rules.projectInScope(user, p) && rules.hasPerm(user, "projects.update"),
      canDelete: rules.canDeleteProject(user, p) })),
    tasks: tasks.map(t => taskOut(t, user)),
    deals: deals.map(d => ({ id: d.code, name: d.name, account: d.account, ownerId: d.ownerId, createdById: d.createdById, stage: d.stage, value: d.value,
      probability: d.probability, close: d.closeDate || "", notes: d.notes || "", createdAt: d.createdAt, updatedAt: d.updatedAt,
      canEdit: rules.canEditDeal(user), canDelete: rules.canDeleteDeal(user) })),
    notifications: notificationRows(user, 0, 60),
    unread: unreadCount(user),
    activity: activity.map(a => ({ userId: a.userId, who: rules.userName(a.userId), text: a.description, when: a.createdAt.slice(0, 16) })),
    me: userPayload(user),
    session: SESSION,
    taskCategories: TASK_CATEGORIES,
    limits: LIMITS,
    emailDomains: EMAIL_DOMAINS,
    pwResets: pendingResetsFor(user),
    meta: { serverTime: new Date().toISOString(), today: today(), ownFileDeleteHours: OWN_FILE_DELETE_HOURS }
  } };
}

/* ---------------- search (only what this person may see) ---------------- */
export function search({ q }, user) {
  const query = String(q || "").trim().slice(0, 80).toLowerCase();
  if (query.length < 2) return { ok: true, results: [] };
  const has = v => String(v || "").toLowerCase().indexOf(query) !== -1, db = getDb(), results = [];
  visibleTasks(user).filter(t => has(t.title) || has(t.description) || has(t.code) || t.tags.some(has))
    .sort((a, b) => a.updatedAt < b.updatedAt ? 1 : -1).slice(0, 12).forEach(t => {
      const p = t.projectId ? projectById(t.projectId) : null;
      results.push({ type: "task", id: t.code, title: t.title, sub: (p ? p.code + " - " : "") + t.status, badge: t.priority });
    });
  db.projects.filter(p => rules.canSeeProject(user, p) && (has(p.name) || has(p.description) || has(p.code))).slice(0, 8)
    .forEach(p => results.push({ type: "project", id: p.code, title: p.name, sub: p.status, badge: "" }));
  const visible = rules.hasPerm(user, "users.view") ? rules.visibleUserIds(user) : [user.id];
  db.users.filter(x => visible.indexOf(x.id) !== -1 && !x.deletedAt && (has(x.name) || has(x.email) || has(x.department)))
    .sort((a, b) => (b.email.toLowerCase() === query) - (a.email.toLowerCase() === query) || a.name.localeCompare(b.name)).slice(0, 8)
    .forEach(x => results.push({ type: "person", id: x.id, title: x.name, sub: [x.email, x.designation, x.department].filter(Boolean).join(" - "), badge: "" }));
  return { ok: true, results };
}

/* ---------------- reports ---------------- */
export function reports(payload, user) {
  if (!rules.hasPerm(user, "view_reports")) fail("Only Admins and Managers can see reports.");
  const day = today(), tasks = visibleTasks(user);
  const count = fn => tasks.filter(fn).length;
  const overdue = t => isOpenStatus(t.status) && t.dueDate && t.dueDate < day;
  const total = tasks.length, done = count(t => t.status === "Completed"), cancelled = count(t => t.status === "Cancelled");
  const monday = new Date(day + "T00:00:00"); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const trend = [];
  for (let i = 7; i >= 0; i--) {
    const from = new Date(monday); from.setDate(from.getDate() - 7 * i);
    const fromIso = dbDate(from), toIso = addDays(fromIso, 6);
    trend.push({ label: from.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
      value: count(t => t.completedAt && t.completedAt.slice(0, 10) >= fromIso && t.completedAt.slice(0, 10) <= toIso) });
  }
  const db = getDb();
  const peopleIds = rules.seesAllPeople(user) ? db.users.filter(rules.isLive).map(x => x.id) : rules.teamIds(user);
  const people = peopleIds.map(id => {
    const mine = db.tasks.filter(t => t.assigneeIds.indexOf(id) !== -1);
    return { id, name: rules.userName(id), open: mine.filter(t => isOpenStatus(t.status)).length, done: mine.filter(t => t.status === "Completed").length,
      overdue: mine.filter(overdue).length, hours: mine.reduce((s, t) => s + t.estimatedHours, 0), spent: mine.reduce((s, t) => s + t.spentHours, 0) };
  }).filter(p => p.open + p.done > 0 || db.tasks.some(t => t.assigneeIds.indexOf(p.id) !== -1)).sort((a, b) => b.open - a.open || b.done - a.done).slice(0, 100);
  const projects = db.projects.filter(p => rules.canSeeProject(user, p)).sort((a, b) => a.name.localeCompare(b.name)).map(p => {
    const list = tasks.filter(t => t.projectId === p.id), finished = list.filter(t => t.status === "Completed").length;
    return { id: p.code, name: p.name, reported: p.progress, status: p.status, total: list.length, done: finished, overdue: list.filter(overdue).length,
      taskBased: list.length ? Math.round(finished / list.length * 100) : 0 };
  });
  const closed = tasks.filter(t => t.completedAt);
  const avgDays = closed.length ? closed.reduce((s, t) => s + (new Date(t.completedAt.replace(" ", "T")) - new Date(t.createdAt.replace(" ", "T"))) / 86400000, 0) / closed.length : 0;
  return { ok: true, data: {
    scope: rules.seesAllTasks(user) ? "company" : "team",
    totals: { total, todo: count(t => t.status === "To Do"), inProgress: count(t => t.status === "In Progress"), review: count(t => t.status === "Review"),
      onHold: count(t => t.status === "On Hold"), completed: done, cancelled, overdue: count(overdue),
      dueToday: count(t => isOpenStatus(t.status) && t.dueDate === day), completionRate: total - cancelled > 0 ? Math.round(done / (total - cancelled) * 100) : 0,
      avgDays: Math.round(avgDays * 10) / 10 },
    trend, people, projects
  } };
}

/* ---------------- team workload ---------------- */
export function workload({ user: oneId }, user) {
  let scope = rules.workloadScopeIds(user);
  const one = Number(oneId) || 0;
  if (one > 0) { if (scope.indexOf(one) === -1) fail("You do not have permission to see this person's workload."); scope = [one]; }
  if (!scope.length) return { ok: true, scope: "none", people: [] };
  const day = today(), soon = addDays(day, 7), horizon = addDays(day, 14), db = getDb();
  const people = scope.map(id => {
    const x = rules.userRow(id); if (!x) return null;
    const mine = db.tasks.filter(t => t.assigneeIds.indexOf(id) !== -1 && t.status !== "Cancelled");
    const open = mine.filter(t => isOpenStatus(t.status));
    return { id, name: x.name, designation: x.designation || x.role, role: x.role, assigned: mine.length,
      pending: mine.filter(t => t.status === "To Do").length, inProgress: mine.filter(t => t.status === "In Progress").length,
      waiting: mine.filter(t => t.status === "On Hold" || t.status === "Review").length, completed: mine.filter(t => t.status === "Completed").length,
      overdue: open.filter(t => t.dueDate && t.dueDate < day).length, dueSoon: open.filter(t => t.dueDate && t.dueDate >= day && t.dueDate <= soon).length,
      upcoming: open.filter(t => t.dueDate && t.dueDate <= horizon && rules.canAccessTask(user, t))
        .sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0) || PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]).slice(0, 5)
        .map(t => ({ id: t.code, title: t.title, status: t.status, priority: t.priority, due: t.dueDate })) };
  }).filter(Boolean).sort((a, b) => a.id === user.id ? -1 : b.id === user.id ? 1 : a.name.localeCompare(b.name));
  return { ok: true, scope: rules.hasPerm(user, "workload.all") ? "all" : (scope.length > 1 ? "team" : "own"), people };
}

/* ---------------- notifications ---------------- */
export const notifPoll = ({ after }, user) => ({ ok: true, unread: unreadCount(user), items: notificationRows(user, Number(after) || 0, 20) });
export function notifRead({ id }, user) {
  getDb().notifications.forEach(n => { if (n.userId === user.id && (!id || n.id === Number(id))) n.isRead = true; });
  return { ok: true };
}

/* ---------------- push notifications on this device ----------------
   Real push needs a push server; the demo remembers that the device is on and shows notifications locally. */
export const pushConfig = (payload, user) => ({ ok: true, ready: true, publicKey: "", devices: getDb().pushDevices[user.id] || 0, reason: "" });
export function pushSubscribe(payload, user) { const db = getDb(); db.pushDevices[user.id] = 1; audit(user, "push_on", "notification", user.id, null, { device: navigator.userAgent.slice(0, 120) }, "Turned on push notifications on a device"); return { ok: true }; }
export function pushUnsubscribe(payload, user) { delete getDb().pushDevices[user.id]; return { ok: true }; }
export function pushTest(payload, user) {
  audit(user, "push_test", "notification", user.id, null, null, "Sent a test push notification");
  return { ok: true, sent: 1, local: { title: "10X Agency CRM", body: "Test notification: push notifications work on this device." } };
}

/* ---------------- profile photo (kept as a data URL) ---------------- */
export function setAvatar({ data, mime, name }, user) {
  const url = String(data || "");
  if (url.includes(",") && dataUrlBytes(url) > MAX_AVATAR_BYTES) fail("The photo must be 1 MB or smaller.");
  const file = validateUpload(name || "photo.jpg", mime, url, MAX_AVATAR_BYTES);
  if (file.mime !== "image/png" && file.mime !== "image/jpeg") fail("Please choose a JPG or PNG photo.");
  user.avatar = url;
  audit(user, "profile_photo", "user", user.id, null, { photo: "updated" }, "Changed own profile photo");
  return { ok: true, avatar: url };
}
export function removeAvatar(payload, user) {
  if (user.avatar) { user.avatar = ""; audit(user, "profile_photo", "user", user.id, null, { photo: "removed" }, "Removed own profile photo"); }
  return { ok: true };
}

/* Builds the demo database from the data files. Runs once per browser (the result is saved);
   dates are placed relative to the day it runs, so there are always overdue, due-soon and finished tasks. */
import { USERS, DEMO_PASSWORD, PERMISSION_OVERRIDES } from "./users.js";
import { PROJECTS } from "./projects.js";
import { TASKS, CHECKLISTS, DESCRIPTIONS, COMMENT_LINES, FILE_NAMES } from "./tasks.js";
import { DEALS } from "./deals.js";

/* small seeded random generator: the same demo data on every machine */
function makeRandom(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pad = n => String(n).padStart(2, "0");
export function dbDateTime(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds()); }
export function dbDate(d) { return dbDateTime(d).slice(0, 10); }

export function buildSeed() {
  const rnd = makeRandom(20261021);
  const pick = list => list[Math.floor(rnd() * list.length)];
  const now = new Date();
  /* a moment `days` from now during office hours (negative = past, never in the future for past events) */
  const at = (days, hour) => {
    const d = new Date(now); d.setDate(d.getDate() + Math.round(days));
    d.setHours(hour !== undefined ? hour : 9 + Math.floor(rnd() * 9), Math.floor(rnd() * 60), Math.floor(rnd() * 60), 0);
    return d > now ? new Date(now.getTime() - 60000 * (5 + Math.floor(rnd() * 120))) : d;
  };
  const day = days => { const d = new Date(now); d.setDate(d.getDate() + days); return dbDate(d); };
  const userOf = id => USERS.find(u => u.id === id);

  const db = {
    version: 1,
    users: [], permOverrides: {}, projects: [], tasks: [], subtasks: [], comments: [], attachments: [], taskActivity: [],
    deals: [], notifications: [], activity: [], audit: [], recycle: [], pwResets: [], pushDevices: {},
    seq: {}, counters: {}
  };
  const nextId = table => (db.seq[table] = (db.seq[table] || 0) + 1);

  /* ---------- users ---------- */
  USERS.forEach(u => {
    const created = at(u.joined, 10);
    db.users.push({
      id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, isSuperAdmin: !!u.superAdmin,
      designation: u.designation, department: u.department, city: u.city, status: u.status || "Active",
      reportsToId: u.reportsTo, joinedOn: dbDate(created), password: DEMO_PASSWORD, mustChange: !!u.mustChange,
      avatar: "", isOnline: false, lastSeenAt: u.deletedDaysAgo ? dbDateTime(at(-u.deletedDaysAgo - 1)) : dbDateTime(at(-rnd() * 2)),
      createdAt: dbDateTime(created), updatedAt: dbDateTime(at(-rnd() * 30)),
      deletedAt: u.deletedDaysAgo ? dbDateTime(at(-u.deletedDaysAgo, 15)) : null,
      resetToken: null, resetExpiresAt: null
    });
  });
  db.seq.users = USERS.length;
  db.permOverrides = JSON.parse(JSON.stringify(PERMISSION_OVERRIDES));
  /* a few people online right now */
  [1, 3, 4, 7, 10, 20].forEach(id => { const u = db.users.find(x => x.id === id); u.isOnline = true; u.lastSeenAt = dbDateTime(new Date(now.getTime() - 60000)); });

  /* helpers that also write the side tables, like the real backend does */
  const log = (userId, text, when) => db.activity.push({ id: nextId("activity"), userId, description: text, createdAt: dbDateTime(when) });
  const audit = (userId, action, module, recordId, oldValue, newValue, description, when) => {
    const u = userOf(userId);
    db.audit.push({ id: nextId("audit"), userId, userName: u ? u.name : "System", userEmail: u ? u.email : "", userRole: u ? u.role + (u.superAdmin ? " (Super Admin)" : "") : "",
      userDesignation: u ? u.designation : "", action, module, recordId: String(recordId || ""), oldValue: oldValue || null, newValue: newValue || null,
      ip: "103.21." + Math.floor(rnd() * 200) + "." + Math.floor(rnd() * 250), description, createdAt: dbDateTime(when) });
  };
  const notify = (userId, kind, title, body, taskId, actorId, when, read, extra) => db.notifications.push(Object.assign({
    id: nextId("notifications"), userId, kind, title, body, taskId: taskId || null, resetId: null, actorId: actorId || null,
    isRead: !!read, external: "", createdAt: dbDateTime(when)
  }, extra || {}));
  const event = (taskId, userId, action, detail, when) => db.taskActivity.push({ id: nextId("taskActivity"), taskId, userId, action, detail, createdAt: dbDateTime(when) });

  /* ---------- projects ---------- */
  PROJECTS.forEach((p, i) => {
    const created = at(Math.min(p.start, 0) - 2, 11);
    db.projects.push({ id: i + 1, code: p.code, name: p.name, description: p.description, ownerId: p.ownerId, createdById: p.createdById,
      status: p.status, progress: p.progress, startDate: day(p.start), dueDate: day(p.due), budget: p.budget, memberIds: p.members.slice(),
      createdAt: dbDateTime(created), updatedAt: dbDateTime(at(-rnd() * 10)) });
    log(p.createdById, "created project " + p.name, created);
    audit(p.createdById, "create", "project", p.code, null, { name: p.name, owner_id: p.ownerId, status: "Planning", member_ids: p.members }, "Created project " + p.code + " - " + p.name, created);
  });
  db.seq.projects = PROJECTS.length; db.counters.project = PROJECTS.length;

  /* ---------- tasks ---------- */
  TASKS.forEach((row, i) => {
    const [projectCode, title, category, assigneeIds, createdById, priority, status, startDay, dueDay, hours, tags, note] = row;
    const id = i + 1, code = "TK-" + (101 + i);
    const project = db.projects.find(p => p.code === projectCode);
    const created = at(Math.min(startDay, 0) - 1, 10);
    const finished = status === "Completed" ? at(Math.min(dueDay, 0) - rnd() * 2, 17) : null;
    const items = CHECKLISTS[category] || CHECKLISTS["Custom/ remark"];
    const doneShare = status === "Completed" ? 1 : status === "Review" ? 0.85 : status === "In Progress" ? 0.45 : status === "On Hold" ? 0.3 : 0;
    const doneCount = Math.round(items.length * doneShare);
    items.forEach((t, k) => db.subtasks.push({ id: nextId("subtasks"), taskId: id, title: t, isDone: k < doneCount }));
    const spent = status === "Completed" ? hours * (0.8 + rnd() * 0.4) : hours * doneShare * (0.6 + rnd() * 0.5);
    const task = {
      id, code, title, description: DESCRIPTIONS[category] || DESCRIPTIONS["Custom/ remark"], projectId: project ? project.id : null,
      category, categoryNote: category === "Custom/ remark" ? (note || "Other") : "", createdById, priority, status,
      startDate: day(startDay), dueDate: day(dueDay), estimatedHours: hours, spentHours: Math.round(spent * 4) / 4, tags: tags.slice(),
      progress: Math.round(doneShare * 100), completedAt: finished ? dbDateTime(finished) : null, assigneeIds: assigneeIds.slice(),
      createdAt: dbDateTime(created), updatedAt: dbDateTime(finished || at(-rnd() * 4))
    };
    db.tasks.push(task);
    const creator = userOf(createdById), names = assigneeIds.map(a => userOf(a).name).join(", ");
    event(id, createdById, "created", "Task created", created);
    event(id, createdById, "assigned", "Assigned to " + names, created);
    log(createdById, "created " + code + " and assigned it to " + names, created);
    audit(createdById, "create", "task", code, null, { title, project_id: task.projectId, category, assignee_ids: assigneeIds, priority, status: "To Do", start_date: task.startDate, due_date: task.dueDate }, "Created task " + code + " - " + title, created);
    tags.forEach(t => audit(createdById, "tag_add", "tag", code, null, { tag: t }, "Added tag #" + t + " to " + code, created));
    assigneeIds.forEach(a => { if (a !== createdById) notify(a, "assigned", "New task assigned to you", title + " - " + priority, id, createdById, created, rnd() < 0.7); });

    /* status history */
    if (status !== "To Do") {
      const mover = assigneeIds[0];
      const when = finished || at(-rnd() * Math.max(1, -startDay), 15);
      if (status === "Completed" || status === "Review") event(id, mover, "status", "Status changed to In Progress", new Date(when.getTime() - 86400000 * (1 + rnd() * 3)));
      event(id, mover, "status", "Status changed to " + status, when);
      log(mover, "moved " + code + " to " + status, when);
      audit(mover, "status", "task", code, { status: "To Do" }, { status }, code + " moved to " + status, when);
      if (mover !== createdById) notify(createdById, "status", "Task status changed", code + " - " + title + " moved to " + status, id, mover, when, rnd() < 0.6);
    }

    /* comments with @mentions */
    const people = Array.from(new Set([createdById].concat(assigneeIds)));
    const commentCount = status === "To Do" ? (rnd() < 0.3 ? 1 : 0) : 1 + Math.floor(rnd() * 3);
    for (let c = 0; c < commentCount; c++) {
      const author = pick(people);
      const others = people.filter(x => x !== author);
      let body = pick(COMMENT_LINES); const mentions = [];
      if (body.indexOf("{a}") !== -1) {
        if (others.length) { const m = pick(others); mentions.push(m); body = body.replace("{a}", "@" + userOf(m).name); }
        else body = body.replace("{a} ", "");
      }
      const when = at(-rnd() * Math.max(1, -startDay + 1));
      db.comments.push({ id: nextId("comments"), taskId: id, authorId: author, body, mentions, createdAt: dbDateTime(when) });
      event(id, author, "comment", "Comment added", when);
      log(author, "commented on " + code, when);
      audit(author, "comment", "task", code, null, { comment: body, mentioned_ids: mentions, outside_contacts: [] }, "Commented on " + code, when);
      mentions.forEach(m => notify(m, "mention", userOf(author).name + " mentioned you on " + code, body.slice(0, 140), id, author, when, rnd() < 0.5));
      others.filter(o => mentions.indexOf(o) === -1).forEach(o => {
        if (/@Mr\./.test(body)) notify(o, "external", userOf(author).name + " mentioned an outside contact on " + code, body.slice(0, 140), id, author, when, rnd() < 0.6, { external: "Mr. Bhatia" });
        else notify(o, "comment", "New comment on " + code, body.slice(0, 140), id, author, when, rnd() < 0.6);
      });
    }

    /* files */
    if (status !== "To Do" && rnd() < 0.55) {
      const names2 = FILE_NAMES[category] || FILE_NAMES["Custom/ remark"];
      const n = 1 + Math.floor(rnd() * Math.min(2, names2.length));
      for (let f = 0; f < n; f++) {
        const fileName = names2[f], by = pick(people), when = at(-rnd() * Math.max(1, -startDay));
        const ext = fileName.split(".").pop();
        db.attachments.push({ id: nextId("attachments"), taskId: id, projectId: task.projectId, fileName, mime: ext === "pdf" ? "application/pdf" : ext === "png" ? "image/png" : "image/jpeg",
          size: 40000 + Math.floor(rnd() * 900000), uploadedById: by, createdAt: dbDateTime(when), dataUrl: null });
        event(id, by, "file", "Uploaded " + fileName, when);
        log(by, "uploaded " + fileName + " to " + code, when);
      }
    }
  });
  db.seq.tasks = TASKS.length; db.counters.task = 100 + TASKS.length;

  /* ---------- deals ---------- */
  DEALS.forEach((d, i) => {
    const created = at(-20 - rnd() * 60, 12);
    db.deals.push({ id: i + 1, code: d.code, name: d.name, account: d.account, ownerId: d.ownerId, createdById: d.createdById, stage: d.stage,
      value: d.value, probability: d.probability, closeDate: day(d.close), notes: d.notes, createdAt: dbDateTime(created), updatedAt: dbDateTime(at(-rnd() * 15)) });
    log(d.createdById, "created deal " + d.name, created);
    audit(d.createdById, "create", "deal", d.code, null, { name: d.name, account: d.account, owner_id: d.ownerId, stage: "Discovery", value: d.value }, "Created deal " + d.code + " - " + d.name, created);
    if (d.ownerId !== d.createdById) notify(d.ownerId, "external", "New deal for you: " + d.name, "Client: " + d.account + " (outside contact) - Stage " + d.stage, null, d.createdById, created, true, { external: d.account });
  });
  db.seq.deals = DEALS.length; db.counters.deal = DEALS.length + 1;

  /* ---------- sign-ins, profile and permission changes (activity log) ---------- */
  db.users.filter(u => !u.deletedAt && u.status !== "Inactive").forEach(u => {
    for (let k = 0; k < 6; k++) { const when = at(-rnd() * 35, 9); log(u.id, "signed in", when); audit(u.id, "login", "auth", u.id, null, null, "Signed in", when); }
  });
  audit(1, "permissions", "user", 6, { permissions: [] }, { permissions: ["workload.team", "activity.team", "view_reports"], added: ["activity.team", "view_reports"], removed: [] },
    "Changed permissions of Ananya Iyer (+activity.team, view_reports)", at(-22, 12));
  audit(1, "permissions", "user", 15, null, { added: ["deals.view", "deals.edit"], removed: [] }, "Changed permissions of Riya Choudhary (+deals.view, deals.edit)", at(-18, 16));
  notify(6, "account", "Your access was updated", "Aarav Mehta changed your permissions. The menu is updated for you.", null, 1, at(-22, 12), true);
  audit(2, "update", "user", 13, { status: "Active" }, { status: "On Leave" }, "Updated user Kavya Desai", at(-3, 10));
  audit(2, "create", "user", 22, null, { name: "Farhan Qureshi", email: "farhan@the10xagency.in", role: "Employee", department: "E-commerce", status: "Active", reports_to_id: 20 }, "Added user Farhan Qureshi as Employee", at(-12, 11));
  log(2, "added Farhan Qureshi as Employee", at(-12, 11));
  audit(4, "file_delete", "attachment", 900, { task: "TK-104", file: "old-header.png" }, { recycle_bin_id: 3 }, "Moved file old-header.png to the Recycle Bin", at(-4, 13));

  /* ---------- recycle bin ---------- */
  const bin = (module, originalId, label, snapshot, deletedById, daysAgo, extra) => db.recycle.push(Object.assign({
    id: nextId("recycle"), module, originalId: String(originalId), label, snapshot, fileCount: snapshot.attachments ? snapshot.attachments.length : 0,
    deletedById, deletionReason: "", restoreStatus: "deleted", deletedAt: dbDateTime(at(-daysAgo, 14)),
    purgeAt: dbDateTime(at(30 - daysAgo, 14)), restoredAt: null, restoredById: null, purgedAt: null, purgedById: null
  }, extra || {}));
  const deletedTask = {
    task: { id: 900, code: "TK-099", title: "Duplicate: Home page banner sizes", description: "Created twice by mistake.", projectId: 1, category: "Web development", categoryNote: "",
      createdById: 11, priority: "Low", status: "To Do", startDate: day(-9), dueDate: day(-2), estimatedHours: 1, spentHours: 0, tags: ["design"], progress: 0,
      completedAt: null, assigneeIds: [11], createdAt: dbDateTime(at(-9, 10)), updatedAt: dbDateTime(at(-9, 10)) },
    subtasks: [{ id: 9001, taskId: 900, title: "Check sizes", isDone: false }], comments: [], attachments: [], timeline: []
  };
  bin("task", "TK-099", "TK-099 - Duplicate: Home page banner sizes", deletedTask, 4, 2);
  bin("deal", "D-0", "D-0 - Test deal (please ignore)", { deal: { id: 900, code: "D-0", name: "Test deal (please ignore)", account: "Test", ownerId: 5, createdById: 5, stage: "Discovery",
    value: 1000, probability: 10, closeDate: day(10), notes: "", createdAt: dbDateTime(at(-15, 11)), updatedAt: dbDateTime(at(-15, 11)) } }, 5, 9);
  bin("attachment", "900", "old-header.png (TK-104)", { attachment: { id: 900, taskId: 4, projectId: 1, fileName: "old-header.png", mime: "image/png", size: 182000, uploadedById: 12,
    createdAt: dbDateTime(at(-8, 12)), dataUrl: null } }, 4, 4);
  const gaurav = db.users.find(u => u.id === 23);
  bin("user", "23", "Gaurav Mishra (gaurav@the10xagency.in)", { user: { id: 23, reportsToId: 6, status: "Active", isSuperAdmin: false }, members: [2], permissions: {}, reports: [] }, 2, 6);
  gaurav.reportsToId = null;
  bin("task", "TK-098", "TK-098 - Old onboarding checklist", { task: { id: 901, code: "TK-098" } }, 2, 12,
    { restoreStatus: "restored", restoredAt: dbDateTime(at(-11, 10)), restoredById: 2 });
  bin("project", "P-00", "P-00 - Pilot project (0 tasks)", { project: { id: 902, code: "P-00" }, tasks: [] }, 1, 35,
    { restoreStatus: "purged", purgedAt: dbDateTime(at(-5, 2)), purgedById: null });
  log(4, "deleted task TK-099 - Duplicate: Home page banner sizes", at(-2, 14));
  audit(4, "delete", "task", "TK-099", { title: "Duplicate: Home page banner sizes", status: "To Do" }, { recycle_bin_id: 1 }, "Moved task TK-099 - Duplicate: Home page banner sizes to the Recycle Bin", at(-2, 14));
  audit(2, "delete", "user", 23, { name: "Gaurav Mishra", email: "gaurav@the10xagency.in", role: "Employee" }, { recycle_bin_id: 4 }, "Moved user Gaurav Mishra to the Recycle Bin", at(-6, 14));

  /* ---------- password reset requests ---------- */
  const reqAt = new Date(now.getTime() - 2 * 3600000);
  db.pwResets.push({ id: 1, userId: 9, status: "Pending", priority: "High", requestCount: 2, requestedAt: dbDateTime(reqAt), lastRequestedAt: dbDateTime(new Date(now.getTime() - 40 * 60000)),
    lastNotifiedAt: dbDateTime(new Date(now.getTime() - 40 * 60000)), reminderCount: 2, openedAt: null, openedById: null, adminAction: "", completedAt: null, completedById: null, note: "" });
  db.pwResets.push({ id: 2, userId: 8, status: "Completed", priority: "High", requestCount: 1, requestedAt: dbDateTime(at(-10, 9)), lastRequestedAt: dbDateTime(at(-10, 9)),
    lastNotifiedAt: dbDateTime(at(-10, 9)), reminderCount: 0, openedAt: dbDateTime(at(-10, 10)), openedById: 2, adminAction: "temporary_password", completedAt: dbDateTime(at(-10, 10)), completedById: 2, note: "" });
  db.pwResets.push({ id: 3, userId: 16, status: "Rejected", priority: "High", requestCount: 1, requestedAt: dbDateTime(at(-25, 18)), lastRequestedAt: dbDateTime(at(-25, 18)),
    lastNotifiedAt: dbDateTime(at(-25, 18)), reminderCount: 1, openedAt: dbDateTime(at(-25, 19)), openedById: 1, adminAction: "rejected", completedAt: dbDateTime(at(-25, 19)), completedById: 1, note: "Account closed, employee has left." });
  db.seq.pwResets = 3;
  [1, 2].forEach(admin => notify(admin, "pwreset", "HIGH PRIORITY reminder: password reset still pending", "Arjun Nair (arjun@the10xagency.in) requested a password reset.",
    null, 9, new Date(now.getTime() - 40 * 60000), false, { resetId: 1 }));
  audit(null, "password_reset_request", "auth", "PR-1", null, { status: "Pending", priority: "High" }, "Password reset requested", reqAt);

  /* newest first, like the database queries */
  ["notifications", "activity", "audit"].forEach(t => db[t].sort((a, b) => a.createdAt < b.createdAt ? -1 : 1).forEach((r, k) => { r.id = k + 1; }));
  db.seq.notifications = db.notifications.length; db.seq.activity = db.activity.length; db.seq.audit = db.audit.length;
  return db;
}

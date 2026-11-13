/* Tasks: details, create / edit, status, delete (to the Recycle Bin), checklist, comments with @mentions, files. */
import { getDb, nextId, nowStamp, fileBlobs } from "../mockDb.js";
import { LIMITS, TASK_CATEGORIES, TASK_PRIORITIES, TASK_STATUSES, CATEGORY_CUSTOM, OWN_FILE_DELETE_HOURS, MAX_UPLOAD_BYTES, RECYCLE_DAYS } from "../../data/settings.js";
import * as rules from "../rules.js";
import { dbDateTime } from "../../data/seed.js";
import { fail, deny, cleanText, textField, numberField, pick, dateOrNull, idList, logActivity, audit, auditDiff, taskEvent, notify,
  findTaskForUser, projectById, categoryLabel, recalcProgress, attachmentOut, validateUpload } from "./shared.js";

const binEntry = (user, module, originalId, label, snapshot) => {
  const now = new Date(), purge = new Date(now.getTime() + RECYCLE_DAYS * 86400000);
  const entry = { id: nextId("recycle"), module, originalId: String(originalId), label, snapshot, fileCount: (snapshot.attachments || []).length,
    deletedById: user.id, deletionReason: "", restoreStatus: "deleted", deletedAt: nowStamp(), purgeAt: dbDateTime(purge),
    restoredAt: null, restoredById: null, purgedAt: null, purgedById: null };
  getDb().recycle.push(entry);
  return entry.id;
};
export { binEntry };

/* everything about one task that the database keeps, for the Recycle Bin */
export function snapshotTask(task) {
  const db = getDb();
  return { task: JSON.parse(JSON.stringify(task)), subtasks: db.subtasks.filter(s => s.taskId === task.id), comments: db.comments.filter(c => c.taskId === task.id),
    attachments: db.attachments.filter(a => a.taskId === task.id), timeline: db.taskActivity.filter(e => e.taskId === task.id) };
}
export function removeTaskRows(task) {
  const db = getDb(), keep = list => list.filter(r => r.taskId !== task.id);
  db.tasks = db.tasks.filter(t => t.id !== task.id);
  db.subtasks = keep(db.subtasks); db.comments = keep(db.comments); db.attachments = keep(db.attachments); db.taskActivity = keep(db.taskActivity);
  db.notifications = db.notifications.filter(n => n.taskId !== task.id);
}

/* people who can open the task, so they can be @mentioned */
function mentionable(task) {
  return getDb().users.filter(rules.isAssignableState).filter(x => rules.canAccessTask(x, task))
    .map(x => ({ id: x.id, name: x.name, designation: x.designation || x.role, avatar: x.avatar || "" }));
}

export function taskDetail({ id }, user) {
  const task = findTaskForUser(id, user), db = getDb(), project = task.projectId ? projectById(task.projectId) : null;
  const filesAllowed = rules.hasPerm(user, "files.view");
  return { ok: true, data: {
    task: { id: task.code, dbId: task.id, title: task.title, description: task.description, project: project ? project.code : "", category: task.category,
      categoryNote: task.categoryNote || "", categoryLabel: categoryLabel(task.category, task.categoryNote), assigneeIds: task.assigneeIds.slice(), createdById: task.createdById,
      priority: task.priority, status: task.status, startDate: task.startDate || "", due: task.dueDate || "", hours: task.estimatedHours, spent: task.spentHours,
      tags: rules.hasPerm(user, "tags.view") ? task.tags.slice() : [], progress: task.progress, completedAt: task.completedAt || "", createdAt: task.createdAt, updatedAt: task.updatedAt,
      can: { manage: rules.canManageTask(user, task) && rules.hasPerm(user, "tasks.edit"), edit: rules.canFullEditTask(user, task), update: rules.canUpdateTask(user, task),
        delete: rules.canDeleteTask(user, task), tagAdd: rules.hasPerm(user, "tags.edit"), tagRemove: rules.hasPerm(user, "tags.delete"),
        files: filesAllowed, upload: rules.hasPerm(user, "files.edit") && rules.canEditTask(user, task) } },
    subtasks: db.subtasks.filter(s => s.taskId === task.id).map(s => ({ id: s.id, title: s.title, done: s.isDone ? 1 : 0 })),
    comments: db.comments.filter(c => c.taskId === task.id).sort((a, b) => a.id - b.id).map(c => ({ id: c.id, authorId: c.authorId, author: rules.userName(c.authorId),
      body: c.body, at: c.createdAt.slice(0, 16), mentions: c.mentions.map(m => ({ id: m, name: rules.userName(m) })) })),
    attachments: filesAllowed ? db.attachments.filter(a => a.taskId === task.id).sort((a, b) => b.id - a.id).map(attachmentOut) : [],
    timeline: db.taskActivity.filter(e => e.taskId === task.id).sort((a, b) => b.id - a.id).slice(0, 100)
      .map(e => ({ userId: e.userId, who: rules.userName(e.userId), action: e.action, detail: e.detail, at: e.createdAt.slice(0, 16) })),
    mentionable: mentionable(task)
  } };
}

/* ---------------- tags and checklist from the form ---------------- */
function cleanTags(list) {
  if (!Array.isArray(list)) return [];
  const out = [], seen = {};
  list.forEach(raw => {
    const tag = cleanText(raw).replace(/\s+/g, " ").replace(/^#+/, "");
    if (!tag) return;
    if (Array.from(tag).length > LIMITS.tag[1]) fail("Tag \"" + tag.slice(0, 40) + "...\" is too long. A tag can be at most " + LIMITS.tag[1] + " characters.", { field: "tags" });
    if (/[<>]/.test(tag)) fail("A tag cannot contain < or >.", { field: "tags" });
    if (seen[tag.toLowerCase()]) return;
    seen[tag.toLowerCase()] = 1; out.push(tag);
  });
  if (out.length > LIMITS.tags_max) fail("A task can have at most " + LIMITS.tags_max + " tags.", { field: "tags" });
  return out;
}
const checklistKey = title => title.trim().replace(/\s+/g, " ").toLowerCase();
function syncChecklist(task, list) {
  if (list.length > LIMITS.checklist_max) fail("A task can have at most " + LIMITS.checklist_max + " checklist items.", { field: "checklist" });
  const seen = {}, clean = list.map(item => {
    const title = textField(item && typeof item === "object" ? item.title : item, "Checklist item", LIMITS.checklist[0], LIMITS.checklist[1], "checklist");
    if (seen[checklistKey(title)]) fail("The checklist item \"" + title + "\" is listed twice. Each item must be unique.", { field: "checklist" });
    seen[checklistKey(title)] = 1;
    return { id: item && typeof item === "object" ? Number(item.id) || 0 : 0, title, done: !!(item && item.done) };
  });
  const db = getDb(), existing = db.subtasks.filter(s => s.taskId === task.id), keep = [];
  clean.forEach(c => {
    const row = c.id && existing.find(s => s.id === c.id);
    if (row) { row.title = c.title; row.isDone = c.done; keep.push(row.id); }
    else db.subtasks.push({ id: nextId("subtasks"), taskId: task.id, title: c.title, isDone: c.done });
  });
  db.subtasks = db.subtasks.filter(s => s.taskId !== task.id || keep.indexOf(s.id) !== -1 || !existing.some(e => e.id === s.id));
  recalcProgress(task);
}
function projectIdFor(user, code) {
  const value = cleanText(code);
  if (!value) return null;
  const project = getDb().projects.find(p => p.code === value);
  if (!project) fail("That project does not exist. Please pick a project from the list.", { field: "project" });
  if (!rules.isAdmin(user) && !rules.hasPerm(user, "manage_projects") && !rules.canSeeProject(user, project)) fail("You are not part of that project. Please pick a project from the list.", { field: "project" });
  return project.id;
}

/* ---------------- create / edit ---------------- */
export function saveTask({ data }, user) {
  const form = data && typeof data === "object" ? data : {};
  const code = cleanText(form.id);
  const old = code ? findTaskForUser(code, user) : null;
  const manage = old ? rules.canManageTask(user, old) : true;
  if (old && !manage && !rules.isTaskAssignee(user, old)) deny("You can only change tasks you created, tasks of your team, or tasks assigned to you.");
  if (!rules.hasPerm(user, "tasks.edit")) deny(old ? "You do not have permission to edit tasks." : "You do not have permission to create tasks.");

  const title = textField(form.title, "Task title", LIMITS.task_title[0], LIMITS.task_title[1], "title");
  let status = pick(form.status, TASK_STATUSES, old ? old.status : "To Do");
  /* a field the form did not send keeps its current value (someone else may have just changed it) */
  const tags = rules.hasPerm(user, "tags.view") && (!old || "tags" in form) ? cleanTags(form.tags || []) : (old ? old.tags.slice() : []);
  const spent = "spent" in form ? numberField(form.spent, "Hours spent", 0, LIMITS.hours[1], "spent") : (old ? old.spentHours : 0);
  if (old && !rules.hasPerm(user, "tasks.update")) {
    if (status !== old.status) deny("You do not have permission to change the task status.");
    if (Math.abs(spent - old.spentHours) > 0.001) deny("You do not have permission to log hours on tasks.");
  }
  const lower = list => list.map(t => t.toLowerCase());
  const tagsAdded = tags.filter(t => lower(old ? old.tags : []).indexOf(t.toLowerCase()) === -1);
  const tagsRemoved = (old ? old.tags : []).filter(t => lower(tags).indexOf(t.toLowerCase()) === -1);
  if (tagsAdded.length && !rules.hasPerm(user, "tags.edit")) deny("You do not have permission to add tags.");
  if (tagsRemoved.length && !rules.hasPerm(user, "tags.delete")) deny("You do not have permission to remove tags.");

  let description, priority, start, due, hours, category, note, projectId, assignees;
  if (manage) {
    description = textField(form.description, "Description", LIMITS.task_desc[0], LIMITS.task_desc[1], "description");
    priority = pick(form.priority, TASK_PRIORITIES, "Medium");
    start = dateOrNull(form.startDate); due = dateOrNull(form.due);
    if (!start) fail(String(form.startDate || "").trim() ? "Start date is not a valid date." : "Start date is required.", { field: "start" });
    if (!due) fail(String(form.due || "").trim() ? "End date (due date) is not a valid date." : "End date (due date) is required.", { field: "due" });
    if (due < start) fail("End date cannot be earlier than the start date.", { field: "due" });
    hours = numberField(form.hours === undefined ? 0 : form.hours, "Estimated hours", 0, LIMITS.hours[1], "hours");
    category = String(form.category || "");
    if (TASK_CATEGORIES.indexOf(category) === -1) fail("Please choose a project category from the list.", { field: "category" });
    note = category === CATEGORY_CUSTOM ? textField(form.categoryNote, "Custom category / remark", LIMITS.category_note[0], LIMITS.category_note[1], "categoryNote") : "";
    if (/[<>]/.test(note)) fail("Category cannot contain < or >.", { field: "categoryNote" });
    projectId = projectIdFor(user, form.project);
    assignees = rules.canAssignOthers(user) ? idList(form.assigneeIds) : (old ? old.assigneeIds.slice() : [user.id]);
    if (!assignees.length) fail("Please choose at least one assignee.", { field: "assignees" });
    assignees.forEach(id => {
      if (old && old.assigneeIds.indexOf(id) !== -1) return;          // already on the task
      if (!rules.canAssignTo(user, id)) {
        const target = rules.userRow(id);
        const why = !rules.isAssignableState(target) ? "is not an active member" : rules.userRank(target) > rules.userRank(user) ? "has a higher designation than you" : "is not in your team";
        fail((target ? target.name : "This person") + " " + why + ", so you cannot assign this task to them.", { field: "assignees" });
      }
    });
  } else {
    /* assignee of a task outside their team: title, status, tags, checklist and hours spent only */
    ({ description, priority, startDate: start, dueDate: due, estimatedHours: hours, category, categoryNote: note, projectId } = old);
    assignees = old.assigneeIds.slice();
  }

  if (old) {
    if (status !== old.status && (status === "Cancelled" || old.status === "Cancelled") && !rules.isSuper(user)) fail("Only the Super Admin can cancel a task or reopen a cancelled task.", { field: "status" });
    const before = JSON.parse(JSON.stringify(old));
    Object.assign(old, { title, description, projectId, category, categoryNote: note, priority, status, startDate: start, dueDate: due, estimatedHours: hours,
      spentHours: spent, tags, assigneeIds: assignees, updatedAt: nowStamp(),
      completedAt: status === "Completed" ? (before.status === "Completed" ? before.completedAt : nowStamp()) : null });
    if (Array.isArray(form.subtasks)) syncChecklist(old, form.subtasks); else recalcProgress(old);
    if (before.title !== title) taskEvent(old.id, user, "edited", "Title changed to \"" + title + "\"");
    if (before.status !== status) taskEvent(old.id, user, "status", "Status changed to " + status);
    if (before.priority !== priority) taskEvent(old.id, user, "priority", "Priority changed to " + priority);
    if (before.dueDate !== due) taskEvent(old.id, user, "due_date", "Due date changed to " + (due || "none"));
    const added = assignees.filter(a => before.assigneeIds.indexOf(a) === -1), removed = before.assigneeIds.filter(a => assignees.indexOf(a) === -1);
    if (added.length || removed.length) taskEvent(old.id, user, "assigned", "Assigned to " + assignees.map(rules.userName).join(", "));
    added.forEach(a => { if (a !== user.id) notify(a, "assigned", "New task assigned to you", title + " - " + priority, old.id, user.id); });
    if (before.status !== status) Array.from(new Set(assignees.concat([old.createdById]))).forEach(who => {
      if (who !== user.id) notify(who, "status", "Task status changed", code + " - " + title + " moved to " + status, old.id, user.id);
    });
    logActivity(user, "updated " + code + " - " + title);
    const pickFields = t => ({ title: t.title, description: t.description, project_id: t.projectId, category: categoryLabel(t.category, t.categoryNote), assignee_ids: t.assigneeIds,
      priority: t.priority, status: t.status, start_date: t.startDate, due_date: t.dueDate, estimated_hours: t.estimatedHours, spent_hours: t.spentHours, tags: t.tags });
    const [oldValue, newValue] = auditDiff(pickFields(before), pickFields(old));
    audit(user, "update", "task", code, oldValue, Array.isArray(form.subtasks) ? Object.assign(newValue || {}, { checklist: "saved from the edit form" }) : newValue, "Updated task " + code + " - " + title);
    tagsAdded.forEach(t => audit(user, "tag_add", "tag", code, null, { tag: t }, "Added tag #" + t + " to " + code));
    tagsRemoved.forEach(t => audit(user, "tag_remove", "tag", code, { tag: t }, null, "Removed tag #" + t + " from " + code));
    return { ok: true, id: code, created: false };
  }

  if (status === "Cancelled" && !rules.isSuper(user)) fail("Only the Super Admin can cancel a task.", { field: "status" });
  if (!rules.canAssignOthers(user)) status = "To Do";
  const db = getDb();
  db.counters.task = Math.max(db.counters.task || 100, ...db.tasks.map(t => Number(t.code.slice(3)) || 0)) + 1;
  const newCode = "TK-" + db.counters.task;
  const task = { id: nextId("tasks"), code: newCode, title, description, projectId, category, categoryNote: note, createdById: user.id, priority, status,
    startDate: start, dueDate: due, estimatedHours: hours, spentHours: spent, tags, progress: 0, completedAt: status === "Completed" ? nowStamp() : null,
    assigneeIds: assignees, createdAt: nowStamp(), updatedAt: nowStamp() };
  db.tasks.push(task);
  if (Array.isArray(form.subtasks)) syncChecklist(task, form.subtasks); else recalcProgress(task);
  const names = assignees.map(rules.userName).join(", ");
  taskEvent(task.id, user, "created", "Task created");
  taskEvent(task.id, user, "assigned", "Assigned to " + names);
  assignees.forEach(a => { if (a !== user.id) notify(a, "assigned", "New task assigned to you", title + " - " + priority, task.id, user.id); });
  logActivity(user, "created " + newCode + " and assigned it to " + names);
  audit(user, "create", "task", newCode, null, { title, project_id: projectId, category: categoryLabel(category, note), assignee_ids: assignees, priority, status, start_date: start, due_date: due },
    "Created task " + newCode + " - " + title);
  tagsAdded.forEach(t => audit(user, "tag_add", "tag", newCode, null, { tag: t }, "Added tag #" + t + " to " + newCode));
  return { ok: true, id: newCode, created: true };
}

export function setTaskStatus({ id, status }, user) {
  if (!id || TASK_STATUSES.indexOf(status) === -1) fail("A task and a valid status are required.");
  const task = findTaskForUser(id, user);
  if (!rules.canEditTask(user, task)) deny("Only the assignees, the creator's team or a Manager of the task can change its status.");
  if (!rules.hasPerm(user, "tasks.update")) deny("You do not have permission to change the task status.");
  if (task.status === status) return { ok: true };
  if ((status === "Cancelled" || task.status === "Cancelled") && !rules.isSuper(user)) fail("Only the Super Admin can cancel a task or reopen a cancelled task.");
  const was = task.status;
  Object.assign(task, { status, completedAt: status === "Completed" ? nowStamp() : null, updatedAt: nowStamp() });
  recalcProgress(task);
  taskEvent(task.id, user, "status", "Status changed to " + status);
  logActivity(user, "moved " + task.code + " to " + status);
  audit(user, "status", "task", task.code, { status: was }, { status }, task.code + " moved to " + status);
  Array.from(new Set(task.assigneeIds.concat([task.createdById]))).forEach(who => {
    if (who !== user.id) notify(who, "status", "Task status changed", task.code + " - " + task.title + " moved to " + status, task.id, user.id);
  });
  return { ok: true };
}

export function deleteTask({ id }, user) {
  const task = findTaskForUser(id, user);
  if (!rules.canDeleteTask(user, task)) deny("Only the person who created this task, their Manager, or an Admin can delete it.");
  const binId = binEntry(user, "task", task.code, task.code + " - " + task.title, snapshotTask(task));
  removeTaskRows(task);
  logActivity(user, "deleted task " + task.code + " - " + task.title);
  audit(user, "delete", "task", task.code, { title: task.title, status: task.status }, { recycle_bin_id: binId }, "Moved task " + task.code + " - " + task.title + " to the Recycle Bin");
  return { ok: true, recycled: true };
}

/* ---------------- checklist on the task page ---------------- */
export function subtask({ op, task: code, subId, title }, user) {
  const task = findTaskForUser(code, user), db = getDb();
  if (!rules.canUpdateTask(user, task)) deny("You cannot change the checklist of this task.");
  const items = db.subtasks.filter(s => s.taskId === task.id), item = items.find(s => s.id === Number(subId));
  const duplicate = (text, exceptId) => items.some(s => s.id !== exceptId && checklistKey(s.title) === checklistKey(text));
  if (op === "add") {
    const text = textField(title, "Checklist item", LIMITS.checklist[0], LIMITS.checklist[1], "checklist");
    if (items.length >= LIMITS.checklist_max) fail("A task can have at most " + LIMITS.checklist_max + " checklist items.");
    if (duplicate(text, 0)) fail("This checklist item already exists on the task.", { field: "checklist" });
    db.subtasks.push({ id: nextId("subtasks"), taskId: task.id, title: text, isDone: false });
    taskEvent(task.id, user, "checklist", "Added checklist item: " + text);
    audit(user, "checklist_add", "task", task.code, null, { item: text }, "Added checklist item on " + task.code);
  } else if (op === "toggle") {
    if (!item) fail("Checklist item not found.");
    item.isDone = !item.isDone;
    audit(user, "checklist_toggle", "task", task.code, { item: item.title, done: item.isDone ? 0 : 1 }, { item: item.title, done: item.isDone ? 1 : 0 }, "Ticked/unticked checklist item on " + task.code);
  } else if (op === "edit") {
    if (!item) fail("Checklist item not found.");
    const text = textField(title, "Checklist item", LIMITS.checklist[0], LIMITS.checklist[1], "checklist");
    if (duplicate(text, item.id)) fail("This checklist item already exists on the task.", { field: "checklist" });
    audit(user, "checklist_edit", "task", task.code, { item: item.title }, { item: text }, "Edited checklist item on " + task.code);
    item.title = text;
  } else if (op === "delete") {
    if (item) {
      db.subtasks = db.subtasks.filter(s => s !== item);
      taskEvent(task.id, user, "checklist", "Removed checklist item: " + item.title);
      audit(user, "checklist_delete", "task", task.code, { item: item.title }, null, "Removed checklist item on " + task.code);
    }
  } else fail("Unknown checklist action.");
  task.updatedAt = nowStamp();
  recalcProgress(task);
  return { ok: true };
}

/* ---------------- comments ---------------- */
/* ids picked from the @ list are kept only when "@Name" is really in the text; typed "@Full Name" is matched too */
function findMentions(text, people, sentIds) {
  const low = text.toLowerCase(), found = [];
  if (text.indexOf("@") === -1) return found;
  sentIds.forEach(id => { const p = people.find(x => x.id === id); if (p && low.indexOf("@" + p.name.toLowerCase()) !== -1 && found.indexOf(id) === -1) found.push(id); });
  people.slice().sort((a, b) => b.name.length - a.name.length).forEach(p => {
    if (found.indexOf(p.id) !== -1) return;
    const needle = "@" + p.name.toLowerCase(), at = low.indexOf(needle);
    if (at === -1) return;
    const next = low.charAt(at + needle.length);
    const sameName = people.filter(o => o.name.toLowerCase() === p.name.toLowerCase()).length === 1;
    if ((!next || !/[\p{L}\p{N}]/u.test(next)) && sameName) found.push(p.id);
  });
  return found;
}
/* "@Name" of someone who is not a CRM user (a client): capitalised names only, never a CRM user's name */
function findOutsideContacts(text) {
  const matches = text.match(/(?<![\p{L}\p{N}._%+-])@(\p{Lu}[\p{L}.'-]{1,29}(?: \p{Lu}[\p{L}.'-]{1,29})?)/gu) || [];
  const known = [];
  getDb().users.forEach(x => { const n = x.name.toLowerCase().trim(); known.push(n, n.split(" ")[0]); });
  const out = {};
  matches.forEach(m => {
    const candidate = m.slice(1).replace(/[.'-]+$/, ""), low = candidate.toLowerCase(), first = low.split(" ")[0];
    const internal = known.some(k => k === low || k === first || k.indexOf(low) === 0 || low.indexOf(k + " ") === 0);
    if (!internal) out[low] = candidate;
  });
  return Object.values(out).slice(0, 5);
}
export function comment({ task: code, body, mentions }, user) {
  const task = findTaskForUser(code, user);
  if (!rules.hasPerm(user, "tasks.update")) deny("You do not have permission to comment on tasks.");
  const text = textField(body, "Comment", LIMITS.comment[0], LIMITS.comment[1], "comment");
  const found = findMentions(text, mentionable(task), idList(mentions));
  getDb().comments.push({ id: nextId("comments"), taskId: task.id, authorId: user.id, body: text, mentions: found, createdAt: nowStamp() });
  taskEvent(task.id, user, "comment", "Comment added");
  task.updatedAt = nowStamp();
  const snippet = text.slice(0, 140);
  found.forEach(who => { if (who !== user.id) notify(who, "mention", user.name + " mentioned you on " + task.code, snippet, task.id, user.id); });
  const outside = findOutsideContacts(text);
  Array.from(new Set(task.assigneeIds.concat([task.createdById]))).forEach(who => {
    if (who === user.id || found.indexOf(who) !== -1) return;
    if (outside.length) notify(who, "external", user.name + " mentioned an outside contact on " + task.code, snippet, task.id, user.id, { external: outside.join(", ") });
    else notify(who, "comment", "New comment on " + task.code, snippet, task.id, user.id);
  });
  logActivity(user, "commented on " + task.code);
  audit(user, "comment", "task", task.code, null, { comment: text, mentioned_ids: found, outside_contacts: outside }, "Commented on " + task.code);
  return { ok: true, mentioned: found.map(rules.userName), external: outside };
}

/* ---------------- files ---------------- */
export function upload({ task: code, name, mime, data }, user) {
  const task = findTaskForUser(code, user);
  if (!rules.canEditTask(user, task) || !rules.hasPerm(user, "files.edit")) deny("You cannot add files to this task.");
  const file = validateUpload(name, mime, data, MAX_UPLOAD_BYTES);
  const attachment = { id: nextId("attachments"), taskId: task.id, projectId: task.projectId, fileName: file.name, mime: file.mime, size: file.bytes,
    uploadedById: user.id, createdAt: nowStamp(), dataUrl: data, uploaded: true };
  getDb().attachments.push(attachment);
  taskEvent(task.id, user, "file", "Uploaded " + file.name);
  task.assigneeIds.forEach(who => { if (who !== user.id) notify(who, "file", "New file added to your task", file.name, task.id, user.id); });
  logActivity(user, "uploaded " + file.name + " to " + task.code);
  audit(user, "file_upload", "attachment", attachment.id, null, { task: task.code, file: file.name, mime: file.mime, bytes: file.bytes, storage: "browser" }, "Uploaded " + file.name + " to " + task.code);
  return { ok: true, name: file.name, id: attachment.id };
}
/* returns the file itself: uploaded content, or a generated stand-in for the demo's sample files */
export function download({ id }, user) {
  const db = getDb(), attachment = db.attachments.find(a => a.id === Number(id));
  if (!attachment) fail("File not found.");
  const task = db.tasks.find(t => t.id === attachment.taskId);
  findTaskForUser(task && task.code, user);
  if (!rules.hasPerm(user, "files.view")) deny("You do not have permission to download files.");
  const dataUrl = attachment.dataUrl || fileBlobs.get(attachment.id) || null;
  /* only the demo's own sample files have no content; a real upload without it was too big to keep after a reload */
  if (!dataUrl && attachment.uploaded) fail("This file was too big to keep in this browser after the page was reloaded. Please upload it again.");
  return { ok: true, file: { name: attachment.fileName, mime: attachment.mime, dataUrl } };
}
export function deleteAttachment({ id, task: code }, user) {
  const db = getDb(), attachment = db.attachments.find(a => a.id === Number(id));
  if (!attachment) fail("File not found.");
  const task = db.tasks.find(t => t.id === attachment.taskId);
  if (code && task && code !== task.code) deny("This file does not belong to that task.");
  if (!rules.canAccessTask(user, task)) deny("You do not have access to this task.");
  if (!rules.hasPerm(user, "files.delete")) {
    if (!rules.hasPerm(user, "files.edit")) deny("You do not have permission to remove files.");
    if (attachment.uploadedById !== user.id) deny("Only the person who uploaded this file, or a Manager, can remove it.");
    const fresh = Date.now() - new Date(attachment.createdAt.replace(" ", "T")).getTime() <= OWN_FILE_DELETE_HOURS * 3600000;
    if (!rules.canManageTask(user, task) && (!fresh || !["To Do", "In Progress", "On Hold", "Review"].includes(task.status)))
      deny("You can remove your own file only within " + OWN_FILE_DELETE_HOURS + " hours of uploading it, while the task is open. Ask a Manager.");
  }
  const binId = binEntry(user, "attachment", attachment.id, attachment.fileName + " (" + task.code + ")", { attachment: Object.assign({}, attachment) });
  db.attachments = db.attachments.filter(a => a !== attachment);
  taskEvent(task.id, user, "file", "Removed " + attachment.fileName);
  logActivity(user, "removed file " + attachment.fileName + " from " + task.code);
  audit(user, "file_delete", "attachment", attachment.id, { task: task.code, file: attachment.fileName }, { recycle_bin_id: binId }, "Moved file " + attachment.fileName + " to the Recycle Bin");
  return { ok: true, recycled: true };
}

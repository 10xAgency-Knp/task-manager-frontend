/* Projects and the sales pipeline (deals): create, edit, delete to the Recycle Bin. */
import { getDb, nextId, nowStamp } from "../mockDb.js";
import { LIMITS, PROJECT_STATUSES, DEAL_STAGES } from "../../data/settings.js";
import * as rules from "../rules.js";
import { fail, deny, cleanText, textField, numberField, pick, dateOrNull, idList, logActivity, audit, auditDiff, notify } from "./shared.js";
import { binEntry, snapshotTask, removeTaskRows } from "./tasks.js";

const money = value => numberField(String(value === undefined || value === null ? "" : value).replace(/[^0-9.]/g, "") || 0, "Budget", 0, 999999999999, "budget");

export function saveProject({ data }, user) {
  const form = data && typeof data === "object" ? data : {};
  const db = getDb(), code = cleanText(form.id), canEdit = rules.hasPerm(user, "projects.edit");
  if (!code && !canEdit) deny("You do not have permission to create projects.");
  const old = code ? db.projects.find(p => p.code === code) : null;
  if (code && !old) fail("Project not found.");
  if (old && !rules.canEditProject(user, old)) deny("You can edit only projects that you or your team own.");

  /* "Projects: Update" without "Edit": only status and progress can change */
  if (old && !canEdit) {
    const status = pick(form.status, PROJECT_STATUSES, old.status);
    const progress = status === "Completed" ? 100 : Math.round(numberField(form.progress === undefined ? old.progress : form.progress, "Progress", 0, 100, "progress"));
    const [oldValue, newValue] = auditDiff({ status: old.status, progress: old.progress }, { status, progress });
    Object.assign(old, { status, progress, updatedAt: nowStamp() });
    logActivity(user, "updated project " + old.name);
    audit(user, "update", "project", code, oldValue, newValue, "Updated status / progress of project " + code + " - " + old.name);
    return { ok: true, id: code, created: false, statusOnly: true };
  }

  const name = textField(form.name, "Project name", LIMITS.project_name[0], LIMITS.project_name[1], "name");
  if (/[<>]/.test(name)) fail("Project name cannot contain < or >.", { field: "name" });
  const duplicate = db.projects.find(p => p.name.trim().toLowerCase() === name.toLowerCase() && p !== old);
  if (duplicate) fail("A project with this name already exists (" + duplicate.code + ").", { field: "name" });
  const description = textField(form.description, "Description", LIMITS.project_desc[0], LIMITS.project_desc[1], "description");
  const ownerId = Number(form.ownerId) || 0;
  if (ownerId <= 0) fail("Please choose the project manager.", { field: "owner" });
  if (!rules.isAssignableState(rules.userRow(ownerId))) fail("The project manager must be an active member.", { field: "owner" });
  if (!rules.isAdmin(user) && !rules.inTeam(user, ownerId) && !(old && old.ownerId === ownerId)) fail("You can choose yourself or someone in your team as project manager.", { field: "owner" });
  let status = pick(form.status, PROJECT_STATUSES, "Planning");
  let progress = status === "Completed" ? 100 : Math.round(numberField(form.progress === undefined ? 0 : form.progress, "Progress", 0, 100, "progress"));
  if (old && !rules.hasPerm(user, "projects.update")) { status = old.status; progress = old.progress; }   // "Edit" without "Update"
  const start = dateOrNull(form.startDate), due = dateOrNull(form.due);
  if (!start) fail(String(form.startDate || "").trim() ? "Start date is not a valid date." : "Start date is required.", { field: "start" });
  if (!due) fail(String(form.due || "").trim() ? "End date (deadline) is not a valid date." : "End date (deadline) is required.", { field: "due" });
  if (due < start) fail("End date cannot be earlier than the start date.", { field: "due" });
  const budget = money(form.budget);
  const members = idList(form.memberIds).filter(id => rules.isAssignableState(rules.userRow(id)));
  if (members.length > 200) fail("A project can have at most 200 members.");

  const fields = { name, description, ownerId, status, progress, startDate: start, dueDate: due, budget, memberIds: members };
  if (old) {
    const shape = p => ({ name: p.name, description: p.description, owner_id: p.ownerId, status: p.status, progress: p.progress, start_date: p.startDate,
      due_date: p.dueDate, budget: p.budget, member_ids: p.memberIds.slice().sort((a, b) => a - b) });
    const [oldValue, newValue] = auditDiff(shape(old), shape(Object.assign({}, old, fields)));
    Object.assign(old, fields, { updatedAt: nowStamp() });
    logActivity(user, "updated project " + name);
    audit(user, "update", "project", code, oldValue, newValue, "Updated project " + code + " - " + name);
    return { ok: true, id: code, created: false };
  }
  db.counters.project = Math.max(db.counters.project || 0, ...db.projects.map(p => Number(p.code.slice(2)) || 0)) + 1;
  const newCode = "P-" + String(db.counters.project).padStart(2, "0");
  db.projects.push(Object.assign({ id: nextId("projects"), code: newCode, createdById: user.id, createdAt: nowStamp(), updatedAt: nowStamp() }, fields));
  logActivity(user, "created project " + name);
  audit(user, "create", "project", newCode, null, { name, owner_id: ownerId, status, member_ids: members }, "Created project " + newCode + " - " + name);
  return { ok: true, id: newCode, created: true };
}

export function deleteProject({ id }, user) {
  if (!rules.hasPerm(user, "projects.delete")) deny("You do not have permission to delete projects.");
  const db = getDb(), project = db.projects.find(p => p.code === String(id || ""));
  if (!project) fail("Project not found.");
  if (!rules.canDeleteProject(user, project)) deny("You can delete only projects that you or your team own.");
  const tasks = db.tasks.filter(t => t.projectId === project.id);
  const binId = binEntry(user, "project", project.code, project.code + " - " + project.name + " (" + tasks.length + " tasks)",
    { project: JSON.parse(JSON.stringify(project)), tasks: tasks.map(snapshotTask), attachments: [] });
  tasks.forEach(removeTaskRows);
  db.projects = db.projects.filter(p => p !== project);
  logActivity(user, "deleted project " + project.name);
  audit(user, "delete", "project", project.code, { name: project.name, status: project.status }, { recycle_bin_id: binId }, "Moved project " + project.code + " - " + project.name + " and its tasks to the Recycle Bin");
  return { ok: true, recycled: true };
}

/* ---------------- deals ---------------- */
export function saveDeal({ data }, user) {
  if (!rules.hasPerm(user, "deals.view")) deny("You do not have permission to manage deals.");
  const form = data && typeof data === "object" ? data : {};
  const db = getDb(), code = cleanText(form.id);
  if (!code && !rules.hasPerm(user, "deals.edit")) deny("You do not have permission to create deals.");
  let old = null;
  if (code) {
    if (!rules.canEditDeal(user)) deny("You do not have permission to change deals.");
    old = db.deals.find(d => d.code === code && rules.canSeeDeal(user, d));
    if (!old) fail("Deal not found.");
  }
  const name = textField(form.name, "Deal name", LIMITS.deal_name[0], LIMITS.deal_name[1], "name");
  const account = textField(form.account, "Account / client", 0, LIMITS.deal_account[1], "account");
  const notes = textField(form.notes, "Notes", 0, LIMITS.deal_notes[1], "notes");
  const ownerId = Number(form.ownerId) || user.id;
  if (!rules.isAssignableState(rules.userRow(ownerId))) fail("The owner must be an active member.", { field: "owner" });
  if (!rules.isAdmin(user) && !rules.inTeam(user, ownerId)) fail("You can choose yourself or someone in your team as the owner.", { field: "owner" });
  const stage = pick(form.stage, DEAL_STAGES, "Discovery");
  const value = numberField(String(form.value === undefined || form.value === null ? "" : form.value).replace(/[^0-9.]/g, "") || 0, "Value", 0, 999999999999, "value");
  let probability = Math.round(numberField(form.probability === undefined ? 0 : form.probability, "Probability", 0, 100, "probability"));
  if (stage === "Won") probability = 100;
  if (stage === "Lost") probability = 0;
  const fields = { name, account, ownerId, stage, value, probability, closeDate: dateOrNull(form.close), notes };
  if (old) {
    const shape = d => ({ name: d.name, account: d.account, owner_id: d.ownerId, stage: d.stage, value: d.value, probability: d.probability, close_date: d.closeDate, notes: d.notes });
    const [oldValue, newValue] = auditDiff(shape(old), shape(Object.assign({}, old, fields)));
    Object.assign(old, fields, { updatedAt: nowStamp() });
    logActivity(user, "updated deal " + name + " (" + stage + ")");
    audit(user, "update", "deal", code, oldValue, newValue, "Updated deal " + code + " - " + name);
    return { ok: true, id: code, created: false };
  }
  db.counters.deal = Math.max(db.counters.deal || 0, ...db.deals.map(d => Number(d.code.slice(2)) || 0)) + 1;
  const newCode = "D-" + db.counters.deal;
  db.deals.push(Object.assign({ id: nextId("deals"), code: newCode, createdById: user.id, createdAt: nowStamp(), updatedAt: nowStamp() }, fields));
  logActivity(user, "created deal " + name);
  if (ownerId !== user.id) notify(ownerId, account ? "external" : "assigned", "New deal for you: " + name,
    (account ? "Client: " + account + " (outside contact) - " : "") + "Stage " + stage, null, user.id, account ? { external: account } : null);
  audit(user, "create", "deal", newCode, null, { name, account, owner_id: ownerId, stage, value }, "Created deal " + newCode + " - " + name);
  return { ok: true, id: newCode, created: true };
}

export function deleteDeal({ id }, user) {
  if (!rules.canDeleteDeal(user)) deny("You do not have permission to delete deals.");
  const db = getDb(), deal = db.deals.find(d => d.code === String(id || "") && rules.canSeeDeal(user, d));
  if (!deal) fail("Deal not found.");
  const binId = binEntry(user, "deal", deal.code, deal.code + " - " + deal.name, { deal: Object.assign({}, deal) });
  db.deals = db.deals.filter(d => d !== deal);
  logActivity(user, "removed deal " + deal.name);
  audit(user, "delete", "deal", deal.code, { name: deal.name, stage: deal.stage, value: deal.value }, { recycle_bin_id: binId }, "Moved deal " + deal.code + " - " + deal.name + " to the Recycle Bin");
  return { ok: true, recycled: true };
}

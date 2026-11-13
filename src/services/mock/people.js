/* Members: add / edit / remove people, roles (Super Admin section) and per-person permissions. */
import { getDb, nextId, nowStamp } from "../mockDb.js";
import { LIMITS, PERMS, PERM_KEYS, PERM_ALIASES, ROLE_DEFAULTS, ROLE_LIMITS } from "../../data/settings.js";
import * as rules from "../rules.js";
import { fail, deny, cleanText, textField, pick, dateOrNull, passwordProblem, phoneProblem, emailProblem, logActivity, audit, auditDiff, notify } from "./shared.js";
import { binEntry } from "./tasks.js";
import { completeResetsFor } from "./admin.js";

const ROLES = ["Admin", "Manager", "Employee"];
const liveUsers = () => getDb().users.filter(rules.isLive);
const activeAdminCount = excludeId => liveUsers().filter(u => u.role === "Admin" && u.status === "Active" && u.id !== excludeId).length;
const superCount = excludeId => liveUsers().filter(u => u.isSuperAdmin && u.role === "Admin" && u.status !== "Inactive" && u.id !== excludeId).length;
function roleCount(role, excludeId) { return liveUsers().filter(u => u.role === role && u.id !== excludeId && !(role === "Admin" && u.isSuperAdmin)).length; }
function checkRoleLimit(role, excludeId) {
  const max = ROLE_LIMITS[role];
  if (!max) return;
  const used = roleCount(role, excludeId);
  if (used >= max) fail("Maximum account limit reached: only " + max + " " + role + " accounts are allowed and " + used + " already exist. " +
    "Remove or change the role of an existing " + role + " before adding another.", { field: "role", limit: true });
}

export function saveUser({ data }, actor, adminSection) {
  const form = data && typeof data === "object" ? data : {};
  const db = getDb(), id = Number(form.id) || 0;
  const old = id ? db.users.find(u => u.id === id && !u.deletedAt) : null;
  if (id && !old) fail("User not found.");
  const self = !!old && old.id === actor.id;
  if (!self && !rules.canManageUser(actor, old)) deny(old ? "You can edit only people in your own team." : "Only an Admin or someone with User Management can add users.");
  if (self && !rules.hasPerm(actor, "users.edit")) fail("To change your profile details, ask an Admin. You can change your photo and password in Settings.");

  const name = textField(form.name, "Full name", LIMITS.user_name[0], LIMITS.user_name[1], "name");
  if (/[<>,@]/.test(name)) fail("Name cannot contain < > , or @.", { field: "name" });
  const email = cleanText(form.email).toLowerCase();
  if (!email) fail("Email is required.", { field: "email" });
  if (email.length > 160) fail("Email can be at most 160 characters.", { field: "email" });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("Please enter a valid email address.", { field: "email" });
  const phone = cleanText(form.phone);
  let role = pick(form.role, ROLES, "Employee");
  const designation = textField(form.designation, "Designation", 0, LIMITS.designation[1], "designation");
  const department = textField(form.dept, "Department", LIMITS.dept[0], LIMITS.dept[1], "dept");
  if (/[<>]/.test(department + designation)) fail("Department and designation cannot contain < or >.", { field: "dept" });
  const city = textField(form.city, "City", 0, LIMITS.city[1], "city");
  let status = pick(form.status, ["Active", "On Leave", "Inactive"], "Active");
  const joined = dateOrNull(form.joined);
  const password = String(form.password || "").trim();
  let reportsTo = Number(form.reportsToId) || null;

  const taken = db.users.find(u => u.email.toLowerCase() === email && u.id !== id);
  if (taken) fail(taken.deletedAt ? "This email belongs to a removed user (" + taken.name + "). Restore that user from the Recycle Bin, or ask the Super Admin to delete it permanently first."
    : "This email is already used by " + taken.name + ".", { field: "email" });
  if (reportsTo !== null) {
    const manager = rules.userRow(reportsTo);
    if (!rules.isAssignableState(manager)) fail("\"Reports to\" must be an active member.", { field: "reportsTo" });
    if (old && (reportsTo === old.id || rules.downlineIds(old.id).indexOf(reportsTo) !== -1)) fail("A person cannot report to themselves or to someone in their own team.", { field: "reportsTo" });
    if (rules.userRank(manager) < rules.userRank({ role, isSuperAdmin: old ? old.isSuperAdmin : false })) fail("A person can only report to someone of the same or a higher role.", { field: "reportsTo" });
    if (!rules.isAdmin(actor) && !rules.inTeam(actor, reportsTo)) fail("You can only choose yourself or someone in your team.", { field: "reportsTo" });
  }

  if (old) {
    let problem;
    if (phone !== old.phone && (problem = phoneProblem(phone))) fail(problem, { field: "phone" });
    if (email !== old.email.toLowerCase() && (problem = emailProblem(email))) fail(problem, { field: "email" });
    if (!self && rules.isSuper(old) && !rules.isSuper(actor)) fail("Only a Super Admin can edit another Super Admin.");
    if (!rules.isAdmin(actor) && old.role !== "Employee" && !self) fail("You can edit only Employees in your team.");
    if (!self && role !== old.role && !rules.isSuper(actor)) fail("Only the Super Admin can change a user's role.", { field: "role" });
    if (old.isSuperAdmin && (role !== "Admin" || status === "Inactive") && superCount(id) === 0) fail("This is the last Super Admin. Make someone else Super Admin first.");
    if (!self && !rules.hasPerm(actor, "users.update")) {
      if (status !== old.status) deny("You do not have permission to change a member's status.");
      if (password) deny("You do not have permission to set passwords.");
    }
    if (self) {
      role = old.role; status = old.status;                 // cannot lock yourself out
      if (!rules.isAdmin(actor)) reportsTo = old.reportsToId;
      if (password) fail("To change your own password, use Settings > Change my password.", { field: "password" });
    }
    if (!adminSection && !self) {
      if (role === "Admin" && old.role !== "Admin") deny("The Admin role can only be given by the Super Admin, in the Super Admin section (Permissions).");
      if (old.role === "Admin" && role !== "Admin") fail("An Admin's role can only be changed by the Super Admin, in the Super Admin section (Permissions).", { field: "role" });
    }
    if (old.role === "Admin" && (role !== "Admin" || status !== "Active") && activeAdminCount(id) === 0) fail("This is the last active Admin. Make someone else an Admin first.");
    if (role !== old.role) checkRoleLimit(role, id);
    if (password && (problem = passwordProblem(password))) fail(problem, { field: "password" });

    const shape = u => ({ name: u.name, email: u.email, phone: u.phone, role: u.role, designation: u.designation, department: u.department, city: u.city,
      status: u.status, joined_on: u.joinedOn, reports_to_id: u.reportsToId });
    const before = shape(old);
    Object.assign(old, { name, email, phone, role, designation, department, city, status, joinedOn: joined, reportsToId: reportsTo, updatedAt: nowStamp() });
    if (password) { old.password = password; old.mustChange = true; if (!self) completeResetsFor(actor, id, "set_in_user_form"); }
    if (status === "Inactive") old.isOnline = false;
    if (role !== "Admin") old.isSuperAdmin = false;
    if (role !== before.role) notify(id, "account", "Your role was changed", actor.name + " changed your role from " + before.role + " to " + role + ". Your menu is updated.", null, actor.id);
    logActivity(actor, "updated user " + name);
    const [oldValue, newValue] = auditDiff(before, shape(old));
    audit(actor, self ? "profile_update" : "update", "user", id, oldValue, password ? Object.assign(newValue || {}, { temporary_password_reset: true }) : newValue, "Updated user " + name);
    return { ok: true, id, created: false, passwordSet: !!password };
  }

  let problem;
  if ((problem = emailProblem(email))) fail(problem, { field: "email" });
  if ((problem = phoneProblem(phone))) fail(problem, { field: "phone" });
  if (role === "Admin" && !adminSection) deny("Admin accounts can only be created by the Super Admin, in the Super Admin section (Permissions).");
  if (role !== "Employee" && !rules.isSuper(actor)) fail("Only the Super Admin can create Admins or Managers. Add the person as Employee and ask the Super Admin to change the role.", { field: "role" });
  if (!rules.isAdmin(actor) && reportsTo === null) reportsTo = actor.id;      // a Manager adds people to their own team
  if (!password) fail("A temporary password is required for a new user.", { field: "password" });
  if ((problem = passwordProblem(password))) fail(problem, { field: "password" });
  checkRoleLimit(role, 0);
  const newId = nextId("users");
  db.users.push({ id: newId, name, email, phone, role, isSuperAdmin: false, designation, department, city, status, reportsToId: reportsTo, joinedOn: joined,
    password, mustChange: true, avatar: "", isOnline: false, lastSeenAt: null, createdAt: nowStamp(), updatedAt: nowStamp(), deletedAt: null, resetToken: null, resetExpiresAt: null });
  logActivity(actor, "added " + name + " as " + role);
  audit(actor, "create", "user", newId, null, { name, email, phone, role, department, status, reports_to_id: reportsTo }, "Added user " + name + " as " + role);
  return { ok: true, id: newId, created: true };
}
export function saveAdmin(payload, actor) {
  if (!rules.isSuper(actor)) deny("Only the Super Admin can do this.");
  return saveUser(payload, actor, true);
}

export function deleteUser({ id, force }, actor) {
  if (!rules.hasPerm(actor, "users.delete")) deny("You do not have permission to remove users.");
  const db = getDb(), target = db.users.find(u => u.id === Number(id) && !u.deletedAt);
  if (!target) fail("User not found.");
  if (!rules.isAdmin(actor) && (target.role !== "Employee" || rules.downlineIds(actor.id).indexOf(target.id) === -1)) deny("You can remove only Employees of your own team.");
  if (target.id === actor.id) fail("You cannot remove your own account.");
  if (target.role === "Admin" && activeAdminCount(target.id) === 0) fail("You cannot remove the last active Admin.");
  if (target.isSuperAdmin) {
    if (!rules.isSuper(actor)) fail("Only a Super Admin can remove another Super Admin.");
    if (superCount(target.id) === 0) fail("You cannot remove the last Super Admin.");
  }
  const open = db.tasks.filter(t => t.assigneeIds.indexOf(target.id) !== -1 && t.status !== "Completed" && t.status !== "Cancelled").length;
  if (open > 0 && !force) fail(target.name + " still has " + open + " open task" + (open === 1 ? "" : "s") + ". Reassign them first.", { needForce: true });
  const reports = db.users.filter(u => u.reportsToId === target.id && !u.deletedAt).map(u => u.id);
  const binId = binEntry(actor, "user", target.id, target.name + " (" + target.email + ")", {
    user: { id: target.id, reportsToId: target.reportsToId, status: target.status, isSuperAdmin: target.isSuperAdmin },
    members: db.projects.filter(p => p.memberIds.indexOf(target.id) !== -1).map(p => p.id), permissions: db.permOverrides[target.id] || {}, reports });
  /* their direct reports move up to the removed person's own manager */
  db.users.forEach(u => { if (u.reportsToId === target.id) u.reportsToId = target.reportsToId; });
  db.projects.forEach(p => { p.memberIds = p.memberIds.filter(m => m !== target.id); });
  db.notifications = db.notifications.filter(n => n.userId !== target.id);
  delete db.permOverrides[target.id];
  Object.assign(target, { deletedAt: nowStamp(), status: "Inactive", isOnline: false, isSuperAdmin: false, reportsToId: null });
  logActivity(actor, "removed user " + target.name);
  audit(actor, "delete", "user", target.id, { name: target.name, email: target.email, role: target.role }, { recycle_bin_id: binId }, "Moved user " + target.name + " to the Recycle Bin");
  return { ok: true, recycled: true };
}

export function setRole({ userId, role }, actor) {
  if (!rules.isSuper(actor)) deny("Only the Super Admin can do this.");
  const newRole = pick(role, ROLES, null);
  if (!newRole) fail("Please choose a role.");
  const target = getDb().users.find(u => u.id === Number(userId) && !u.deletedAt);
  if (!target) fail("User not found.");
  if (target.id === actor.id) fail("You cannot change your own role.");
  if (target.isSuperAdmin) fail("This person is a Super Admin. Remove Super Admin first, then change the role.");
  if (target.role === newRole) return { ok: true, unchanged: true };
  if (target.role === "Admin" && activeAdminCount(target.id) === 0) fail("This is the last active Admin. Make someone else an Admin first.");
  checkRoleLimit(newRole, target.id);
  const was = target.role;
  Object.assign(target, { role: newRole, isSuperAdmin: false, updatedAt: nowStamp() });
  notify(target.id, "account", "Your role was changed", actor.name + " changed your role from " + was + " to " + newRole + ". Your menu is updated.", null, actor.id);
  audit(actor, "role_change", "user", target.id, { role: was }, { role: newRole }, "Changed the role of " + target.name + " from " + was + " to " + newRole);
  logActivity(actor, "changed the role of " + target.name + " to " + newRole);
  return { ok: true };
}

/* ---------------- permissions panel ---------------- */
export function permissions(payload, actor) {
  if (!rules.canManagePerms(actor)) deny("You do not have permission to manage permissions.");
  const order = { Admin: 0, Manager: 1, Employee: 2 };
  const users = liveUsers().sort((a, b) => order[a.role] - order[b.role] || a.name.localeCompare(b.name));
  return { ok: true, perms: PERMS, rolePerms: ROLE_DEFAULTS, ready: true, mine: rules.effectivePerms(actor), isSuper: rules.isSuper(actor),
    limits: { Admin: { used: roleCount("Admin", 0), max: ROLE_LIMITS.Admin }, Manager: { used: roleCount("Manager", 0), max: ROLE_LIMITS.Manager } },
    users: users.map(x => {
      const own = getDb().permOverrides[x.id] || {};
      return { id: x.id, name: x.name, email: x.email, role: x.role, status: x.status, designation: x.designation || "", superAdmin: rules.isSuper(x),
        effective: PERM_KEYS.filter(k => rules.hasPerm(x, k)), granted: Object.keys(own).filter(k => own[k]), revoked: Object.keys(own).filter(k => !own[k]),
        editable: rules.canEditPermsOf(actor, x) };
    }) };
}
export function savePermissions({ userId, perms, mode }, actor) {
  if (!rules.canManagePerms(actor)) deny("You do not have permission to manage permissions.");
  const db = getDb(), target = db.users.find(u => u.id === Number(userId) && !u.deletedAt);
  if (!target) fail("User not found.");
  let wanted = (Array.isArray(perms) ? perms : []).filter(k => typeof k === "string");
  if (mode !== "full") wanted = (ROLE_DEFAULTS[target.role] || []).concat(...wanted.map(k => PERM_ALIASES[k] || [k]));
  wanted = wanted.filter(k => PERM_KEYS.indexOf(k) !== -1);
  if (target.id === actor.id) deny("You cannot change your own permissions.");
  if (rules.isSuper(target)) fail("The Super Admin always has every permission. Nothing to change.");
  if (!rules.canEditPermsOf(actor, target)) deny("You can change permissions only for people below your rank.");
  const before = PERM_KEYS.filter(k => rules.hasPerm(target, k)), overrides = {};
  PERM_KEYS.forEach(k => {
    let on = wanted.indexOf(k) !== -1;
    /* an Admin can only switch boxes they have themselves; "Permissions: manage" stays with the Super Admin */
    if (!rules.isSuper(actor) && (!rules.hasPerm(actor, k) || k === "permissions.manage")) on = before.indexOf(k) !== -1;
    if (on !== ((ROLE_DEFAULTS[target.role] || []).indexOf(k) !== -1)) overrides[k] = on;
  });
  db.permOverrides[target.id] = overrides;
  const after = PERM_KEYS.filter(k => rules.hasPerm(target, k));
  const added = after.filter(k => before.indexOf(k) === -1), removed = before.filter(k => after.indexOf(k) === -1);
  audit(actor, "permissions", "user", target.id, { permissions: before }, { permissions: after, added, removed },
    "Changed permissions of " + target.name + (added.length ? " (+" + added.join(", ") + ")" : "") + (removed.length ? " (-" + removed.join(", ") + ")" : ""));
  if (added.length || removed.length) notify(target.id, "account", "Your access was updated", actor.name + " changed your permissions. The menu is updated for you.", null, actor.id);
  logActivity(actor, "changed permissions of " + target.name);
  return { ok: true, effective: after };
}
export function setSuper({ userId, on }, actor) {
  if (!rules.isSuper(actor)) deny("Only the Super Admin can do this.");
  const target = getDb().users.find(u => u.id === Number(userId) && !u.deletedAt);
  if (!target) fail("User not found.");
  if (on && target.role !== "Admin") fail("Only an Admin can be made Super Admin. Change their role to Admin first.");
  if (on && target.status === "Inactive") fail("This user is inactive.");
  if (!on && target.isSuperAdmin && superCount(target.id) === 0) fail("This is the last Super Admin. Make someone else Super Admin first.");
  if (!on && target.isSuperAdmin) checkRoleLimit("Admin", target.id);   // becomes a normal Admin, which counts toward the limit
  if (target.isSuperAdmin !== !!on && target.id !== actor.id)
    notify(target.id, "account", "Your access was updated", actor.name + (on ? " made you a Super Admin." : " removed your Super Admin rights."), null, actor.id);
  audit(actor, "super_admin", "user", target.id, { superAdmin: target.isSuperAdmin }, { superAdmin: !!on }, (on ? "Made " : "Removed Super Admin from ") + target.name + (on ? " a Super Admin" : ""));
  target.isSuperAdmin = !!on;
  logActivity(actor, on ? "made " + target.name + " a Super Admin" : "removed Super Admin from " + target.name);
  return { ok: true };
}

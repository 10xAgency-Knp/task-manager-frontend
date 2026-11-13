/* Quick self-check of the mock service layer, without a browser: `npm run check`.
   Runs the same actions the screens use and checks the access rules and the saved data. */
import assert from "node:assert/strict";

process.env.TZ = "Asia/Kolkata";   // the users' time zone: date maths must not slip a day (UTC is 5:30 behind)

/* the little bit of browser the mock needs */
const store = new Map();
globalThis.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.location = { href: "http://localhost/", reload() {} };

const { request } = await import("../src/services/mockApi.js");
const { addDays } = await import("../src/services/mock/workspace.js");
assert.equal(addDays("2026-10-21", 1), "2026-10-22", "tomorrow is the next day in India time");
assert.equal(addDays("2026-10-31", 7), "2026-11-07");
const call = (action, payload) => request(action, payload, { background: true });

/* signed out: the session check must not touch the saved data */
assert.equal((await call("session")).authed, false);
assert.equal(localStorage.getItem("crm10x_demo_db_v1"), null, "a signed-out session check must not save anything");

assert.equal((await call("login", { email: "aarav@the10xagency.in", password: "wrong" })).error, "Invalid email or password.");
assert.equal((await call("load")).error, "AUTH", "signed-out people get AUTH");

/* Employee: own and team tasks only, no admin pages */
assert.equal((await call("login", { email: "karan@the10xagency.in", password: "Demo@12345" })).ok, true);
const employeeLoad = await call("load");
assert.ok(employeeLoad.data.tasks.length > 0 && employeeLoad.data.tasks.every(t => t.assigneeIds.includes(7) || t.createdById === 7), "employee sees only own tasks");
assert.equal((await call("permissions")).ok, false, "employee cannot open Permissions");
assert.match((await call("taskDetail", { id: "TK-111" })).error, /not assigned to you/, "task outside the team is refused");

/* Super Admin: create, edit, delete and restore a task */
await call("logout");
assert.equal((await call("login", { email: "aarav@the10xagency.in", password: "Demo@12345" })).ok, true);
const form = { title: "Self-check task", description: "Created by the self-check", category: "SEO", assigneeIds: [7], priority: "High", status: "To Do",
  startDate: "2026-11-01", due: "2026-11-10", tags: ["check"], subtasks: [{ title: "One" }, { title: "Two" }] };
const bad = await call("saveTask", { data: Object.assign({}, form, { due: "2026-10-01" }) });
assert.equal(bad.field, "due", "end before start is rejected on the due field");
const created = await call("saveTask", { data: form });
assert.ok(created.ok && /^TK-\d+$/.test(created.id));
const detail = await call("taskDetail", { id: created.id });
assert.deepEqual(detail.data.subtasks.map(s => s.title), ["One", "Two"]);
assert.equal((await call("setTaskStatus", { id: created.id, status: "In Progress" })).ok, true);
/* a form save without "status" keeps the newer status (nobody's change is undone) */
const { status, ...withoutStatus } = form;
assert.equal((await call("saveTask", { data: Object.assign({}, withoutStatus, { id: created.id, title: "Self-check task (edited)" }) })).ok, true);
assert.equal((await call("taskDetail", { id: created.id })).data.task.status, "In Progress");
assert.equal((await call("deleteTask", { id: created.id })).ok, true);
const bin = (await call("recycleList", {})).rows.find(r => r.original_id === created.id);
assert.ok(bin, "deleted task is in the Recycle Bin");
assert.equal((await call("recycleRestore", { id: bin.id })).ok, true);
assert.equal((await call("taskDetail", { id: created.id })).data.subtasks.length, 2, "restored with its checklist");

/* an uploaded file whose content could not be kept is reported, never replaced by a sample file */
const png = "data:image/png;base64," + Buffer.from("\x89PNG\r\n\x1a\nIHDR....", "latin1").toString("base64");
const up = await call("upload", { task: created.id, name: "proof.png", mime: "image/png", data: png });
assert.ok(up.ok, up.error);
const { getDb } = await import("../src/services/mockDb.js");
getDb().attachments.find(a => a.id === up.id).dataUrl = null;   // as after a reload when the file was too big for storage
assert.match((await call("download", { id: up.id })).error, /too big to keep/);
const sample = getDb().attachments.find(a => !a.uploaded);
assert.equal((await call("download", { id: sample.id })).ok, true, "the demo's own sample files still download");

/* everything above was saved */
const saved = JSON.parse(localStorage.getItem("crm10x_demo_db_v1"));
assert.ok(saved.tasks.some(t => t.code === created.id && t.title === "Self-check task (edited)"));
console.log("Mock API self-check passed.");

/* Workspace settings the backend normally sends: permission list, role defaults, field limits,
   categories, allowed email domains. Same values as the PHP CRM. */
export const PERMS = [
  ["tasks.view", "Tasks", "View", "See tasks (their own, their team, or every task with \"All company tasks\")"],
  ["tasks.edit", "Tasks", "Edit", "Create tasks and change task details in the task form"],
  ["tasks.update", "Tasks", "Update", "Change status, tick checklist items, log hours and comment"],
  ["tasks.delete", "Tasks", "Delete", "Delete tasks created by themselves or their team (moves to the Recycle Bin)"],
  ["all_tasks", "Tasks", "All company tasks", "See and work on every task in the company, not only their team"],
  ["delete_records", "Tasks", "Delete any task", "Delete any task they can see"],
  ["projects.view", "Projects", "View", "See projects of their team"],
  ["projects.edit", "Projects", "Edit", "Create projects and change name, description, manager, dates, budget and members"],
  ["projects.update", "Projects", "Update", "Change project status and progress"],
  ["projects.delete", "Projects", "Delete", "Delete projects of their team (moves to the Recycle Bin)"],
  ["tags.view", "Tags", "View", "See tags on tasks"],
  ["tags.edit", "Tags", "Edit", "Add tags to tasks"],
  ["tags.delete", "Tags", "Delete", "Remove existing tags from tasks"],
  ["users.view", "Users", "View", "See the Members page and profiles of their team"],
  ["users.edit", "Users", "Edit", "Add users (Employees, reporting to them) and edit details of people in their team"],
  ["users.update", "Users", "Update", "Change a member's status and set a temporary password"],
  ["users.delete", "Users", "Delete", "Remove users (moves to the Recycle Bin)"],
  ["deals.view", "Sales pipeline", "View", "Open the Sales Pipeline"],
  ["deals.edit", "Sales pipeline", "Edit", "Create deals"],
  ["deals.update", "Sales pipeline", "Update", "Change existing deals"],
  ["deals.delete", "Sales pipeline", "Delete", "Delete deals (moves to the Recycle Bin)"],
  ["files.view", "Files", "View", "Download files of tasks they can open"],
  ["files.edit", "Files", "Edit", "Upload files to tasks"],
  ["files.delete", "Files", "Delete", "Remove any file (without it: only their own upload, shortly after uploading)"],
  ["view_reports", "Reports", "View", "Open the Reports page"],
  ["activity.own", "Activity log", "Own", "See their own activity log"],
  ["activity.team", "Activity log", "Team", "See the activity of the people who report to them"],
  ["activity.all", "Activity log", "All users", "See the activity of every user"],
  ["workload.own", "Team workload", "Own", "See their own workload"],
  ["workload.team", "Team workload", "Team", "See the workload of the people who report to them"],
  ["workload.all", "Team workload", "All users", "See everyone's workload"],
  ["recycle_restore", "Recycle Bin", "View + restore", "Open the Recycle Bin and restore deleted items"],
  ["permissions.manage", "Permissions", "Manage", "Tick and untick permissions of people below Admin rank (never their own)"]
].map(([key, module, label, help]) => ({ key, module, label, help }));
export const PERM_KEYS = PERMS.map(p => p.key);

/* older permission names still understood by the screens */
export const PERM_ALIASES = {
  manage_projects: ["projects.edit", "projects.update"],
  manage_deals: ["deals.view", "deals.edit"],
  manage_users: ["users.edit", "users.update"],
  manage_files: ["files.delete"],
  view_audit: ["activity.team"]
};

export const ROLE_DEFAULTS = {
  Admin: ["tasks.view", "tasks.edit", "tasks.update", "tasks.delete", "all_tasks", "delete_records",
    "projects.view", "projects.edit", "projects.update", "projects.delete",
    "tags.view", "tags.edit", "tags.delete",
    "users.view", "users.edit", "users.update", "users.delete",
    "deals.view", "deals.edit", "deals.update", "deals.delete",
    "files.view", "files.edit", "files.delete", "view_reports",
    "activity.own", "activity.team", "workload.own", "workload.team", "workload.all", "permissions.manage"],
  Manager: ["tasks.view", "tasks.edit", "tasks.update", "tasks.delete",
    "projects.view", "projects.edit", "projects.update",
    "tags.view", "tags.edit", "tags.delete",
    "users.view", "deals.view", "deals.edit",
    "files.view", "files.edit", "files.delete", "view_reports",
    "activity.own", "workload.own", "workload.team"],
  Employee: ["tasks.view", "tasks.edit", "tasks.update", "tasks.delete", "projects.view",
    "tags.view", "tags.edit", "users.view", "files.view", "files.edit",
    "activity.own", "workload.own", "workload.team"]
};

export const ROLE_LIMITS = { Admin: 2, Manager: 5 };   // Super Admins are not counted as Admins

export const TASK_STATUSES = ["To Do", "In Progress", "On Hold", "Review", "Completed", "Cancelled"];
export const TASK_PRIORITIES = ["Low", "Medium", "High", "Urgent"];
export const PROJECT_STATUSES = ["Planning", "In Progress", "At Risk", "Completed", "On Hold"];
export const DEAL_STAGES = ["Discovery", "Qualified", "Proposal", "Negotiation", "Won", "Lost"];
export const TASK_CATEGORIES = ["Web development", "SMM", "E commerce", "Video editing/ graphic", "Human resource", "SEO", "Custom/ remark"];
export const CATEGORY_CUSTOM = "Custom/ remark";

export const LIMITS = {
  task_title: [3, 200], task_desc: [3, 3000], category_note: [2, 60], tag: [1, 30], tags_max: 10,
  checklist: [1, 200], checklist_max: 100, comment: [1, 4000], hours: [0, 9999],
  project_name: [3, 120], project_desc: [3, 3000],
  deal_name: [3, 120], deal_account: [0, 120], deal_notes: [0, 4000],
  user_name: [2, 80], designation: [0, 60], dept: [2, 40], city: [0, 60]
};

export const EMAIL_DOMAINS = ["gmail.com", "10xagency.in", "10xagency.co.in", "the10xagency.in", "fivermail.com", "clicxormedia.com", "clicxormedia.in"];

export const SESSION = { idleMinutes: 60, absoluteHours: 12 };
export const OWN_FILE_DELETE_HOURS = 24;
export const RECYCLE_DAYS = 30;
export const ACTIVITY_LOG_KEEP_DAYS = 40;
export const PW_RESET_REMINDER_MINUTES = 30;
export const ADMIN_RESET_MINUTES = 30;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_AVATAR_BYTES = 1024 * 1024;

/**
 * People & Organizational Management Screens
 *
 * Implements:
 * 1. Members: Workspace directory cards (team and downline for managers, all members for admins)
 * 2. UserPage: Detailed employee profile workspace with KPI metrics, assigned tasks, and workload breakdown
 * 3. Reports: Company-wide and team performance analytics with 8-week completion trends and project health variance
 * 4. Settings: Personal profile photo uploads (canvas center-crop resize), Web Push configuration, and password changes
 */
import { useEffect, useRef, useState } from "react";
import { appStore, emitStoreChange, showToast, showErrorToast } from "../store/appStore.js";
import { API } from "../services/api.js";
import { Icon } from "../components/Icon.jsx";
import {
  can,
  hasPermission,
  isCurrentUserAdmin,
  isCurrentUserSuperAdmin,
  hasTeamView,
  getTeamUsers,
  getUserById,
  getUserWorkloadMetrics,
  canViewUser,
  getProjectById,
  isTaskAssignedToUser,
  pluralize,
  formatDisplayDate,
  formatDateTime,
  sortTasks,
  STATUS_HEX_COLORS,
  PROJECT_STATUS_BADGE_CLASSES,
  validatePasswordStrength
} from "../utils/helpers.js";
import { navigateToDetail } from "../routes/navigation.js";
import { safeRefresh } from "../services/sync.js";
import {
  PUSH,
  pushInit,
  pushEnable,
  pushDisable,
  pushIsIOS,
  pushIsStandalone,
  showDeviceNotification
} from "../services/push.js";
import {
  getNotificationSoundMode,
  setNotificationSoundMode,
  playNotificationAlarm
} from "../services/notificationSound.js";
import {
  Avatar,
  PersonChip,
  KpiCard,
  HorizontalBarChart,
  TaskTable,
  EmptyStateBox,
  AccessDeniedBox,
  BackButton,
  RolePill,
  UserStatusBadge,
  Badge,
  RequiredIndicator
} from "../components/ui.jsx";
import { confirmBox, closeModal } from "../components/Modal.jsx";
import { openTask, askDeleteTask } from "../components/forms/TaskForm.jsx";
import { openUser } from "../components/forms/UserForm.jsx";
import { askSignOut } from "./Auth.jsx";
import { usePageHeader } from "../hooks/useHead.js";
import { navigateToKpiView } from "./Dashboard.jsx";

/* ==========================================================================
   1. MEMBERS DIRECTORY VIEW
   ========================================================================== */

export function Members() {
  const currentUserId = appStore.currentUser?.id;
  let membersList = getTeamUsers().sort((a, b) =>
    a.id === currentUserId ? -1 : b.id === currentUserId ? 1 : a.name.localeCompare(b.name)
  );

  if (!hasPermission("users.view")) {
    membersList = membersList.filter(user => user.id === currentUserId);
  }

  const directoryScopeText = !hasPermission("users.view")
    ? " · your profile"
    : isCurrentUserAdmin()
    ? " · everyone in the workspace"
    : membersList.length > 1
    ? " · you and the people who report to you"
    : " · your profile. People who report to you will appear here.";

  return (
    <>
      <div className="page-head">
        <span className="info">
          {pluralize(membersList.length, "member")}
          {directoryScopeText}
        </span>
        <span className="spacer" />
        {can.users() ? (
          <button
            className="btn btn-primary btn-sm"
            id="newUser"
            onClick={() => openUser(null)}
          >
            <Icon name="plus" /> Add User
          </button>
        ) : null}
      </div>

      <div className="grid-3">
        {membersList.map(memberUser => {
          const workload = getUserWorkloadMetrics(memberUser.id);
          const contactInfo = [memberUser.phone, memberUser.city].filter(Boolean).join(" · ");
          const managerUser = memberUser.reportsTo ? getUserById(memberUser.reportsTo) : null;

          return (
            <div
              key={memberUser.id}
              className="card clickable"
              data-user={memberUser.id}
              style={{ padding: "17px 18px" }}
              onClick={() => navigateToDetail("user", memberUser.id)}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 13 }}>
                <Avatar user={memberUser} className="lg" isOnline={Boolean(memberUser.online)} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 670, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span>
                      {memberUser.name}
                      {memberUser.id === currentUserId ? (
                        <>
                          {" "}
                          <span className="muted" style={{ fontWeight: 500, fontSize: 12 }}>
                            (you)
                          </span>
                        </>
                      ) : null}
                    </span>
                    {can.editUser(memberUser) || (memberUser.id === appStore.currentUser?.id && isCurrentUserAdmin()) ? (
                      <button
                        className="btn btn-ghost btn-xs"
                        style={{ padding: "2px 8px" }}
                        title="Edit user"
                        onClick={(e) => {
                          e.stopPropagation();
                          openUser(memberUser.id);
                        }}
                      >
                        <Icon name="edit" /> Edit
                      </button>
                    ) : null}
                  </div>
                  <div className="muted" style={{ fontSize: 12.1 }}>
                    {[memberUser.designation, memberUser.dept].filter(Boolean).join(" · ")}
                  </div>
                  <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <UserStatusBadge user={memberUser} />
                    <RolePill role={memberUser.role} />
                    {memberUser.superAdmin ? (
                      <span className="role-pill rp-admin">Super Admin</span>
                    ) : null}
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  fontSize: 12.1,
                  color: "var(--text2)"
                }}
              >
                {memberUser.email ? <div className="ellipsis">{memberUser.email}</div> : null}
                {contactInfo ? <div>{contactInfo}</div> : null}
                <div className="muted">
                  Reports to: {managerUser ? managerUser.name : "nobody (top level)"}
                </div>
              </div>

              <div className="divider" style={{ margin: "13px 0" }} />

              <div className="progress-row">
                <span>Current load</span>
                <b>{workload.open.length} open</b>
              </div>
              <div className="bar" style={{ height: 6 }}>
                <i style={{ width: `${Math.min(100, workload.open.length * 12)}%` }} />
              </div>

              <div style={{ display: "flex", gap: 7, marginTop: 12, flexWrap: "wrap" }}>
                <span className="pill">{workload.done.length + workload.oldDone} completed</span>
                <span className="pill">{workload.hours}h assigned</span>
                {workload.late.length ? (
                  <span className="badge b-red">{workload.late.length} late</span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ==========================================================================
   2. USER PROFILE DETAIL VIEW
   ========================================================================== */

export function UserPage({ id }) {
  const user = getUserById(id);
  const isViewPermitted = Boolean(user && canViewUser(user));

  usePageHeader(
    isViewPermitted ? user.name : "Member",
    isViewPermitted ? `${user.designation || user.role} - ${user.dept}` : ""
  );

  if (!isViewPermitted) {
    return (
      <>
        <BackButton />
        <AccessDeniedBox message="You can only open your own profile and the profiles of people in your team." />
      </>
    );
  }

  const workload = getUserWorkloadMetrics(user.id);
  const visitedProjectCodes = {};
  const activeProjects = [];

  workload.tasks
    .map(task => task.project)
    .concat(Object.keys(workload.oldProjects))
    .forEach(projectCode => {
      if (projectCode && !visitedProjectCodes[projectCode]) {
        visitedProjectCodes[projectCode] = true;
        const project = getProjectById(projectCode);
        if (project) activeProjects.push(project);
      }
    });

  const supervisor = user.reportsTo ? getUserById(user.reportsTo) : null;
  const directSubordinates = (appStore.database.users || []).filter(
    u => u.reportsTo === user.id && !u.archived
  );
  const canAssignTaskToUser = (appStore.database.assignable || []).includes(user.id);
  const totalCompletedCount = workload.done.length + workload.oldDone;

  return (
    <>
      <BackButton />

      {/* User Header Overview Card */}
      <div className="card" style={{ marginBottom: 15 }}>
        <div className="card-body">
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <Avatar user={user} className="xl" isOnline={Boolean(user.online)} />
            <div style={{ flex: 1, minWidth: 220 }}>
              <h2 style={{ fontSize: 19, fontWeight: 700 }}>{user.name}</h2>
              <div className="muted" style={{ fontSize: 12.6, marginTop: 2 }}>
                {user.designation || "-"} &middot; {user.dept}
                {user.city ? ` · ${user.city}` : ""}
              </div>
              <div style={{ marginTop: 8, display: "flex", gap: 7, flexWrap: "wrap" }}>
                <UserStatusBadge user={user} />
                <RolePill role={user.role} />
                {user.superAdmin ? <span className="role-pill rp-admin">Super Admin</span> : null}
                <span className="pill">{user.online ? "Online" : "Offline"}</span>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              {can.editUser(user) || (user.id === appStore.currentUser?.id && isCurrentUserAdmin()) ? (
                <button
                  className="btn btn-ghost btn-sm"
                  id="editUser"
                  onClick={() => openUser(user.id)}
                >
                  <Icon name="edit" /> Edit
                </button>
              ) : null}
              {canAssignTaskToUser ? (
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => openTask(null, { assignees: [user.id] })}
                >
                  <Icon name="plus" /> Assign Task
                </button>
              ) : null}
            </div>
          </div>

          <div className="divider" />

          <div className="grid-3" style={{ gap: 12 }}>
            <div>
              <div className="field">
                <div className="k">Email</div>
                <div className="v">{user.email || "-"}</div>
              </div>
              <div className="field">
                <div className="k">Phone</div>
                <div className="v">{user.phone || "-"}</div>
              </div>
            </div>

            <div>
              <div className="field">
                <div className="k">Department</div>
                <div className="v">{user.dept}</div>
              </div>
              <div className="field">
                <div className="k">Reports to</div>
                <div className="v">
                  {supervisor ? <PersonChip userId={supervisor.id} /> : "Nobody (top level)"}
                </div>
              </div>
            </div>

            <div>
              <div className="field">
                <div className="k">Employee ID</div>
                <div className="v">U-{user.id}</div>
              </div>
              <div className="field">
                <div className="k">Last seen</div>
                <div className="v">{user.lastSeen ? formatDateTime(user.lastSeen) : "-"}</div>
              </div>
            </div>
          </div>

          <div className="meta-dates">
            <span>
              Joined <b>{formatDisplayDate(user.joined)}</b>
            </span>
            {user.createdAt ? (
              <span>
                Account created <b>{formatDateTime(user.createdAt)}</b>
              </span>
            ) : null}
            {user.updatedAt ? (
              <span>
                Profile updated <b>{formatDateTime(user.updatedAt)}</b>
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="kpis" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
        <KpiCard
          label="Open Tasks"
          value={workload.open.length}
          foot="Currently assigned"
          iconName="list"
          color="#0b3d91"
          bg="#e8eefc"
        />
        <KpiCard
          label="Completed"
          value={totalCompletedCount}
          foot="So far"
          iconName="check"
          color="#5aa236"
          bg="#eef7e8"
        />
        <KpiCard
          label="Overdue"
          value={workload.late.length}
          foot={workload.late.length ? "Needs attention" : "On track"}
          iconName="alert"
          color="#d94b4b"
          bg="#fdeaea"
        />
        <KpiCard
          label="Effort"
          value={`${workload.hours}h`}
          foot="Total estimate"
          iconName="clock"
          color="#7a5af8"
          bg="#f0ecff"
        />
      </div>

      {/* Assigned Tasks & Subordinates Sidebar Grid */}
      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <div>
              <h3>Assigned tasks</h3>
              <div className="sub">{workload.tasks.length} you can see</div>
            </div>
          </div>
          <TaskTable
            list={sortTasks(workload.tasks)}
            opts={{ emptyTitle: "No tasks assigned" }}
            onEdit={taskId => openTask(taskId)}
            onDel={askDeleteTask}
          />
        </div>

        <div>
          {directSubordinates.length ? (
            <div className="card" style={{ marginBottom: 15 }}>
              <div className="card-head">
                <div>
                  <h3>Team</h3>
                  <div className="sub">
                    {pluralize(directSubordinates.length, "person")} report to{" "}
                    {user.name.split(" ")[0]}
                  </div>
                </div>
              </div>
              <div className="card-body">
                <div className="mini-list">
                  {directSubordinates.map(subordinate => (
                    <div key={subordinate.id} className="mini-item">
                      <PersonChip userId={subordinate.id} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          <div className="card" style={{ marginBottom: 15 }}>
            <div className="card-head">
              <div>
                <h3>Workload</h3>
                <div className="sub">Task mix</div>
              </div>
            </div>
            <div className="card-body">
              <HorizontalBarChart
                items={[
                  {
                    label: "Open",
                    value: workload.open.length,
                    color: "linear-gradient(90deg,#1a5cc8,#0b3d91)"
                  },
                  {
                    label: "Review",
                    value: workload.tasks.filter(t => t.status === "Review").length,
                    color: STATUS_HEX_COLORS["Review"]
                  },
                  {
                    label: "On Hold",
                    value: workload.tasks.filter(t => t.status === "On Hold").length,
                    color: STATUS_HEX_COLORS["On Hold"]
                  },
                  {
                    label: "Overdue",
                    value: workload.late.length,
                    color: STATUS_HEX_COLORS["Cancelled"]
                  },
                  {
                    label: "Completed",
                    value: totalCompletedCount,
                    color: STATUS_HEX_COLORS["Completed"]
                  }
                ]}
              />
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <div>
                <h3>Projects</h3>
                <div className="sub">Where this person contributes</div>
              </div>
            </div>
            <div className="card-body">
              <div className="mini-list">
                {activeProjects.length ? (
                  activeProjects.map(proj => {
                    const taskCount =
                      (appStore.database.tasks || []).filter(
                        t => t.project === proj.id && isTaskAssignedToUser(t, user.id)
                      ).length + (workload.oldProjects[proj.id] || 0);

                    return (
                      <div
                        key={proj.id}
                        className="mini-item clickable"
                        data-project={proj.id}
                        onClick={() => navigateToDetail("project", proj.id)}
                      >
                        <i
                          style={{
                            width: 9,
                            height: 9,
                            borderRadius: 3,
                            flex: "0 0 9px",
                            background: proj.status === "At Risk" ? "#d94b4b" : "#0b3d91"
                          }}
                        />
                        <div>
                          <div className="t">{proj.name}</div>
                          <div className="s">{pluralize(taskCount, "task")} assigned</div>
                        </div>
                        <div className="r">
                          <Badge dot className={PROJECT_STATUS_BADGE_CLASSES[proj.status]}>
                            {proj.status}
                          </Badge>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="muted" style={{ fontSize: 12.6 }}>
                    Not part of any project
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ==========================================================================
   3. REPORTS ANALYTICS VIEW
   ========================================================================== */

function AnalyticsTrendSparkline({ values, labels }) {
  const maxValue = Math.max(...values, 1);

  return (
    <>
      <div className="spark" style={{ height: 90 }}>
        {values.map((val, idx) => (
          <i
            key={idx}
            style={{ height: `${Math.max(4, (val / maxValue) * 100)}%` }}
            title={`${labels[idx] || ""}: ${val}`}
          />
        ))}
      </div>
      <div style={{ display: "flex", gap: 5, marginTop: 8 }}>
        {labels.map((lbl, idx) => (
          <div
            key={idx}
            style={{
              flex: 1,
              textAlign: "center",
              fontSize: 10.2,
              color: "var(--muted)",
              fontWeight: 650
            }}
          >
            {lbl}
          </div>
        ))}
      </div>
    </>
  );
}

export function Reports() {
  const [errorMessage, setErrorMessage] = useState("");
  const [, setForceUpdate] = useState(0);

  useEffect(() => {
    if (can.reports() && !appStore.reportsCache) {
      API.reports().then(
        response => {
          appStore.reportsCache = response.data;
          setForceUpdate(tick => tick + 1);
        },
        error => {
          if (!error.silent) setErrorMessage(error.message);
        }
      );
    }
  }, [appStore.reportsCache]);

  if (!can.reports()) {
    return <AccessDeniedBox message="You do not have access to reports." />;
  }
  if (errorMessage) {
    return <AccessDeniedBox message={errorMessage} />;
  }

  const reportsData = appStore.reportsCache;
  if (!reportsData) {
    return (
      <div className="card">
        <div className="card-body">
          <div className="sk sk-card" />
          <div className="sk sk-card" />
          <div className="sk sk-card" />
        </div>
      </div>
    );
  }

  const totals = reportsData.totals || {};
  const isCompanyWide = reportsData.scope === "company";
  const whoseText = isCompanyWide ? "All company tasks" : "Tasks of you and your team";
  const totalCount = totals.total ?? 0;
  const completedCount = totals.completed ?? 0;
  const openTaskCount = totalCount - completedCount - (totals.cancelled ?? 0);

  return (
    <>
      <div className="notice" style={{ marginBottom: 14 }}>
        <Icon name="report" />
        <div>
          {isCompanyWide ? (
            <>You are seeing the <b>whole company</b>.</>
          ) : (
            <>
              You are seeing <b>your own and your team's</b> work only (people who report to you,
              directly or indirectly).
            </>
          )}
        </div>
      </div>

      <div className="kpis" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
        <KpiCard
          label="Completion Rate"
          value={`${totals.completionRate ?? 0}%`}
          foot={`${completedCount} of ${totalCount} tasks`}
          iconName="check"
          color="#5aa236"
          bg="#eef7e8"
        />
        <KpiCard
          label="Open Tasks"
          value={openTaskCount}
          foot={`${totals.inProgress ?? 0} in progress`}
          iconName="board"
          color="#0b3d91"
          bg="#e8eefc"
          go={hasTeamView() ? "alltasks:open" : "mytasks:open"}
          onGo={navigateToKpiView}
        />
        <KpiCard
          label="Overdue"
          value={totals.overdue ?? 0}
          foot={`${totals.dueToday ?? 0} due today`}
          iconName="alert"
          color="#d94b4b"
          bg="#fdeaea"
          go={hasTeamView() ? "alltasks:overdue" : "mytasks:overdue"}
          onGo={navigateToKpiView}
        />
        <KpiCard
          label="Avg. Completion"
          value={`${totals.avgDays ?? 0} days`}
          foot="From creation to done"
          iconName="clock"
          color="#7a5af8"
          bg="#f0ecff"
        />
      </div>

      <div className="grid-2e" style={{ marginBottom: 15 }}>
        <div className="card">
          <div className="card-head">
            <div>
              <h3>Tasks completed over time</h3>
              <div className="sub">Last 8 weeks (week starting) &middot; {whoseText}</div>
            </div>
          </div>
          <div className="card-body">
            <AnalyticsTrendSparkline
              values={reportsData.trend.map(t => t.value)}
              labels={reportsData.trend.map(t => t.label)}
            />
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <h3>Status distribution</h3>
              <div className="sub">{whoseText}</div>
            </div>
          </div>
          <div className="card-body">
            <HorizontalBarChart
              items={[
                { label: "To Do", value: totals.todo, color: STATUS_HEX_COLORS["To Do"] },
                {
                  label: "In Progress",
                  value: totals.inProgress,
                  color: STATUS_HEX_COLORS["In Progress"]
                },
                { label: "On Hold", value: totals.onHold, color: STATUS_HEX_COLORS["On Hold"] },
                { label: "Review", value: totals.review, color: STATUS_HEX_COLORS["Review"] },
                {
                  label: "Completed",
                  value: totals.completed,
                  color: STATUS_HEX_COLORS["Completed"]
                },
                {
                  label: "Cancelled",
                  value: totals.cancelled || 0,
                  color: STATUS_HEX_COLORS["Cancelled"]
                }
              ]}
            />
          </div>
        </div>
      </div>

      {/* Workload per Person Table */}
      <div className="card" style={{ marginBottom: 15 }}>
        <div className="card-head">
          <div>
            <h3>Workload per person</h3>
            <div className="sub">
              Open, completed and overdue tasks of{" "}
              {isCompanyWide ? "every member" : "each person in your team"}
            </div>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th>Open</th>
                <th>Completed</th>
                <th>Overdue</th>
                <th>Estimated</th>
                <th>Spent</th>
                <th>Load</th>
              </tr>
            </thead>
            <tbody>
              {reportsData.people.length ? (
                reportsData.people.map(person => (
                  <tr key={person.id}>
                    <td>
                      <PersonChip userId={person.id} />
                    </td>
                    <td>
                      <span className="strong">{person.open}</span>
                    </td>
                    <td>{person.done}</td>
                    <td>
                      {person.overdue ? (
                        <span className="badge b-red">{person.overdue}</span>
                      ) : (
                        <span className="muted">0</span>
                      )}
                    </td>
                    <td className="muted nowrap">{person.hours}h</td>
                    <td className="muted nowrap">{person.spent}h</td>
                    <td style={{ minWidth: 120 }}>
                      <div
                        className={
                          "bar" +
                          (person.open >= 6 ? " red" : person.open >= 4 ? " amber" : "")
                        }
                      >
                        <i style={{ width: `${Math.min(100, person.open * 12)}%` }} />
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="7">
                    <EmptyStateBox iconName="team" title="No data yet" />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Project Health Table */}
      <div className="card">
        <div className="card-head">
          <div>
            <h3>Project health</h3>
            <div className="sub">
              Reported progress compared with actual task completion
              {isCompanyWide ? "" : " (counting your team's tasks)"}
            </div>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Project</th>
                <th>Tasks</th>
                <th>Reported</th>
                <th>By tasks</th>
                <th>Variance</th>
                <th>Overdue</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {reportsData.projects.length ? (
                reportsData.projects.map(proj => {
                  const variance = proj.reported - proj.taskBased;
                  return (
                    <tr
                      key={proj.id}
                      className="clickable"
                      data-project={proj.id}
                      onClick={() => navigateToDetail("project", proj.id)}
                    >
                      <td className="strong">{proj.name}</td>
                      <td>
                        {proj.done}/{proj.total}
                      </td>
                      <td style={{ minWidth: 110 }}>
                        <div className="bar">
                          <i style={{ width: `${proj.reported}%` }} />
                        </div>
                        <span className="muted" style={{ fontSize: 10.9 }}>
                          {proj.reported}%
                        </span>
                      </td>
                      <td className="muted">{proj.taskBased}%</td>
                      <td>
                        <span
                          className={
                            "badge " +
                            (Math.abs(variance) <= 12
                              ? "b-green"
                              : variance > 0
                              ? "b-amber"
                              : "b-red")
                          }
                        >
                          {variance > 0 ? "+" : ""}
                          {variance}%
                        </span>
                      </td>
                      <td>
                        {proj.overdue ? (
                          <span className="badge b-red">{proj.overdue}</span>
                        ) : (
                          <span className="muted">0</span>
                        )}
                      </td>
                      <td>
                        <Badge dot className={PROJECT_STATUS_BADGE_CLASSES[proj.status]}>
                          {proj.status}
                        </Badge>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="7">
                    <EmptyStateBox iconName="proj" title="No projects yet" />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

/* ==========================================================================
   4. SETTINGS & PROFILE VIEW
   ========================================================================== */

export function Settings() {
  const currentUser = appStore.currentUser;
  const profileUser = getUserById(currentUser.id) || currentUser;
  const managerUser = profileUser.reportsTo ? getUserById(profileUser.reportsTo) : null;

  const permissionsMatrix = [
    ["Create tasks and edit task details", can.createTask()],
    ["Change task status, checklist, hours and comment", hasPermission("tasks.update")],
    ["Delete tasks of your team", hasPermission("tasks.delete")],
    ["Assign tasks to your team", can.assignOther()],
    ["See every task in the company", Boolean(currentUser.seesAllTasks)],
    [
      "Add tags / remove existing tags",
      hasPermission("tags.edit")
        ? hasPermission("tags.delete")
          ? true
          : "add only"
        : false
    ],
    ["Create and edit projects", can.projects()],
    ["Use the sales pipeline", can.deals()],
    ["Change or delete deals", can.editDeal()],
    ["View reports (" + (currentUser.seesAllTasks ? "company" : "your team") + ")", can.reports()],
    ["Add and edit users", can.users()],
    ["Remove any attachment", hasPermission("files.delete")],
    ["Open the Recycle Bin and restore items", can.recycle()],
    [
      "Activity log: " +
        (hasPermission("activity.all")
          ? "everyone"
          : hasPermission("activity.team")
          ? "you and your team"
          : "your own"),
      can.audit()
    ],
    [
      "Team workload: " +
        (hasPermission("workload.all")
          ? "everyone"
          : hasPermission("workload.team")
          ? "you and your team"
          : "your own"),
      can.workload()
    ],
    [
      "Manage permissions" +
        (isCurrentUserSuperAdmin() ? "" : " (Managers and Employees)"),
      can.permissions()
    ],
    ["Change roles, cancel tasks (Super Admin)", isCurrentUserSuperAdmin()]
  ];

  useEffect(() => {
    const timers = [150, 800, 2000].map(delayMs =>
      setTimeout(() => window.clearSearchAutofill && window.clearSearchAutofill(), delayMs)
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="grid-2e">
      <div>
        <ProfilePhotoCard />
        <DevicePushNotificationsCard />
        <ChangePasswordCard />
      </div>

      <div>
        {/* Profile Card */}
        <div className="card" style={{ marginBottom: 15 }}>
          <div className="card-head">
            <div>
              <h3>My profile</h3>
              <div className="sub">How you appear in the workspace</div>
            </div>
          </div>
          <div className="card-body">
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
              <Avatar user={currentUser.id} className="lg" isOnline={true} />
              <div>
                <div style={{ fontSize: 16, fontWeight: 680 }}>{profileUser.name}</div>
                <div className="muted" style={{ fontSize: 12.3 }}>
                  {profileUser.designation || currentUser.role} &middot; {profileUser.dept || ""}
                </div>
                <div style={{ marginTop: 7 }}>
                  <RolePill role={currentUser.role} />
                  {isCurrentUserSuperAdmin() ? (
                    <>
                      {" "}
                      <span className="role-pill rp-admin">Super Admin</span>
                    </>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="field">
              <div className="k">Email</div>
              <div className="v">{profileUser.email || currentUser.email || "-"}</div>
            </div>
            <div className="field">
              <div className="k">Phone</div>
              <div className="v">{profileUser.phone || "-"}</div>
            </div>
            <div className="field">
              <div className="k">City</div>
              <div className="v">{profileUser.city || "-"}</div>
            </div>
            <div className="field">
              <div className="k">Reports to</div>
              <div className="v">
                {managerUser ? <PersonChip userId={managerUser.id} /> : "Nobody (top level)"}
              </div>
            </div>

            {isCurrentUserAdmin() ? (
              <button
                className="btn btn-primary btn-sm"
                id="editMe"
                style={{ marginTop: 14 }}
                onClick={() => openUser(currentUser.id)}
              >
                <Icon name="edit" /> Edit my details
              </button>
            ) : (
              <div className="hint" style={{ marginTop: 12 }}>
                To change your name, email or department, ask an Admin. You can change your photo
                and password here.
              </div>
            )}
          </div>
        </div>

        {/* Session Card */}
        <div className="card" style={{ marginBottom: 15 }}>
          <div className="card-head">
            <div>
              <h3>Session</h3>
              <div className="sub">Sign-in and security</div>
            </div>
          </div>
          <div className="card-body">
            <div style={{ fontSize: 12.9, color: "var(--text2)", lineHeight: 1.65 }}>
              You are signed in as <b>{currentUser.role}</b>. You are signed out after{" "}
              {appStore.database.session?.idleMinutes || 60} minutes without activity, and after{" "}
              {appStore.database.session?.absoluteHours || 12} hours in any case. If an Admin sets
              a new password for you or deactivates your account, you are signed out and the
              sign-in screen tells you why. Role or permission changes apply at once without
              signing you out.
            </div>
            <button
              className="btn btn-danger btn-sm"
              id="logout2"
              style={{ marginTop: 15 }}
              onClick={askSignOut}
            >
              <Icon name="out" /> Sign out
            </button>
          </div>
        </div>

        {/* Role Permissions Matrix Card */}
        <div className="card">
          <div className="card-head">
            <div>
              <h3>What you can do</h3>
              <div className="sub">Permissions for your role</div>
            </div>
          </div>
          <div className="card-body">
            <div className="mini-list">
              {permissionsMatrix.map(([description, isGranted]) => (
                <div key={description} className="mini-item">
                  <span className={"perm-ico " + (isGranted ? "yes" : "no")}>
                    <Icon name={isGranted ? "check" : "x"} />
                  </span>
                  <div className="t">
                    {description}
                    {typeof isGranted === "string" ? (
                      <>
                        {" "}
                        <span className="muted">({isGranted})</span>
                      </>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
   PHOTO RESIZING & PROFILE AVATAR UPLOAD
   ========================================================================== */

function verifyImageBinaryType(file) {
  const readBufferSlice = blob =>
    new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(new Uint8Array(reader.result || new ArrayBuffer(0)));
      reader.onerror = () => resolve(new Uint8Array(0));
      reader.readAsArrayBuffer(blob);
    });

  return Promise.all([
    readBufferSlice(file.slice(0, 16)),
    readBufferSlice(file.slice(Math.max(0, file.size - 4096)))
  ]).then(([headerBytes, tailBytes]) => {
    let detectedType = "";

    if (
      headerBytes.length >= 3 &&
      headerBytes[0] === 0xff &&
      headerBytes[1] === 0xd8 &&
      headerBytes[2] === 0xff
    ) {
      detectedType = "image/jpeg";
    } else if (
      headerBytes.length >= 8 &&
      headerBytes[0] === 0x89 &&
      headerBytes[1] === 0x50 &&
      headerBytes[2] === 0x4e &&
      headerBytes[3] === 0x47 &&
      headerBytes[4] === 0x0d &&
      headerBytes[5] === 0x0a &&
      headerBytes[6] === 0x1a &&
      headerBytes[7] === 0x0a
    ) {
      detectedType = "image/png";
    }

    if (!detectedType) return "";

    let isFileComplete = false;
    if (detectedType === "image/jpeg") {
      for (let idx = tailBytes.length - 2; idx >= 0; idx--) {
        if (tailBytes[idx] === 0xff && tailBytes[idx + 1] === 0xd9) {
          isFileComplete = true;
          break;
        }
      }
    } else {
      for (let idx = tailBytes.length - 4; idx >= 0; idx--) {
        if (
          tailBytes[idx] === 0x49 &&
          tailBytes[idx + 1] === 0x45 &&
          tailBytes[idx + 2] === 0x4e &&
          tailBytes[idx + 3] === 0x44
        ) {
          isFileComplete = true;
          break;
        }
      }
    }

    return isFileComplete ? detectedType : "damaged";
  });
}

function resizePhotoToSquareDataUrl(file) {
  const genericErrorMessage =
    "This file could not be read as an image. Please choose a JPG or PNG photo.";

  return verifyImageBinaryType(file).then(imageType => {
    if (imageType === "damaged") {
      throw new Error(
        "This image file is damaged or incomplete. Please choose another JPG or PNG photo."
      );
    }
    if (!imageType) {
      throw new Error(
        "This file is not a real JPG or PNG image (it may be damaged, or another format renamed to .jpg/.png)."
      );
    }

    return new Promise((resolve, reject) => {
      const fileReader = new FileReader();
      fileReader.onerror = () => reject(new Error(genericErrorMessage));
      fileReader.onload = () => {
        const imageElement = new Image();
        imageElement.onload = () => {
          const width = imageElement.naturalWidth;
          const height = imageElement.naturalHeight;
          if (!width || !height) return reject(new Error(genericErrorMessage));

          const squareDimension = Math.min(width, height);
          const canvas = document.createElement("canvas");
          canvas.width = 256;
          canvas.height = 256;
          const context = canvas.getContext("2d");

          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, 256, 256);
          context.drawImage(
            imageElement,
            (width - squareDimension) / 2,
            (height - squareDimension) / 2,
            squareDimension,
            squareDimension,
            0,
            0,
            256,
            256
          );

          resolve(canvas.toDataURL("image/jpeg", 0.88));
        };
        imageElement.onerror = () => reject(new Error(genericErrorMessage));
        imageElement.src = fileReader.result;
      };
      fileReader.readAsDataURL(file);
    });
  });
}

function ProfilePhotoCard() {
  const user = getUserById(appStore.currentUser?.id) || appStore.currentUser;
  const fileInputRef = useRef(null);
  const [hintMessage, setHintMessage] = useState({
    text: "The photo is resized to 256 x 256 pixels before it is uploaded.",
    isError: false
  });
  const [isUploading, setIsUploading] = useState(false);

  const handleSelectFile = async event => {
    const selectedFile = event.target.files?.[0];
    event.target.value = "";
    if (!selectedFile) return;

    if (
      !/\.(jpe?g|png)$/i.test(selectedFile.name) ||
      (selectedFile.type && !/^image\/(jpeg|jpg|png|pjpeg)$/i.test(selectedFile.type))
    ) {
      return setHintMessage({ text: "Please choose a JPG, JPEG or PNG photo.", isError: true });
    }

    if (!selectedFile.size) {
      return setHintMessage({ text: "The file is empty.", isError: true });
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      return setHintMessage({ text: "The photo must be 10 MB or smaller.", isError: true });
    }

    setIsUploading(true);
    setHintMessage({ text: "Uploading...", isError: false });

    try {
      const resizedBase64 = await resizePhotoToSquareDataUrl(selectedFile);
      await API.setAvatar({ name: "photo.jpg", mime: "image/jpeg", data: resizedBase64 });
      await safeRefresh();
      showToast("Profile photo updated");
      setHintMessage({
        text: "The photo is resized to 256 x 256 pixels before it is uploaded.",
        isError: false
      });
    } catch (uploadError) {
      setHintMessage({ text: uploadError.message || "Upload failed.", isError: true });
    }

    setIsUploading(false);
  };

  return (
    <div className="card" style={{ marginBottom: 15 }}>
      <div className="card-head">
        <div>
          <h3>Profile photo</h3>
          <div className="sub">Shown next to your name everywhere in the CRM. JPG or PNG.</div>
        </div>
      </div>
      <div className="card-body">
        <div className="photo-row">
          <Avatar user={appStore.currentUser?.id} className="xl" />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              className="btn btn-primary btn-sm"
              id="photoPick"
              disabled={isUploading}
              onClick={() => fileInputRef.current.click()}
            >
              <Icon name="up" /> {user.avatar ? "Change photo" : "Upload photo"}
            </button>
            {user.avatar ? (
              <button
                className="btn btn-ghost btn-sm"
                id="photoDel"
                onClick={() =>
                  confirmBox(
                    "Remove profile photo?",
                    <p>Your initials will be shown instead.</p>,
                    "Remove photo",
                    async () => {
                      await API.removeAvatar();
                      closeModal();
                      await safeRefresh();
                      showToast("Photo removed");
                    }
                  )
                }
              >
                <Icon name="del" /> Remove
              </button>
            ) : null}
            <input
              type="file"
              id="photoIn"
              ref={fileInputRef}
              accept=".jpg,.jpeg,.png,image/jpeg,image/png"
              style={{ display: "none" }}
              onChange={handleSelectFile}
            />
          </div>
        </div>
        <div
          className="hint"
          id="photoHint"
          style={hintMessage.isError ? { color: "var(--red)" } : undefined}
        >
          {hintMessage.text}
        </div>
      </div>
    </div>
  );
}

function DevicePushNotificationsCard() {
  const [isBusy, setIsBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    pushInit().then(() => emitStoreChange());
  }, []);

  const isPushActive = PUSH.active;
  const permissionStatus = "Notification" in window ? Notification.permission : "unsupported";

  const defaultStatusExplanation = !PUSH.supported
    ? PUSH.reason || "Not available in this browser."
    : !PUSH.ready
    ? PUSH.reason || "Checking..."
    : isPushActive
    ? "On. You get CRM notifications on this device even when the CRM tab is closed (the browser must be running)."
    : permissionStatus === "denied"
    ? "Blocked in this browser. Click the lock icon next to the address, set Notifications to Allow, then press Turn on."
    : pushIsIOS() && !pushIsStandalone()
    ? "On iPhone / iPad: add the CRM to the Home Screen (Safari > Share > Add to Home Screen), open it from there and turn on."
    : "Off. Turn on to get notifications in the corner of your screen (like WhatsApp Web or Jibble), even in other apps.";

  const executePushAction = async actionFn => {
    setIsBusy(true);
    setStatusMessage("");
    try {
      await actionFn();
      emitStoreChange();
    } catch (error) {
      setStatusMessage(error.message || String(error));
    }
    setIsBusy(false);
  };

  return (
    <div className="card" style={{ marginBottom: 15 }}>
      <div className="card-head">
        <div>
          <h3>Notifications on this device</h3>
          <div className="sub">Pop-up notifications on this computer or phone</div>
        </div>
        <div className="right">
          <span className={"badge " + (isPushActive ? "b-green" : "b-grey")}>
            {isPushActive ? "On" : "Off"}
          </span>
        </div>
      </div>
      <div className="card-body">
        <div
          style={{
            fontSize: 12.8,
            lineHeight: 1.6,
            color: statusMessage ? "var(--red)" : "var(--text2)"
          }}
          id="pushStatus"
        >
          {statusMessage || defaultStatusExplanation}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          {PUSH.supported && PUSH.ready ? (
            isPushActive ? (
              <>
                <button
                  className="btn btn-ghost btn-sm"
                  id="pushTestBtn"
                  disabled={isBusy}
                  onClick={() =>
                    executePushAction(async () => {
                      const result = await API.pushTest();
                      playNotificationAlarm(
                        result.local || { title: "Test notification", body: "Alarm check" },
                        { force: true }
                      );
                      if (result.local) {
                        showDeviceNotification(
                          result.local.title,
                          result.local.body,
                          "#/notifications",
                          `crm-test-${Date.now()}`,
                          true
                        );
                      }
                      showToast(
                        result.sent
                          ? "Test sent. It appears in the corner of the screen when the CRM is not in front."
                          : "No device received it. Turn notifications off and on again."
                      );
                    })
                  }
                >
                  <Icon name="bell" /> Send test
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  id="pushOffBtn"
                  disabled={isBusy}
                  onClick={() =>
                    executePushAction(async () => {
                      await pushDisable();
                      showToast("Notifications are off for this device");
                    })
                  }
                >
                  Turn off
                </button>
              </>
            ) : (
              <button
                className="btn btn-primary btn-sm"
                id="pushOnBtn"
                disabled={isBusy}
                onClick={() =>
                  executePushAction(async () => {
                    await pushEnable();
                    showToast("Notifications are on for this device");
                  })
                }
              >
                <Icon name="bell" /> Turn on notifications
              </button>
            )
          ) : null}
        </div>

        <div className="hint" style={{ marginTop: 10 }}>
          Turn on once on every computer and phone you use. Signing out turns it off for that
          device.
        </div>

        <div className="divider" style={{ margin: "14px 0" }} />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 650 }}>Notification alarm sound</div>
            <div className="muted" style={{ fontSize: 11.8 }}>
              Plays an audio chime or spoken voice alert when a new notification arrives
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <select
              className="i"
              id="notifSoundMode"
              style={{ width: "auto", minWidth: 200 }}
              value={getNotificationSoundMode()}
              onChange={event => {
                const mode = setNotificationSoundMode(event.target.value);
                emitStoreChange();
                if (mode !== "off") {
                  playNotificationAlarm({ title: "Notification alarm enabled" }, { force: true });
                }
                showToast(
                  mode === "off"
                    ? "Notification alarm sound muted"
                    : mode === "voice"
                    ? "Alarm chime + voice announcement enabled"
                    : "Notification alarm chime enabled"
                );
              }}
            >
              <option value="chime">Alarm chime (On)</option>
              <option value="voice">Alarm chime + Voice alert</option>
              <option value="off">Muted (Off)</option>
            </select>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              id="notifSoundTestBtn"
              onClick={() => {
                playNotificationAlarm(
                  { title: "Test notification alarm", body: "Incoming CRM notification sound check" },
                  { force: true }
                );
                showToast("Playing notification alarm test");
              }}
            >
              <Icon name="volOn" /> Test alarm
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChangePasswordCard() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formErrors, setFormErrors] = useState({});
  const [isUpdating, setIsUpdating] = useState(false);

  const handleSubmitPasswordChange = async event => {
    event.preventDefault();
    const errors = {};

    if (!currentPassword) errors.old = "Please enter current password.";
    if (!newPassword) {
      errors.new = "Please enter new password.";
    } else if (newPassword.length < 10) {
      errors.new = `New password must be at least 10 characters (now ${newPassword.length}).`;
    }

    if (!confirmPassword) errors.new2 = "Please enter confirm new password.";

    if (!errors.new) {
      const strengthError = validatePasswordStrength(newPassword);
      if (strengthError) errors.new = strengthError;
      else if (newPassword.length > 72) errors.new = "Password can be at most 72 characters.";
      else if (newPassword === currentPassword) {
        errors.new = "The new password must be different from the current one.";
      }
    }

    if (!errors.new && !errors.new2 && newPassword !== confirmPassword) {
      errors.new2 = "The two new passwords do not match.";
    }

    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setIsUpdating(true);
    try {
      await API.changePassword(currentPassword, newPassword);
      showToast("Password updated. Other devices were signed out.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (passwordError) {
      if (!passwordError.silent) {
        if (passwordError.field) {
          setFormErrors({ [passwordError.field]: passwordError.message });
        }
        showErrorToast(passwordError);
      }
    }
    setIsUpdating(false);
  };

  return (
    <div className="card" style={{ marginBottom: 15 }}>
      <div className="card-head">
        <div>
          <h3>Change my password</h3>
          <div className="sub">
            10 to 72 characters with one capital letter, one small letter and one number. A symbol
            makes it stronger.
          </div>
        </div>
      </div>

      <form
        className="card-body"
        id="pwFormWrap"
        autoComplete="on"
        noValidate
        onSubmit={handleSubmitPasswordChange}
      >
        <div className="form-grid" id="pwForm">
          <input
            type="text"
            name="username"
            autoComplete="username"
            value={appStore.currentUser?.email || ""}
            readOnly
            tabIndex={-1}
            aria-hidden="true"
            style={{ display: "none" }}
          />

          <label className={"f" + (formErrors.old ? " has-err" : "")}>
            <span>
              Current password
              <RequiredIndicator />
            </span>
            <input
              className="i"
              id="pwOld"
              type="password"
              autoComplete="current-password"
              maxLength={200}
              value={currentPassword}
              onChange={event => setCurrentPassword(event.target.value)}
            />
            {formErrors.old ? <div className="ferr">{formErrors.old}</div> : null}
          </label>

          <label className={"f" + (formErrors.new ? " has-err" : "")}>
            <span>
              New password
              <RequiredIndicator />
            </span>
            <input
              className="i"
              id="pwNew"
              type="password"
              autoComplete="new-password"
              maxLength={72}
              value={newPassword}
              onChange={event => setNewPassword(event.target.value)}
            />
            {formErrors.new ? <div className="ferr">{formErrors.new}</div> : null}
          </label>

          <label className={"f full" + (formErrors.new2 ? " has-err" : "")}>
            <span>
              Confirm new password
              <RequiredIndicator />
            </span>
            <input
              className="i"
              id="pwNew2"
              type="password"
              autoComplete="new-password"
              maxLength={72}
              value={confirmPassword}
              onChange={event => setConfirmPassword(event.target.value)}
            />
            {formErrors.new2 ? <div className="ferr">{formErrors.new2}</div> : null}
          </label>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            id="pwSave"
            disabled={isUpdating}
          >
            <Icon name="key" /> Update password
          </button>
        </div>
      </form>
    </div>
  );
}

/**
 * CRM Workspace Overview Dashboard Screen
 *
 * Displays:
 * - Dynamic greeting and personal task completion progress meter
 * - Key performance indicator metrics (Open, Overdue, Due Today, In Review, Completed this week)
 * - My Focus List: Top priority upcoming open tasks assigned to the current user
 * - Upcoming Deadlines: Chronologically ordered deadlines for the active scope
 * - Team Workload / Task Mix summary cards
 * - Real-time activity timeline feed
 */
import { useState, useEffect } from "react";
import { appStore, emitStoreChange } from "../store/appStore.js";
import { API } from "../services/api.js";
import { UI_TO_API_TASK_STATUS } from "../services/apiAdapters.js";
import {
  formatDateToISO,
  getTodayISO,
  getMyTasks,
  hasTeamView,
  isTaskOpen,
  isTaskOverdue,
  getArchivedUserMetrics,
  sortTasks,
  pluralize,
  getUserNameById,
  formatShortDisplayDate,
  formatDateTime,
  STATUS_HEX_COLORS,
  PRIORITY_BADGE_CLASSES,
  STATUSES,
  getTeamUsers,
  isTaskAssignedToUser,
  isCurrentUserAdmin,
  hasPermission
} from "../utils/helpers.js";
import { navigateToView, navigateToDetail } from "../routes/navigation.js";
import {
  KpiCard,
  TaskTable,
  ScopeSegmentedControl,
  Avatar,
  HorizontalBarChart
} from "../components/ui.jsx";
import { openTask, askDeleteTask } from "../components/forms/TaskForm.jsx";

/**
 * Handles KPI card clicks (e.g. "mytasks:overdue" -> navigates to mytasks view with overdue tab)
 * @param {string} targetAction
 */
export function navigateToKpiView(targetAction) {
  const [targetView, initialTab] = targetAction.split(":");
  navigateToView(targetView, initialTab);
}

// Backward-compatible export
export const goKpi = navigateToKpiView;

export function Dashboard() {
  const [liveDashboard, setLiveDashboard] = useState(null);

  useEffect(() => {
    let isMounted = true;
    API.dashboard().then(data => {
      if (isMounted && data) {
        setLiveDashboard(data);
      }
    });
    return () => { isMounted = false; };
  }, [appStore.refreshTick]);

  const currentUser = appStore.currentUser;
  const myAssignedTasks = getMyTasks();
  const todayDateString = getTodayISO();
  const sevenDaysAgoDateString = formatDateToISO(new Date(Date.now() - 7 * 864e5));

  const isTeamScopeSelected = hasTeamView() && appStore.taskFilters.scope === "team";
  const scopedTasks = isTeamScopeSelected ? appStore.database.tasks || [] : myAssignedTasks;

  const openTasks = scopedTasks.filter(isTaskOpen);
  const overdueTasks = scopedTasks.filter(isTaskOverdue);
  const dueTodayTasks = openTasks.filter(
    task => String(task.due || "").slice(0, 10) === todayDateString
  );
  const inReviewTasks = scopedTasks.filter(task => task.status === "Review");
  const completedThisWeekTasks = scopedTasks.filter(
    task => task.status === "Completed" && String(task.completedAt || "").slice(0, 10) >= sevenDaysAgoDateString
  );

  // Current user's individual completion percentage
  const myOpenTasks = myAssignedTasks.filter(isTaskOpen);
  const myArchivedMetrics = getArchivedUserMetrics(currentUser.id);
  const myCompletedCount =
    myAssignedTasks.filter(task => task.status === "Completed").length +
    (myArchivedMetrics.done || 0);
  const myTotalHistoricalTasks = myAssignedTasks.length + (myArchivedMetrics.total || 0);
  const myCompletionPercentage = liveDashboard?.banner?.completionPercentage !== undefined
    ? liveDashboard.banner.completionPercentage
    : (myTotalHistoricalTasks ? Math.round((myCompletedCount / myTotalHistoricalTasks) * 100) : 0);

  // Time-aware greeting
  const currentHour = new Date().getHours();
  const greetingText =
    currentHour < 12
      ? "Good morning"
      : currentHour < 17
      ? "Good afternoon"
      : "Good evening";

  const targetTasksView = isTeamScopeSelected ? "alltasks" : "mytasks";
  const scopeAudienceLabel = isTeamScopeSelected
    ? currentUser.seesAllTasks
      ? "everyone"
      : "you and your team"
    : "you";

  const focusTasksList = (liveDashboard?.myFocusList?.length && !isTeamScopeSelected)
    ? liveDashboard.myFocusList
    : sortTasks(myOpenTasks).slice(0, 7);

  const upcomingDeadlines = (liveDashboard?.upcomingDeadlines?.length && isTeamScopeSelected)
    ? liveDashboard.upcomingDeadlines
    : sortTasks(
        openTasks.filter(task => task.due && task.due >= todayDateString)
      ).slice(0, 6);

  const myOverdueCount = myAssignedTasks.filter(isTaskOverdue).length;

  const handleScopeChange = newScope => {
    appStore.taskFilters.scope = newScope;
    appStore.taskFilters.assigneeFilter = "";
    emitStoreChange();
  };

  return (
    <>
      {/* Welcome Banner & Completion Meter */}
      <div className="welcome">
        <div style={{ position: "relative", zIndex: 1 }}>
          <h2>
            {greetingText}, {String(currentUser.name).split(" ")[0]}
          </h2>
          <p>
            {myOpenTasks.length
              ? `You have ${pluralize(myOpenTasks.length, "open task")}${
                  myOverdueCount ? `, ${myOverdueCount} overdue` : ""
                }.`
              : "You are all caught up. Nice work."}
            {hasTeamView()
              ? ` Your team has ${pluralize(
                  (appStore.database.tasks || []).filter(isTaskOpen).length,
                  "open task"
                )}.`
              : ""}
          </p>
        </div>
        <div className="meter">
          <b>{myCompletionPercentage}%</b>
          <span>My completion</span>
        </div>
      </div>

      {/* Scope Switcher for Team Leaders and Admins */}
      {hasTeamView() ? (
        <div className="page-head">
          <span className="info">
            The numbers below count tasks of <b>{scopeAudienceLabel}</b>.
          </span>
          <span className="spacer" />
          <ScopeSegmentedControl onChange={handleScopeChange} />
        </div>
      ) : null}

      {/* KPI Cards Grid */}
      <div className="kpis">
        <KpiCard
          label={isTeamScopeSelected ? "Open Tasks" : "My Open Tasks"}
          value={openTasks.length}
          foot={`${dueTodayTasks.length} due today`}
          iconName="list"
          color="#0b3d91"
          bg="#e8eefc"
          go={`${targetTasksView}:open`}
          onGo={navigateToKpiView}
        />
        <KpiCard
          label="Overdue"
          value={overdueTasks.length}
          foot={overdueTasks.length ? "Needs attention" : "On track"}
          iconName="alert"
          color="#d94b4b"
          bg="#fdeaea"
          go={`${targetTasksView}:overdue`}
          onGo={navigateToKpiView}
        />
        <KpiCard
          label="Due Today"
          value={dueTodayTasks.length}
          foot="Deadline today"
          iconName="clock"
          color="#e0a13a"
          bg="#fdf3e2"
          go={`${targetTasksView}:today`}
          onGo={navigateToKpiView}
        />
        <KpiCard
          label="In Review"
          value={inReviewTasks.length}
          foot="Waiting for sign-off"
          iconName="eye"
          color="#7a5af8"
          bg="#f0ecff"
          go={`${targetTasksView}:review`}
          onGo={navigateToKpiView}
        />
        <KpiCard
          label="Done This Week"
          value={completedThisWeekTasks.length}
          foot="Completed in 7 days"
          iconName="check"
          color="#5aa236"
          bg="#eef7e8"
          go={`${targetTasksView}:completed`}
          onGo={navigateToKpiView}
        />
      </div>

      {/* Focus List & Upcoming Deadlines Grid */}
      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <div>
              <h3>My focus list</h3>
              <div className="sub">Open tasks assigned to you, by due date and priority</div>
            </div>
            <div className="right">
              <button
                className="btn btn-ghost btn-sm"
                data-go="mytasks"
                onClick={() => navigateToView("mytasks")}
              >
                View all
              </button>
            </div>
          </div>
          <TaskTable
            list={focusTasksList}
            opts={{
              compact: true,
              emptyTitle: "No open tasks",
              emptySub: "Tasks assigned to you will appear here"
            }}
            onEdit={taskId => openTask(taskId)}
            onDel={askDeleteTask}
          />
        </div>

        <div>
          <div className="card" style={{ marginBottom: 15 }}>
            <div className="card-head">
              <div>
                <h3>Upcoming deadlines</h3>
                <div className="sub">
                  Next open tasks of {scopeAudienceLabel} by due date (today onwards)
                </div>
              </div>
            </div>
            <div className="card-body">
              <div className="mini-list">
                {upcomingDeadlines.length ? (
                  upcomingDeadlines.map(task => (
                    <div
                      key={task.id}
                      className="mini-item clickable"
                      data-task={task.id}
                      onClick={() => navigateToDetail("task", task.id)}
                    >
                      <i
                        style={{
                          width: 9,
                          height: 9,
                          borderRadius: 3,
                          flex: "0 0 9px",
                          background: STATUS_HEX_COLORS[task.status] || "#8894ac"
                        }}
                      />
                      <div style={{ minWidth: 0 }}>
                        <div className="t">{task.title}</div>
                        <div className="s">
                          {task.id} &middot;{" "}
                          {(task.assigneeIds || []).map(getUserNameById).join(", ") || "Unassigned"}
                        </div>
                      </div>
                      <div className="r">
                        <div className="s" style={{ fontWeight: 650, color: "var(--text2)" }}>
                          {formatShortDisplayDate(task.due)}
                        </div>
                        <span
                          className={"badge " + (PRIORITY_BADGE_CLASSES[task.priority] || "b-grey")}
                          style={{ marginTop: 3 }}
                        >
                          {task.priority}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="muted" style={{ fontSize: 12.6 }}>
                    No upcoming deadlines
                  </div>
                )}
              </div>
            </div>
          </div>

          {hasTeamView() ? (
            <TeamLoadCard liveWorkload={liveDashboard?.teamWorkload} />
          ) : (
            <StatusMixCard taskList={myAssignedTasks} liveMix={liveDashboard?.taskMix} />
          )}
        </div>
      </div>

      {/* Activity Timeline Card */}
      <div className="card">
        <div className="card-head">
          <div>
            <h3>Recent activity</h3>
            <div className="sub">
              {hasPermission("activity.all")
                ? "Latest updates across the workspace"
                : `Latest updates by you${
                    hasPermission("activity.team") && currentUser.hasTeam ? " and your team" : ""
                  }`}
            </div>
          </div>
        </div>
        <div className="card-body">
          <ActivityFeed
            activityList={liveDashboard?.recentActivities?.length ? liveDashboard.recentActivities : (appStore.database.activity || [])}
            maxCount={10}
          />
        </div>
      </div>
    </>
  );
}

/**
 * Team Workload Summary Card
 */
function TeamLoadCard({ liveWorkload }) {
  const activeTeamMembers = getTeamUsers().filter(user => user.status !== "Inactive");

  const workloadRows = (Array.isArray(liveWorkload) && liveWorkload.length > 0)
    ? liveWorkload.map(row => {
        const userId = row.userId || row.id;
        return {
          id: userId,
          openCount: row.openTasksCount !== undefined ? row.openTasksCount : (row.openCount || 0),
          lateCount: (appStore.database.tasks || []).filter(
            task => isTaskOverdue(task) && isTaskAssignedToUser(task, userId)
          ).length
        };
      })
    : activeTeamMembers
        .map(member => ({
          id: member.id,
          openCount: (appStore.database.tasks || []).filter(
            task => isTaskOpen(task) && isTaskAssignedToUser(task, member.id)
          ).length,
          lateCount: (appStore.database.tasks || []).filter(
            task => isTaskOverdue(task) && isTaskAssignedToUser(task, member.id)
          ).length
        }))
        .sort((a, b) => b.openCount - a.openCount)
        .slice(0, 8);

  const maxOpenCount = Math.max(...workloadRows.map(row => row.openCount), 1);

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h3>Team workload</h3>
          <div className="sub">
            Open tasks assigned to each person in {isCurrentUserAdmin() ? "the company" : "your team"}
          </div>
        </div>
        <div className="right">
          <button
            className="btn btn-ghost btn-sm"
            data-go="teamtasks"
            onClick={() => navigateToView("teamtasks")}
          >
            Details
          </button>
        </div>
      </div>
      <div className="card-body">
        {workloadRows.length ? (
          workloadRows.map(row => (
            <div
              key={row.id}
              className="clickable"
              data-user={row.id}
              style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 11 }}
              onClick={() => navigateToDetail("user", row.id)}
            >
              <Avatar user={row.id} className="sm" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="progress-row">
                  <span>
                    {getUserNameById(row.id)}
                    {row.lateCount ? (
                      <>
                        {" "}
                        <span className="badge b-red" style={{ padding: "0 6px" }}>
                          {row.lateCount} late
                        </span>
                      </>
                    ) : null}
                  </span>
                  <b>{row.openCount}</b>
                </div>
                <div
                  className={
                    "bar" +
                    (row.openCount >= 6 ? " red" : row.openCount >= 4 ? " amber" : "")
                  }
                >
                  <i style={{ width: `${Math.round((row.openCount / maxOpenCount) * 100)}%` }} />
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="muted" style={{ fontSize: 12.6 }}>
            Nobody reports to you yet. An Admin sets "Reports to" in Members.
          </div>
        )}
        <div className="info-note">
          How it is calculated: every task that is not Completed or Cancelled counts for each of its
          assignees. Amber = 4 or more open tasks, red = 6 or more.
        </div>
      </div>
    </div>
  );
}

/**
 * Task Status Distribution Horizontal Bar Chart Card
 */
function StatusMixCard({ taskList, liveMix }) {
  const chartItems = STATUSES.map(statusName => {
    let count = taskList.filter(task => task.status === statusName).length;
    if (liveMix && typeof liveMix === "object") {
      const apiKey = UI_TO_API_TASK_STATUS[statusName];
      if (apiKey && liveMix[apiKey] !== undefined) {
        count = Number(liveMix[apiKey]) || 0;
      }
    }
    return {
      label: statusName,
      value: count,
      color: STATUS_HEX_COLORS[statusName]
    };
  });

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h3>My task mix</h3>
          <div className="sub">Tasks assigned to you, by status</div>
        </div>
      </div>
      <div className="card-body">
        <HorizontalBarChart items={chartItems} />
      </div>
    </div>
  );
}

/**
 * Recent Activity Timeline List
 */
export function ActivityFeed({ activityList = [], maxCount = 10, list, n }) {
  const resolvedList = activityList.length ? activityList : list || [];
  const resolvedCount = maxCount ?? n ?? 10;

  if (!resolvedList.length) {
    return (
      <div className="muted" style={{ fontSize: 12.6 }}>
        No activity yet
      </div>
    );
  }

  return resolvedList.slice(0, resolvedCount).map((activityItem, index) => (
    <div key={index} className="tl">
      <i className="dot n" />
      <div style={{ flex: 1 }}>
        <div className="t">
          <b>{activityItem.who}</b> {activityItem.text}
        </div>
        <div className="w">{formatDateTime(activityItem.when)}</div>
      </div>
    </div>
  ));
}

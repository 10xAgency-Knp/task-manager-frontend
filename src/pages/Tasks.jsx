/**
 * Tasks Views Screen Collection
 *
 * Implements 4 key task management interfaces:
 * 1. TaskList: Filterable list with tab categories (Open, Overdue, Due Today, In Review, Completed)
 * 2. Board: Drag-and-drop 6-column Kanban board with live column dropping
 * 3. Calendar: Month-view task scheduling grid organized by due dates
 * 4. TeamWorkload: Team member workload distribution metrics & upcoming deadlines
 */
import { useEffect, useRef, useState } from "react";
import { appStore, emitStoreChange, showToast, showErrorToast } from "../store/appStore.js";
import { API } from "../services/api.js";
import { Icon } from "../components/Icon.jsx";
import {
  formatDateToISO,
  getTodayISO,
  isTaskOpen,
  isTaskOverdue,
  isTaskAssignedToUser,
  getMyTasks,
  hasTeamView,
  isCurrentUserAdmin,
  getActiveUsers,
  getTeamUsers,
  getUserNameById,
  pluralize,
  sortTasks,
  PRIORITIES,
  STATUSES,
  BOARD_COLS,
  STATUS_HEX_COLORS,
  PRIORITY_BADGE_CLASSES,
  TASK_STATUS_BADGE_CLASSES,
  getProjectNameById,
  formatShortDisplayDate,
  can,
  canChangeTaskStatus,
  isCurrentUserSuperAdmin,
  getTasksByCurrentScope,
  getUserById,
  getTaskById
} from "../utils/helpers.js";
import { navigateToDetail } from "../routes/navigation.js";
import { safeRefresh } from "../services/sync.js";
import {
  TaskTable,
  ScopeSegmentedControl,
  Avatar,
  AssigneeAvatarStack,
  EmptyStateBox,
  AccessDeniedBox,
  Badge
} from "../components/ui.jsx";
import { openTask, askDeleteTask } from "../components/forms/TaskForm.jsx";

const updateTaskFilters = patch => {
  Object.assign(appStore.taskFilters, patch);
  emitStoreChange();
};

/* ==========================================================================
   1. TASK LIST VIEW
   ========================================================================== */

function getTaskListTabs() {
  const today = getTodayISO();
  const nextWeek = formatDateToISO(new Date(Date.now() + 7 * 864e5));

  return [
    { id: "all", label: "All", filterFn: () => true },
    { id: "open", label: "Open", filterFn: isTaskOpen },
    { id: "overdue", label: "Overdue", filterFn: isTaskOverdue },
    {
      id: "today",
      label: "Due today",
      filterFn: task => isTaskOpen(task) && String(task.due || "").slice(0, 10) === today
    },
    {
      id: "week",
      label: "Next 7 days",
      filterFn: task => isTaskOpen(task) && task.due && task.due >= today && task.due <= nextWeek
    },
    {
      id: "review",
      label: "In review",
      filterFn: task => task.status === "Review"
    },
    {
      id: "completed",
      label: "Completed",
      filterFn: task => task.status === "Completed"
    }
  ];
}

export function TaskList({ scope }) {
  const taskFilters = appStore.taskFilters;
  const currentUser = appStore.currentUser;
  const [searchInputText, setSearchInputText] = useState(taskFilters.searchQuery);
  const debounceTimerRef = useRef(null);

  const baseTasks =
    scope === "all"
      ? appStore.database.tasks || []
      : scope === "byMe"
      ? (appStore.database.tasks || []).filter(task => task.createdById === currentUser.id)
      : getMyTasks();

  const tabsList = getTaskListTabs();
  const activeTabConfig = tabsList.find(tab => tab.id === taskFilters.activeTab) || tabsList[0];

  const filteredTasks = baseTasks
    .filter(activeTabConfig.filterFn)
    .filter(task => {
      if (taskFilters.projectFilter && task.project !== taskFilters.projectFilter) return false;
      if (taskFilters.priorityFilter && task.priority !== taskFilters.priorityFilter) return false;
      if (taskFilters.statusFilter && task.status !== taskFilters.statusFilter) return false;
      if (taskFilters.assigneeFilter && !isTaskAssignedToUser(task, taskFilters.assigneeFilter)) return false;

      if (taskFilters.searchQuery) {
        const searchableHaystack = [
          task.id,
          task.title,
          task.description,
          task.categoryLabel,
          (task.tags || []).join(" "),
          (task.assigneeIds || []).map(getUserNameById).join(" ")
        ]
          .join(" ")
          .toLowerCase();

        if (!searchableHaystack.includes(taskFilters.searchQuery.toLowerCase())) {
          return false;
        }
      }
      return true;
    });

  const isAnyFilterActive = Boolean(
    taskFilters.projectFilter ||
      taskFilters.priorityFilter ||
      taskFilters.statusFilter ||
      taskFilters.assigneeFilter ||
      taskFilters.searchQuery
  );

  const availableProjects = (appStore.database.projects || []).filter(project =>
    baseTasks.some(task => task.project === project.id)
  );

  const availablePeople =
    scope !== "mine" && hasTeamView()
      ? isCurrentUserAdmin() || currentUser.seesAllTasks
        ? getActiveUsers()
        : getTeamUsers()
      : [];

  const handleSearchChange = textValue => {
    setSearchInputText(textValue);
    clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      updateTaskFilters({ searchQuery: textValue.trim() });
    }, 280);
  };

  return (
    <>
      <div className="page-head">
        <div className="tabs">
          {tabsList.map(tabItem => (
            <button
              key={tabItem.id}
              className={"tab " + (tabItem.id === activeTabConfig.id ? "active" : "")}
              data-tab={tabItem.id}
              onClick={() => updateTaskFilters({ activeTab: tabItem.id })}
            >
              {tabItem.label}
              <span className="n">{baseTasks.filter(tabItem.filterFn).length}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-head filters">
          <div className="gsearch" style={{ width: "auto", flex: 1, minWidth: 180 }}>
            <Icon name="search" />
            <input
              id="tSearch"
              placeholder="Filter by title, tag, ID, person..."
              value={searchInputText}
              autoComplete="off"
              maxLength={80}
              onChange={event => handleSearchChange(event.target.value)}
            />
          </div>

          <select
            className="i sel"
            id="fProj"
            value={taskFilters.projectFilter}
            onChange={event => updateTaskFilters({ projectFilter: event.target.value })}
          >
            <option value="">All projects</option>
            {availableProjects.map(project => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>

          {availablePeople.length ? (
            <select
              className="i sel"
              id="fAss"
              value={String(taskFilters.assigneeFilter)}
              onChange={event => updateTaskFilters({ assigneeFilter: event.target.value })}
            >
              <option value="">Everyone</option>
              {availablePeople.map(person => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          ) : null}

          <select
            className="i sel"
            id="fPrio"
            value={taskFilters.priorityFilter}
            onChange={event => updateTaskFilters({ priorityFilter: event.target.value })}
          >
            <option value="">Any priority</option>
            {PRIORITIES.map(priority => (
              <option key={priority}>{priority}</option>
            ))}
          </select>

          <select
            className="i sel"
            id="fStatus"
            value={taskFilters.statusFilter}
            onChange={event => updateTaskFilters({ statusFilter: event.target.value })}
          >
            <option value="">Any status</option>
            {STATUSES.map(status => (
              <option key={status}>{status}</option>
            ))}
          </select>

          {isAnyFilterActive ? (
            <button
              className="btn btn-ghost btn-sm"
              id="clrF"
              onClick={() => {
                setSearchInputText("");
                updateTaskFilters({
                  searchQuery: "",
                  projectFilter: "",
                  assigneeFilter: "",
                  priorityFilter: "",
                  statusFilter: ""
                });
              }}
            >
              <Icon name="x" /> Clear
            </button>
          ) : null}

          <span className="muted" style={{ fontSize: 12, marginLeft: "auto" }}>
            {pluralize(filteredTasks.length, "task")}
          </span>
        </div>

        <TaskTable
          list={sortTasks(filteredTasks)}
          opts={{
            emptyTitle: isAnyFilterActive ? "No tasks match these filters" : "No tasks here yet",
            emptySub: isAnyFilterActive ? "Try clearing the filters" : "Use Create Task to add one"
          }}
          onEdit={taskId => openTask(taskId)}
          onDel={askDeleteTask}
        />
      </div>
    </>
  );
}

/* ==========================================================================
   2. TEAM WORKLOAD VIEW
   ========================================================================== */

export function TeamWorkload() {
  const [workloadData, setWorkloadData] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (can.workload()) {
      API.workload().then(
        data => setWorkloadData(data),
        error => {
          if (!error.silent) setErrorMessage(error.message);
        }
      );
    }
  }, [appStore.refreshTick]);

  if (!can.workload()) {
    return <AccessDeniedBox message="You do not have permission to see workload." />;
  }
  if (errorMessage) {
    return <AccessDeniedBox message={errorMessage} />;
  }
  if (!workloadData) {
    return (
      <div className="card">
        <div className="card-body">
          <div className="sk sk-card" />
          <div className="sk sk-card" />
        </div>
      </div>
    );
  }

  const people = workloadData.people || [];
  const scopeExplanation =
    workloadData.scope === "all"
      ? "Everyone in the company"
      : workloadData.scope === "team"
      ? `${pluralize(people.length, "person")}: you and the people who report to you`
      : "Your own workload";

  const aggregateTotals = people.reduce(
    (accum, person) => {
      accum.assigned += person.assigned;
      accum.pending += person.pending;
      accum.inProgress += person.inProgress;
      accum.completed += person.completed;
      accum.overdue += person.overdue;
      accum.dueSoon += person.dueSoon;
      return accum;
    },
    { assigned: 0, pending: 0, inProgress: 0, completed: 0, overdue: 0, dueSoon: 0 }
  );

  const WorkloadStatBox = ({ count, label, className }) => (
    <div className={"wl-stat" + (className ? " " + className : "")}>
      <b>{count}</b>
      <span>{label}</span>
    </div>
  );

  return (
    <>
      <div className="page-head">
        <span className="info">{scopeExplanation}</span>
      </div>

      {people.length > 1 ? (
        <div className="wl-sum card" style={{ marginBottom: 14 }}>
          <div className="card-body wl-row">
            <WorkloadStatBox count={aggregateTotals.assigned} label="Assigned" />
            <WorkloadStatBox count={aggregateTotals.pending} label="Pending" />
            <WorkloadStatBox count={aggregateTotals.inProgress} label="In progress" />
            <WorkloadStatBox count={aggregateTotals.completed} label="Completed" className="ok" />
            <WorkloadStatBox
              count={aggregateTotals.overdue}
              label="Overdue"
              className={aggregateTotals.overdue ? "bad" : ""}
            />
            <WorkloadStatBox count={aggregateTotals.dueSoon} label="Due in 7 days" />
          </div>
        </div>
      ) : null}

      {people.length ? (
        <div className="grid-3">
          {people.map(person => {
            const userEntity = getUserById(person.id) || { id: person.id, name: person.name };
            const canAssignToUser =
              (appStore.database.assignable || []).includes(person.id) && can.createTask();

            return (
              <div key={person.id} className="card">
                <div
                  className="card-head clickable"
                  data-user={person.id}
                  onClick={() => navigateToDetail("user", person.id)}
                >
                  <Avatar user={userEntity} isOnline={Boolean(userEntity.online)} />
                  <div style={{ minWidth: 0 }}>
                    <h3>
                      {person.name}
                      {person.id === appStore.currentUser?.id ? (
                        <>
                          {" "}
                          <span className="muted" style={{ fontWeight: 500 }}>
                            (you)
                          </span>
                        </>
                      ) : null}
                    </h3>
                    <div className="sub">{person.designation}</div>
                  </div>
                  <div className="right">
                    {person.overdue ? (
                      <span className="badge b-red">{person.overdue} overdue</span>
                    ) : null}
                    <span className="pill">
                      {person.pending + person.inProgress + person.waiting} open
                    </span>
                  </div>
                </div>

                <div className="card-body" style={{ paddingTop: 6 }}>
                  <div className="wl-row">
                    <WorkloadStatBox count={person.assigned} label="Assigned" />
                    <WorkloadStatBox count={person.pending} label="Pending" />
                    <WorkloadStatBox count={person.inProgress} label="In progress" />
                    <WorkloadStatBox count={person.completed} label="Completed" className="ok" />
                    <WorkloadStatBox
                      count={person.overdue}
                      label="Overdue"
                      className={person.overdue ? "bad" : ""}
                    />
                  </div>

                  <div className="muted" style={{ fontSize: 11.5, margin: "10px 0 4px" }}>
                    Upcoming deadlines
                    {person.dueSoon ? <> &middot; {person.dueSoon} due in the next 7 days</> : null}
                  </div>

                  <div className="mini-list">
                    {person.upcoming.length ? (
                      person.upcoming.map(task => {
                        const isLate = task.due < getTodayISO();
                        return (
                          <div
                            key={task.id}
                            className="mini-item clickable"
                            data-task={task.id}
                            onClick={() => navigateToDetail("task", task.id)}
                          >
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div className="t ellipsis">{task.title}</div>
                              <div
                                className="s"
                                style={isLate ? { color: "#d94b4b", fontWeight: 650 } : undefined}
                              >
                                {task.id} &middot; {isLate ? "was due " : "due "}
                                {formatShortDisplayDate(task.due)}
                              </div>
                            </div>
                            <div className="r">
                              <Badge dot className={TASK_STATUS_BADGE_CLASSES[task.status]}>
                                {task.status}
                              </Badge>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="muted" style={{ fontSize: 12.6, padding: "8px 0" }}>
                        No deadlines in the next 14 days
                      </div>
                    )}
                  </div>

                  {canAssignToUser ? (
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ marginTop: 10 }}
                      onClick={() => openTask(null, { assignees: [person.id] })}
                    >
                      <Icon name="plus" /> Assign task
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyStateBox
          iconName="team"
          title="No workload to show"
          subtitle="Ask the Super Admin if you should see your team's workload"
        />
      )}
    </>
  );
}

/* ==========================================================================
   3. KANBAN TASK BOARD VIEW
   ========================================================================== */

export function Board() {
  const taskFilters = appStore.taskFilters;
  const [dragOverColumn, setDragOverColumn] = useState("");
  const [optimisticMovedTasks, setOptimisticMovedTasks] = useState({});
  const draggedTaskIdRef = useRef(null);

  const scopedTaskList = getTasksByCurrentScope();
  const filteredTasks = scopedTaskList.filter(
    task =>
      !(taskFilters.projectFilter && task.project !== taskFilters.projectFilter) &&
      !(taskFilters.assigneeFilter && !isTaskAssignedToUser(task, taskFilters.assigneeFilter))
  );

  const availableProjects = (appStore.database.projects || []).filter(project =>
    scopedTaskList.some(task => task.project === project.id)
  );

  const isTeamScope = taskFilters.scope === "team" && hasTeamView();
  const availablePeople = isTeamScope
    ? isCurrentUserAdmin() || appStore.currentUser.seesAllTasks
      ? getActiveUsers()
      : getTeamUsers()
    : [];

  const getEffectiveStatus = task => optimisticMovedTasks[task.id] || task.status;

  const handleCardDrop = async targetColumn => {
    setDragOverColumn("");
    const taskId = draggedTaskIdRef.current;
    draggedTaskIdRef.current = null;

    const task = getTaskById(taskId);
    if (!task || getEffectiveStatus(task) === targetColumn) return;

    if ((targetColumn === "Cancelled" || task.status === "Cancelled") && !isCurrentUserSuperAdmin()) {
      showToast("Only the Super Admin can cancel a task or reopen a cancelled task.", "err");
      return;
    }

    setOptimisticMovedTasks(previous => ({ ...previous, [taskId]: targetColumn }));

    try {
      await API.setStatus(taskId, targetColumn);
      showToast(`${taskId} moved to ${targetColumn}`);
      await safeRefresh();
    } catch (dropError) {
      showErrorToast(dropError);
    }

    setOptimisticMovedTasks(previous => {
      const next = { ...previous };
      delete next[taskId];
      return next;
    });
  };

  return (
    <>
      <div className="page-head">
        <select
          className="i sel"
          id="fProj"
          value={taskFilters.projectFilter}
          onChange={event => updateTaskFilters({ projectFilter: event.target.value })}
        >
          <option value="">All projects</option>
          {availableProjects.map(project => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>

        {availablePeople.length ? (
          <select
            className="i sel"
            id="fAss"
            value={String(taskFilters.assigneeFilter)}
            onChange={event => updateTaskFilters({ assigneeFilter: event.target.value })}
          >
            <option value="">Everyone</option>
            {availablePeople.map(person => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        ) : null}

        {taskFilters.projectFilter || taskFilters.assigneeFilter ? (
          <button
            className="btn btn-ghost btn-sm"
            id="clrF"
            onClick={() => updateTaskFilters({ projectFilter: "", assigneeFilter: "" })}
          >
            <Icon name="x" /> Clear
          </button>
        ) : null}

        <span className="info">
          {pluralize(filteredTasks.length, "task")}
          {isTeamScope ? "" : " assigned to you or created by you"} &middot; drag a card to change its status
        </span>

        <span className="spacer" />
        <ScopeSegmentedControl onChange={newScope => updateTaskFilters({ scope: newScope, assigneeFilter: "" })} />
      </div>

      <div className="kanban six" id="kanban">
        {BOARD_COLS.map(columnName => {
          const cardsInColumn = sortTasks(
            filteredTasks.filter(task => getEffectiveStatus(task) === columnName)
          );

          return (
            <div
              key={columnName}
              className={"kcol" + (dragOverColumn === columnName ? " over" : "")}
              data-col={columnName}
              onDragOver={event => {
                if (draggedTaskIdRef.current) {
                  event.preventDefault();
                  if (dragOverColumn !== columnName) setDragOverColumn(columnName);
                }
              }}
              onDragLeave={event => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                  setDragOverColumn("");
                }
              }}
              onDrop={event => {
                event.preventDefault();
                handleCardDrop(columnName);
              }}
            >
              <div className="kcol-head">
                <i style={{ background: STATUS_HEX_COLORS[columnName] }} />
                <strong>{columnName}</strong>
                <span className="c">{cardsInColumn.length}</span>
              </div>

              {cardsInColumn.length ? (
                cardsInColumn.map(task => (
                  <KanbanCard key={task.id} task={task} dragRef={draggedTaskIdRef} />
                ))
              ) : (
                <div className="kdrop muted">Drop tasks here</div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

function KanbanCard({ task, t, dragRef, drag }) {
  const resolvedTask = task || t;
  const resolvedDragRef = dragRef || drag;

  const [isDragging, setIsDragging] = useState(false);
  const subtasks = resolvedTask.subtasks || [];
  const completedSubtasks = subtasks.filter(sub => Number(sub.done)).length;
  const isOverdue = isTaskOverdue(resolvedTask);
  const canUpdate = can.updateTask(resolvedTask) && canChangeTaskStatus(resolvedTask);

  return (
    <div
      className={"kcard" + (isDragging ? " dragging" : "")}
      data-task={resolvedTask.id}
      data-id={resolvedTask.id}
      draggable={Boolean(canUpdate)}
      style={canUpdate ? undefined : { cursor: "pointer" }}
      onClick={() => navigateToDetail("task", resolvedTask.id)}
      onDragStart={event => {
        resolvedDragRef.current = resolvedTask.id;
        setIsDragging(true);
        try {
          event.dataTransfer.setData("text/plain", resolvedTask.id);
          event.dataTransfer.effectAllowed = "move";
        } catch (dataTransferError) {
          // Handled gracefully in legacy browsers
        }
      }}
      onDragEnd={() => setIsDragging(false)}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span className="kcard-id">{resolvedTask.id}</span>
        <span
          className={"badge " + (PRIORITY_BADGE_CLASSES[resolvedTask.priority] || "b-grey")}
          style={{ marginLeft: "auto", fontSize: 10.3, padding: "1px 7px" }}
        >
          {resolvedTask.priority}
        </span>
      </div>

      <div className="kcard-title">{resolvedTask.title}</div>

      {resolvedTask.project ? (
        <div className="muted ellipsis" style={{ fontSize: 11 }}>
          {getProjectNameById(resolvedTask.project)}
        </div>
      ) : null}

      {subtasks.length ? (
        <div className="bar" style={{ height: 5, marginTop: 8 }}>
          <i style={{ width: `${Math.round((completedSubtasks / subtasks.length) * 100)}%` }} />
        </div>
      ) : null}

      <div className="kcard-meta">
        <AssigneeAvatarStack task={resolvedTask} max={3} />
        <span className={"kcard-due" + (isOverdue ? " late" : "")}>
          <Icon name="clock" />
          {formatShortDisplayDate(resolvedTask.due)}
        </span>
      </div>
    </div>
  );
}

/* ==========================================================================
   4. CALENDAR SCHEDULING VIEW
   ========================================================================== */

export function Calendar() {
  const activeCalendarState = appStore.calendarDate;
  const currentMonthDate = new Date(
    activeCalendarState.getFullYear(),
    activeCalendarState.getMonth(),
    1
  );
  const activeMonthIndex = currentMonthDate.getMonth();

  const calendarGridStartDate = new Date(currentMonthDate);
  calendarGridStartDate.setDate(1 - ((currentMonthDate.getDay() + 6) % 7));

  const todayDateString = getTodayISO();
  const tasksByDueDateMap = {};

  getTasksByCurrentScope().forEach(task => {
    if (task.due) {
      const dateKey = String(task.due).slice(0, 10);
      tasksByDueDateMap[dateKey] = tasksByDueDateMap[dateKey] || [];
      tasksByDueDateMap[dateKey].push(task);
    }
  });

  const calendarDayCells = [];
  for (let dayOffset = 0; dayOffset < 42; dayOffset++) {
    const cellDate = new Date(
      calendarGridStartDate.getFullYear(),
      calendarGridStartDate.getMonth(),
      calendarGridStartDate.getDate() + dayOffset
    );

    if (dayOffset >= 35 && cellDate.getMonth() !== activeMonthIndex) {
      break;
    }

    const isoDateKey = formatDateToISO(cellDate);
    const dayEvents = sortTasks(tasksByDueDateMap[isoDateKey] || []);
    const isCurrentMonth = cellDate.getMonth() === activeMonthIndex;
    const isToday = isoDateKey === todayDateString;

    calendarDayCells.push(
      <div
        key={isoDateKey}
        className={
          "cal-cell" +
          (!isCurrentMonth ? " out" : "") +
          (isToday ? " today" : "")
        }
      >
        <div className="cal-d">
          <span>{cellDate.getDate()}</span>
          {dayEvents.length ? (
            <span className="muted" style={{ fontSize: 10 }}>
              {dayEvents.length}
            </span>
          ) : null}
        </div>

        {dayEvents.slice(0, 3).map(task => {
          const statusClass =
            task.status === "Completed"
              ? "done"
              : isTaskOverdue(task)
              ? "late"
              : task.priority === "High" || task.priority === "Urgent"
              ? "hi"
              : "";

          return (
            <div
              key={task.id}
              className={"cal-ev " + statusClass}
              data-task={task.id}
              title={`${task.id} - ${task.title} (${task.status})`}
              onClick={() => navigateToDetail("task", task.id)}
            >
              {task.title}
            </div>
          );
        })}

        {dayEvents.length > 3 ? (
          <div
            className="muted"
            style={{ fontSize: 10.5, marginTop: 3 }}
            title={dayEvents.slice(3).map(t => t.title).join(", ")}
          >
            +{dayEvents.length - 3} more
          </div>
        ) : null}
      </div>
    );
  }

  const navigateMonth = monthOffset => {
    appStore.calendarDate =
      monthOffset === 0
        ? new Date()
        : new Date(
            activeCalendarState.getFullYear(),
            activeCalendarState.getMonth() + monthOffset,
            1
          );
    emitStoreChange();
  };

  const isTeamScope = appStore.taskFilters.scope === "team" && hasTeamView();

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h3>
            {currentMonthDate.toLocaleDateString("en-IN", {
              month: "long",
              year: "numeric"
            })}
          </h3>
          <div className="sub">
            {isTeamScope ? "Your team's tasks" : "Tasks assigned to you or created by you"} by due date
          </div>
        </div>

        <div className="right">
          <ScopeSegmentedControl
            onChange={newScope => updateTaskFilters({ scope: newScope, assigneeFilter: "" })}
          />
          <button
            className="icon-sq"
            id="calPrev"
            title="Previous month"
            onClick={() => navigateMonth(-1)}
          >
            <Icon name="chevL" />
          </button>
          <button
            className="btn btn-ghost btn-sm"
            id="calToday"
            onClick={() => navigateMonth(0)}
          >
            Today
          </button>
          <button
            className="icon-sq"
            id="calNext"
            title="Next month"
            onClick={() => navigateMonth(1)}
          >
            <Icon name="chev" />
          </button>
        </div>
      </div>

      <div className="card-body">
        <div className="cal-scroll">
          <div className="cal-inner">
            <div className="cal-head">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(dayName => (
                <div key={dayName}>{dayName}</div>
              ))}
            </div>
            <div className="cal-grid">{calendarDayCells}</div>
          </div>
        </div>

        <div className="cal-legend">
          <span>
            <i style={{ background: "var(--navy)" }} />
            Open
          </span>
          <span>
            <i style={{ background: "var(--amber)" }} />
            High priority
          </span>
          <span>
            <i style={{ background: "var(--red)" }} />
            Overdue
          </span>
          <span>
            <i style={{ background: "var(--green)" }} />
            Completed
          </span>
        </div>
      </div>
    </div>
  );
}

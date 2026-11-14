/**
 * Projects & Deals Screen Collection
 *
 * Provides management views for:
 * 1. Projects: Grid of active, at-risk, and completed projects with progress bars and member avatars
 * 2. ProjectDetail: Full project workspace with KPI cards, member lists, status breakdowns, and project tasks
 * 3. Deals: Sales pipeline tracker with open pipeline value, weighted value, win rate, and deal stages
 */
import { appStore, emitStoreChange } from "../store/appStore.js";
import { Icon } from "../components/Icon.jsx";
import {
  can,
  isCurrentUserAdmin,
  getProjectById,
  calculateProjectStatistics,
  pluralize,
  formatShortDisplayDate,
  formatDisplayDate,
  formatDateTime,
  formatCurrencyINR,
  STATUSES,
  STATUS_HEX_COLORS,
  PROJECT_STATUS_BADGE_CLASSES,
  DEAL_STAGE_BADGE_CLASSES,
  DEAL_STAGES,
  isTaskOpen,
  isTaskAssignedToUser,
  sortTasks
} from "../utils/helpers.js";
import { navigateToDetail } from "../routes/navigation.js";
import {
  KpiCard,
  TaskTable,
  PersonChip,
  Avatar,
  EmptyStateBox,
  AccessDeniedBox,
  BackButton,
  MetadataDatesLine,
  HorizontalBarChart,
  Badge,
  MultiLineText
} from "../components/ui.jsx";
import { openTask, askDeleteTask } from "../components/forms/TaskForm.jsx";
import { openProject, askDeleteProject } from "../components/forms/ProjectForm.jsx";
import { openDeal, askDeleteDeal } from "../components/forms/DealForm.jsx";
import { usePageHeader } from "../hooks/useHead.js";

const setActiveTab = tabId => {
  appStore.taskFilters.activeTab = tabId;
  emitStoreChange();
};

/* ==========================================================================
   1. PROJECTS GRID VIEW
   ========================================================================== */

export function Projects() {
  const projectList = appStore.database.projects || [];
  const activeTabId = ["all", "active", "risk", "completed"].includes(appStore.taskFilters.activeTab)
    ? appStore.taskFilters.activeTab
    : "all";

  const projectTabs = [
    { id: "all", label: "All", filterFn: () => true },
    { id: "active", label: "Active", filterFn: project => project.status !== "Completed" },
    { id: "risk", label: "At risk", filterFn: project => project.status === "At Risk" },
    { id: "completed", label: "Completed", filterFn: project => project.status === "Completed" }
  ];

  const currentTabConfig = projectTabs.find(tab => tab.id === activeTabId) || projectTabs[0];
  const displayedProjects = projectList.filter(currentTabConfig.filterFn);

  return (
    <>
      <div className="page-head">
        <div className="tabs">
          {projectTabs.map(tab => (
            <button
              key={tab.id}
              className={"tab " + (tab.id === activeTabId ? "active" : "")}
              data-tab={tab.id}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
              <span className="n">{projectList.filter(tab.filterFn).length}</span>
            </button>
          ))}
        </div>

        <span className="spacer" />

        {can.projects() ? (
          <button
            className="btn btn-primary btn-sm"
            id="newProj"
            onClick={() => openProject(null)}
          >
            <Icon name="plus" /> New Project
          </button>
        ) : null}
      </div>

      {displayedProjects.length ? (
        <div className="grid-3">
          {displayedProjects.map(project => {
            const statistics = calculateProjectStatistics(project);
            const memberIds = project.memberIds || [];

            return (
              <div
                key={project.id}
                className="card clickable"
                data-project={project.id}
                style={{ padding: "17px 18px", display: "flex", flexDirection: "column" }}
                onClick={() => navigateToDetail("project", project.id)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span
                    className="muted"
                    style={{ fontSize: 11, fontWeight: 750, letterSpacing: ".5px" }}
                  >
                    {project.id}
                  </span>
                  <Badge
                    dot
                    className={PROJECT_STATUS_BADGE_CLASSES[project.status]}
                    style={{ marginLeft: "auto" }}
                  >
                    {project.status}
                  </Badge>
                </div>

                <div style={{ fontSize: 15, fontWeight: 680, lineHeight: 1.3 }}>
                  {project.name}
                </div>

                <div
                  className="muted clamp2"
                  style={{ fontSize: 12.3, marginTop: 4, minHeight: 36 }}
                >
                  {project.description || "No description"}
                </div>

                <div className="progress-row" style={{ marginTop: 12 }}>
                  <span>Progress</span>
                  <b>{project.progress}%</b>
                </div>

                <div
                  className={
                    "bar" +
                    (project.status === "At Risk"
                      ? " red"
                      : project.progress >= 100
                      ? " green"
                      : "")
                  }
                >
                  <i style={{ width: `${Math.min(100, project.progress)}%` }} />
                </div>

                <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 12 }}>
                  <span className="pill">{statistics.open} open</span>
                  <span className="pill">
                    {statistics.done}/{statistics.total} done
                  </span>
                  {statistics.late ? (
                    <span className="badge b-red">{statistics.late} overdue</span>
                  ) : null}
                </div>

                <div className="divider" style={{ margin: "13px 0 11px" }} />

                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: "auto" }}>
                  <div className="stack">
                    {memberIds.slice(0, 4).map(memberId => (
                      <Avatar key={memberId} user={memberId} className="sm" />
                    ))}
                    {memberIds.length > 4 ? (
                      <span className="more">+{memberIds.length - 4}</span>
                    ) : null}
                  </div>
                  <div className="muted" style={{ fontSize: 11.6, marginLeft: "auto", textAlign: "right" }}>
                    Due {formatShortDisplayDate(project.due)}
                  </div>
                </div>

                <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>
                  Updated {formatDateTime(project.updatedAt)}
                </div>

                <div
                  style={{
                    marginTop: 10,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap"
                  }}
                >
                  <span
                    className="muted"
                    style={{
                      fontSize: 10.6,
                      textTransform: "uppercase",
                      fontWeight: 700,
                      letterSpacing: ".4px"
                    }}
                  >
                    PM
                  </span>
                  <PersonChip userId={project.ownerId} />
                  {project.canEdit || project.canDelete ? (
                    <div className="row-actions" style={{ marginLeft: "auto" }}>
                      {project.canEdit ? (
                        <button
                          className="mini-btn"
                          data-editproj={project.id}
                          title="Edit"
                          onClick={event => {
                            event.stopPropagation();
                            openProject(project.id);
                          }}
                        >
                          <Icon name="edit" />
                        </button>
                      ) : null}
                      {project.canDelete ? (
                        <button
                          className="mini-btn danger"
                          data-delproj={project.id}
                          title="Delete"
                          onClick={event => {
                            event.stopPropagation();
                            askDeleteProject(project.id);
                          }}
                        >
                          <Icon name="del" />
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card">
          <EmptyStateBox
            iconName="proj"
            title="No projects here"
            subtitle={
              can.projects()
                ? "Use New Project to create one"
                : "You and your team are not part of any project yet"
            }
          />
        </div>
      )}
    </>
  );
}

/* ==========================================================================
   2. PROJECT DETAIL VIEW
   ========================================================================== */

export function ProjectDetail({ id }) {
  const project = getProjectById(id);

  usePageHeader(project?.name, project ? `${project.id} - ${project.status}` : "");

  if (!project) {
    return (
      <>
        <BackButton />
        <AccessDeniedBox message="This project was not found, or it is not shared with you or your team." />
      </>
    );
  }

  const statistics = calculateProjectStatistics(project);
  const memberIds = project.memberIds || [];

  const statusBreakdownItems = STATUSES.map(statusName => ({
    label: statusName,
    value:
      statistics.tasks.filter(task => task.status === statusName).length +
      (statusName === "Completed"
        ? statistics.oldCompleted
        : statusName === "Cancelled"
        ? statistics.oldCancelled
        : 0),
    color: STATUS_HEX_COLORS[statusName]
  }));

  return (
    <>
      <BackButton />

      {/* Project Overview Card */}
      <div className="card" style={{ marginBottom: 15 }}>
        <div className="card-body">
          <div style={{ display: "flex", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                <span className="muted" style={{ fontSize: 11.4, fontWeight: 750 }}>
                  {project.id}
                </span>
                <Badge dot className={PROJECT_STATUS_BADGE_CLASSES[project.status]}>
                  {project.status}
                </Badge>
              </div>
              <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-.4px" }}>
                {project.name}
              </h2>
              <div style={{ fontSize: 13, color: "var(--text2)", marginTop: 6, lineHeight: 1.6 }}>
                {project.description ? (
                  <MultiLineText text={project.description} />
                ) : (
                  <span className="muted">No description</span>
                )}
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {can.createTask() ? (
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => openTask(null, { project: project.id })}
                >
                  <Icon name="plus" /> Add task
                </button>
              ) : null}
              {project.canEdit ? (
                <button
                  className="btn btn-ghost btn-sm"
                  data-editproj={project.id}
                  onClick={() => openProject(project.id)}
                >
                  <Icon name="edit" /> Edit
                </button>
              ) : null}
              {project.canDelete ? (
                <button
                  className="btn btn-danger btn-sm"
                  data-delproj={project.id}
                  onClick={() => askDeleteProject(project.id)}
                >
                  <Icon name="del" /> Delete
                </button>
              ) : null}
            </div>
          </div>

          <div className="divider" />

          <div className="grid-4" style={{ gap: 12, margin: 0 }}>
            <div className="field">
              <div className="k">Project manager</div>
              <div className="v">
                <PersonChip userId={project.ownerId} />
              </div>
            </div>
            <div className="field">
              <div className="k">Start date</div>
              <div className="v">{formatDisplayDate(project.startDate)}</div>
            </div>
            <div className="field">
              <div className="k">Deadline</div>
              <div className="v">{formatDisplayDate(project.due)}</div>
            </div>
            <div className="field">
              <div className="k">Budget</div>
              <div className="v">{can.projects() ? formatCurrencyINR(project.budget) : "-"}</div>
            </div>
          </div>

          <div className="progress-row" style={{ marginTop: 12 }}>
            <span>Reported progress</span>
            <b>{project.progress}%</b>
          </div>
          <div className={"bar" + (project.progress >= 100 ? " green" : "")} style={{ height: 8 }}>
            <i style={{ width: `${Math.min(100, project.progress)}%` }} />
          </div>

          <MetadataDatesLine item={project} />
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="kpis" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
        <KpiCard
          label="Total Tasks"
          value={statistics.total}
          foot={`${statistics.done} completed`}
          iconName="list"
          color="#0b3d91"
          bg="#e8eefc"
        />
        <KpiCard
          label="Open"
          value={statistics.open}
          foot="Still in progress"
          iconName="board"
          color="#7a5af8"
          bg="#f0ecff"
        />
        <KpiCard
          label="Overdue"
          value={statistics.late}
          foot={statistics.late ? "Needs attention" : "On track"}
          iconName="alert"
          color="#d94b4b"
          bg="#fdeaea"
        />
        <KpiCard
          label="By Tasks"
          value={`${statistics.total ? Math.round((statistics.done / statistics.total) * 100) : 0}%`}
          foot="Actual completion"
          iconName="check"
          color="#5aa236"
          bg="#eef7e8"
        />
      </div>

      {/* Project Tasks & Team Sidebar Grid */}
      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <div>
              <h3>Project tasks</h3>
              <div className="sub">
                {pluralize(statistics.total, "task")}
                {isCurrentUserAdmin() || appStore.currentUser?.seesAllTasks
                  ? ""
                  : " of you and your team in this project"}
                {statistics.oldCompleted + statistics.oldCancelled
                  ? ` (${statistics.oldCompleted + statistics.oldCancelled} closed more than 90 days ago are not listed: find them with search)`
                  : ""}
              </div>
            </div>
          </div>
          <TaskTable
            list={sortTasks(statistics.tasks)}
            opts={{
              noProject: true,
              emptyTitle: "No tasks in this project yet",
              emptySub: "Use Add task to create one"
            }}
            onEdit={taskId => openTask(taskId)}
            onDel={askDeleteTask}
          />
        </div>

        <div>
          <div className="card" style={{ marginBottom: 15 }}>
            <div className="card-head">
              <div>
                <h3>Team</h3>
                <div className="sub">{pluralize(memberIds.length, "member")}</div>
              </div>
            </div>
            <div className="card-body">
              <div className="mini-list">
                {memberIds.length ? (
                  memberIds.map(memberId => (
                    <div key={memberId} className="mini-item">
                      <PersonChip userId={memberId} />
                      <div className="r">
                        <span className="pill">
                          {
                            statistics.tasks.filter(
                              task => isTaskOpen(task) && isTaskAssignedToUser(task, memberId)
                            ).length
                          }{" "}
                          open
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="muted" style={{ fontSize: 12.6 }}>
                    No members added
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <div>
                <h3>Status breakdown</h3>
              </div>
            </div>
            <div className="card-body">
              <HorizontalBarChart items={statusBreakdownItems} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ==========================================================================
   3. SALES PIPELINE / DEALS VIEW
   ========================================================================== */

export function Deals() {
  if (!can.deals()) {
    return <AccessDeniedBox message="You do not have access to the sales pipeline." />;
  }

  const dealsList = appStore.database.deals || [];
  const currentTab =
    DEAL_STAGES.includes(appStore.taskFilters.activeTab) || appStore.taskFilters.activeTab === "open"
      ? appStore.taskFilters.activeTab
      : "all";

  const openDeals = dealsList.filter(deal => deal.stage !== "Won" && deal.stage !== "Lost");
  const totalOpenPipelineValue = openDeals.reduce((sum, deal) => sum + deal.value, 0);
  const weightedPipelineValue = openDeals.reduce(
    (sum, deal) => sum + (deal.value * deal.probability) / 100,
    0
  );

  const wonDeals = dealsList.filter(deal => deal.stage === "Won");
  const lostDeals = dealsList.filter(deal => deal.stage === "Lost");
  const totalResolvedDeals = wonDeals.length + lostDeals.length;
  const winRatePercentage = totalResolvedDeals
    ? Math.round((wonDeals.length / totalResolvedDeals) * 100)
    : 0;

  const displayedDeals = dealsList.filter(deal => {
    if (currentTab === "all") return true;
    if (currentTab === "open") return deal.stage !== "Won" && deal.stage !== "Lost";
    return deal.stage === currentTab;
  });

  return (
    <>
      <div className="kpis" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
        <KpiCard
          label="Open Pipeline"
          value={formatCurrencyINR(totalOpenPipelineValue)}
          foot={pluralize(openDeals.length, "open deal")}
          iconName="deal"
          color="#0b3d91"
          bg="#e8eefc"
        />
        <KpiCard
          label="Weighted Value"
          value={formatCurrencyINR(Math.round(weightedPipelineValue))}
          foot="Value x probability"
          iconName="report"
          color="#7a5af8"
          bg="#f0ecff"
        />
        <KpiCard
          label="Won"
          value={formatCurrencyINR(wonDeals.reduce((sum, deal) => sum + deal.value, 0))}
          foot={`${pluralize(wonDeals.length, "deal")} closed`}
          iconName="check"
          color="#5aa236"
          bg="#eef7e8"
        />
        <KpiCard
          label="Win Rate"
          value={`${winRatePercentage}%`}
          foot={`${wonDeals.length} won, ${lostDeals.length} lost`}
          iconName="flag"
          color="#e0a13a"
          bg="#fdf3e2"
        />
      </div>

      <div className="page-head">
        <div className="tabs">
          {["all", "open"].concat(DEAL_STAGES).map(tabKey => {
            const count =
              tabKey === "all"
                ? dealsList.length
                : tabKey === "open"
                ? openDeals.length
                : dealsList.filter(deal => deal.stage === tabKey).length;

            return (
              <button
                key={tabKey}
                className={"tab " + (tabKey === currentTab ? "active" : "")}
                data-tab={tabKey}
                onClick={() => setActiveTab(tabKey)}
              >
                {tabKey === "all" ? "All" : tabKey === "open" ? "Open" : tabKey}
                <span className="n">{count}</span>
              </button>
            );
          })}
        </div>

        <span className="spacer" />

        {can.createDeal() ? (
          <button
            className="btn btn-primary btn-sm"
            id="newDeal"
            onClick={() => openDeal(null)}
          >
            <Icon name="plus" /> New Deal
          </button>
        ) : null}
      </div>

      {!isCurrentUserAdmin() ? (
        <div className="notice" style={{ marginBottom: 12 }}>
          <Icon name="lock" />
          <div>
            You see the deals of{" "}
            {appStore.currentUser?.hasTeam ? "you and your team" : "your own"}.{" "}
            {can.editDeal()
              ? ""
              : 'Once a deal is created only someone with "Sales pipeline: Update" can change it. '}
            Click a deal to view it.
          </div>
        </div>
      ) : null}

      <div className="card">
        {displayedDeals.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ whiteSpace: "nowrap" }}>Deal</th>
                  <th>Account</th>
                  <th>Owner</th>
                  <th>Stage</th>
                  <th>Value</th>
                  <th>Probability</th>
                  <th>Close date</th>
                  <th>Updated</th>
                  <th className="right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayedDeals.map(deal => (
                  <tr
                    key={deal.id}
                    className="clickable"
                    data-editdeal={deal.id}
                    onClick={() => openDeal(deal.id)}
                  >
                    <td>
                      <div className="muted" style={{ fontSize: 10.6, fontWeight: 700 }}>
                        {deal.id}
                      </div>
                      <div className="strong">{deal.name}</div>
                    </td>
                    <td>{deal.account || "-"}</td>
                    <td>
                      <PersonChip userId={deal.ownerId} />
                    </td>
                    <td>
                      <Badge dot className={DEAL_STAGE_BADGE_CLASSES[deal.stage]}>
                        {deal.stage}
                      </Badge>
                    </td>
                    <td className="strong nowrap">{formatCurrencyINR(deal.value)}</td>
                    <td style={{ minWidth: 110 }}>
                      <div className="bar">
                        <i style={{ width: `${deal.probability}%` }} />
                      </div>
                      <span className="muted" style={{ fontSize: 10.9 }}>
                        {deal.probability}%
                      </span>
                    </td>
                    <td className="nowrap">{formatDisplayDate(deal.close)}</td>
                    <td className="nowrap muted" style={{ fontSize: 11.6 }}>
                      {formatDateTime(deal.updatedAt)}
                    </td>
                    <td>
                      <div className="row-actions">
                        {deal.canEdit ? (
                          <>
                            <button
                              className="mini-btn"
                              data-editdeal={deal.id}
                              title="Edit"
                              onClick={event => {
                                event.stopPropagation();
                                openDeal(deal.id);
                              }}
                            >
                              <Icon name="edit" />
                            </button>
                            {deal.canDelete ? (
                              <button
                                className="mini-btn danger"
                                data-deldeal={deal.id}
                                title="Delete"
                                onClick={event => {
                                  event.stopPropagation();
                                  askDeleteDeal(deal.id);
                                }}
                              >
                                <Icon name="del" />
                              </button>
                            ) : null}
                          </>
                        ) : (
                          <button
                            className="mini-btn"
                            data-editdeal={deal.id}
                            title="View"
                            onClick={event => {
                              event.stopPropagation();
                              openDeal(deal.id);
                            }}
                          >
                            <Icon name="eye" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyStateBox
            iconName="deal"
            title="No deals here"
            subtitle="Use New Deal to add an opportunity"
          />
        )}
      </div>
    </>
  );
}

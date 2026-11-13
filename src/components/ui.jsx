/**
 * Shared Application UI Building Blocks
 *
 * Provides standardized presentation components for avatars, person chips,
 * KPI summary cards, progress bars, tables, status badges, and pagination.
 */
import { useState } from "react";
import { appStore, showToast, showErrorToast } from "../store/appStore.js";
import { API } from "../services/api.js";
import { Icon } from "./Icon.jsx";
import { safeRefresh } from "../services/sync.js";
import { focusOn, navBack } from "../routes/navigation.js";
import {
  AVATAR_BACKGROUND_PALETTE,
  hashStringToIndex,
  getUserInitials,
  resolveUserEntity,
  getUserById,
  canViewUser,
  isTaskOverdue,
  formatShortDisplayDate,
  formatDateTime,
  getProjectNameById,
  getUserNameById,
  can,
  canChangeTaskStatus,
  getAvailableStatusChoices,
  PRIORITY_BADGE_CLASSES,
  TASK_STATUS_BADGE_CLASSES,
  hasTeamView
} from "../utils/helpers.js";

/**
 * User Avatar Component
 * Displays a profile photo when configured; falls back to initials on a deterministic colored background.
 */
export function Avatar({ user, u, className, cls, isOnline, online }) {
  const resolvedUserRef = user ?? u;
  const userEntity = resolveUserEntity(resolvedUserRef);
  const displayName = userEntity ? userEntity.name : String(resolvedUserRef ?? "?");
  const [isImageBroken, setIsImageBroken] = useState(false);
  const resolvedClass = className || cls || "";
  const resolvedOnline = isOnline ?? online;
  const onlineIndicator = resolvedOnline === true ? <i className="on" /> : null;

  if (userEntity && userEntity.avatar && !isImageBroken) {
    return (
      <div className={"avatar img " + resolvedClass} title={displayName}>
        <img
          src={userEntity.avatar}
          alt={displayName}
          className={/\bxl\b/.test(resolvedClass) ? "profile-photo" : undefined}
          onError={() => setIsImageBroken(true)}
        />
        {onlineIndicator}
      </div>
    );
  }

  const backgroundColor = AVATAR_BACKGROUND_PALETTE[
    hashStringToIndex(displayName, AVATAR_BACKGROUND_PALETTE.length)
  ];

  return (
    <div
      className={"avatar " + resolvedClass}
      style={{ background: backgroundColor }}
      title={displayName}
    >
      {getUserInitials(displayName)}
      {onlineIndicator}
    </div>
  );
}

/**
 * Clickable Person Chip
 * Displays an avatar, user name, and designation. Navigates to the user profile when allowed.
 */
export function PersonChip({
  userId,
  id,
  size,
  hideSubtitle,
  noSub,
  disableLink,
  noLink,
  isOnline,
  online,
  fallbackText,
  fallback
}) {
  const resolvedId = userId ?? id;
  const userEntity = getUserById(resolvedId);

  if (!userEntity) {
    return <span className="muted">{fallbackText || fallback || "-"}</span>;
  }

  const isLinkDisabled = disableLink ?? noLink;
  const isClickable = !isLinkDisabled && !userEntity.archived && canViewUser(userEntity);
  const isSubtitleHidden = hideSubtitle ?? noSub;
  const resolvedOnline = isOnline ?? online;

  const tooltipText = userEntity.name + (userEntity.designation ? ` - ${userEntity.designation}` : "");

  return (
    <span
      className={"pchip" + (isClickable ? " clickable" : "") + (userEntity.archived ? " arch" : "")}
      data-user={isClickable ? userEntity.id : undefined}
      title={tooltipText}
      onClick={
        isClickable
          ? event => {
              event.stopPropagation();
              focusOn("user", userEntity.id);
            }
          : undefined
      }
    >
      <Avatar
        user={userEntity}
        className={size || "sm"}
        isOnline={resolvedOnline ? Boolean(userEntity.online) : undefined}
      />
      <span className="pn">
        <b>{userEntity.name}</b>
        {isSubtitleHidden ? null : (
          <small>
            {userEntity.archived
              ? "Former member"
              : userEntity.designation || userEntity.role || ""}
          </small>
        )}
      </span>
    </span>
  );
}

/**
 * Key Performance Indicator (KPI) Metric Card
 */
export function KpiCard({
  label,
  value,
  foot,
  iconName,
  ic,
  color,
  bg,
  go,
  onGo
}) {
  const resolvedIcon = iconName || ic;
  const isClickable = Boolean(go);

  return (
    <div
      className="kpi"
      style={isClickable ? undefined : { cursor: "default" }}
      data-go={go || undefined}
      onClick={isClickable && onGo ? () => onGo(go) : undefined}
    >
      <div className="kpi-top">
        <span className="kpi-ico" style={{ background: bg, color }}>
          <Icon name={resolvedIcon} />
        </span>
        <span className="kpi-label">{label}</span>
      </div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-foot">{foot || ""}</div>
    </div>
  );
}

/**
 * Horizontal Progress Bar List
 */
export function HorizontalBarChart({ items }) {
  const maxValue = Math.max(...items.map(item => Number(item.value) || 0), 1);

  return items.map(item => {
    const numericValue = Number(item.value) || 0;
    const barWidthPercent = Math.round((numericValue / maxValue) * 100);

    return (
      <div key={item.label} style={{ marginBottom: 11 }}>
        <div className="progress-row">
          <span>{item.label}</span>
          <b>{numericValue}</b>
        </div>
        <div className="bar">
          <i style={{ width: `${barWidthPercent}%`, background: item.color }} />
        </div>
      </div>
    );
  });
}

/**
 * Empty State Container
 */
export function EmptyStateBox({ iconName, ic, title, subtitle, sub }) {
  const resolvedIcon = iconName || ic;
  const resolvedSubtitle = subtitle || sub;

  return (
    <div className="empty">
      <Icon name={resolvedIcon} />
      <p>{title}</p>
      {resolvedSubtitle ? <div className="sm">{resolvedSubtitle}</div> : null}
    </div>
  );
}

/**
 * Access Denied Message Box
 */
export function AccessDeniedBox({ message, msg }) {
  return (
    <div className="deny">
      <Icon name="lock" />
      <div>{message || msg || "You do not have access to this page."}</div>
    </div>
  );
}

/**
 * Back Navigation Button
 */
export function BackButton() {
  return (
    <button
      className="btn btn-ghost btn-sm"
      data-back="1"
      style={{ marginBottom: 14 }}
      onClick={navBack}
    >
      <Icon name="back" /> Back
    </button>
  );
}

/**
 * General Purpose Status Badge
 */
export function Badge({ className, cls, dot, children, style }) {
  const resolvedClass = className || cls || "b-grey";
  return (
    <span className={"badge " + (dot ? "dot " : "") + resolvedClass} style={style}>
      {children}
    </span>
  );
}

/**
 * User Role Pill
 */
export function RolePill({ role, r }) {
  const resolvedRole = role || r || "Employee";
  const pillStyleClass =
    resolvedRole === "Admin"
      ? "rp-admin"
      : resolvedRole === "Manager"
      ? "rp-manager"
      : "rp-employee";

  return <span className={"role-pill " + pillStyleClass}>{resolvedRole}</span>;
}

/**
 * User Status Pill Badge (Active / On Leave / Inactive)
 */
export function UserStatusBadge({ user, u }) {
  const resolvedUser = user || u;
  const statusColorClass =
    resolvedUser.status === "Active"
      ? "b-green"
      : resolvedUser.status === "On Leave"
      ? "b-amber"
      : "b-grey";

  return <span className={"badge " + statusColorClass}>{resolvedUser.status}</span>;
}

/**
 * Required Input Asterisk Indicator
 */
export function RequiredIndicator() {
  return (
    <span className="req" title="Required">
      *
    </span>
  );
}

/**
 * Multi-Line Text Formatter
 */
export function MultiLineText({ text }) {
  const lines = String(text ?? "").split("\n");
  return lines.map((lineText, index) => (
    <span key={index}>
      {lineText}
      {index < lines.length - 1 ? <br /> : null}
    </span>
  ));
}

/**
 * Entity Creation, Update, and Completion Timestamps Line
 */
export function MetadataDatesLine({ item, o }) {
  const entity = item || o || {};
  const dateParts = [];

  if (entity.createdAt) {
    dateParts.push(
      <span key="created">
        Created <b>{formatDateTime(entity.createdAt)}</b>
        {entity.createdById ? (
          <>
            {" "}by <b>{getUserNameById(entity.createdById)}</b>
          </>
        ) : null}
      </span>
    );
  }

  if (entity.updatedAt) {
    dateParts.push(
      <span key="updated">
        Last updated <b>{formatDateTime(entity.updatedAt)}</b>
      </span>
    );
  }

  if (entity.completedAt) {
    dateParts.push(
      <span key="completed">
        Completed <b>{formatDateTime(entity.completedAt)}</b>
      </span>
    );
  }

  return dateParts.length ? <div className="meta-dates">{dateParts}</div> : null;
}

/**
 * Task Scope Segmented Control ("Mine" | "My team")
 */
export function ScopeSegmentedControl({ onChange }) {
  if (!hasTeamView()) return null;

  const currentScope = appStore.taskFilters.scope;
  const scopeOptions = [
    ["mine", "Mine"],
    ["team", appStore.currentUser?.seesAllTasks ? "Everyone" : "My team"]
  ];

  return (
    <div className="seg scope-seg" title="Mine = assigned to you or created by you">
      {scopeOptions.map(([scopeKey, scopeLabel]) => (
        <button
          key={scopeKey}
          data-scope={scopeKey}
          className={currentScope === scopeKey ? "on" : ""}
          onClick={() => onChange(scopeKey)}
        >
          {scopeLabel}
        </button>
      ))}
    </div>
  );
}

/**
 * Stacked Assignee Avatars
 */
export function AssigneeAvatarStack({ task, t, max }) {
  const resolvedTask = task || t || {};
  const assigneeIds = resolvedTask.assigneeIds || [];

  if (!assigneeIds.length) {
    return <span className="muted">Unassigned</span>;
  }

  if (assigneeIds.length === 1 && !max) {
    return <PersonChip userId={assigneeIds[0]} />;
  }

  const maxDisplayCount = max || 3;
  const visibleIds = assigneeIds.slice(0, maxDisplayCount);
  const remainingCount = assigneeIds.length - maxDisplayCount;

  return (
    <div className="stack">
      {visibleIds.map(userId => (
        <Avatar key={userId} user={userId} className="sm" />
      ))}
      {remainingCount > 0 ? <span className="more">+{remainingCount}</span> : null}
    </div>
  );
}

/**
 * Inline Task Status Dropdown Select Cell
 */
export function TaskStatusSelectCell({ task, t }) {
  const resolvedTask = task || t;
  const [isBusy, setIsBusy] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState(null);

  if (!can.updateTask(resolvedTask) || !canChangeTaskStatus(resolvedTask)) {
    return (
      <Badge dot className={TASK_STATUS_BADGE_CLASSES[resolvedTask.status]}>
        {resolvedTask.status}
      </Badge>
    );
  }

  const handleStatusChange = async event => {
    const nextStatus = event.target.value;
    setIsBusy(true);
    setSelectedStatus(nextStatus);

    try {
      await API.setStatus(resolvedTask.id, nextStatus);
      showToast(`${resolvedTask.id} moved to ${nextStatus}`);
      await safeRefresh();
    } catch (error) {
      showErrorToast(error);
    }

    setIsBusy(false);
    setSelectedStatus(null);
  };

  return (
    <select
      className="i"
      data-st={resolvedTask.id}
      style={{ padding: "5px 8px", fontSize: 12, width: "auto" }}
      value={selectedStatus || resolvedTask.status}
      disabled={isBusy}
      onClick={event => event.stopPropagation()}
      onChange={handleStatusChange}
    >
      {getAvailableStatusChoices(resolvedTask.status).map(statusChoice => (
        <option key={statusChoice}>{statusChoice}</option>
      ))}
    </select>
  );
}

/**
 * Standard Tasks Data Table
 */
export function TaskTable({ list, opts = {}, onEdit, onDel }) {
  if (!list.length) {
    return (
      <EmptyStateBox
        iconName="list"
        title={opts.emptyTitle || "No tasks here"}
        subtitle={opts.emptySub || ""}
      />
    );
  }

  const shouldHideProject = opts.noProject || opts.compact;

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Task</th>
            {shouldHideProject ? null : <th>Project</th>}
            <th>Assignees</th>
            {opts.compact ? null : <th>Assigned by</th>}
            <th>Priority</th>
            <th>Status</th>
            <th>Due</th>
            {opts.compact ? null : <th>Updated</th>}
            <th className="right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {list.map(taskItem => {
            const isOverdue = isTaskOverdue(taskItem);
            const subtasks = taskItem.subtasks || [];
            const completedSubtaskCount = subtasks.filter(sub => Number(sub.done)).length;

            return (
              <tr
                key={taskItem.id}
                className="clickable"
                data-task={taskItem.id}
                onClick={() => focusOn("task", taskItem.id)}
              >
                <td style={{ minWidth: 220 }}>
                  <div className="muted" style={{ fontSize: 10.6, fontWeight: 750, letterSpacing: ".4px" }}>
                    {taskItem.id}
                    {subtasks.length ? (
                      <> &middot; {completedSubtaskCount}/{subtasks.length} checklist</>
                    ) : null}
                    {taskItem.commentCount ? (
                      <> &middot; {taskItem.commentCount} comment{taskItem.commentCount === 1 ? "" : "s"}</>
                    ) : null}
                  </div>
                  <div className="strong">{taskItem.title}</div>
                  {(taskItem.tags || []).length ? (
                    <div style={{ marginTop: 4 }}>
                      {taskItem.tags.slice(0, 4).map(tagName => (
                        <span key={tagName} className="tagchip">
                          #{tagName}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </td>

                {shouldHideProject ? null : (
                  <td className="muted" style={{ fontSize: 12.4 }}>
                    {taskItem.project ? getProjectNameById(taskItem.project) : "-"}
                  </td>
                )}

                <td>
                  <AssigneeAvatarStack task={taskItem} max={opts.compact ? 3 : undefined} />
                </td>

                {opts.compact ? null : (
                  <td>
                    <PersonChip userId={taskItem.createdById} hideSubtitle />
                  </td>
                )}

                <td>
                  <Badge dot className={PRIORITY_BADGE_CLASSES[taskItem.priority]}>
                    {taskItem.priority}
                  </Badge>
                </td>

                <td>
                  <TaskStatusSelectCell task={taskItem} />
                </td>

                <td
                  className="nowrap"
                  style={isOverdue ? { color: "#d94b4b", fontWeight: 650 } : undefined}
                >
                  {formatShortDisplayDate(taskItem.due)}
                  {isOverdue ? " (late)" : ""}
                </td>

                {opts.compact ? null : (
                  <td
                    className="nowrap muted"
                    style={{ fontSize: 11.6 }}
                    title={`Created ${formatDateTime(taskItem.createdAt)}`}
                  >
                    {formatDateTime(taskItem.updatedAt)}
                  </td>
                )}

                <td>
                  <div className="row-actions">
                    {can.editTask(taskItem) ? (
                      <button
                        className="mini-btn"
                        data-edit={taskItem.id}
                        title="Edit"
                        onClick={event => {
                          event.stopPropagation();
                          onEdit(taskItem.id);
                        }}
                      >
                        <Icon name="edit" />
                      </button>
                    ) : null}
                    {can.deleteTask(taskItem) ? (
                      <button
                        className="mini-btn danger"
                        data-del={taskItem.id}
                        title="Delete"
                        onClick={event => {
                          event.stopPropagation();
                          onDel(taskItem.id);
                        }}
                      >
                        <Icon name="del" />
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Numbered Pagination Controls
 */
export function PaginationControls({ page = 1, pages = 1, onPage }) {
  const currentPage = Number(page) || 1;
  const totalPages = Number(pages) || 1;
  if (totalPages <= 1) return null;

  const pageNumbers = [];
  const addPageNumber = num => {
    if (!pageNumbers.includes(num) && num >= 1 && num <= totalPages) {
      pageNumbers.push(num);
    }
  };

  addPageNumber(1);
  for (let offset = currentPage - 2; offset <= currentPage + 2; offset++) {
    addPageNumber(offset);
  }
  addPageNumber(totalPages);
  pageNumbers.sort((a, b) => a - b);

  const renderedElements = [];
  pageNumbers.forEach((pageNum, index) => {
    if (index > 0 && pageNum - pageNumbers[index - 1] > 1) {
      renderedElements.push(<span key={"gap-" + pageNum} className="gap">&hellip;</span>);
    }
    renderedElements.push(
      <button
        key={pageNum}
        data-page={pageNum}
        className={pageNum === currentPage ? "on" : ""}
        onClick={() => onPage(pageNum)}
      >
        {pageNum}
      </button>
    );
  });

  return (
    <div className="pager">
      <button
        data-page={currentPage - 1}
        disabled={currentPage <= 1}
        title="Previous page"
        onClick={() => onPage(currentPage - 1)}
      >
        &lsaquo; Prev
      </button>
      {renderedElements}
      <button
        data-page={currentPage + 1}
        disabled={currentPage >= totalPages}
        title="Next page"
        onClick={() => onPage(currentPage + 1)}
      >
        Next &rsaquo;
      </button>
      <span className="muted" style={{ fontSize: 12, marginLeft: 6 }}>
        Page {currentPage} of {totalPages}
      </span>
    </div>
  );
}

/**
 * Clipboard Copy Button with visual feedback confirmation
 */
export function CopyButton({ text, label, id }) {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = () => {
    if (!navigator.clipboard) {
      showToast("Could not copy. Please copy by hand.", "err");
      return;
    }
    navigator.clipboard.writeText(text).then(
      () => {
        setIsCopied(true);
        showToast("Copied");
        setTimeout(() => setIsCopied(false), 1400);
      },
      () => showToast("Could not copy. Please copy by hand.", "err")
    );
  };

  return (
    <button
      className={"btn btn-ghost" + (isCopied ? " is-done" : "")}
      id={id}
      onClick={handleCopy}
    >
      {isCopied ? (
        <>
          <Icon name="check" /> Copied
        </>
      ) : (
        <>
          <Icon name="file" /> {label || "Copy details"}
        </>
      )}
    </button>
  );
}

/* ==========================================================================
   LEGACY COMPATIBILITY EXPORTS
   ========================================================================== */

export const HBar = HorizontalBarChart;
export const EmptyBox = EmptyStateBox;
export const DenyBox = AccessDeniedBox;
export const BackBtn = BackButton;
export const Req = RequiredIndicator;
export const MultiLine = MultiLineText;
export const DatesLine = MetadataDatesLine;
export const ScopeSeg = ScopeSegmentedControl;
export const AssigneeStack = AssigneeAvatarStack;
export const StatusCell = TaskStatusSelectCell;
export const Pager = PaginationControls;
export const CopyBtn = CopyButton;

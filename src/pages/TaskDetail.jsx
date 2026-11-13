/**
 * Task Detail Workspace Screen
 *
 * Full-page workspace for an individual task displaying:
 * - Metadata header: Status, priority, project, assignees, dates, estimated vs. spent hours
 * - Multi-assignee chips and clickable project reference
 * - Interactive checklist with individual item toggles, additions, and deletions
 * - Real-time comments feed with @mention user autocomplete
 * - Multi-file attachment uploader with progress tracking, download, and deletion
 * - Activity timeline history
 */
import { useEffect, useRef, useState } from "react";
import { appStore, showToast, showErrorToast } from "../store/appStore.js";
import { API, CONFIG } from "../services/api.js";
import { Icon } from "../components/Icon.jsx";
import {
  can,
  canChangeTaskStatus,
  getAvailableStatusChoices,
  isTaskOverdue,
  formatDisplayDate,
  formatDateTime,
  formatByteSize,
  pluralize,
  getProjectNameById,
  getFieldValidationLimit,
  TASK_STATUS_BADGE_CLASSES,
  PRIORITY_BADGE_CLASSES,
  validateUploadFile,
  readFileAsDataUrl,
  UPLOAD_ACCEPT
} from "../utils/helpers.js";
import { navigateToDetail, navigateBack } from "../routes/navigation.js";
import { safeRefresh } from "../services/sync.js";
import {
  BackButton,
  AccessDeniedBox,
  PersonChip,
  Avatar,
  MetadataDatesLine,
  Badge,
  MultiLineText
} from "../components/ui.jsx";
import { confirmBox, closeModal } from "../components/Modal.jsx";
import { usePageHeader } from "../hooks/useHead.js";
import { openTask } from "../components/forms/TaskForm.jsx";

export function TaskDetail({ id }) {
  const [taskDetailData, setTaskDetailData] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");

  const loadTaskDetail = () =>
    API.detail(id).then(
      response => setTaskDetailData(response.data || response),
      error => {
        if (!error.silent && error.status !== 404) setErrorMessage(error.message);
      }
    );

  useEffect(() => {
    loadTaskDetail();
  }, [id, appStore.refreshTick]);

  usePageHeader(
    taskDetailData?.task?.title,
    taskDetailData
      ? `${taskDetailData.task.id}${
          taskDetailData.task.project ? ` - ${getProjectNameById(taskDetailData.task.project)}` : ""
        }`
      : ""
  );

  if (errorMessage) {
    return (
      <>
        <BackButton />
        <AccessDeniedBox message={errorMessage} />
      </>
    );
  }

  if (!taskDetailData) {
    return (
      <div className="card">
        <div className="card-body">
          <div className="sk sk-line" style={{ width: "40%" }} />
          <div className="sk sk-card" />
          <div className="sk sk-card" />
        </div>
      </div>
    );
  }

  return <TaskBody taskDetail={taskDetailData} taskId={id} reload={() => safeRefresh()} />;
}

function TaskBody({ taskDetail, taskId, reload }) {
  const task = taskDetail.task;
  const assigneeIds = task.assigneeIds || [];

  const canEdit = can.editTask(task);
  const canUpdate = can.updateTask(task);
  const canDelete = can.deleteTask(task);
  const canUploadAttachments =
    task.can?.upload !== undefined ? Boolean(task.can.upload) : canEdit;

  const subtaskList = taskDetail.subtasks || [];
  const completedSubtasksCount = subtaskList.filter(sub => Number(sub.done)).length;
  const totalSubtasksCount = subtaskList.length;
  const progressPercentage = totalSubtasksCount
    ? Math.round((completedSubtasksCount / totalSubtasksCount) * 100)
    : task.progress || 0;

  const isLate = isTaskOverdue({ status: task.status, due: task.due });
  const [statusChangeInProgress, setStatusChangeInProgress] = useState("");

  const handleStatusChange = async nextStatus => {
    if (nextStatus === task.status) return;
    setStatusChangeInProgress(nextStatus);

    try {
      await API.setStatus(taskId, nextStatus);
      showToast(`${taskId} moved to ${nextStatus}`);
      await reload();
    } catch (statusError) {
      showErrorToast(statusError);
    }
    setStatusChangeInProgress("");
  };

  const handleDeleteTask = () =>
    confirmBox(
      "Delete task?",
      <p>
        <b>{task.title}</b> ({taskId}) with its checklist, comments and files will move to
        the <b>Recycle Bin</b>. It can be restored for 30 days.
      </p>,
      "Delete",
      async () => {
        navigateBack();
        await API.delTask(taskId);
        closeModal();
        showToast("Task deleted");
        safeRefresh();
      }
    );

  return (
    <>
      <BackButton />

      {/* Task Header & Metadata Overview */}
      <div className="card" style={{ marginBottom: 15 }}>
        <div className="card-body">
          <div style={{ display: "flex", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", marginBottom: 6 }}>
                <span className="muted" style={{ fontSize: 11.4, fontWeight: 750, letterSpacing: ".5px" }}>
                  {task.id}
                </span>
                <Badge dot className={TASK_STATUS_BADGE_CLASSES[task.status]}>
                  {task.status}
                </Badge>
                <Badge dot className={PRIORITY_BADGE_CLASSES[task.priority]}>
                  {task.priority}
                </Badge>
                {task.categoryLabel ? <span className="pill">{task.categoryLabel}</span> : null}
              </div>

              <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-.4px", lineHeight: 1.3 }}>
                {task.title}
              </h2>

              {isLate ? (
                <div style={{ marginTop: 8 }}>
                  <span className="badge b-red">Overdue: was due {formatDisplayDate(task.due)}</span>
                </div>
              ) : null}
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {canEdit ? (
                <button
                  className="btn btn-ghost btn-sm"
                  id="editTask"
                  onClick={() => openTask(taskId, null, taskDetail)}
                >
                  <Icon name="edit" /> Edit
                </button>
              ) : null}
              {canDelete ? (
                <button
                  className="btn btn-danger btn-sm"
                  id="delTask"
                  onClick={handleDeleteTask}
                >
                  <Icon name="del" /> Delete
                </button>
              ) : null}
            </div>
          </div>

          <div className="divider" />

          {/* Details Metadata Grid */}
          <div className="grid-4" style={{ gap: 12, margin: 0 }}>
            <div className="field">
              <div className="k">Assignees</div>
              <div className="v" style={{ display: "flex", flexWrap: "wrap", gap: "8px 14px" }}>
                {assigneeIds.length ? (
                  assigneeIds.map(assigneeId => (
                    <PersonChip key={assigneeId} userId={assigneeId} />
                  ))
                ) : (
                  <span className="muted">Unassigned</span>
                )}
              </div>
            </div>

            <div className="field">
              <div className="k">Assigned by</div>
              <div className="v">
                <PersonChip userId={task.createdById} />
              </div>
            </div>

            <div className="field">
              <div className="k">Start date</div>
              <div className="v">{formatDisplayDate(task.startDate)}</div>
            </div>

            <div className="field">
              <div className="k">Due date</div>
              <div
                className="v"
                style={isLate ? { color: "#d94b4b", fontWeight: 650 } : undefined}
              >
                {formatDisplayDate(task.due)}
              </div>
            </div>
          </div>

          <div className="grid-4" style={{ gap: 12, margin: 0 }}>
            <div className="field">
              <div className="k">Project</div>
              <div className="v">
                {task.project ? (
                  <span
                    className="link"
                    data-project={task.project}
                    onClick={() => navigateToDetail("project", task.project)}
                  >
                    {getProjectNameById(task.project)}
                  </span>
                ) : (
                  "-"
                )}
              </div>
            </div>

            <div className="field">
              <div className="k">Estimated</div>
              <div className="v">{task.hours || 0}h</div>
            </div>

            <div className="field">
              <div className="k">Spent</div>
              <div className="v">{task.spent || 0}h</div>
            </div>

            <div className="field">
              <div className="k">Progress</div>
              <div className="v">{progressPercentage}%</div>
            </div>
          </div>

          <MetadataDatesLine item={task} />

          <div className="divider" />

          {/* Checklist Progress Bar */}
          <div className="progress-row">
            <span>Checklist completion</span>
            <b>
              {completedSubtasksCount}/{totalSubtasksCount}
            </b>
          </div>
          <div className={"bar" + (progressPercentage === 100 ? " green" : "")} style={{ height: 8 }}>
            <i style={{ width: `${progressPercentage}%` }} />
          </div>

          {canUpdate && canChangeTaskStatus(task) ? (
            <div style={{ marginTop: 14, display: "flex", gap: 9, flexWrap: "wrap", alignItems: "center" }}>
              <span className="muted" style={{ fontSize: 12.2 }}>
                Change status:
              </span>
              <div className="seg">
                {getAvailableStatusChoices(task.status).map(statusName => (
                  <button
                    key={statusName}
                    data-setstatus={statusName}
                    className={statusName === task.status ? "on" : undefined}
                    disabled={statusChangeInProgress === statusName}
                    onClick={() => handleStatusChange(statusName)}
                  >
                    {statusName}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Main Detail Grid: Description, Checklist, Comments vs Attachments & Timeline */}
      <div className="detail-grid">
        <div>
          {/* Description Card */}
          <div className="card" style={{ marginBottom: 15 }}>
            <div className="card-head">
              <div>
                <h3>Description</h3>
              </div>
            </div>
            <div className="card-body">
              <div style={{ fontSize: 13.3, lineHeight: 1.7, color: "var(--text2)" }}>
                {task.description ? (
                  <MultiLineText text={task.description} />
                ) : (
                  <span className="muted">No description added.</span>
                )}
              </div>
              {task.tags && task.tags.length ? (
                <div style={{ marginTop: 14 }}>
                  {task.tags.map(tagName => (
                    <span key={tagName} className="tagchip">
                      #{tagName}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <ChecklistSection
            taskDetail={taskDetail}
            taskId={taskId}
            canUpdate={canUpdate}
            progressPercentage={progressPercentage}
            completedCount={completedSubtasksCount}
            totalCount={totalSubtasksCount}
            reload={reload}
          />

          <CommentsSection
            taskDetail={taskDetail}
            taskId={taskId}
            canUpdate={canUpdate}
            reload={reload}
          />
        </div>

        <div>
          <AttachmentsSection
            taskDetail={taskDetail}
            taskId={taskId}
            task={task}
            canUpload={canUploadAttachments}
            reload={reload}
          />

          {/* Activity Timeline Card */}
          <div className="card">
            <div className="card-head">
              <div>
                <h3>Activity</h3>
                <div className="sub">Everything that happened on this task</div>
              </div>
            </div>
            <div className="card-body">
              {(taskDetail.timeline || []).length ? (
                taskDetail.timeline.map((eventItem, index) => {
                  const actionType = eventItem.action;
                  const dotColorClass =
                    actionType === "created"
                      ? "n"
                      : actionType === "status"
                      ? "g"
                      : actionType === "priority"
                      ? "a"
                      : actionType === "file"
                      ? "v"
                      : actionType === "due"
                      ? "r"
                      : "n";

                  return (
                    <div key={index} className="tl">
                      <i className={"dot " + dotColorClass} />
                      <div style={{ flex: 1 }}>
                        <div className="t">
                          <b>{eventItem.who}</b>: {eventItem.detail || eventItem.action}
                        </div>
                        <div className="w">{formatDateTime(eventItem.at)}</div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="muted" style={{ fontSize: 12.6 }}>
                  No activity yet
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ==========================================================================
   CHECKLIST COMPONENT
   ========================================================================== */

function ChecklistSection({
  taskDetail,
  taskId,
  canUpdate,
  progressPercentage,
  completedCount,
  totalCount,
  reload
}) {
  const [newChecklistText, setNewChecklistText] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [optimisticToggles, setOptimisticToggles] = useState({});

  const subtasksList = taskDetail.subtasks || [];

  const handleAddChecklist = async () => {
    const sanitizedTitle = newChecklistText.replace(/\s+/g, " ").trim();
    if (!sanitizedTitle) {
      setErrorMessage("Type the checklist item first.");
      return;
    }
    if (
      subtasksList.some(
        sub => sub.title.replace(/\s+/g, " ").trim().toLowerCase() === sanitizedTitle.toLowerCase()
      )
    ) {
      setErrorMessage(`“${sanitizedTitle}” is already in the checklist. Each item must be unique.`);
      return;
    }

    setIsAdding(true);
    try {
      await API.subtask({ op: "add", task: taskId, title: sanitizedTitle });
      setNewChecklistText("");
      await reload();
      showToast("Checklist item added");
    } catch (addError) {
      if (!addError.silent) {
        setErrorMessage(addError.message);
        showErrorToast(addError);
      }
    }
    setIsAdding(false);
  };

  const handleToggleChecklist = async (subtaskItem, isChecked) => {
    setOptimisticToggles(previous => ({ ...previous, [subtaskItem.id]: isChecked }));
    try {
      await API.subtask({ op: "toggle", task: taskId, subId: subtaskItem.id });
      await reload();
    } catch (toggleError) {
      showErrorToast(toggleError);
    }
    setOptimisticToggles(previous => {
      const next = { ...previous };
      delete next[subtaskItem.id];
      return next;
    });
  };

  const handleRemoveChecklist = subtaskItem =>
    confirmBox(
      "Remove checklist item?",
      <p>
        <b>{subtaskItem.title}</b> will be removed from the checklist.
      </p>,
      "Remove",
      async () => {
        await API.subtask({ op: "delete", task: taskId, subId: subtaskItem.id });
        closeModal();
        await reload();
        showToast("Checklist item removed");
      }
    );

  return (
    <div className="card" style={{ marginBottom: 15 }}>
      <div className="card-head">
        <div>
          <h3>Checklist</h3>
          <div className="sub">
            {completedCount} of {totalCount} complete
          </div>
        </div>
        <div className="right">
          <span className="pill">{progressPercentage}%</span>
        </div>
      </div>
      <div className="card-body">
        <div id="subList">
          {subtasksList.length ? (
            subtasksList.map(subtask => {
              const isDone =
                subtask.id in optimisticToggles
                  ? optimisticToggles[subtask.id]
                  : Boolean(Number(subtask.done));

              return (
                <div key={subtask.id} className={"check " + (isDone ? "done" : "")}>
                  <input
                    type="checkbox"
                    data-sub={subtask.id}
                    checked={isDone}
                    disabled={!canUpdate || subtask.id in optimisticToggles}
                    onChange={event => handleToggleChecklist(subtask, event.target.checked)}
                  />
                  <span>{subtask.title}</span>
                  {canUpdate ? (
                    <button
                      className="rm"
                      data-subdel={subtask.id}
                      title="Remove"
                      onClick={() => handleRemoveChecklist(subtask)}
                    >
                      <Icon name="x" />
                    </button>
                  ) : null}
                </div>
              );
            })
          ) : (
            <div className="muted" style={{ fontSize: 12.6, padding: "6px 0" }}>
              No checklist items yet
            </div>
          )}
        </div>

        {canUpdate ? (
          <div className={errorMessage ? "has-err" : ""}>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <input
                className="i"
                id="subNew"
                placeholder="Type a checklist item and press Enter"
                maxLength={getFieldValidationLimit("checklist", 1)}
                value={newChecklistText}
                onChange={event => {
                  setNewChecklistText(event.target.value);
                  setErrorMessage("");
                }}
                onKeyDown={event => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handleAddChecklist();
                  }
                }}
              />
              <button
                className="btn btn-primary btn-sm"
                id="subAdd"
                title="Add"
                disabled={isAdding}
                onClick={handleAddChecklist}
              >
                <Icon name="plus" />
              </button>
            </div>
            {errorMessage ? <div className="ferr">{errorMessage}</div> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ==========================================================================
   COMMENTS & @MENTIONS COMPONENT
   ========================================================================== */

function resolveCommentMentions(mentions = []) {
  return (Array.isArray(mentions) ? mentions : [])
    .map(mention => {
      if (mention && typeof mention === "object" && mention.name) {
        return { id: Number(mention.id ?? mention.usr_id), name: String(mention.name) };
      }
      const userId = Number(typeof mention === "object" ? (mention.id ?? mention.usr_id) : mention);
      const user = userId ? getUserById(userId) : null;
      return user && user.name ? { id: userId, name: user.name } : null;
    })
    .filter(Boolean);
}

function HighlightedCommentText({ body, mentions = [] }) {
  const resolvedMentions = resolveCommentMentions(mentions);
  const mentionNames = resolvedMentions
    .map(mention => `@${mention.name}`)
    .sort((a, b) => b.length - a.length);

  if (!mentionNames.length) {
    return <MultiLineText text={body} />;
  }

  const lowerMentionSet = new Set(mentionNames.map(n => n.toLowerCase()));
  const regexPattern = new RegExp(
    `(${mentionNames.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
    "i"
  );

  return String(body)
    .split(regexPattern)
    .map((chunk, index) =>
      lowerMentionSet.has(chunk.toLowerCase()) ? (
        <span key={index} className="at">
          {chunk}
        </span>
      ) : (
        <MultiLineText key={index} text={chunk} />
      )
    );
}

function CommentsSection({ taskDetail, taskId, canUpdate, reload }) {
  const [commentText, setCommentText] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isPosting, setIsPosting] = useState(false);
  const [mentionState, setMentionState] = useState({
    isOpen: false,
    candidates: [],
    selectedIndex: 0,
    cursorStartIndex: -1
  });

  const mentionedUserIdsRef = useRef([]);
  const textareaRef = useRef(null);

  const mentionablePeople = taskDetail.mentionable || [];
  const commentsList = taskDetail.comments || [];

  const inspectMentionsAtCursor = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const cursorPosition = textarea.selectionStart;
    const textBeforeCursor = textarea.value.slice(0, cursorPosition);
    const mentionMatch = /(^|[\s(])@([^@\n]{0,30})$/.exec(textBeforeCursor);

    if (!mentionMatch) {
      setMentionState({ isOpen: false, candidates: [], selectedIndex: 0, cursorStartIndex: -1 });
      return;
    }

    const searchQuery = mentionMatch[2].toLowerCase();
    const matchingCandidates = mentionablePeople
      .filter(
        person =>
          person &&
          person.name &&
          Number(person.id) !== Number(appStore.currentUser?.id) &&
          String(person.name).toLowerCase().includes(searchQuery)
      )
      .slice(0, 8);

    setMentionState(previous => ({
      isOpen: matchingCandidates.length > 0,
      candidates: matchingCandidates,
      selectedIndex: Math.min(previous.selectedIndex, Math.max(0, matchingCandidates.length - 1)),
      cursorStartIndex: cursorPosition - mentionMatch[2].length - 1
    }));
  };

  const handleSelectMentionCandidate = candidateIndex => {
    const person = mentionState.candidates[candidateIndex];
    const textarea = textareaRef.current;
    if (!person || mentionState.cursorStartIndex < 0 || !textarea) return;

    const currentCursor = textarea.selectionStart;
    const insertText = `@${person.name} `;
    const updatedValue =
      textarea.value.slice(0, mentionState.cursorStartIndex) +
      insertText +
      textarea.value.slice(currentCursor);

    setCommentText(updatedValue);
    const newCursorPosition = mentionState.cursorStartIndex + insertText.length;

    setTimeout(() => {
      textarea.setSelectionRange(newCursorPosition, newCursorPosition);
      textarea.focus();
    }, 0);

    if (!mentionedUserIdsRef.current.includes(person.id)) {
      mentionedUserIdsRef.current.push(person.id);
    }

    setMentionState({ isOpen: false, candidates: [], selectedIndex: 0, cursorStartIndex: -1 });
  };

  const handlePostComment = async () => {
    const sanitizedText = commentText.trim();
    if (!sanitizedText) {
      setErrorMessage("Write something first.");
      return;
    }

    const maxCommentLength = getFieldValidationLimit("comment", 1);
    if (sanitizedText.length > maxCommentLength) {
      setErrorMessage(`A comment can be at most ${maxCommentLength} characters.`);
      return;
    }

    const activeMentionIds = Array.from(
      new Set([
        ...mentionedUserIdsRef.current
          .map(Number)
          .filter(personId => {
            const person = mentionablePeople.find(p => Number(p.id) === personId);
            return person && person.name && sanitizedText.toLowerCase().includes(`@${person.name.toLowerCase()}`);
          }),
        ...mentionablePeople
          .filter(
            person =>
              person &&
              person.name &&
              Number(person.id) !== Number(appStore.currentUser?.id) &&
              sanitizedText.toLowerCase().includes(`@${person.name.toLowerCase()}`)
          )
          .map(person => Number(person.id))
      ])
    );

    setIsPosting(true);
    try {
      const response = await API.comment(taskId, sanitizedText, activeMentionIds);
      setCommentText("");
      mentionedUserIdsRef.current = [];
      await reload();

      const notificationSummary =
        response.mentioned && response.mentioned.length
          ? `Comment added. Notified: ${response.mentioned.join(", ")}`
          : "Comment added";
      showToast(notificationSummary);
    } catch (commentError) {
      if (!commentError.silent) {
        setErrorMessage(commentError.field === "comment" ? commentError.message : "");
        showErrorToast(commentError);
      }
    }
    setIsPosting(false);
  };

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h3>Comments</h3>
          <div className="sub">
            {pluralize(commentsList.length, "comment")}. Type @ to mention someone: they get a
            notification
          </div>
        </div>
      </div>
      <div className="card-body">
        <div id="cmtList">
          {commentsList.length ? (
            commentsList.map(comment => (
              <div key={comment.id || comment.at + comment.authorId} className="comment">
                <Avatar user={comment.authorId} className="sm" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="head">
                    <b>{comment.author}</b>
                    <span>{formatDateTime(comment.at)}</span>
                  </div>
                  <div className="body">
                    <HighlightedCommentText body={comment.body} mentions={comment.mentions} />
                  </div>
                  {(() => {
                    const resolvedMentions = resolveCommentMentions(comment.mentions);
                    return resolvedMentions.length ? (
                      <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                        Notified: {resolvedMentions.map(m => m.name).join(", ")}
                      </div>
                    ) : null;
                  })()}
                </div>
              </div>
            ))
          ) : (
            <div className="muted" style={{ fontSize: 12.6, padding: "8px 0" }}>
              No comments yet. Start the conversation.
            </div>
          )}
        </div>

        {!canUpdate ? (
          <div className="muted" style={{ fontSize: 12.4, marginTop: 12 }}>
            You can read comments. Adding comments needs the "Tasks: Update" permission.
          </div>
        ) : (
          <div style={{ display: "flex", gap: 10, marginTop: 14, alignItems: "flex-start" }}>
            <Avatar user={appStore.currentUser?.id} className="sm" />
            <div style={{ flex: 1 }} className={"f" + (errorMessage ? " has-err" : "")}>
              <div className="mention-wrap">
                <textarea
                  className="i"
                  id="cmtNew"
                  ref={textareaRef}
                  placeholder="Write a comment... type @ to mention someone"
                  maxLength={getFieldValidationLimit("comment", 1)}
                  value={commentText}
                  onChange={event => {
                    setCommentText(event.target.value);
                    setErrorMessage("");
                    setTimeout(inspectMentionsAtCursor, 0);
                  }}
                  onClick={inspectMentionsAtCursor}
                  onBlur={() =>
                    setTimeout(
                      () => setMentionState(prev => ({ ...prev, isOpen: false })),
                      150
                    )
                  }
                  onKeyDown={event => {
                    if (mentionState.isOpen && mentionState.candidates.length > 0) {
                      if (event.key === "ArrowDown") {
                        event.preventDefault();
                        setMentionState(prev => ({
                          ...prev,
                          selectedIndex: (prev.selectedIndex + 1) % prev.candidates.length
                        }));
                        return;
                      }
                      if (event.key === "ArrowUp") {
                        event.preventDefault();
                        setMentionState(prev => ({
                          ...prev,
                          selectedIndex:
                            (prev.selectedIndex - 1 + prev.candidates.length) %
                            prev.candidates.length
                        }));
                        return;
                      }
                      if (event.key === "Enter" || event.key === "Tab") {
                        event.preventDefault();
                        handleSelectMentionCandidate(mentionState.selectedIndex);
                        return;
                      }
                      if (event.key === "Escape") {
                        event.preventDefault();
                        event.stopPropagation();
                        setMentionState(prev => ({ ...prev, isOpen: false }));
                        return;
                      }
                    }

                    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                      event.preventDefault();
                      handlePostComment();
                    }
                  }}
                />

                <div
                  className="mention-list"
                  id="mentionList"
                  style={{ display: mentionState.isOpen ? "block" : "none" }}
                >
                  <div className="muted" style={{ fontSize: 11, padding: "4px 8px" }}>
                    People who can see this task
                  </div>
                  {mentionState.candidates.map((person, index) => (
                    <div
                      key={person.id}
                      className={
                        "multi-item" + (index === mentionState.selectedIndex ? " sel" : "")
                      }
                      data-mi={index}
                      onMouseDown={event => {
                        event.preventDefault();
                        handleSelectMentionCandidate(index);
                      }}
                    >
                      <Avatar user={person.id} className="sm" />
                      <span>{person.name}</span>
                      <span className="muted" style={{ marginLeft: "auto", fontSize: 11 }}>
                        {person.designation || ""}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {errorMessage ? <div className="ferr">{errorMessage}</div> : null}

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                <span className="hint" style={{ margin: 0 }}>
                  Type @ for suggestions &middot; Ctrl + Enter to send
                </span>
                <button
                  className="btn btn-primary btn-sm"
                  id="cmtAdd"
                  disabled={isPosting}
                  onClick={handlePostComment}
                >
                  <Icon name="chat" /> Comment
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ==========================================================================
   ATTACHMENTS & FILE UPLOADS COMPONENT
   ========================================================================== */

function AttachmentsSection({ taskDetail, taskId, task, canUpload, reload }) {
  const attachmentsList = taskDetail.attachments || [];
  const [uploadQueue, setUploadQueue] = useState([]);
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef(null);
  const isQueueProcessingRef = useRef(false);
  const pendingJobsRef = useRef([]);
  const uploadStatsRef = useRef({ changed: false, failedCount: 0 });
  const nextJobKeyRef = useRef(0);

  const updateQueueJob = (jobKey, patch) => {
    setUploadQueue(queue =>
      queue.map(item => (item.key === jobKey ? { ...item, ...patch } : item))
    );
  };

  const processUploadQueue = async () => {
    if (isQueueProcessingRef.current) return;
    isQueueProcessingRef.current = true;

    while (pendingJobsRef.current.length > 0) {
      const job = pendingJobsRef.current.shift();
      updateQueueJob(job.key, { percent: 0, statusText: "Reading file..." });

      try {
        const base64Data = await readFileAsDataUrl(job.file);
        updateQueueJob(job.key, { statusText: "Uploading..." });

        await API.uploadWithProgress(
          {
            task: taskId,
            name: job.file.name,
            mime: job.file.type || "",
            data: base64Data
          },
          progressPct =>
            updateQueueJob(job.key, {
              percent: progressPct,
              statusText: progressPct >= 99 ? "Saving..." : `Uploading ${progressPct}%`
            })
        );

        updateQueueJob(job.key, { percent: 100, statusText: "Uploaded", kind: "ok" });
        uploadStatsRef.current.changed = true;
      } catch (uploadError) {
        if (uploadError?.silent) {
          pendingJobsRef.current = [];
          break;
        }
        updateQueueJob(job.key, {
          statusText: uploadError.message || "Upload failed.",
          kind: "err"
        });
        uploadStatsRef.current.failedCount++;
      }
    }

    isQueueProcessingRef.current = false;
    const stats = uploadStatsRef.current;

    if (!stats.changed && stats.failedCount > 0) {
      showToast(
        `${stats.failedCount} ${
          stats.failedCount === 1 ? "file was" : "files were"
        } not uploaded. See the reasons below.`,
        "err"
      );
      stats.failedCount = 0;
    }

    if (stats.changed) {
      const waitDelay = stats.failedCount > 0 ? 4000 : 900;
      if (stats.failedCount > 0) {
        showToast(
          `${stats.failedCount} ${
            stats.failedCount === 1 ? "file was" : "files were"
          } not uploaded. See the reasons below.`,
          "err"
        );
      } else {
        showToast("Upload finished");
      }
      stats.changed = false;
      stats.failedCount = 0;
      setTimeout(() => {
        setUploadQueue([]);
        reload();
      }, waitDelay);
    }
  };

  const handleQueueFiles = fileList => {
    const queueRows = [];

    Array.prototype.forEach.call(fileList || [], file => {
      const jobKey = ++nextJobKeyRef.current;
      const validationError = validateUploadFile(file);

      queueRows.push({
        key: jobKey,
        name: file.name,
        size: file.size,
        percent: 0,
        statusText: validationError || "Waiting...",
        kind: validationError ? "err" : ""
      });

      if (validationError) {
        uploadStatsRef.current.failedCount++;
      } else {
        pendingJobsRef.current.push({ file, key: jobKey });
      }
    });

    setUploadQueue(prevQueue => prevQueue.concat(queueRows));
    setTimeout(processUploadQueue, 0);
  };

  const handleDownloadAttachment = async (attachment, triggerButton) => {
    triggerButton.disabled = true;
    try {
      await API.download(attachment.id, attachment.name);
    } catch (downloadError) {
      showErrorToast(downloadError);
    }
    triggerButton.disabled = false;
  };

  const handleRemoveAttachment = attachment =>
    confirmBox(
      "Remove file?",
      <p>
        The file will move to the <b>Recycle Bin</b> and can be restored for 30 days.
      </p>,
      "Remove",
      async () => {
        await API.delFile(attachment.id, taskId);
        closeModal();
        await reload();
        showToast("File removed");
      }
    );

  return (
    <div className="card" style={{ marginBottom: 15 }}>
      <div className="card-head">
        <div>
          <h3>Attachments</h3>
          <div className="sub">{pluralize(attachmentsList.length, "file")}</div>
        </div>
      </div>
      <div className="card-body">
        <div id="fileList">
          {attachmentsList.length ? (
            attachmentsList.map(attachment => (
              <div key={attachment.id} className="file-item">
                <span className="file-ico">
                  <Icon name="file" />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="n ellipsis">{attachment.name}</div>
                  <div className="m">
                    {attachment.by || ""} &middot; {formatByteSize(attachment.size)} &middot;{" "}
                    {formatDateTime(attachment.at)}
                  </div>
                </div>

                {can.files() ? (
                  <button
                    className="mini-btn"
                    data-filedl={attachment.id}
                    title="Download"
                    onClick={event => handleDownloadAttachment(attachment, event.currentTarget)}
                  >
                    <Icon name="down" />
                  </button>
                ) : null}

                {can.removeFile(attachment, task) ? (
                  <button
                    className="mini-btn danger"
                    data-filedel={attachment.id}
                    title="Remove"
                    onClick={() => handleRemoveAttachment(attachment)}
                  >
                    <Icon name="del" />
                  </button>
                ) : null}
              </div>
            ))
          ) : (
            <div className="muted" style={{ fontSize: 12.6, padding: "6px 0" }}>
              No files yet
            </div>
          )}
        </div>

        {canUpload ? (
          <>
            <div
              className={"drop" + (isDragOver ? " over" : "")}
              id="dropZone"
              style={{ marginTop: 12 }}
              onClick={() => fileInputRef.current.click()}
              onDragOver={event => {
                event.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={event => {
                event.preventDefault();
                setIsDragOver(false);
                handleQueueFiles(event.dataTransfer.files);
              }}
            >
              <Icon name="up" />
              <div style={{ marginTop: 6 }}>Drop files here or click to upload</div>
              <div style={{ fontSize: 11, marginTop: 3 }}>
                JPG, PNG, PDF, MP4, MOV, WEBM &middot; max {CONFIG.MAX_UPLOAD_MB} MB per file
              </div>
            </div>

            <div id="upQueue" className="up-queue">
              {uploadQueue.map(item => (
                <div key={item.key} className={"up-item" + (item.kind ? " " + item.kind : "")}>
                  <div className="up-top">
                    <span className="n ellipsis">{item.name}</span>
                    <span className="m">{formatByteSize(item.size)}</span>
                  </div>
                  <div className="bar">
                    <i style={{ width: `${item.percent}%` }} />
                  </div>
                  <div className="up-st">{item.statusText}</div>
                </div>
              ))}
            </div>

            <input
              type="file"
              id="fileIn"
              ref={fileInputRef}
              multiple
              accept={UPLOAD_ACCEPT}
              style={{ display: "none" }}
              onChange={event => {
                handleQueueFiles(event.target.files);
                event.target.value = "";
              }}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}

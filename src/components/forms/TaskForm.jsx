/**
 * Task Creation & Editing Modal Form
 *
 * Provides a comprehensive modal dialog to create or update CRM tasks including:
 * - Title, rich description, and multi-assignee assignment
 * - Project association and category categorization
 * - Priority and workflow status controls
 * - Estimated vs. actual spent hours tracking
 * - Tags management with permission guards
 * - Interactive checklist management
 */
import { useRef, useState } from "react";
import { appStore, showToast } from "../../store/appStore.js";
import { API } from "../../services/api.js";
import { Icon } from "../Icon.jsx";
import {
  can,
  hasPermission,
  isCurrentUserAdmin,
  getFieldValidationLimit,
  getTodayISO,
  PRIORITIES,
  getAvailableStatusChoices,
  canChangeTaskStatus,
  getTaskCategories,
  CATEGORY_CUSTOM_OPT,
  validateTextField,
  validateNumericField,
  validateDescriptionField,
  getTaskById
} from "../../utils/helpers.js";
import { navigateBack } from "../../routes/navigation.js";
import { safeRefresh } from "../../services/sync.js";
import {
  openModal,
  closeModal,
  ModalFrame,
  requestCloseModal,
  stackedConfirm,
  confirmBox
} from "../Modal.jsx";
import { useDirtyFormGuard } from "../../hooks/useDirty.js";
import { FormField, DescriptionFormField, scrollToError } from "../Field.jsx";
import { PeoplePicker } from "./PeoplePicker.jsx";

/**
 * Opens the task creation or edit modal dialog.
 * @param {string} [taskId] - Task ID (e.g. "TK-101") if editing
 * @param {Object} [presetData] - Preset default values (e.g. project or assignees)
 * @param {Object} [taskDetailPayload] - Full detail payload if already loaded
 */
export function openTask(taskId, presetData = {}, taskDetailPayload = null) {
  let resolvedTask = taskId ? getTaskById(taskId) : null;

  if (taskId && !resolvedTask && taskDetailPayload) {
    resolvedTask = {
      ...taskDetailPayload.task,
      subtasks: taskDetailPayload.subtasks || []
    };
  }

  if (taskId && !resolvedTask) {
    showToast("Task not found. Try refreshing.", "err");
    return;
  }

  if (!taskId && !can.createTask()) {
    showToast("You do not have permission to create tasks.", "err");
    return;
  }

  if (resolvedTask && !can.editTask(resolvedTask)) {
    showToast(
      "You can only change tasks you created, tasks of your team, or tasks assigned to you.",
      "err"
    );
    return;
  }

  openModal(<TaskForm taskToEdit={resolvedTask} preset={presetData} />, { form: true });
}

/**
 * Prompts user confirmation to move a task to the Recycle Bin.
 * @param {string} taskCode
 */
export function askDeleteTask(taskCode) {
  const task = getTaskById(taskCode);
  if (!task) return;

  confirmBox(
    "Delete task?",
    <p>
      <b>{task.title}</b> ({task.id}) with its checklist, comments and files will move to
      the <b>Recycle Bin</b>. It can be restored for 30 days.
    </p>,
    "Delete",
    async () => {
      await API.delTask(taskCode);
      closeModal();
      await safeRefresh();
      showToast("Task deleted");

      if (
        appStore.focusedEntity &&
        appStore.focusedEntity.type === "task" &&
        appStore.focusedEntity.id === taskCode
      ) {
        navigateBack();
      }
    }
  );
}

function TaskForm({ taskToEdit, preset = {} }) {
  const currentUser = appStore.currentUser;
  const candidateAssigneePool = (appStore.database.assignable || []).slice();

  const defaultValues = taskToEdit || {
    title: "",
    description: "",
    project: preset.project || "",
    category: "",
    categoryNote: "",
    assigneeIds: (preset.assignees || [])
      .map(Number)
      .filter(id => candidateAssigneePool.includes(id)),
    priority: "Medium",
    status: "To Do",
    startDate: "",
    due: "",
    hours: 0,
    spent: 0,
    tags: [],
    subtasks: []
  };

  const isFullManager = taskToEdit ? can.manageTask(taskToEdit) : true;
  const canAssignOthers = can.assignOther();
  const areMajorFieldsLocked = Boolean(taskToEdit && !isFullManager);

  let initialAssignees = (defaultValues.assigneeIds || []).slice();
  if (!taskToEdit && !canAssignOthers) {
    initialAssignees = [currentUser.id];
  }
  initialAssignees.forEach(id => {
    if (!candidateAssigneePool.includes(id)) {
      candidateAssigneePool.push(id);
    }
  });

  const fieldLimits = {
    title: [
      getFieldValidationLimit("task_title", 0),
      getFieldValidationLimit("task_title", 1)
    ],
    tag: getFieldValidationLimit("tag", 1),
    tagsMax: getFieldValidationLimit("tags_max") || 10,
    check: getFieldValidationLimit("checklist", 1),
    checkMax: getFieldValidationLimit("checklist_max") || 100,
    hours: getFieldValidationLimit("hours", 1) || 9999,
    note: getFieldValidationLimit("category_note", 1) || 60
  };

  const initialFormData = {
    title: defaultValues.title || "",
    description: defaultValues.description || "",
    assignees: initialAssignees,
    project: defaultValues.project || "",
    category: defaultValues.category || "",
    categoryNote: defaultValues.categoryNote || "",
    priority: defaultValues.priority || "Medium",
    status: defaultValues.status,
    startDate: String(defaultValues.startDate || "").slice(0, 10),
    due: String(defaultValues.due || "").slice(0, 10),
    hours: String(defaultValues.hours || 0),
    spent: String(defaultValues.spent || 0),
    tags: (defaultValues.tags || []).slice(),
    subtasks: (defaultValues.subtasks || []).map(item => ({
      id: item.id || 0,
      title: typeof item === "string" ? item : item.title,
      done: Boolean(Number(item.done))
    }))
  };

  const [formData, setFormData] = useState(initialFormData);
  const [formErrors, setFormErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tagInputValue, setTagInputValue] = useState("");
  const [subtaskInputValue, setSubtaskInputValue] = useState("");

  const initialJsonSnapshot = useRef(JSON.stringify(initialFormData));

  // Guard against closing modal with unsaved changes
  useDirtyFormGuard(
    () =>
      JSON.stringify(formData) !== initialJsonSnapshot.current ||
      Boolean(tagInputValue.trim()) ||
      Boolean(subtaskInputValue.trim())
  );

  const updateFormField = (fieldName, value) => {
    setFormData(previous => ({ ...previous, [fieldName]: value }));
    if (formErrors[fieldName]) {
      setFormErrors(previousErrors => ({ ...previousErrors, [fieldName]: "" }));
    }
  };

  const setFieldError = (fieldName, errorMessage) => {
    setFormErrors(previousErrors => ({ ...previousErrors, [fieldName]: errorMessage }));
  };

  const isFieldDisabled = areMajorFieldsLocked;
  const projectList = (appStore.database.projects || [])
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
  const isCustomCategory = formData.category === CATEGORY_CUSTOM_OPT;

  // Tag Management Logic
  const savedTags = (taskToEdit ? defaultValues.tags || [] : []).map(tag =>
    String(tag).toLowerCase()
  );
  const isTagSaved = tag => savedTags.includes(String(tag).toLowerCase());
  const mayRemoveTag = tag => !isTagSaved(tag) || can.removeTag();

  const promptRemoveTag = tagToRemove => {
    if (tagToRemove === undefined) return;
    if (!mayRemoveTag(tagToRemove)) {
      setFieldError("tags", "You do not have permission to remove existing tags.");
      return;
    }
    stackedConfirm(
      "Remove tag?",
      <>
        <p>Are you sure you want to remove this tag?</p>
        <p>
          <span className="tagchip">#{tagToRemove}</span>
        </p>
        {isTagSaved(tagToRemove) ? (
          <p className="muted" style={{ fontSize: 12 }}>
            The tag is removed from the task when you save it.
          </p>
        ) : null}
      </>,
      "Remove tag",
      async () => {
        setFormData(previous => ({
          ...previous,
          tags: previous.tags.filter(t => t !== tagToRemove)
        }));
        setFieldError("tags", "");
      },
      { cancelLabel: "Cancel" }
    );
  };

  const handleAddTag = () => {
    const sanitizedTag = tagInputValue
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^#/, "");
    if (!sanitizedTag) return true;

    if (sanitizedTag.length > fieldLimits.tag) {
      setFieldError("tags", `A tag can be at most ${fieldLimits.tag} characters.`);
      return false;
    }
    if (/[<>]/.test(sanitizedTag)) {
      setFieldError("tags", "A tag cannot contain < or >.");
      return false;
    }
    if (formData.tags.some(tag => tag.toLowerCase() === sanitizedTag.toLowerCase())) {
      setFieldError("tags", `The tag “${sanitizedTag}” is already added.`);
      return false;
    }
    if (formData.tags.length >= fieldLimits.tagsMax) {
      setFieldError("tags", `A task can have at most ${fieldLimits.tagsMax} tags.`);
      return false;
    }

    updateFormField("tags", formData.tags.concat(sanitizedTag));
    setTagInputValue("");
    setFieldError("tags", "");
    return true;
  };

  // Checklist Management Logic
  const normalizeChecklistTitle = title => String(title).replace(/\s+/g, " ").trim().toLowerCase();

  const handleAddChecklistItem = () => {
    const sanitizedTitle = subtaskInputValue.replace(/\s+/g, " ").trim();
    if (!sanitizedTitle) {
      setFieldError("checklist", "Type the checklist item first.");
      return;
    }
    if (sanitizedTitle.length > fieldLimits.check) {
      setFieldError(
        "checklist",
        `A checklist item can be at most ${fieldLimits.check} characters.`
      );
      return;
    }
    if (
      formData.subtasks.some(
        sub => normalizeChecklistTitle(sub.title) === normalizeChecklistTitle(sanitizedTitle)
      )
    ) {
      setFieldError(
        "checklist",
        `“${sanitizedTitle}” is already in the checklist. Each item must be unique.`
      );
      return;
    }
    if (formData.subtasks.length >= fieldLimits.checkMax) {
      setFieldError(
        "checklist",
        `A task can have at most ${fieldLimits.checkMax} checklist items.`
      );
      return;
    }

    updateFormField(
      "subtasks",
      formData.subtasks.concat({ id: 0, title: sanitizedTitle, done: false })
    );
    setSubtaskInputValue("");
    setFieldError("checklist", "");
  };

  const handleSave = async () => {
    if (tagInputValue.trim() && !handleAddTag()) return;

    const validationErrors = {};
    validationErrors.title = validateTextField(formData.title, {
      label: "Task title",
      required: true,
      min: fieldLimits.title[0],
      max: fieldLimits.title[1]
    });

    if (!isFieldDisabled) {
      validationErrors.category = validateTextField(formData.category, {
        label: "Project category",
        required: true,
        select: true
      });
    }

    if (isCustomCategory && !isFieldDisabled) {
      validationErrors.categoryNote =
        validateTextField(formData.categoryNote, {
          label: "Custom category / remark",
          required: true,
          min: 2,
          max: fieldLimits.note
        }) || (/[<>]/.test(formData.categoryNote) ? "Category cannot contain < or >." : "");
    }

    if (!areMajorFieldsLocked) {
      validationErrors.description = validateDescriptionField(formData.description);

      if (!formData.assignees.length) {
        validationErrors.assignees = "Please choose at least one assignee.";
      }
      if (formData.startDate && formData.due && formData.due < formData.startDate) {
        validationErrors.due = "End date cannot be earlier than the start date.";
      }
      validationErrors.hours = validateNumericField(formData.hours, {
        label: "Estimated hours",
        min: 0,
        max: fieldLimits.hours
      });
    }

    validationErrors.spent = validateNumericField(formData.spent, {
      label: "Hours spent",
      min: 0,
      max: fieldLimits.hours
    });

    Object.keys(validationErrors).forEach(key => {
      if (!validationErrors[key]) delete validationErrors[key];
    });

    setFormErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      scrollToError();
      return;
    }

    const payload = {
      id: taskToEdit ? taskToEdit.id : "",
      title: formData.title.trim(),
      description: formData.description.trim(),
      assigneeIds: formData.assignees,
      project: formData.project,
      category: formData.category,
      categoryNote: isCustomCategory ? formData.categoryNote.trim() : "",
      priority: formData.priority,
      status: formData.status,
      startDate: formData.startDate,
      due: formData.due,
      hours: Number(formData.hours) || 0,
      spent: Number(formData.spent) || 0,
      tags: formData.tags,
      subtasks: formData.subtasks
    };

    setIsSubmitting(true);
    try {
      const response = await API.saveTask(payload);
      closeModal();
      await safeRefresh();
      showToast(
        taskToEdit
          ? `Task ${response.id || ""} updated`
          : `Task ${response.id || ""} created`
      );
    } catch (saveError) {
      setIsSubmitting(false);
      if (saveError?.silent) return;
      if (saveError?.field) {
        setFieldError(saveError.field, saveError.message);
      }
      showToast(saveError?.message || String(saveError), "err");
    }
  };

  const isStatusDisabled =
    (!taskToEdit && !canAssignOthers) ||
    !canChangeTaskStatus(defaultValues) ||
    Boolean(taskToEdit && !can.updateTask(taskToEdit));

  return (
    <ModalFrame
      wide
      title={taskToEdit ? `Edit task ${taskToEdit.id}` : "Create Task"}
      sub={
        taskToEdit
          ? "Changes are saved when you click Save"
          : "Fields marked * are required"
      }
      foot={
        <>
          <button
            className="btn btn-ghost"
            id="mCancel"
            onClick={() => requestCloseModal()}
          >
            Cancel
          </button>
          <button
            className="btn btn-primary"
            id="kSave"
            disabled={isSubmitting}
            onClick={handleSave}
          >
            {isSubmitting ? "Saving..." : taskToEdit ? "Save changes" : "Create Task"}
          </button>
        </>
      }
    >
      <div className="form-grid">
        {areMajorFieldsLocked ? (
          <div className="notice" style={{ gridColumn: "1/-1" }}>
            <Icon name="alert" />
            <div>
              This task was created outside your team. As an assignee you can change the
              title, status, tags, checklist and hours spent. Ask the creator or their
              Manager to change the rest.
            </div>
          </div>
        ) : null}

        <FormField
          label="Task title"
          isRequired
          isFullWidth
          errorMessage={formErrors.title}
          characterCount={formData.title}
          maxCharacters={fieldLimits.title[1]}
        >
          <input
            className="i"
            id="kT"
            maxLength={fieldLimits.title[1]}
            value={formData.title}
            placeholder="e.g. Prepare the client proposal"
            onChange={event => updateFormField("title", event.target.value)}
          />
        </FormField>

        <DescriptionFormField
          id="kD"
          value={formData.description}
          disabled={isFieldDisabled}
          errorMessage={formErrors.description}
          placeholder="Details, acceptance criteria, links..."
          onChange={value => updateFormField("description", value)}
        />

        <div
          className={"f full" + (formErrors.assignees ? " has-err" : "")}
          id="assignField"
        >
          <span>
            Assign to
            {areMajorFieldsLocked ? null : <span className="req" title="Required">*</span>}
            {canAssignOthers && !areMajorFieldsLocked ? (
              <>
                {" "}
                <span className="muted" style={{ textTransform: "none", letterSpacing: 0, fontWeight: 500 }}>
                  (you can pick several people)
                </span>
              </>
            ) : null}
          </span>
          <PeoplePicker
            value={formData.assignees}
            onChange={assignees => updateFormField("assignees", assignees)}
            editable={canAssignOthers && !areMajorFieldsLocked}
            pool={candidateAssigneePool}
            err={formErrors.assignees}
            boxId="assignBox"
            listId="assignList"
          />
          {!canAssignOthers && !taskToEdit ? (
            <div className="hint">
              You can create tasks for yourself. People with a team can assign tasks to
              their team.
            </div>
          ) : !areMajorFieldsLocked ? (
            <div className="hint">
              You can assign to yourself
              {currentUser.seesAllTasks || isCurrentUserAdmin()
                ? " and anyone of the same or a lower designation."
                : " and the people in your team."}
            </div>
          ) : null}
        </div>

        <FormField
          label="Project"
          helperHint={
            can.projects()
              ? "Need a new project? Create it on the Projects page first."
              : "Pick an existing project. Ask a Manager to create a new one."
          }
          errorMessage={formErrors.project}
        >
          <select
            className="i"
            id="kP"
            disabled={isFieldDisabled}
            value={formData.project}
            onChange={event => updateFormField("project", event.target.value)}
          >
            <option value="">No project</option>
            {projectList.map(project => (
              <option key={project.id} value={project.id}>
                {project.name} ({project.id})
              </option>
            ))}
          </select>
        </FormField>

        <FormField
          label="Project category"
          isRequired
          errorMessage={formErrors.category || formErrors.categoryNote}
        >
          <select
            className="i"
            id="kC"
            disabled={isFieldDisabled}
            value={formData.category}
            onChange={event => updateFormField("category", event.target.value)}
          >
            {!formData.category ? <option value="">Choose category...</option> : null}
            {getTaskCategories().map(category => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
          {isCustomCategory ? (
            <input
              className="i"
              id="kCc"
              maxLength={fieldLimits.note}
              disabled={isFieldDisabled}
              placeholder="Type category / remark"
              style={{ marginTop: 7 }}
              value={formData.categoryNote}
              autoFocus={!initialFormData.categoryNote}
              onChange={event => updateFormField("categoryNote", event.target.value)}
            />
          ) : null}
        </FormField>

        <div className="f">
          <span>Priority</span>
          <div className="seg" id="prioSeg">
            {PRIORITIES.map(priorityLevel => (
              <button
                type="button"
                key={priorityLevel}
                className={formData.priority === priorityLevel ? "on" : ""}
                data-prio={priorityLevel}
                disabled={isFieldDisabled}
                onClick={() => updateFormField("priority", priorityLevel)}
              >
                {priorityLevel}
              </button>
            ))}
          </div>
        </div>

        <FormField label="Status" errorMessage={formErrors.status}>
          <select
            className="i"
            id="kS"
            disabled={isStatusDisabled}
            value={formData.status}
            onChange={event => updateFormField("status", event.target.value)}
          >
            {getAvailableStatusChoices(taskToEdit ? defaultValues.status : "").map(
              statusChoice => (
                <option key={statusChoice}>{statusChoice}</option>
              )
            )}
          </select>
        </FormField>

        <FormField
          label="Start date"
          errorMessage={formErrors.startDate}
        >
          <input
            className="i"
            type="date"
            id="kSt"
            disabled={isFieldDisabled}
            value={formData.startDate}
            onChange={event => updateFormField("startDate", event.target.value)}
          />
        </FormField>

        <FormField
          label="End date (due)"
          errorMessage={formErrors.due}
        >
          <input
            className="i"
            type="date"
            id="kDue"
            disabled={isFieldDisabled}
            value={formData.due}
            onChange={event => updateFormField("due", event.target.value)}
          />
        </FormField>

        <FormField label="Estimated hours" errorMessage={formErrors.hours}>
          <input
            className="i"
            type="number"
            min="0"
            max={fieldLimits.hours}
            step="0.5"
            id="kH"
            disabled={isFieldDisabled}
            value={formData.hours}
            onChange={event => {
              updateFormField("hours", event.target.value);
              setFieldError(
                "hours",
                validateNumericField(event.target.value, {
                  label: "Estimated hours",
                  min: 0,
                  max: fieldLimits.hours
                })
              );
            }}
          />
        </FormField>

        <FormField
          label="Hours spent"
          errorMessage={formErrors.spent}
          helperHint="Time actually worked on the task. Assignees update it as they go."
        >
          <input
            className="i"
            type="number"
            min="0"
            max={fieldLimits.hours}
            step="0.25"
            id="kSp"
            disabled={Boolean(taskToEdit && !can.updateTask(taskToEdit))}
            value={formData.spent}
            onChange={event => {
              updateFormField("spent", event.target.value);
              setFieldError(
                "spent",
                validateNumericField(event.target.value, {
                  label: "Hours spent",
                  min: 0,
                  max: fieldLimits.hours
                })
              );
            }}
          />
        </FormField>

        {!hasPermission("tags.view") ? null : (
          <div
            className={"f full" + (formErrors.tags ? " has-err" : "")}
            id="tagField"
          >
            <span>
              Tags{" "}
              <span className="muted" style={{ textTransform: "none", letterSpacing: 0, fontWeight: 500 }}>
                (press Enter to add; commas are allowed inside a tag; up to {fieldLimits.tagsMax} tags, {fieldLimits.tag} characters each)
              </span>
            </span>

            <div className="chipbox" id="tagBox">
              {formData.tags.map(tagName => (
                <span className="chip" key={tagName}>
                  #{tagName}
                  {mayRemoveTag(tagName) ? (
                    <span
                      className="x"
                      data-tagdel={tagName}
                      title="Remove tag"
                      role="button"
                      aria-label={`Remove tag ${tagName}`}
                      onClick={event => {
                        event.stopPropagation();
                        promptRemoveTag(tagName);
                      }}
                    >
                      &#10005;
                    </span>
                  ) : null}
                </span>
              ))}

              {!can.addTag() ? (
                formData.tags.length ? null : (
                  <span className="muted" style={{ fontSize: 12 }}>
                    No tags
                  </span>
                )
              ) : formData.tags.length < fieldLimits.tagsMax ? (
                <input
                  id="tagIn"
                  placeholder="Type a tag and press Enter"
                  autoComplete="off"
                  maxLength={fieldLimits.tag}
                  value={tagInputValue}
                  onChange={event => {
                    setTagInputValue(event.target.value);
                    setFieldError(
                      "tags",
                      event.target.value.length >= fieldLimits.tag
                        ? `Maximum ${fieldLimits.tag} characters per tag reached.`
                        : ""
                    );
                  }}
                  onKeyDown={event => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleAddTag();
                    } else if (
                      event.key === "Backspace" &&
                      !tagInputValue &&
                      formData.tags.length > 0
                    ) {
                      event.preventDefault();
                      promptRemoveTag(formData.tags[formData.tags.length - 1]);
                    }
                  }}
                  onBlur={() => {
                    if (tagInputValue.trim()) handleAddTag();
                  }}
                />
              ) : (
                <span className="muted" style={{ fontSize: 12 }}>
                  Maximum {fieldLimits.tagsMax} tags reached
                </span>
              )}
            </div>

            {formErrors.tags ? <div className="ferr">{formErrors.tags}</div> : null}
            {!can.removeTag() && (defaultValues.tags || []).length ? (
              <div className="hint">
                You can add tags. Removing an existing tag needs the "Tags: Delete" permission.
              </div>
            ) : null}
          </div>
        )}

        <div
          className={"f full" + (formErrors.checklist ? " has-err" : "")}
          id="checkField"
        >
          <span>
            Checklist{" "}
            <span className="muted" style={{ textTransform: "none", letterSpacing: 0, fontWeight: 500 }}>
              (each item must be unique)
            </span>
          </span>

          <div id="subBox">
            {formData.subtasks.length ? (
              formData.subtasks.map((item, index) => (
                <div
                  key={index + item.title}
                  className={"check " + (item.done ? "done" : "")}
                >
                  <input
                    type="checkbox"
                    data-kst={index}
                    checked={item.done}
                    onChange={event =>
                      updateFormField(
                        "subtasks",
                        formData.subtasks.map((sub, j) =>
                          j === index ? { ...sub, done: event.target.checked } : sub
                        )
                      )
                    }
                  />
                  <span>{item.title}</span>
                  <button
                    type="button"
                    className="rm"
                    data-kstdel={index}
                    title="Remove"
                    onClick={() =>
                      updateFormField(
                        "subtasks",
                        formData.subtasks.filter((_, j) => j !== index)
                      )
                    }
                  >
                    &#10005;
                  </button>
                </div>
              ))
            ) : (
              <div className="muted" style={{ fontSize: 12.4, padding: "4px 0" }}>
                No checklist items. Add some below.
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 9 }}>
            <input
              className="i"
              id="subIn"
              maxLength={fieldLimits.check}
              placeholder="Type a checklist item and press Enter"
              value={subtaskInputValue}
              onChange={event => {
                setSubtaskInputValue(event.target.value);
                setFieldError("checklist", "");
              }}
              onKeyDown={event => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleAddChecklistItem();
                }
              }}
            />
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              id="subAddBtn"
              onClick={handleAddChecklistItem}
            >
              Add
            </button>
          </div>

          {formErrors.checklist ? (
            <div className="ferr">{formErrors.checklist}</div>
          ) : null}
        </div>
      </div>
    </ModalFrame>
  );
}

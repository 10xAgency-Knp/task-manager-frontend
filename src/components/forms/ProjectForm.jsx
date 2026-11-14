/**
 * Project Creation & Edit Modal Form
 *
 * Provides a modal dialog to create or update project records,
 * manage project managers, statuses, progress, budgets, and assigned team members.
 */
import { useRef, useState } from "react";
import { appStore, showToast } from "../../store/appStore.js";
import { API } from "../../services/api.js";
import { Icon } from "../Icon.jsx";
import {
  can,
  isCurrentUserAdmin,
  getProjectById,
  getActiveUsers,
  getTeamUsers,
  getUserById,
  getTodayISO,
  PROJECT_STATUSES,
  validateTextField,
  validateNumericField,
  validateDescriptionField,
  pluralize
} from "../../utils/helpers.js";
import { navigateBack } from "../../routes/navigation.js";
import { safeRefresh } from "../../services/sync.js";
import {
  openModal,
  closeModal,
  ModalFrame,
  requestCloseModal,
  confirmBox
} from "../Modal.jsx";
import { useDirtyFormGuard } from "../../hooks/useDirty.js";
import { FormField, DescriptionFormField, scrollToError } from "../Field.jsx";
import { PeoplePicker } from "./PeoplePicker.jsx";

/**
 * Opens project creation or edit modal dialog.
 * @param {string} [projectId] - Project ID (e.g. "P-01") if editing
 */
export function openProject(projectId) {
  const project = projectId ? getProjectById(projectId) : null;

  if (project ? !project.canEdit : !can.projects()) {
    showToast(
      project
        ? "You can edit only projects that you or your team own."
        : "You do not have permission to create projects.",
      "err"
    );
    return;
  }

  openModal(<ProjectForm projectToEdit={project} />, { form: true });
}

/**
 * Prompts user confirmation to move a project and its associated tasks to the Recycle Bin.
 * @param {string} projectCode
 */
export function askDeleteProject(projectCode) {
  const project = getProjectById(projectCode);
  if (!project) return;

  const associatedTaskCount = (appStore.database.tasks || []).filter(
    task => task.project === projectCode
  ).length;

  confirmBox(
    "Delete project?",
    <p>
      <b>{project.name}</b> and its <b>{pluralize(associatedTaskCount, "task")}</b> will move to
      the <b>Recycle Bin</b>. They can be restored together for 30 days.
    </p>,
    "Delete project",
    async () => {
      await API.delProject(projectCode);
      closeModal();
      await safeRefresh();
      showToast("Project deleted");

      if (
        appStore.focusedEntity &&
        appStore.focusedEntity.type === "project" &&
        appStore.focusedEntity.id === projectCode
      ) {
        navigateBack();
      }
    }
  );
}

function ProjectForm({ projectToEdit, p }) {
  const resolvedProject = projectToEdit || p;

  // Partial edit permissions: "Projects: Update" without "Edit" allows only status & progress
  const isOnlyStatusEditable = Boolean(resolvedProject && resolvedProject.canEditDetails === false);
  const isStatusLocked = Boolean(resolvedProject && resolvedProject.canUpdate === false);

  const defaultValues = resolvedProject || {
    name: "",
    description: "",
    ownerId: appStore.currentUser?.id,
    status: "Planning",
    progress: 0,
    startDate: getTodayISO(),
    due: "",
    budget: 0,
    memberIds: []
  };

  const candidateOwners = isCurrentUserAdmin()
    ? getActiveUsers()
    : getTeamUsers().filter(user => user.status !== "Inactive");

  if (
    defaultValues.ownerId &&
    !candidateOwners.some(user => user.id === defaultValues.ownerId) &&
    getUserById(defaultValues.ownerId)
  ) {
    candidateOwners.push(getUserById(defaultValues.ownerId));
  }

  const memberCandidatePool = getActiveUsers().map(user => user.id);

  const initialFormData = {
    name: defaultValues.name || "",
    description: defaultValues.description || "",
    ownerId: String(defaultValues.ownerId || ""),
    status: defaultValues.status,
    progress: String(defaultValues.progress || 0),
    budget: defaultValues.budget ? String(defaultValues.budget) : "",
    startDate: String(defaultValues.startDate || "").slice(0, 10),
    due: String(defaultValues.due || "").slice(0, 10),
    memberIds: (defaultValues.memberIds || []).slice()
  };

  const [formData, setFormData] = useState(initialFormData);
  const [formErrors, setFormErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const initialJsonSnapshot = useRef(JSON.stringify(initialFormData));
  useDirtyFormGuard(() => JSON.stringify(formData) !== initialJsonSnapshot.current);

  const updateFormField = (fieldName, value) => {
    setFormData(previous => ({ ...previous, [fieldName]: value }));
    if (formErrors[fieldName]) {
      setFormErrors(previousErrors => ({ ...previousErrors, [fieldName]: "" }));
    }
  };

  const handleSave = async () => {
    const validationErrors = {};

    if (!isOnlyStatusEditable) {
      validationErrors.name = validateTextField(formData.name, {
        label: "Project name",
        required: true,
        min: 3,
        max: 120
      });
      validationErrors.ownerId = validateTextField(formData.ownerId, {
        label: "Project manager",
        required: true,
        select: true
      });
      validationErrors.description = validateDescriptionField(formData.description);
      validationErrors.startDate = validateTextField(formData.startDate, {
        label: "Start date",
        required: true
      });
      validationErrors.due = validateTextField(formData.due, {
        label: "End date",
        required: true
      });

      if (!validationErrors.startDate && !validationErrors.due && formData.due < formData.startDate) {
        validationErrors.due = "End date cannot be earlier than the start date.";
      }

      validationErrors.budget = validateNumericField(formData.budget, {
        label: "Budget",
        min: 0,
        max: 999999999999
      });
    }

    if (!isStatusLocked) {
      validationErrors.progress = validateNumericField(formData.progress, {
        label: "Progress",
        min: 0,
        max: 100
      });
    }

    Object.keys(validationErrors).forEach(key => {
      if (!validationErrors[key]) delete validationErrors[key];
    });

    setFormErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      scrollToError();
      return;
    }

    const payload = {
      id: resolvedProject ? resolvedProject.id : "",
      name: formData.name.trim(),
      description: formData.description.trim(),
      ownerId: Number(formData.ownerId),
      status: formData.status,
      progress: Number(formData.progress) || 0,
      budget: formData.budget,
      startDate: formData.startDate,
      due: formData.due,
      memberIds: formData.memberIds
    };

    setIsSubmitting(true);
    try {
      await API.saveProject(payload);
      closeModal();
      await safeRefresh();
      showToast("Project saved");
    } catch (saveError) {
      setIsSubmitting(false);
      if (saveError?.silent) return;
      if (saveError?.field) {
        setFormErrors(previousErrors => ({
          ...previousErrors,
          [saveError.field]: saveError.message
        }));
      }
      showToast(saveError.message, "err");
    }
  };

  return (
    <ModalFrame
      wide
      title={resolvedProject ? `Edit project ${resolvedProject.id}` : "New Project"}
      sub="Fields marked * are required"
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
            id="pSave"
            disabled={isSubmitting}
            onClick={handleSave}
          >
            {isSubmitting ? "Saving..." : resolvedProject ? "Save changes" : "Create Project"}
          </button>
        </>
      }
    >
      <div className="form-grid">
        {isOnlyStatusEditable ? (
          <div className="notice" style={{ gridColumn: "1/-1" }}>
            <Icon name="lock" />
            <div>
              You can change the status and progress of this project. Ask someone with "Projects:
              Edit" to change the rest.
            </div>
          </div>
        ) : null}

        <FormField
          label="Project name"
          isRequired
          isFullWidth
          errorMessage={formErrors.name}
          characterCount={formData.name}
          maxCharacters={120}
        >
          <input
            className="i"
            id="pN"
            maxLength={120}
            disabled={isOnlyStatusEditable}
            value={formData.name}
            placeholder="e.g. Client Website Revamp"
            onChange={event => updateFormField("name", event.target.value)}
          />
        </FormField>

        <DescriptionFormField
          id="pDesc"
          value={formData.description}
          disabled={isOnlyStatusEditable}
          errorMessage={formErrors.description}
          onChange={value => updateFormField("description", value)}
        />

        <FormField
          label="Project manager"
          isRequired
          errorMessage={formErrors.ownerId}
        >
          <select
            className="i"
            id="pO"
            disabled={isOnlyStatusEditable}
            value={formData.ownerId}
            onChange={event => updateFormField("ownerId", event.target.value)}
          >
            {candidateOwners.map(owner => (
              <option key={owner.id} value={owner.id}>
                {owner.name}
                {owner.designation ? ` - ${owner.designation}` : ""}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Status">
          <select
            className="i"
            id="pS"
            disabled={isStatusLocked}
            value={formData.status}
            onChange={event => updateFormField("status", event.target.value)}
          >
            {PROJECT_STATUSES.map(status => (
              <option key={status}>{status}</option>
            ))}
          </select>
        </FormField>

        <FormField label="Progress (%)" errorMessage={formErrors.progress}>
          <input
            className="i"
            type="number"
            min="0"
            max="100"
            id="pP"
            disabled={isStatusLocked}
            value={formData.progress}
            onChange={event => {
              updateFormField("progress", event.target.value);
              setFormErrors(previous => ({
                ...previous,
                progress: validateNumericField(event.target.value, {
                  label: "Progress",
                  min: 0,
                  max: 100
                })
              }));
            }}
          />
        </FormField>

        <FormField label="Budget (INR)" errorMessage={formErrors.budget}>
          <input
            className="i"
            type="number"
            min="0"
            max="999999999999"
            step="1"
            id="pB"
            disabled={isOnlyStatusEditable}
            value={formData.budget}
            placeholder="e.g. 125000"
            onChange={event => updateFormField("budget", event.target.value)}
          />
        </FormField>

        <FormField
          label="Start date"
          isRequired={!isOnlyStatusEditable}
          errorMessage={formErrors.startDate}
        >
          <input
            className="i"
            type="date"
            id="pSt"
            disabled={isOnlyStatusEditable}
            value={formData.startDate}
            onChange={event => updateFormField("startDate", event.target.value)}
          />
        </FormField>

        <FormField
          label="End date (deadline)"
          isRequired={!isOnlyStatusEditable}
          errorMessage={formErrors.due}
        >
          <input
            className="i"
            type="date"
            id="pD"
            disabled={isOnlyStatusEditable}
            value={formData.due}
            onChange={event => updateFormField("due", event.target.value)}
          />
        </FormField>

        <div className="f full">
          <span>Team members (optional)</span>
          <PeoplePicker
            value={formData.memberIds}
            onChange={memberIds => updateFormField("memberIds", memberIds)}
            editable={!isOnlyStatusEditable}
            pool={memberCandidatePool}
            boxId="memBox"
            listId="memList"
          />
        </div>
      </div>
    </ModalFrame>
  );
}

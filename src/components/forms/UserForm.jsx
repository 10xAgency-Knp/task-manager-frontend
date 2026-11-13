/**
 * User / Team Member Management Modal Form
 *
 * Provides a dialog to add or edit workspace members, configure organizational hierarchy
 * ("Reports to"), assign roles (Employee, Manager, Admin with Super Admin permission guards),
 * validate contact details, and issue temporary passwords with one-click clipboard copying.
 */
import { useRef, useState } from "react";
import { appStore, showToast } from "../../store/appStore.js";
import { API, CONFIG } from "../../services/api.js";
import { Icon } from "../Icon.jsx";
import {
  can,
  hasPermission,
  isCurrentUserAdmin,
  isCurrentUserSuperAdmin,
  getUserById,
  getActiveUsers,
  getReportingUserIds,
  getUserRoleRank,
  getRoleCapacityLimits,
  getTodayISO,
  suggestSecurePassword,
  validatePasswordStrength,
  validatePhoneNumber,
  validateEmailAddress,
  validateTextField
} from "../../utils/helpers.js";
import { navigateBack } from "../../routes/navigation.js";
import { safeRefresh } from "../../services/sync.js";
import {
  openModal,
  closeModal,
  ModalFrame,
  requestCloseModal,
  confirmBox,
  stackedConfirm
} from "../Modal.jsx";
import { useDirtyFormGuard } from "../../hooks/useDirty.js";
import { FormField, scrollToError } from "../Field.jsx";
import { MetadataDatesLine, CopyButton } from "../ui.jsx";

const STANDARD_DEPARTMENTS = [
  "Management",
  "Agency Sales",
  "Business Development Associate",
  "Performance Marketing",
  "SEO",
  "SSM",
  "Development",
  "E commerce",
  "Accounts",
  "HR"
];

const DEPARTMENT_CUSTOM_OPTION = "Custom / remark";

/**
 * Opens user creation or edit modal dialog.
 * @param {number|string} [userId]
 * @param {{ adminSection?: boolean }} [options]
 */
export function openUser(userId, options = {}) {
  const isAdminSection = Boolean(options.adminSection && isCurrentUserSuperAdmin());
  const user = userId ? getUserById(userId) : null;
  const isEditingSelf = Boolean(user && user.id === appStore.currentUser?.id);

  if (user ? !(isEditingSelf ? hasPermission("users.edit") : can.editUser(user)) : !can.users()) {
    showToast(
      user
        ? "You can edit only Employees in your own team."
        : "Only an Admin or someone with User Management can add users.",
      "err"
    );
    return;
  }

  openModal(
    <UserForm
      userToEdit={user}
      isEditingSelf={isEditingSelf}
      isAdminSection={isAdminSection}
    />,
    { form: true }
  );
}

/**
 * Prompts user confirmation to remove/deactivate a member into the Recycle Bin.
 * @param {Object} user
 */
export function askDeleteUser(user) {
  confirmBox(
    "Remove user?",
    <p>
      <b>{user.name}</b> will be removed from the workspace and can no longer sign in.
      Their tasks and history stay. The account moves to the <b>Recycle Bin</b> for 30 days.
    </p>,
    "Remove user",
    async () => {
      try {
        await API.delUser(user.id, false);
      } catch (error) {
        if (!error.needForce) throw error;
        await new Promise((resolve, reject) =>
          stackedConfirm(
            "Remove anyway?",
            <>
              <p>{error.message}</p>
              <p>Their open tasks stay and still show them as the assignee.</p>
            </>,
            "Remove anyway",
            async () => {
              try {
                await API.delUser(user.id, true);
                resolve();
              } catch (deleteError) {
                reject(deleteError);
              }
            },
            { onCancel: () => reject(new Error("Cancelled")) }
          )
        );
      }
      closeModal();
      await safeRefresh();
      showToast("User removed");

      if (
        appStore.focusedEntity &&
        appStore.focusedEntity.type === "user"
      ) {
        navigateBack();
      }
    }
  );
}

function UserForm({ userToEdit, u, isEditingSelf, self, isAdminSection, adminSection }) {
  const resolvedUser = userToEdit || u;
  const resolvedSelf = isEditingSelf ?? self;
  const resolvedAdminSection = isAdminSection ?? adminSection;
  const currentUser = appStore.currentUser;

  let defaultValues = resolvedUser || {
    name: "",
    email: "",
    phone: "",
    role: "Employee",
    designation: "",
    dept: "",
    city: "",
    status: "Active",
    joined: getTodayISO(),
    reportsTo: isCurrentUserAdmin() ? null : currentUser?.id
  };

  if (!resolvedUser && !isCurrentUserSuperAdmin()) {
    defaultValues = { ...defaultValues, role: "Employee" };
  }
  if (!resolvedUser && resolvedAdminSection) {
    defaultValues = { ...defaultValues, role: "Admin", reportsTo: null };
  }

  const roleLimits = getRoleCapacityLimits();
  const availableRoles = resolvedAdminSection
    ? ["Admin"]
    : resolvedUser && resolvedUser.role === "Admin"
    ? ["Admin"]
    : ["Employee", "Manager"];

  const isRoleLocked =
    resolvedSelf ||
    !isCurrentUserSuperAdmin() ||
    resolvedAdminSection ||
    Boolean(resolvedUser && resolvedUser.role === "Admin");

  const subordinates = resolvedUser ? getReportingUserIds(resolvedUser.id) : [];

  const eligibleSupervisors = getActiveUsers().filter(candidateSupervisor => {
    if (resolvedUser && (candidateSupervisor.id === resolvedUser.id || subordinates.includes(candidateSupervisor.id))) {
      return false;
    }
    if (!isCurrentUserAdmin() && !(candidateSupervisor.inTeam || candidateSupervisor.id === currentUser?.id)) {
      return false;
    }
    return (
      candidateSupervisor.role !== "Employee" &&
      getUserRoleRank(candidateSupervisor) >=
        getUserRoleRank({
          role: defaultValues.role,
          superAdmin: resolvedUser ? resolvedUser.superAdmin : false
        })
    );
  });

  const isPasswordLocked = resolvedSelf || Boolean(resolvedUser && !can.updateUser());
  const userDept = defaultValues.dept || defaultValues.department || defaultValues.usr_dept || "";
  const selectedDepartment = !userDept
    ? ""
    : STANDARD_DEPARTMENTS.includes(userDept)
    ? userDept
    : DEPARTMENT_CUSTOM_OPTION;

  const initialFormData = {
    name: defaultValues.name || "",
    email: defaultValues.email || "",
    phone: defaultValues.phone || "",
    role: defaultValues.role,
    reportsToId: defaultValues.reportsTo ? String(defaultValues.reportsTo) : "",
    designation: defaultValues.designation || "",
    department: selectedDepartment,
    customDepartment: selectedDepartment === DEPARTMENT_CUSTOM_OPTION ? (defaultValues.customDepartment || defaultValues.customDept || defaultValues.usr_custom_dept || userDept) : "",
    city: defaultValues.city || "",
    status: defaultValues.status,
    joined: String(defaultValues.joined || "").slice(0, 10),
    password: resolvedUser ? "" : suggestSecurePassword()
  };

  const [formData, setFormData] = useState(initialFormData);
  const [formErrors, setFormErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const initialJsonSnapshot = useRef(JSON.stringify(initialFormData));
  useDirtyFormGuard(() => JSON.stringify(formData) !== initialJsonSnapshot.current);

  const updateFormField = (fieldName, value) => {
    setFormData(previous => ({ ...previous, [fieldName]: value }));
    if (formErrors[fieldName] || formErrors.dept || formErrors.department) {
      setFormErrors(previousErrors => ({
        ...previousErrors,
        [fieldName]: "",
        ...(fieldName === "department" || fieldName === "customDepartment" ? { dept: "", department: "" } : {})
      }));
    }
  };

  const initialPhoneNumber = initialFormData.phone;
  const phoneNumberError =
    formData.phone === initialPhoneNumber ? "" : validatePhoneNumber(formData.phone);

  const checkEmailUniqueness = emailValue => {
    const normalized = emailValue.trim().toLowerCase();
    if (!normalized || (resolvedUser && normalized === String(resolvedUser.email || "").toLowerCase())) {
      return "";
    }
    const formatError = validateEmailAddress(normalized);
    if (formatError) return formatError;

    const existingUser = (appStore.database.users || []).find(
      user => user.email && user.email.toLowerCase() === normalized && (!resolvedUser || user.id !== resolvedUser.id)
    );
    return existingUser ? `This email is already used by ${existingUser.name}.` : "";
  };

  const handleSave = async () => {
    const isCustom = formData.department === DEPARTMENT_CUSTOM_OPTION;
    const finalDept = isCustom ? formData.customDepartment.trim() : formData.department;

    const payload = {
      id: resolvedUser ? resolvedUser.id : "",
      name: formData.name.trim(),
      email: formData.email.trim(),
      phone: formData.phone.trim(),
      role: formData.role,
      reportsToId: Number(formData.reportsToId) || null,
      designation: formData.designation.trim(),
      dept: finalDept,
      department: formData.department,
      customDepartment: isCustom ? formData.customDepartment.trim() : "",
      custom_dept: isCustom ? formData.customDepartment.trim() : null,
      usr_custom_dept: isCustom ? formData.customDepartment.trim() : null,
      city: formData.city.trim(),
      status: formData.status,
      joined: formData.joined,
      password: resolvedSelf ? "" : formData.password.trim()
    };

    const validationErrors = {
      name:
        validateTextField(formData.name, { label: "Full name", required: true, min: 2, max: 80 }) ||
        (/[<>,@]/.test(payload.name) ? "Name cannot contain < > , or @." : ""),
      email:
        validateTextField(formData.email, { label: "Email", required: true, max: 160 }) ||
        (!resolvedUser || payload.email.toLowerCase() !== String(resolvedUser.email || "").toLowerCase()
          ? checkEmailUniqueness(formData.email)
          : ""),
      designation: validateTextField(formData.designation, { label: "Designation", max: 60 }),
      dept:
        validateTextField(formData.department, { label: "Department", required: true, select: true }) ||
        (formData.department === DEPARTMENT_CUSTOM_OPTION
          ? validateTextField(formData.customDepartment, { label: "Department", required: true, min: 2, max: 40 })
          : ""),
      city: validateTextField(formData.city, { label: "City", max: 60 }),
      phone: payload.phone !== initialPhoneNumber ? validatePhoneNumber(payload.phone) : ""
    };

    if (!resolvedUser && !payload.password) {
      validationErrors.password = "A temporary password is required for a new user.";
    } else if (payload.password) {
      validationErrors.password =
        validatePasswordStrength(payload.password) ||
        (payload.password.length > 72 ? "Password can be at most 72 characters." : "");
    }

    Object.keys(validationErrors).forEach(key => {
      if (!validationErrors[key]) delete validationErrors[key];
    });

    setFormErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      scrollToError();
      return;
    }

    const executeSaveRequest = async () => {
      setIsSubmitting(true);
      try {
        const response = resolvedAdminSection
          ? await API.saveAdmin(payload)
          : await API.saveUser(payload);

        closeModal();
        await safeRefresh();

        if (response.created) {
          openModal(
            <UserCredentialsModal
              name={payload.name}
              email={payload.email.toLowerCase()}
              password={payload.password}
            />
          );
        } else {
          showToast(
            response.passwordSet
              ? "User saved. They were signed out and must use the new password."
              : "User saved"
          );
        }
      } catch (saveError) {
        setIsSubmitting(false);
        if (saveError?.silent) return;
        if (saveError?.field) {
          const fieldKey = saveError.field === "reportsTo" ? "reportsToId" : saveError.field;
          setFormErrors(previous => ({ ...previous, [fieldKey]: saveError.message }));
        }
        showToast(saveError.message, "err");
      }
    };

    if (resolvedUser && !resolvedSelf && payload.status === "Inactive" && resolvedUser.status !== "Inactive") {
      stackedConfirm(
        `Deactivate ${resolvedUser.name}?`,
        <p>They will be signed out at once and cannot sign in until an Admin sets them back to Active.</p>,
        "Deactivate",
        executeSaveRequest
      );
    } else {
      executeSaveRequest();
    }
  };

  return (
    <ModalFrame
      title={resolvedUser ? `Edit user U-${resolvedUser.id}` : resolvedAdminSection ? "Add Admin" : "Add User"}
      sub={
        resolvedUser
          ? "Changes apply right away. A new password signs the person out and they are told why."
          : "The new member signs in with this email and temporary password"
      }
      foot={
        <>
          {resolvedUser && !resolvedSelf && can.deleteUser(resolvedUser) ? (
            <button
              className="btn btn-danger"
              id="uDel"
              style={{ marginRight: "auto" }}
              onClick={() => askDeleteUser(resolvedUser)}
            >
              Remove user
            </button>
          ) : null}
          <button
            className="btn btn-ghost"
            id="mCancel"
            onClick={() => requestCloseModal()}
          >
            Cancel
          </button>
          <button
            className="btn btn-primary"
            id="mOk"
            data-testid="uSave"
            disabled={isSubmitting}
            onClick={handleSave}
          >
            {isSubmitting ? "Saving..." : resolvedUser ? "Save changes" : "Add User"}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <FormField
          label="Full name"
          isRequired
          isFullWidth
          errorMessage={formErrors.name}
          characterCount={formData.name}
          maxCharacters={80}
        >
          <input
            className="i"
            id="uN"
            maxLength={80}
            value={formData.name}
            placeholder="e.g. Ananya Rao"
            onChange={event => updateFormField("name", event.target.value)}
          />
        </FormField>

        <FormField
          label="Email (login ID)"
          isRequired
          errorMessage={formErrors.email}
        >
          <input
            className="i"
            id="uE"
            type="email"
            name="member_email"
            autoComplete="off"
            data-lpignore="true"
            maxLength={160}
            value={formData.email}
            placeholder="name@the10xagency.in"
            onChange={event => updateFormField("email", event.target.value)}
            onBlur={() =>
              setFormErrors(previous => ({
                ...previous,
                email: checkEmailUniqueness(formData.email)
              }))
            }
          />
        </FormField>

        <FormField label="Phone" errorMessage={formErrors.phone}>
          <input
            className="i"
            id="uPh"
            maxLength={10}
            inputMode="numeric"
            value={formData.phone}
            placeholder="10-digit mobile, e.g. 9876543210"
            onChange={event =>
              updateFormField("phone", event.target.value.replace(/[^0-9]/g, "").slice(0, 10))
            }
          />
          <div
            className="hint"
            id="uPhHint"
            style={phoneNumberError ? { color: "var(--red)" } : undefined}
          >
            {phoneNumberError ||
              (formData.phone.length === 10
                ? "Looks good."
                : formData.phone
                ? `10 digits, numbers only (${formData.phone.length}/10).`
                : "10 digits, numbers only.")}
          </div>
        </FormField>

        <FormField
          label="Role"
          errorMessage={formErrors.role}
          helperHint={
            resolvedSelf
              ? "You cannot change your own role."
              : !isCurrentUserSuperAdmin()
              ? "Only the Super Admin can change roles."
              : resolvedAdminSection
              ? `Admins: ${roleLimits.Admin.used} of ${roleLimits.Admin.max} used.`
              : resolvedUser && resolvedUser.role === "Admin"
              ? "Admin roles are changed only by the Super Admin, in Permissions."
              : `Managers: ${roleLimits.Manager.used} of ${roleLimits.Manager.max} used. Admins are added only in Permissions (Super Admin).`
          }
        >
          <select
            className="i"
            id="uR"
            disabled={isRoleLocked}
            value={formData.role}
            onChange={event => updateFormField("role", event.target.value)}
          >
            {availableRoles.map(role => (
              <option key={role}>{role}</option>
            ))}
          </select>
        </FormField>

        <FormField
          label="Reports to (team)"
          errorMessage={formErrors.reportsToId}
          helperHint="The manager sees this person’s tasks, workload, reports and logs."
        >
          <select
            className="i"
            id="uRep"
            disabled={resolvedSelf && !isCurrentUserAdmin()}
            value={formData.reportsToId}
            onChange={event => updateFormField("reportsToId", event.target.value)}
          >
            <option value="">Nobody (top level)</option>
            {eligibleSupervisors.map(supervisor => (
              <option key={supervisor.id} value={supervisor.id}>
                {supervisor.name} - {supervisor.designation || supervisor.role}
              </option>
            ))}
          </select>
        </FormField>

        <FormField
          label="Designation"
          errorMessage={formErrors.designation}
          characterCount={formData.designation}
          maxCharacters={60}
        >
          <input
            className="i"
            id="uDg"
            maxLength={60}
            value={formData.designation}
            placeholder="e.g. SEO Executive"
            onChange={event => updateFormField("designation", event.target.value)}
          />
        </FormField>

        <FormField
          label="Department"
          isRequired
          errorMessage={formErrors.dept || formErrors.department}
        >
          <select
            className="i"
            id="uDp"
            value={formData.department}
            onChange={event => updateFormField("department", event.target.value)}
          >
            {!formData.department ? <option value="">Choose department...</option> : null}
            {STANDARD_DEPARTMENTS.concat([DEPARTMENT_CUSTOM_OPTION]).map(departmentName => (
              <option key={departmentName}>{departmentName}</option>
            ))}
          </select>
          {formData.department === DEPARTMENT_CUSTOM_OPTION ? (
            <input
              className="i"
              id="uDpC"
              maxLength={40}
              placeholder="Type department"
              style={{ marginTop: 7 }}
              value={formData.customDepartment}
              onChange={event => updateFormField("customDepartment", event.target.value)}
            />
          ) : null}
        </FormField>

        <FormField
          label="City"
          errorMessage={formErrors.city}
          characterCount={formData.city}
          maxCharacters={60}
        >
          <input
            className="i"
            id="uC"
            maxLength={60}
            value={formData.city}
            placeholder="e.g. Lucknow"
            onChange={event => updateFormField("city", event.target.value)}
          />
        </FormField>

        <FormField label="Status">
          <select
            className="i"
            id="uS"
            disabled={resolvedSelf || Boolean(resolvedUser && !can.updateUser())}
            value={formData.status}
            onChange={event => updateFormField("status", event.target.value)}
          >
            {["Active", "On Leave", "Inactive"].map(status => (
              <option key={status}>{status}</option>
            ))}
          </select>
        </FormField>

        <FormField
          label={resolvedUser ? "New temporary password" : "Temporary password"}
          isRequired={!resolvedUser}
          errorMessage={formErrors.password}
          helperHint={
            resolvedSelf
              ? "Change your own password from Settings."
              : "10 to 72 characters with a capital letter, a small letter and a number."
          }
        >
          <div style={{ display: "flex", gap: 6 }}>
            <input
              className="i"
              id="uPass"
              maxLength={72}
              autoComplete="new-password"
              value={formData.password}
              disabled={isPasswordLocked}
              placeholder={
                resolvedSelf
                  ? "Use Settings to change your own"
                  : resolvedUser && !can.updateUser()
                  ? "You cannot set passwords"
                  : resolvedUser
                  ? "Leave empty to keep the current one"
                  : ""
              }
              onChange={event => updateFormField("password", event.target.value)}
            />
            {isPasswordLocked ? null : (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                id="uGen"
                title="Generate a strong password"
                onClick={() => updateFormField("password", suggestSecurePassword())}
              >
                <Icon name="refresh" />
              </button>
            )}
          </div>
        </FormField>

        <FormField label="Joined on">
          <input
            className="i"
            type="date"
            id="uJ"
            value={formData.joined}
            onChange={event => updateFormField("joined", event.target.value)}
          />
        </FormField>
      </div>

      {resolvedUser ? (
        <MetadataDatesLine
          item={{ createdAt: resolvedUser.createdAt, updatedAt: resolvedUser.updatedAt }}
        />
      ) : null}
    </ModalFrame>
  );
}

/**
 * Credentials Hand-off Modal displayed immediately after creating a new user
 */
function UserCredentialsModal({ name, email, password }) {
  const applicationUrl = location.href.split(/[?#]/)[0];

  return (
    <ModalFrame
      title="User added"
      foot={
        <>
          <CopyButton
            id="copyCred"
            text={`Sign in to ${CONFIG.APP_NAME}\nLink: ${applicationUrl}\nEmail: ${email}\nTemporary password: ${password}`}
          />
          <button
            className="btn btn-primary"
            id="mCancel"
            onClick={() => requestCloseModal()}
          >
            Done
          </button>
        </>
      }
    >
      <div style={{ fontSize: 13.4, lineHeight: 1.7 }}>
        Share these sign-in details with <b>{name}</b>:
      </div>
      <div className="cred-box">
        <div>
          <span>Link</span>
          <b>{applicationUrl}</b>
        </div>
        <div>
          <span>Email</span>
          <b>{email}</b>
        </div>
        <div>
          <span>Temporary password</span>
          <b>{password}</b>
        </div>
      </div>
      <div className="hint">
        They will be asked to set their own password at first sign-in.
      </div>
    </ModalFrame>
  );
}

// Backward compatibility & semantic aliases
export {
  openUser as openUserModal,
  askDeleteUser as confirmDeleteUserModal
};


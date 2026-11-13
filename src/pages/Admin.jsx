/**
 * Admin Pages & Tools
 *
 * Provides administrative views and actions:
 * 1. Permissions Matrix (Super Admin or authorized Admins)
 * 2. Activity / Audit Log (with diff inspection & filtering)
 * 3. Recycle Bin (soft-deleted items, restoration, permanent purge)
 * 4. Password Reset Requests (High-priority user password reset queue & alerts)
 *
 * NOTE: All operations enforce strict server-side authorization checks.
 */

import {useEffect, useRef, useState} from "react";
import {appStore, emitStoreChange, showToast, showErrorToast} from "../store/appStore.js";
import {API, CONFIG} from "../services/api.js";
import {Icon} from "../components/Icon.jsx";
import {canPerform, isAdminUser, formatPlural, formatDateTime, debounce} from "../utils/helpers.js";
import {navigateToView} from "../routes/navigation.js";
import {safeRefresh} from "../services/sync.js";
import {AccessDeniedBox, EmptyStateBox, RolePill, PaginationControls, CopyButton} from "../components/ui.jsx";
import {openModal, closeModal, ModalFrame, requestCloseModal, confirmBox} from "../components/Modal.jsx";
import {useServerData} from "../hooks/useServer.js";
import {openUserModal} from "../components/forms/UserForm.jsx";

/**
 * Skeleton placeholder while fetching admin data from the server.
 */
const AdminLoadingSkeleton = () => (
    <div className="card">
        <div className="card-body">
            <div className="sk sk-card"/>
            <div className="sk sk-card"/>
        </div>
    </div>
);

// ============================================================================
// PERMISSIONS MATRIX & MANAGEMENT
// ============================================================================

const STANDARD_PERMISSION_ACTIONS = ["View", "Add", "Edit", "Delete"];
const STANDARD_PERMISSION_SCOPES = ["Own", "Team", "All users"];

/**
 * Indexes flat permissions list into module maps and extra custom permissions.
 *
 * @param {Object} permissionsPayload
 * @returns {{ byModuleAction: Object, modules: string[], extraPermissionsByModule: Object }}
 */
function buildPermissionsIndex(permissionsPayload) {
    const byModuleAction = {};
    const modules = [];
    const extraPermissionsByModule = {};

    (permissionsPayload.perms || []).forEach((permission) => {
        if (!modules.includes(permission.module)) {
            modules.push(permission.module);
        }
        byModuleAction[`${permission.module}|${permission.label}`] = permission;

        const isStandardAction = STANDARD_PERMISSION_ACTIONS.includes(permission.label);
        const isStandardScope = STANDARD_PERMISSION_SCOPES.includes(permission.label);
        if (!isStandardAction && !isStandardScope) {
            if (!extraPermissionsByModule[permission.module]) {
                extraPermissionsByModule[permission.module] = [];
            }
            extraPermissionsByModule[permission.module].push(permission);
        }
    });

    return {
        by: byModuleAction,
        byModuleAction,
        mods: modules,
        modules,
        extras: extraPermissionsByModule,
        extraPermissionsByModule
    };
}

/**
 * Known icons for standard module slugs
 */
const MODULE_ICON_MAP = {
    dashboard: "dash",
    my_tasks: "mytask",
    assigned_by_me: "out",
    task_board: "board",
    calendar: "cal",
    all_tasks: "list",
    team_tasks: "team",
    members: "team",
    projects: "proj",
    sales_pipeline: "deal",
    reports: "report",
    password_reset_request: "key",
    audit_log: "eye",
    recycle_bin: "del",
    notifications: "bell",
    settings: "gear",
};

const ACTION_ORDER = ["View", "Add", "Edit", "Delete"];

/**
 * Groups a list of permission keys (e.g. ['my_tasks.view', 'my_tasks.add']) by module into merged structures.
 * Returns an array of { slug, module, icon, actions: string[] }
 */
function groupPermissionsByModule(keys, permsList = []) {
    const permInfoByKey = {};
    permsList.forEach((p) => {
        if (p && p.key) {
            permInfoByKey[p.key] = p;
        }
    });

    const moduleMap = {};

    keys.forEach((key) => {
        if (key.endsWith(".update")) return; // Update is governed by edit

        const parts = key.split(".");
        const slug = parts[0];
        const act = parts[1] || "view";

        const permInfo = permInfoByKey[key] || {};
        const moduleName = permInfo.module || slug.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        const actionLabel = permInfo.label || (act.charAt(0).toUpperCase() + act.slice(1));
        const icon = MODULE_ICON_MAP[slug] || "gear";

        if (!moduleMap[slug]) {
            moduleMap[slug] = {
                slug,
                module: moduleName,
                icon,
                actions: [],
            };
        }

        if (!moduleMap[slug].actions.includes(actionLabel)) {
            moduleMap[slug].actions.push(actionLabel);
        }
    });

    return Object.values(moduleMap).map((item) => {
        item.actions.sort((a, b) => {
            const idxA = ACTION_ORDER.indexOf(a);
            const idxB = ACTION_ORDER.indexOf(b);
            return (idxA !== -1 ? idxA : 99) - (idxB !== -1 ? idxB : 99);
        });
        return item;
    });
}

/**
 * Renders badges summarizing permissions for a user merged by module (e.g. "My Tasks (Add, Edit, Delete)").
 */
function UserPermissionsSummary({user, permissionsData}) {
    if (user.superAdmin) {
        return (
            <span
                className="pill perm-on"
                style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "3px 10px",
                    borderRadius: 14,
                    fontSize: 12,
                    verticalAlign: "middle"
                }}
            >
                <Icon name="key" style={{ width: 13, height: 13, opacity: 0.85 }} />
                <span>Everything (Super Admin)</span>
            </span>
        );
    }

    const permsList = permissionsData.perms || [];
    const grantedKeys = (user.granted || []).filter((key) => !key.endsWith(".update"));
    const revokedKeys = (user.revoked || []).filter((key) => !key.endsWith(".update"));

    if (grantedKeys.length === 0 && revokedKeys.length === 0) {
        return <span className="muted">Role defaults ({user.role})</span>;
    }

    const grantedModules = groupPermissionsByModule(grantedKeys, permsList);
    const revokedModules = groupPermissionsByModule(revokedKeys, permsList);

    return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            {grantedModules.map((item) => (
                <span
                    key={`granted-${item.slug}`}
                    className="pill perm-on"
                    style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        margin: "1px 0",
                        padding: "3px 10px",
                        borderRadius: 14,
                        fontSize: 12,
                        lineHeight: 1.4,
                        verticalAlign: "middle"
                    }}
                    title={`${item.module}: ${item.actions.join(", ")}`}
                >
                    <Icon name={item.icon} style={{ width: 13, height: 13, flexShrink: 0, opacity: 0.85 }} />
                    <span>
                        <strong style={{ fontWeight: 600 }}>{item.module}</strong>{" "}
                        <span style={{ opacity: 0.9, fontSize: "0.92em" }}>
                            ({item.actions.join(", ")})
                        </span>
                    </span>
                </span>
            ))}
            {revokedModules.map((item) => (
                <span
                    key={`revoked-${item.slug}`}
                    className="pill perm-off"
                    style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        margin: "1px 0",
                        padding: "3px 10px",
                        borderRadius: 14,
                        fontSize: 12,
                        lineHeight: 1.4,
                        verticalAlign: "middle"
                    }}
                    title={`Revoked - ${item.module}: ${item.actions.join(", ")}`}
                >
                    <Icon name={item.icon} style={{ width: 13, height: 13, flexShrink: 0, opacity: 0.85 }} />
                    <span>
                        <strong style={{ fontWeight: 600 }}>- {item.module}</strong>{" "}
                        <span style={{ opacity: 0.9, fontSize: "0.92em" }}>
                            ({item.actions.join(", ")})
                        </span>
                    </span>
                </span>
            ))}
        </div>
    );
}

/**
 * Permissions Matrix view.
 */
export function Permissions() {
    const [permissionsData, fetchError, reloadPermissions] = useServerData(() => API.permissions(), []);

    if (!canPerform.permissions()) {
        return <AccessDeniedBox
            message="Only the Super Admin (or an Admin allowed to manage permissions) can open this page."/>;
    }
    if (fetchError) {
        return <AccessDeniedBox message={fetchError}/>;
    }
    if (!permissionsData) {
        return <AdminLoadingSkeleton/>;
    }

    if (!appStore.admin) {
        appStore.admin = {
            perm: null,
            audit: { page: 1, mod: "", act: "", u: "", des: "", q: "", from: "", to: "", module: "", actionType: "", user: "", designation: "", open: {} },
            bin: { status: "deleted", mod: "", module: "" }
        };
    }
    appStore.admin.perm = permissionsData;
    const isSuperAdmin = Boolean(permissionsData.isSuper);
    const roleLimits = permissionsData.limits || {};
    const adminLimit = roleLimits.Admin || {used: 0, max: 2};
    const managerLimit = roleLimits.Manager || {used: 0, max: 5};

    /**
     * Prompts confirmation and toggles Super Admin status for an admin user.
     */
    const handleToggleSuperAdmin = (targetUser) => {
        const willBeSuperAdmin = !targetUser.superAdmin;
        const confirmTitle = willBeSuperAdmin ? "Make Super Admin?" : "Remove Super Admin?";
        const confirmMessage = (
            <p>
                <b>{targetUser.name}</b>{" "}
                {willBeSuperAdmin
                    ? "will be able to give permissions, change roles, cancel tasks and permanently delete."
                    : "will go back to a normal Admin."}
            </p>
        );

        confirmBox(
            confirmTitle,
            confirmMessage,
            willBeSuperAdmin ? "Make Super Admin" : "Remove",
            async () => {
                await API.setSuper(targetUser.id, willBeSuperAdmin);
                closeModal();
                showToast("Saved");
                reloadPermissions();
            }
        );
    };

    return (
        <>
            <div className="notice" style={{marginBottom: 14}}>
                <Icon name="key"/>
                <div>
                    Every person starts with the defaults of their role. Use <b>Permissions</b> to switch View, Edit,
                    Update or Delete on or off per module for one person.{" "}
                    {isSuperAdmin
                        ? "Changing roles, Admin accounts, cancelling tasks and permanent deletes stay with the Super Admin."
                        : "You can change permissions of Managers and Employees, only for boxes you have yourself, and never your own."}
                    {permissionsData.ready === false && (
                        <>
                            {" "}
                            <b style={{color: "#d94b4b"}}>Run migration 009 before saving changes.</b>
                        </>
                    )}
                </div>
            </div>

            {isSuperAdmin && (
                <div className="card" style={{
                    marginBottom: 14,
                    padding: "12px 16px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap"
                }}>
                    <div>
                        <b>Admins:</b> {adminLimit.used} of {adminLimit.max} used &nbsp;&middot;&nbsp;
                        <b>Managers:</b> {managerLimit.used} of {managerLimit.max} used{" "}
                        <span className="muted">(Super Admins are not counted)</span>
                    </div>
                    <button
                        className="btn btn-primary btn-sm"
                        id="permAddAdmin"
                        disabled={adminLimit.used >= adminLimit.max}
                        title={adminLimit.used >= adminLimit.max ? "Maximum Admin limit reached" : undefined}
                        onClick={() => openUserModal(null, {adminSection: true})}
                    >
                        <Icon name="plus"/> Add Admin
                    </button>
                </div>
            )}

            {/* Permission Legend & Information */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 16,
                    flexWrap: "wrap",
                    marginBottom: 12,
                    padding: "9px 16px",
                    background: "var(--card-bg, #ffffff)",
                    borderRadius: "var(--radius-md, 8px)",
                    border: "1px solid var(--border-color, #e2e8f0)",
                    fontSize: 12,
                    color: "var(--c-muted, #64748b)"
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 600, color: "var(--c-text, #1e293b)" }}>Permission Legend:</span>
                    <span
                        className="pill perm-on"
                        style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                            margin: 0,
                            padding: "2px 8px",
                            fontSize: 11
                        }}
                    >
                        <Icon name="check" style={{ width: 12, height: 12 }} />
                        <span>Module (Actions) Granted</span>
                    </span>
                    <span
                        className="pill perm-off"
                        style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                            margin: 0,
                            padding: "2px 8px",
                            fontSize: 11
                        }}
                    >
                        <Icon name="x" style={{ width: 12, height: 12 }} />
                        <span>Module (Actions) Revoked</span>
                    </span>
                    <span className="muted" style={{ fontStyle: "italic" }}>
                        Role defaults: Person inherits standard role privileges
                    </span>
                </div>
                <div className="muted" style={{ fontSize: 11.5 }}>
                    Click <b>Edit</b> to customize module permissions
                </div>
            </div>

            <div className="card">
                <div className="table-wrap">
                    <table>
                        <thead>
                        <tr>
                            <th>Person</th>
                            <th>Role</th>
                            <th>Assigned Permissions (by Module)</th>
                            <th className="right">Actions</th>
                        </tr>
                        </thead>
                        <tbody>
                        {permissionsData.users.map((user) => (
                            <tr key={user.id}>
                                <td>
                                    <div className="strong">{user.name}</div>
                                    <div className="muted" style={{fontSize: 11.6}}>
                                        {user.email}
                                        {user.designation ? ` · ${user.designation}` : ""}
                                        {user.status !== "Active" ? ` · ${user.status}` : ""}
                                    </div>
                                </td>
                                <td>
                                    <RolePill role={user.role}/>
                                    {user.superAdmin && (
                                        <>
                                            {" "}
                                            <span className="role-pill rp-admin">Super Admin</span>
                                        </>
                                    )}
                                </td>
                                <td style={{maxWidth: 440}}>
                                    <UserPermissionsSummary user={user} permissionsData={permissionsData}/>
                                </td>
                                <td>
                                    <div className="row-actions">
                                        {!user.superAdmin && (
                                            <button
                                                className="btn btn-ghost btn-sm"
                                                data-permedit={user.id}
                                                onClick={() => openModal(<PermissionEditorModal
                                                    permissionsData={permissionsData} targetUser={user}
                                                    reloadPermissions={reloadPermissions}/>)}
                                            >
                                                <Icon name={user.editable ? "edit" : "eye"}/>
                                                {user.editable ? " Permissions" : " View"}
                                            </button>
                                        )}
                                        {isSuperAdmin && user.role === "Admin" && user.id !== appStore.currentUser.id && (
                                            <button className="btn btn-ghost btn-sm" data-supertoggle={user.id}
                                                    onClick={() => handleToggleSuperAdmin(user)}>
                                                {user.superAdmin ? "Remove Super Admin" : "Make Super Admin"}
                                            </button>
                                        )}
                                        {isSuperAdmin && !user.superAdmin && user.id !== appStore.currentUser.id && (
                                            <button
                                                className="btn btn-ghost btn-sm"
                                                data-rolechange={user.id}
                                                onClick={() => openModal(<RoleChangeModal
                                                    permissionsData={permissionsData} targetUser={user}
                                                    reloadPermissions={reloadPermissions}/>)}
                                            >
                                                Change role
                                            </button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </>
    );
}

/**
 * Modal to change a user's role (Super Admin only).
 */
function RoleChangeModal({permissionsData, targetUser, reloadPermissions}) {
    const roleLimits = permissionsData.limits || {};
    const [selectedRole, setSelectedRole] = useState(targetUser.role);
    const [errorMessage, setErrorMessage] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    const handleSave = async () => {
        if (selectedRole === targetUser.role) {
            closeModal();
            return;
        }
        setIsSaving(true);
        try {
            await API.setRole(targetUser.id, selectedRole);
            closeModal();
            showToast(`${targetUser.name} is now ${selectedRole}`);
            await safeRefresh();
            reloadPermissions();
        } catch (err) {
            setErrorMessage((err && err.message) || "Could not change the role.");
            setIsSaving(false);
        }
    };

    return (
        <ModalFrame
            title={`Change role for ${targetUser.name}`}
            subtitle={`Current role: ${targetUser.role}. Only the Super Admin can do this.`}
            footer={
                <>
                    <button className="btn btn-ghost" id="mCancel" onClick={() => requestCloseModal()}>
                        Cancel
                    </button>
                    <button className="btn btn-primary" id="rcSave" disabled={isSaving} onClick={handleSave}>
                        {isSaving ? "Saving..." : "Save role"}
                    </button>
                </>
            }
        >
            <div className="field">
                <label>Role</label>
                <select id="rcRole" value={selectedRole} onChange={(e) => setSelectedRole(e.target.value)}>
                    {["Admin", "Manager", "Employee"].map((roleName) => {
                        const limitInfo = roleLimits[roleName];
                        const isAtLimit = limitInfo && roleName !== targetUser.role && limitInfo.used >= limitInfo.max;
                        return (
                            <option key={roleName} value={roleName} disabled={isAtLimit}>
                                {roleName}
                                {limitInfo ? ` (${limitInfo.used} of ${limitInfo.max} used)` : ""}
                                {isAtLimit ? " - limit reached" : ""}
                            </option>
                        );
                    })}
                </select>
                <div className="muted" id="rcErr" style={{marginTop: 8, color: "var(--danger,#c0392b)"}}>
                    {errorMessage}
                </div>
            </div>
        </ModalFrame>
    );
}

/**
 * Interactive granular permissions editor modal.
 */
function PermissionEditorModal({permissionsData, targetUser, reloadPermissions}) {
    const index = buildPermissionsIndex(permissionsData);
    const defaultRolePermissions = permissionsData.rolePerms?.[targetUser.role] || [];
    const currentAdminPermissions = permissionsData.mine || [];
    const isEditable = Boolean(targetUser.editable) && permissionsData.ready !== false;

    const [activePermissions, setActivePermissions] = useState(() => {
        const initialMap = {};
        (permissionsData.perms || []).forEach((permission) => {
            initialMap[permission.key] = targetUser.effective.includes(permission.key);
        });
        // Edit manages update: ensure update state mirrors edit state
        (permissionsData.perms || []).forEach((permission) => {
            if (permission.key.endsWith(".edit")) {
                const updateKey = permission.key.replace(/\.edit$/, ".update");
                initialMap[updateKey] = Boolean(initialMap[permission.key]);
            }
        });
        return initialMap;
    });
    const [isSaving, setIsSaving] = useState(false);

    const isPermissionLocked = (permissionKey) => {
        if (!isEditable) return true;
        if (!permissionsData.isSuper) {
            if (!currentAdminPermissions.includes(permissionKey) || permissionKey === "permissions.manage") {
                return true;
            }
        }
        return false;
    };

    const isRoleDefaultActive = (permissionKey) => defaultRolePermissions.includes(permissionKey);

    const togglePermission = (permissionKey) => {
        setActivePermissions((prev) => {
            const nextVal = !prev[permissionKey];
            const nextState = {
                ...prev,
                [permissionKey]: nextVal,
            };
            // Edit will work for update and update permission is managed by edit permission
            if (permissionKey.endsWith(".edit")) {
                const updateKey = permissionKey.replace(/\.edit$/, ".update");
                nextState[updateKey] = nextVal;
            }
            return nextState;
        });
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const selectedKeys = Object.keys(activePermissions).filter((key) => activePermissions[key]);
            // Ensure update permission is automatically managed by edit permission
            const finalKeys = [...selectedKeys];
            selectedKeys.forEach((key) => {
                if (key.endsWith(".edit")) {
                    const updateKey = key.replace(/\.edit$/, ".update");
                    if (!finalKeys.includes(updateKey)) {
                        finalKeys.push(updateKey);
                    }
                }
            });
            await API.savePermissions(targetUser.id, finalKeys);
            closeModal();
            showToast(`Permissions saved for ${targetUser.name}`);
            reloadPermissions();
        } catch (err) {
            setIsSaving(false);
            showErrorToast(err);
        }
    };

    const handleResetToRoleDefaults = () => {
        setActivePermissions((prev) => {
            const resetMap = {...prev};
            Object.keys(resetMap).forEach((key) => {
                if (!isPermissionLocked(key)) {
                    resetMap[key] = isRoleDefaultActive(key);
                }
            });
            // Ensure update follows edit
            Object.keys(resetMap).forEach((key) => {
                if (key.endsWith(".edit")) {
                    const updateKey = key.replace(/\.edit$/, ".update");
                    if (!isPermissionLocked(updateKey)) {
                        resetMap[updateKey] = resetMap[key];
                    }
                }
            });
            return resetMap;
        });
    };

    const PermissionCheckboxCell = ({permission}) => {
        if (!permission) {
            return <td className="pm-na" title="Not used for this module">&ndash;</td>;
        }
        const isChangedFromDefault = activePermissions[permission.key] !== isRoleDefaultActive(permission.key);
        const locked = isPermissionLocked(permission.key);

        return (
            <td className="pm-cell">
                <label
                    className={`pm-box${isChangedFromDefault ? " changed" : ""}`}
                    title={`${permission.help} (${isRoleDefaultActive(permission.key) ? "role default: on" : "role default: off"})`}
                >
                    <input
                        type="checkbox"
                        data-pk={permission.key}
                        checked={Boolean(activePermissions[permission.key])}
                        disabled={locked}
                        onChange={() => togglePermission(permission.key)}
                    />
                    <span className="sr">{`${permission.module} ${permission.label}`}</span>
                </label>
            </td>
        );
    };

    const actionModules = index.modules.filter((mod) =>
        STANDARD_PERMISSION_ACTIONS.some((action) => index.byModuleAction[`${mod}|${action}`])
    );
    const scopeModules = index.modules.filter((mod) =>
        STANDARD_PERMISSION_SCOPES.some((scope) => index.byModuleAction[`${mod}|${scope}`])
    );
    const otherModules = index.modules.filter(
        (mod) => !actionModules.includes(mod) && !scopeModules.includes(mod)
    );

    return (
        <ModalFrame
            wide
            title={`Permissions for ${targetUser.name}`}
            sub={isEditable ? "Tick or untick, then save. Changes apply at once; the person stays signed in and is notified." : "Read only"}
            foot={
                <>
                    {isEditable && (
                        <button className="btn btn-ghost" id="permReset" style={{marginRight: "auto"}}
                                onClick={handleResetToRoleDefaults}>
                            Reset to role defaults
                        </button>
                    )}
                    <button className="btn btn-ghost" id="mCancel" onClick={() => requestCloseModal()}>
                        {isEditable ? "Cancel" : "Close"}
                    </button>
                    {isEditable && (
                        <button className="btn btn-primary" id="permSave" disabled={isSaving} onClick={handleSave}>
                            {isSaving ? "Saving..." : "Save permissions"}
                        </button>
                    )}
                </>
            }
        >
            <div className="muted" style={{fontSize: 12.2, marginBottom: 10}}>
                Role: <b>{targetUser.role}</b>
                {targetUser.designation ? ` (${targetUser.designation})` : ""}. Boxes start at the role defaults; a box
                with an orange edge is changed for this person. Hover a box to see what it allows.
                {!isEditable && (
                    <>
                        <br/>
                        <b>
                            {permissionsData.ready === false
                                ? "Run migration 009 to change permissions."
                                : targetUser.id === appStore.currentUser.id
                                    ? "You cannot change your own permissions."
                                    : "You can only view these permissions."}
                        </b>
                    </>
                )}
            </div>

            {/* CRUD Action matrix */}
            <div className="table-wrap">
                <table className="pm-table">
                    <thead>
                    <tr>
                        <th>Module</th>
                        {STANDARD_PERMISSION_ACTIONS.map((action) => (
                            <th key={action} className="c">{action}</th>
                        ))}
                    </tr>
                    </thead>
                    <tbody>
                    {actionModules.map((moduleName) => [
                        <tr key={moduleName}>
                            <td className="strong">{moduleName}</td>
                            {STANDARD_PERMISSION_ACTIONS.map((action) => (
                                <PermissionCheckboxCell key={action}
                                                        permission={index.byModuleAction[`${moduleName}|${action}`]}/>
                            ))}
                        </tr>,
                        ...(index.extraPermissionsByModule[moduleName] || []).map((extraPerm) => (
                            <tr key={extraPerm.key} className="pm-extra">
                                <td colSpan="5">
                                    <label
                                        className={`pm-inline${activePermissions[extraPerm.key] !== isRoleDefaultActive(extraPerm.key) ? " changed" : ""}`}>
                                        <input
                                            type="checkbox"
                                            data-pk={extraPerm.key}
                                            checked={Boolean(activePermissions[extraPerm.key])}
                                            disabled={isPermissionLocked(extraPerm.key)}
                                            onChange={() => togglePermission(extraPerm.key)}
                                        />{" "}
                                        <b>{extraPerm.label}</b> <span className="muted">{extraPerm.help}</span>
                                    </label>
                                </td>
                            </tr>
                        ))
                    ])}
                    </tbody>
                </table>
            </div>

            {/* Scope matrix */}
            <div className="table-wrap" style={{marginTop: 12}}>
                <table className="pm-table">
                    <thead>
                    <tr>
                        <th>Who they can see</th>
                        {STANDARD_PERMISSION_SCOPES.map((scope) => (
                            <th key={scope} className="c">{scope}</th>
                        ))}
                    </tr>
                    </thead>
                    <tbody>
                    {scopeModules.map((moduleName) => (
                        <tr key={moduleName}>
                            <td className="strong">{moduleName}</td>
                            {STANDARD_PERMISSION_SCOPES.map((scope) => (
                                <PermissionCheckboxCell key={scope}
                                                        permission={index.byModuleAction[`${moduleName}|${scope}`]}/>
                            ))}
                        </tr>
                    ))}
                    </tbody>
                </table>
            </div>

            {/* Other loose module permissions */}
            <div className="perm-list" style={{marginTop: 12}}>
                {otherModules.map((moduleName) =>
                        permissionsData.perms
                            .filter((p) => p.module === moduleName)
                            .map((perm) => (
                                <label
                                    key={perm.key}
                                    className={`perm-row${isPermissionLocked(perm.key) ? " locked" : ""}${activePermissions[perm.key] !== isRoleDefaultActive(perm.key) ? " changed" : ""}`}
                                >
                                    <input
                                        type="checkbox"
                                        data-pk={perm.key}
                                        checked={Boolean(activePermissions[perm.key])}
                                        disabled={isPermissionLocked(perm.key)}
                                        onChange={() => togglePermission(perm.key)}
                                    />
                                    <span>
                  <b>{`${moduleName}: ${perm.label}`}</b>
                  <br/>
                  <span className="muted">{perm.help}</span>
                </span>
                                </label>
                            ))
                )}
            </div>
        </ModalFrame>
    );
}

// ============================================================================
// ACTIVITY / AUDIT LOG
// ============================================================================

/**
 * Formats old/new diff values for audit log inspection.
 */
function AuditDiffValue({value}) {
    if (value === null || value === undefined) {
        return <span className="muted">-</span>;
    }
    if (typeof value !== "object") {
        return String(value);
    }
    return Object.keys(value).map((key) => {
        const val = value[key];
        const displayText = val === null || val === undefined || val === "" ? "-" : typeof val === "object" ? JSON.stringify(val) : String(val);
        return (
            <div key={key}>
                <span className="muted">{key}:</span> {displayText}
            </div>
        );
    });
}

/**
 * Audit log page.
 */
export function Audit() {
    if (!appStore.admin) {
        appStore.admin = {
            perm: null,
            audit: { page: 1, mod: "", act: "", u: "", des: "", q: "", from: "", to: "", module: "", actionType: "", user: "", designation: "", open: {} },
            bin: { status: "deleted", mod: "", module: "" }
        };
    }
    if (!appStore.admin.audit) {
        appStore.admin.audit = { page: 1, mod: "", act: "", u: "", des: "", q: "", from: "", to: "", module: "", actionType: "", user: "", designation: "", open: {} };
    }
    const auditFilters = appStore.admin.audit;
    const [searchQuery, setSearchQuery] = useState(auditFilters.q || "");

    const debouncedSearch = useRef(
        debounce((queryValue) => {
            Object.assign(appStore.admin.audit, {q: queryValue, page: 1, open: {}});
            emitStoreChange();
        }, 400)
    ).current;

    const [auditData, fetchError] = useServerData(
        () =>
            API.auditLog({
                page: auditFilters.page,
                module: auditFilters.module,
                actionType: auditFilters.actionType,
                user: auditFilters.user,
                designation: auditFilters.designation,
                q: auditFilters.q,
                from: auditFilters.from,
                to: auditFilters.to
            }),
        [
            auditFilters.page,
            auditFilters.module,
            auditFilters.actionType,
            auditFilters.user,
            auditFilters.designation,
            auditFilters.q,
            auditFilters.from,
            auditFilters.to
        ]
    );

    if (!canPerform.audit()) {
        return <AccessDeniedBox message="You do not have permission to view activity logs."/>;
    }
    if (fetchError) {
        return <AccessDeniedBox message={fetchError}/>;
    }
    if (!auditData) {
        return <AdminLoadingSkeleton/>;
    }

    const updateFilters = (patch) => {
        Object.assign(appStore.admin.audit, {page: 1, open: {}}, patch);
        emitStoreChange();
    };

    const FilterSelectOptions = ({list, allLabel}) => (
        <>
            <option value="">{allLabel}</option>
            {list.map((item) => (
                <option key={item}>{item}</option>
            ))}
        </>
    );

    return (
        <>
            <div className="toolbar adm-bar">
                <input
                    className="i"
                    id="auQ"
                    placeholder="Search description, record, email"
                    maxLength={80}
                    value={searchQuery}
                    onChange={(e) => {
                        setSearchQuery(e.target.value);
                        debouncedSearch(e.target.value.trim());
                    }}
                />
                <select className="i sel" id="auMod" value={auditFilters.module}
                        onChange={(e) => updateFilters({module: e.target.value})}>
                    <FilterSelectOptions list={auditData.modules || []} allLabel="All sections"/>
                </select>
                <select className="i sel" id="auAct" value={auditFilters.actionType}
                        onChange={(e) => updateFilters({actionType: e.target.value})}>
                    <FilterSelectOptions list={auditData.actions || []} allLabel="All actions"/>
                </select>
                {auditData.scope !== "own" && (
                    <select className="i sel" id="auUser" value={String(auditFilters.user)}
                            onChange={(e) => updateFilters({user: e.target.value})}>
                        <option value="">{auditData.scope === "all" ? "Everyone" : "You and your team"}</option>
                        {(auditData.people || []).map((person) => (
                            <option key={person.id} value={person.id}>
                                {person.name}
                            </option>
                        ))}
                    </select>
                )}
                {auditData.scope !== "own" && (auditData.designations || []).length > 0 && (
                    <select className="i sel" id="auDes" value={auditFilters.designation}
                            onChange={(e) => updateFilters({designation: e.target.value})}>
                        <FilterSelectOptions list={auditData.designations} allLabel="All designations"/>
                    </select>
                )}
                <input className="i" type="date" id="auFrom" value={auditFilters.from} title="From"
                       onChange={(e) => updateFilters({from: e.target.value})}/>
                <input className="i" type="date" id="auTo" value={auditFilters.to} title="To"
                       onChange={(e) => updateFilters({to: e.target.value})}/>
                <button
                    className="btn btn-ghost btn-sm"
                    id="auClear"
                    onClick={() => {
                        setSearchQuery("");
                        appStore.admin.audit = {
                            page: 1,
                            module: "",
                            actionType: "",
                            user: "",
                            designation: "",
                            q: "",
                            from: "",
                            to: "",
                            open: {}
                        };
                        emitStoreChange();
                    }}
                >
                    Clear
                </button>
            </div>

            <div className="muted" style={{fontSize: 12, margin: "0 0 10px"}}>
                {formatPlural(auditData.total, "entry").replace("entrys", "entries")}
                {auditData.total > 0 && (
                    <> &middot; showing {(auditData.page - 1) * auditData.perPage + 1}-{Math.min(auditData.total, auditData.page * auditData.perPage)}</>
                )}
                {" · "}
                {auditData.scope === "all" ? "everyone in the company" : auditData.scope === "team" ? "your own actions and your team's" : "only your own actions"} &middot; read
                only &middot; entries are kept for {auditData.keepDays || 40} days
            </div>

            <div className="card">
                <div className="table-wrap">
                    <table>
                        <thead>
                        <tr>
                            <th>When</th>
                            <th>Who</th>
                            <th>Action</th>
                            <th>Section</th>
                            <th>Record</th>
                            <th>Details</th>
                        </tr>
                        </thead>
                        <tbody>
                        {(auditData.rows || []).length > 0 ? (
                            (auditData.rows || []).map((row) => {
                                const hasDiffValues = row.old_value !== null || row.new_value !== null;
                                const isExpanded = Boolean(auditFilters.open[row.id]);

                                return (
                                    <tr
                                        key={row.id}
                                        className={hasDiffValues ? "clickable" : ""}
                                        data-auditrow={row.id}
                                        onClick={
                                            hasDiffValues
                                                ? () => {
                                                    auditFilters.open[row.id] = !auditFilters.open[row.id];
                                                    emitStoreChange();
                                                }
                                                : undefined
                                        }
                                    >
                                        <td className="nowrap">{row.at}</td>
                                        <td>
                                            <div className="strong">{row.user_name || "-"}</div>
                                            <div className="muted" style={{fontSize: 11}}>
                                                {[row.user_designation, row.user_role].filter(Boolean).join(" · ")}
                                            </div>
                                            <div className="muted" style={{fontSize: 11}}>
                                                {row.user_email || ""}
                                                {row.ip_address ? ` · ${row.ip_address}` : ""}
                                            </div>
                                        </td>
                                        <td>
                                            <span className="badge b-grey">{row.action}</span>
                                        </td>
                                        <td>{row.module}</td>
                                        <td className="nowrap">{row.record_id || "-"}</td>
                                        <td style={{minWidth: 260}}>
                                            {row.description || ""}
                                            {hasDiffValues && (
                                                <>
                                                    {" "}
                                                    <span className="muted" style={{fontSize: 11}}>
                              {isExpanded ? "hide" : "show"} changes
                            </span>
                                                </>
                                            )}
                                            {isExpanded && (
                                                <div className="audit-diff">
                                                    <div>
                                                        <div className="k">Before</div>
                                                        <AuditDiffValue value={row.old_value}/>
                                                    </div>
                                                    <div>
                                                        <div className="k">After</div>
                                                        <AuditDiffValue value={row.new_value}/>
                                                    </div>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })
                        ) : (
                            <tr>
                                <td colSpan="6">
                                    <EmptyStateBox iconName="eye" title="No activity entries"
                                                   subtitle="Nothing matches these filters"/>
                                </td>
                            </tr>
                        )}
                        </tbody>
                    </table>
                </div>
            </div>

            <PaginationControls
                currentPage={auditData.page}
                totalPages={auditData.pages}
                onPageChange={(nextPage) => {
                    if (nextPage < 1 || nextPage > auditData.pages) return;
                    Object.assign(appStore.admin.audit, {page: nextPage, open: {}});
                    emitStoreChange();
                    window.scrollTo(0, 0);
                }}
            />
        </>
    );
}

// ============================================================================
// RECYCLE BIN
// ============================================================================

export function Recycle() {
    if (!appStore.admin) {
        appStore.admin = {
            perm: null,
            audit: { page: 1, mod: "", act: "", u: "", des: "", q: "", from: "", to: "", module: "", actionType: "", user: "", designation: "", open: {} },
            bin: { status: "deleted", mod: "", module: "" }
        };
    }
    if (!appStore.admin.bin) {
        appStore.admin.bin = { status: "deleted", mod: "", module: "" };
    }
    const binFilters = appStore.admin.bin;
    const [recycleData, fetchError, reloadRecycleBin] = useServerData(
        () => API.recycleList({status: binFilters.status, module: binFilters.module}),
        [binFilters.status, binFilters.module]
    );

    if (!canPerform.recycle()) {
        return <AccessDeniedBox message="You do not have permission to open the Recycle Bin."/>;
    }
    if (fetchError) {
        return <AccessDeniedBox message={fetchError}/>;
    }
    if (!recycleData) {
        return <AdminLoadingSkeleton/>;
    }

    const statusTabs = [
        ["deleted", "In the bin"],
        ["restored", "Restored"],
        ["purged", "Permanently deleted"],
        ["all", "All"]
    ];

    const moduleNames = {
        task: "Task",
        project: "Project",
        user: "User",
        deal: "Deal",
        attachment: "File"
    };

    const handleRestore = (item) => {
        confirmBox(
            "Restore this item?",
            <p>
                <b>{item.label}</b> will be put back where it was.
            </p>,
            "Restore",
            async () => {
                const response = await API.recycleRestore(item.id);
                closeModal();
                await safeRefresh();
                reloadRecycleBin();
                showToast(response.message || "Restored");
            },
            {kind: "primary"}
        );
    };

    const handlePurge = (item) => {
        confirmBox(
            "Delete forever?",
            <p>
                <b>{item.label}</b> and its stored files will be deleted permanently. This cannot be undone.
            </p>,
            "Delete forever",
            async () => {
                await API.recyclePurge(item.id);
                closeModal();
                showToast("Deleted permanently");
                reloadRecycleBin();
            }
        );
    };

    return (
        <>
            <div className="notice" style={{marginBottom: 14}}>
                <Icon name="alert"/>
                <div>
                    Deleted items stay here for <b>{recycleData.days} days</b> and can be restored, then they are
                    deleted permanently with their files.{" "}
                    {recycleData.canPurge
                        ? "As Super Admin you can also delete an item permanently right away."
                        : "Only the Super Admin can delete permanently."}
                </div>
            </div>

            <div className="toolbar adm-bar">
                <div className="seg">
                    {statusTabs.map(([tabKey, tabLabel]) => (
                        <button
                            key={tabKey}
                            data-bintab={tabKey}
                            className={binFilters.status === tabKey ? "on" : ""}
                            onClick={() => {
                                binFilters.status = tabKey;
                                emitStoreChange();
                            }}
                        >
                            {tabLabel}
                        </button>
                    ))}
                </div>
                <select
                    className="i sel"
                    id="binMod"
                    value={binFilters.module}
                    onChange={(e) => {
                        binFilters.module = e.target.value;
                        emitStoreChange();
                    }}
                >
                    <option value="">All types</option>
                    {Object.keys(moduleNames).map((key) => (
                        <option key={key} value={key}>
                            {moduleNames[key]}
                        </option>
                    ))}
                </select>
            </div>

            <div className="card">
                <div className="table-wrap">
                    <table>
                        <thead>
                        <tr>
                            <th>Item</th>
                            <th>Type</th>
                            <th>Deleted by</th>
                            <th>Deleted on</th>
                            <th>{binFilters.status === "deleted" ? "Auto delete on" : "Status"}</th>
                            <th>Files</th>
                            <th className="right">Actions</th>
                        </tr>
                        </thead>
                        <tbody>
                        {recycleData.rows.length > 0 ? (
                            recycleData.rows.map((item) => {
                                const statusCell =
                                    item.restore_status === "deleted" ? (
                                        formatDateTime(item.purge_at)
                                    ) : item.restore_status === "restored" ? (
                                        <>
                                            <span className="badge b-green">Restored</span>{" "}
                                            <span className="muted" style={{fontSize: 11}}>
                          {item.restored_by || ""} &middot; {formatDateTime(item.restored_at)}
                        </span>
                                        </>
                                    ) : (
                                        <>
                                            <span className="badge b-red">Deleted forever</span>{" "}
                                            <span className="muted" style={{fontSize: 11}}>
                          {item.purged_by || ""} &middot; {formatDateTime(item.purged_at)}
                        </span>
                                        </>
                                    );

                                return (
                                    <tr key={item.id}>
                                        <td>
                                            <div className="strong">{item.label}</div>
                                            {item.deletion_reason && (
                                                <div className="muted" style={{fontSize: 11}}>
                                                    {item.deletion_reason}
                                                </div>
                                            )}
                                            {item.purge_error && (
                                                <div style={{fontSize: 11, color: "var(--red)"}}>
                                                    Last cleanup failed, will retry: {item.purge_error}
                                                </div>
                                            )}
                                        </td>
                                        <td>{moduleNames[item.module] || item.module}</td>
                                        <td>{item.deleted_by_name}</td>
                                        <td className="nowrap">{formatDateTime(item.deleted_at)}</td>
                                        <td className="nowrap">{statusCell}</td>
                                        <td>{item.file_count || 0}</td>
                                        <td>
                                            <div className="row-actions">
                                                {item.restore_status === "deleted" && (
                                                    <>
                                                        <button className="btn btn-ghost btn-sm"
                                                                data-binrestore={item.id}
                                                                onClick={() => handleRestore(item)}>
                                                            <Icon name="refresh"/> Restore
                                                        </button>
                                                        {recycleData.canPurge && (
                                                            <button className="btn btn-danger btn-sm"
                                                                    data-binpurge={item.id}
                                                                    onClick={() => handlePurge(item)}>
                                                                Delete forever
                                                            </button>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        ) : (
                            <tr>
                                <td colSpan="7">
                                    <EmptyStateBox icon="del" title="Nothing here"
                                                   subtitle={binFilters.status === "deleted" ? "Deleted items will appear here" : ""}/>
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

// ============================================================================
// PASSWORD RESET REQUESTS (ADMIN WORKFLOW)
// ============================================================================

function formatPasswordResetTime(timestamp) {
    return timestamp ? formatDateTime(String(timestamp).replace(" ", "T").slice(0, 16)) : "-";
}

let SEEN_PASSWORD_RESETS = {};
let POPPED_PASSWORD_RESET_KEY = "";

/**
 * High-priority password reset banner displayed to Admins.
 */
export function PwBanner() {
    const pendingRequests = isAdminUser() && appStore.database.pwResets ? appStore.database.pwResets : [];
    const requestStateKey = pendingRequests.map((req) => `${req.id}:${req.reminders}:${req.times}`).join("|");

    useEffect(() => {
        if (pendingRequests.length === 0) return;

        const freshRequests = pendingRequests.filter((req) => {
            const state = `${req.reminders}:${req.times}`;
            const previousState = SEEN_PASSWORD_RESETS[req.id];
            SEEN_PASSWORD_RESETS[req.id] = state;
            return previousState !== state;
        });

        if (freshRequests.length > 0 && Object.keys(SEEN_PASSWORD_RESETS).length > 0) {
            showToast(`HIGH PRIORITY: ${formatPlural(pendingRequests.length, "password reset request")} waiting for you`, "err");
        }

        if (requestStateKey !== POPPED_PASSWORD_RESET_KEY && !appStore.activeModal) {
            POPPED_PASSWORD_RESET_KEY = requestStateKey;
            openModal(<PasswordResetUrgentPopup requests={pendingRequests}/>, {cls: "pw-overlay"});
        }
    }, [requestStateKey]);

    if (pendingRequests.length === 0) return null;

    return (
        <div className="pw-banner">
            <div className="pw-head">
                <Icon name="alert"/>
                <b>HIGH PRIORITY: Password Reset Required</b>
                <span className="pw-count">{pendingRequests.length} pending</span>
            </div>
            {pendingRequests.slice(0, 3).map((request) => (
                <div key={request.id} className="pw-item">
                    <div className="pw-who">
                        <b>{request.name}</b> requested a password reset.
                        <div className="pw-meta">
                            {request.email} &middot; Requested: {formatPasswordResetTime(request.requestedAt)}
                            {request.times > 1 ? ` · asked ${request.times} times` : ""} &middot; Status: <b>Pending</b>
                        </div>
                    </div>
                    <button className="btn btn-danger btn-sm" data-pwreset={request.id}
                            onClick={() => openPwReset(request.id)}>
                        <Icon name="key"/> Reset Password
                    </button>
                </div>
            ))}
            {pendingRequests.length > 3 && (
                <div className="pw-more">
                    <button className="link" data-pwall="1" onClick={() => navigateToView("pwresets")}>
                        See all {pendingRequests.length} requests
                    </button>
                </div>
            )}
        </div>
    );
}

/**
 * Urgent popup notification for password resets.
 */
function PasswordResetUrgentPopup({requests}) {
    return (
        <ModalFrame
            title="Password reset request"
            subtitle={`HIGH PRIORITY: ${requests.length === 1 ? "1 user is" : `${requests.length} users are`} waiting for a new password`}
            footer={
                <>
                    <button className="btn btn-ghost" id="mCancel" onClick={() => requestCloseModal()}>
                        Later
                    </button>
                    {requests.length === 1 && (
                        <button
                            className="btn btn-primary"
                            id="popResetOne"
                            onClick={() => {
                                closeModal(true);
                                openPwReset(requests[0].id);
                            }}
                        >
                            Reset Password now
                        </button>
                    )}
                </>
            }
        >
            <div className="pw-pop">
                {requests.map((request) => (
                    <div key={request.id} className="pw-pop-item">
                        <Icon name="key"/>
                        <div className="pw-who">
                            <b>{request.name}</b> requested a password reset.
                            <div className="pw-meta">
                                {request.email} &middot; Requested: {formatPasswordResetTime(request.requestedAt)} &middot; Status: <b>Pending</b>
                            </div>
                        </div>
                        <button
                            className="btn btn-danger btn-sm"
                            data-poppw={request.id}
                            onClick={() => {
                                closeModal(true);
                                openPwReset(request.id);
                            }}
                        >
                            Reset Password
                        </button>
                    </div>
                ))}
            </div>
            <div className="hint">If you choose Later, this popup comes back at the next reminder until the password is
                reset.
            </div>
        </ModalFrame>
    );
}

/**
 * Opens password reset processing modal for an Admin.
 *
 * @param {string|number} requestId
 */
export async function openPwReset(requestId) {
    if (!isAdminUser()) {
        showToast("Only an Admin or the Super Admin can reset passwords.", "err");
        return;
    }
    let requestDetails;
    try {
        requestDetails = (await API.pwResetOpen(requestId)).request;
    } catch (err) {
        showErrorToast(err);
        return;
    }
    if (requestDetails.status !== "Pending") {
        showToast(`This request is already ${requestDetails.status.toLowerCase()}.`, "err");
        safeRefresh();
        return;
    }
    openModal(<PasswordResetExecutionForm request={requestDetails}/>, {cls: ""});
}

/**
 * Form to generate or manually enter a new temporary password.
 */
function PasswordResetExecutionForm({request}) {
    const [generationMode, setGenerationMode] = useState("generate");
    const [manualPassword, setManualPassword] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleCompleteReset = async () => {
        if (
            generationMode === "manual" &&
            (manualPassword.length < 8 ||
                !/[A-Z]/.test(manualPassword) ||
                !/[a-z]/.test(manualPassword) ||
                !/[0-9]/.test(manualPassword))
        ) {
            showToast("Password needs 8+ characters with a capital letter, a small letter and a number.", "err");
            return;
        }

        setIsSubmitting(true);
        try {
            const result = await API.pwResetComplete(request.id, generationMode, manualPassword);
            closeModal(true);
            await safeRefresh();
            openModal(<PasswordResetCompletedModal result={result}
                                                   displayedPassword={result.tempPassword || manualPassword}/>);
        } catch (err) {
            setIsSubmitting(false);
            showErrorToast(err);
        }
    };

    const handleRejectRequest = () => {
        closeModal(true);
        confirmBox(
            "Reject this request?",
            <p>
                The reset request of <b>{request.name}</b> will be closed without changing the password. Reminders stop.
            </p>,
            "Reject",
            async () => {
                await API.pwResetReject(request.id, "Rejected by Admin");
                closeModal();
                showToast("Request rejected");
                safeRefresh();
            }
        );
    };

    return (
        <ModalFrame
            title="Reset password"
            subtitle={`HIGH PRIORITY request ${request.code}`}
            footer={
                <>
                    <button className="btn btn-ghost" id="pwReject" style={{marginRight: "auto"}}
                            onClick={handleRejectRequest}>
                        Reject request
                    </button>
                    <button className="btn btn-ghost" id="mCancel" onClick={() => requestCloseModal()}>
                        Cancel
                    </button>
                    <button className="btn btn-primary" id="pwGo" disabled={isSubmitting} onClick={handleCompleteReset}>
                        {isSubmitting ? "Resetting..." : "Reset Password"}
                    </button>
                </>
            }
        >
            <div className="pw-req">
                <div>
                    <span>User</span>
                    <b>{request.name}</b>
                </div>
                <div>
                    <span>Email</span>
                    <b>{request.email}</b>
                </div>
                <div>
                    <span>Requested</span>
                    <b>{formatPasswordResetTime(request.requestedAt)}</b>
                </div>
                <div>
                    <span>Status</span>
                    <b className="pw-pending">Pending</b>
                </div>
            </div>

            <div className="seg" style={{margin: "14px 0 10px"}}>
                <button
                    data-pwmode="generate"
                    className={generationMode === "generate" ? "on" : ""}
                    onClick={() => setGenerationMode("generate")}
                >
                    Generate temporary password
                </button>
                <button
                    data-pwmode="manual"
                    className={generationMode === "manual" ? "on" : ""}
                    onClick={() => setGenerationMode("manual")}
                >
                    Set password manually
                </button>
            </div>

            {generationMode === "manual" && (
                <div id="pwManual">
                    <label className="f">
                        <span>New password</span>
                        <input
                            className="i"
                            id="pwNew"
                            type="text"
                            autoComplete="new-password"
                            maxLength={72}
                            autoFocus
                            placeholder="At least 10 characters, a capital, a small letter and a number"
                            value={manualPassword}
                            onChange={(e) => setManualPassword(e.target.value)}
                        />
                    </label>
                </div>
            )}

            <div className="hint">
                The user must change this password at their next sign in. Passwords are stored encrypted and are never
                written to logs.
            </div>
        </ModalFrame>
    );
}

/**
 * Modal showing completed temporary credentials and copy button.
 */
function PasswordResetCompletedModal({result, displayedPassword}) {
    const shareDetailsText = `Sign in to ${CONFIG.APP_NAME}\nLink: ${location.href.split("?")[0]}\nEmail: ${result.email}\nTemporary password: ${displayedPassword}`;

    return (
        <ModalFrame
            title="Password reset done"
            subtitle="Request completed, reminders stopped"
            footer={
                <>
                    <CopyButton id="pwCopy" text={shareDetailsText}/>
                    <button className="btn btn-primary" id="mCancel" onClick={() => requestCloseModal()}>
                        Done
                    </button>
                </>
            }
        >
            <div className="pw-req">
                <div>
                    <span>User</span>
                    <b>{result.name}</b>
                </div>
                <div>
                    <span>Email</span>
                    <b>{result.email}</b>
                </div>
                <div>
                    <span>Temporary password</span>
                    <b className="mono">{displayedPassword}</b>
                </div>
            </div>
            <div className="hint">
                Share this privately with {result.name}. It is shown only now. They will be asked to set their own
                password when they sign in.
            </div>
        </ModalFrame>
    );
}

/**
 * Password Reset Requests history and pending queue page.
 */
export function PwResets() {
    const [resetsData, fetchError] = useServerData(() => API.pwResets(), []);

    if (!isAdminUser()) {
        return <AccessDeniedBox message="Only an Admin or the Super Admin can see password reset requests."/>;
    }
    if (fetchError) {
        return <AccessDeniedBox message={fetchError}/>;
    }
    if (!resetsData) {
        return <AdminLoadingSkeleton/>;
    }

    const ResetRequestRow = ({request, isPending}) => (
        <tr>
            <td>
                <div className="strong">{request.name}</div>
                <div className="muted" style={{fontSize: 11.6}}>{request.email}</div>
            </td>
            <td className="nowrap">
                {formatPasswordResetTime(request.requestedAt)}
                {request.times > 1 && <div className="muted" style={{fontSize: 11}}>asked {request.times} times</div>}
            </td>
            <td>
                {isPending ? (
                    <span className="badge b-red">High priority &middot; Pending</span>
                ) : request.status === "Completed" ? (
                    <span className="badge b-green">Reset successfully</span>
                ) : (
                    <span className="badge b-grey">{request.status}</span>
                )}
            </td>
            <td className="nowrap">
                {isPending ? (
                    <>
                        {request.reminders ? `${formatPlural(request.reminders, "reminder")} sent` : "Admins notified"}
                        {request.openedBy &&
                            <div className="muted" style={{fontSize: 11}}>opened by {request.openedBy}</div>}
                    </>
                ) : (
                    <>
                        {request.completedBy || ""}
                        <div className="muted"
                             style={{fontSize: 11}}>{formatPasswordResetTime(request.completedAt)}</div>
                    </>
                )}
            </td>
            <td>
                <div className="row-actions">
                    {isPending && (
                        <button className="btn btn-danger btn-sm" data-pwreset={request.id}
                                onClick={() => openPwReset(request.id)}>
                            <Icon name="key"/> Reset Password
                        </button>
                    )}
                </div>
            </td>
        </tr>
    );

    return (
        <>
            <div className="notice" style={{marginBottom: 14}}>
                <Icon name="alert"/>
                <div>
                    Pending requests stay at the top of every page and are raised again
                    every <b>{resetsData.reminderMinutes} minutes</b> until an Admin resets the password or rejects the
                    request.
                </div>
            </div>

            <div className="card">
                <div className="card-head">
                    <h3>Pending</h3>
                </div>
                <div className="table-wrap">
                    <table>
                        <thead>
                        <tr>
                            <th>User</th>
                            <th>Requested</th>
                            <th>Status</th>
                            <th>Admin</th>
                            <th className="right">Action</th>
                        </tr>
                        </thead>
                        <tbody>
                        {resetsData.pending.length > 0 ? (
                            resetsData.pending.map((req) => <ResetRequestRow key={req.id} request={req} isPending/>)
                        ) : (
                            <tr>
                                <td colSpan="5">
                                    <EmptyStateBox icon="check" title="No pending requests"
                                                   subtitle="Everything is handled"/>
                                </td>
                            </tr>
                        )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="card" style={{marginTop: 16}}>
                <div className="card-head">
                    <h3>History</h3>
                </div>
                <div className="table-wrap">
                    <table>
                        <thead>
                        <tr>
                            <th>User</th>
                            <th>Requested</th>
                            <th>Result</th>
                            <th>Handled by</th>
                            <th></th>
                        </tr>
                        </thead>
                        <tbody>
                        {resetsData.history.length > 0 ? (
                            resetsData.history.map((req) => <ResetRequestRow key={req.id} request={req}
                                                                             isPending={false}/>)
                        ) : (
                            <tr>
                                <td colSpan="5">
                                    <EmptyStateBox icon="clock" title="No history yet" subtitle=""/>
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

// Backward compatibility exports
export {
    Permissions as PermissionsPage,
    Audit as AuditLogPage,
    Recycle as RecycleBinPage,
    PwResets as PasswordResetsPage,
    PwBanner as PasswordResetBanner
};

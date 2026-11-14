/**
 * Authentication & Session Management
 *
 * Handles:
 * 1. Application bootstrapping (`boot`) and session restoration
 * 2. Entering the CRM workspace (`enterWorkspace`) & background polling activation
 * 3. User sign out (`signOut`, `promptSignOutConfirmation`)
 * 4. User login screen (`Login`)
 * 5. Forgot password request form (`Forgot`)
 * 6. Token-based password reset screen (`Reset`)
 * 7. Mandatory first-time password change screen (`ForceChange`)
 */

import { useEffect, useRef, useState } from "react";
import { appStore, setStoreState, showToast, showErrorToast } from "../store/appStore.js";
import { API, CONFIG, sessionSet, sessionClear } from "../services/api.js";
import { Icon } from "../components/Icon.jsx";
import { validatePasswordStrength } from "../utils/helpers.js";
import { startPoll, stopPoll, applyLoad } from "../services/sync.js";
import { PUSH } from "../services/push.js";
import { confirmBox, closeModal } from "../components/Modal.jsx";
import { getFirstAllowedView, navigateToView, navigate } from "../routes/navigation.js";

// ============================================================================
// STARTUP & SESSION LIFECYCLE
// ============================================================================

/**
 * Boots the application on first page load:
 * - Checks for password reset tokens in URL query params.
 * - Restores existing session if available.
 * - Determines whether to show the login screen, force-change screen, or CRM shell.
 */
export async function boot() {
  document.title = CONFIG.APP_NAME;

  // Check if user followed a password reset link (?reset=TOKEN)
  const resetTokenFromUrl = new URLSearchParams(location.search).get("reset");
  if (resetTokenFromUrl) {
    // Strip the one-time token from address bar and history to prevent credential leaks
    history.replaceState(null, "", location.pathname);
    return setStoreState({
      screen: "reset",
      resetToken: resetTokenFromUrl
    });
  }

  try {
    const sessionResponse = await API.call("session", {}, { quietAuth: true });
    if (!sessionResponse.authed) {
      return setStoreState({ screen: "login" });
    }

    sessionSet();
    appStore.currentUser = sessionResponse.user;

    // Check if user must immediately change a temporary password
    if (Number(sessionResponse.mustChange) === 1) {
      return setStoreState({ screen: "force" });
    }

    await enterApp();
  } catch (err) {
    if (!err.silent) {
      setStoreState({
        screen: "login",
        authMsg: err.message,
        authGood: false
      });
    }
  }
}

/**
 * Loads the latest database snapshot, syncs state, and opens the main application workspace.
 */
async function enterApp() {
  const loadResponse = await API.load();
  applyLoad(loadResponse.data);

  if (Number(appStore.database.me && appStore.database.me.mustChange) === 1) {
    return setStoreState({ screen: "force" });
  }

  // Never restore another person's draft modal if switching users
  if (
    appStore.activeModal &&
    appStore.activeModal.owner !== undefined &&
    appStore.activeModal.owner !== (appStore.currentUser && appStore.currentUser.id)
  ) {
    appStore.activeModal = null;
  }

  const targetView = getFirstAllowedView();

  setStoreState({
    currentView: targetView,
    currentScreen: "app",
    screen: "app",
    authMsg: "",
    head: null
  });

  navigateToView(targetView, null, { replace: true });

  startPoll();
}

/**
 * Signs out the current user, terminates push subscriptions, and clears state.
 */
export async function signOut() {
  stopPoll();
  try {
    await API.logout(PUSH.endpoint);
  } catch (err) {
    // Already signed out or connection dropped; proceed with local sign out
  }

  PUSH.active = false;
  PUSH.endpoint = "";
  sessionClear();

  setStoreState({
    currentUser: null,
    focusedItem: null,
    reports: null,
    currentView: "dashboard",
    screen: "login",
    authMsg: "",
    activeModal: null,
    modalStack: []
  });

  navigate("/login", { replace: true });
}

/**
 * Prompts confirmation dialog before signing out.
 */
export function askSignOut() {
  confirmBox(
    "Sign out?",
    <p>You will be signed out of {CONFIG.APP_NAME} on this device.</p>,
    "Sign out",
    async () => {
      closeModal(true);
      await signOut();
    },
    { kind: "primary" }
  );
}

// ============================================================================
// AUTHENTICATION UI WRAPPERS & PRIMITIVES
// ============================================================================

/**
 * Centered auth card container with brand logo.
 */
function AuthShell({ children }) {
  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-logo-plate">
          <img className="login-logo" src={CONFIG.LOGO} alt={CONFIG.ORG} />
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * Inline alert box for error or success notifications in auth screens.
 */
function AlertBox({ msg, good }) {
  if (!msg) return null;
  return (
    <div className={`alert-box${good ? " good" : ""}`}>
      <Icon name={good ? "check" : "alert"} />
      <span>{msg}</span>
    </div>
  );
}

/**
 * Full-width action button with loading spinner state.
 */
function FullWidthButton({ id, iconName, label, isBusy, busyLabel, onClick }) {
  return (
    <button className="btn btn-primary btn-block" id={id} disabled={isBusy} onClick={onClick}>
      <Icon name={isBusy ? "refresh" : iconName} /> {isBusy ? busyLabel : label}
    </button>
  );
}

// ============================================================================
// SIGN IN / LOGIN SCREEN
// ============================================================================

export function Login() {
  const [email, setEmail] = useState(appStore.lastEmail || "");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const passwordInputRef = useRef(null);
  const emailInputRef = useRef(null);

  useEffect(() => {
    if (emailInputRef.current) {
      emailInputRef.current.focus();
    }
  }, []);

  const handleLoginSubmit = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      return showToast("Please enter both email and password.", "err");
    }

    setIsSubmitting(true);
    try {
      const response = await API.login(trimmedEmail, password);
      sessionSet();

      Object.assign(appStore, {
        currentUser: response.user,
        currentView: getFirstAllowedView(),
        focusedItem: null,
        reports: null,
        lastEmail: ""
      });
      appStore.taskFilters.activeTab = "all";

      if (Number(response.mustChange) === 1) {
        return setStoreState({ screen: "force" });
      }

      await enterApp();
    } catch (err) {
      setIsSubmitting(false);
      if (err.silent) return;

      appStore.lastEmail = trimmedEmail;
      setStoreState({
        authMsg: err.message,
        authGood: false
      });
    }
  };

  return (
    <AuthShell>
      <div className="login-title">{CONFIG.APP_NAME}</div>
      <div className="login-sub">Task Management Suite</div>
      <AlertBox msg={appStore.authMsg} good={appStore.authGood} />

      <label className="f" style={{ marginTop: 22 }}>
        <span>Email address</span>
        <input
          className="i"
          id="liEmail"
          ref={emailInputRef}
          type="email"
          placeholder="you@the10xagency.in"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && passwordInputRef.current) {
              passwordInputRef.current.focus();
            }
          }}
        />
      </label>

      <label className="f" style={{ marginTop: 14 }}>
        <span>Password</span>
        <input
          className="i"
          id="liPass"
          ref={passwordInputRef}
          type="password"
          placeholder="Your password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleLoginSubmit();
          }}
        />
      </label>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 9 }}>
        <button
          type="button"
          className="link"
          id="toForgot"
          style={{ fontSize: 12.4 }}
          onClick={() => setStoreState({ screen: "forgot", authMsg: "", authGood: false })}
        >
          Forgot password?
        </button>
      </div>

      <FullWidthButton
        id="liBtn"
        iconName="lock"
        label="Sign in"
        isBusy={isSubmitting}
        busyLabel="Signing in..."
        onClick={handleLoginSubmit}
      />
    </AuthShell>
  );
}

// ============================================================================
// FORGOT PASSWORD REQUEST SCREEN
// ============================================================================

export function Forgot() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleForgotSubmit = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      return showToast("Please enter your email.", "err");
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      return showToast("Please enter a valid email address.", "err");
    }

    setIsSubmitting(true);
    try {
      const response = await API.forgot(trimmedEmail);
      setStoreState({
        authMsg: response.message || "Your password reset request has been received.",
        authGood: response.sent !== false
      });
      setEmail("");
    } catch (err) {
      showErrorToast(err);
    }
    setIsSubmitting(false);
  };

  return (
    <AuthShell>
      <div className="login-title">Reset your password</div>
      <div className="login-sub">Forgot password</div>
      <AlertBox msg={appStore.authMsg} good={appStore.authGood} />

      <div style={{ fontSize: 12.6, color: "var(--text2)", lineHeight: 1.6, marginTop: 20 }}>
        Enter your registered email. Admins get a reset link at that email. For everyone else, the request goes to the Admin, who will set a temporary password for you.
      </div>

      <label className="f" style={{ marginTop: 16 }}>
        <span>Email address</span>
        <input
          className="i"
          id="fEmail"
          type="email"
          placeholder="you@the10xagency.in"
          autoComplete="email"
          value={email}
          autoFocus
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleForgotSubmit();
          }}
        />
      </label>

      <FullWidthButton
        id="fBtn"
        iconName="mail"
        label="Send request to Admin"
        isBusy={isSubmitting}
        busyLabel="Sending..."
        onClick={handleForgotSubmit}
      />

      <div className="login-hint">
        <button
          type="button"
          className="link"
          id="toLogin"
          onClick={() => setStoreState({ screen: "login", authMsg: "", authGood: false })}
        >
          Back to sign in
        </button>
      </div>
    </AuthShell>
  );
}

// ============================================================================
// RESET PASSWORD (VIA DIRECT EMAIL LINK)
// ============================================================================

export function Reset() {
  const [recipientUser, setRecipientUser] = useState(null);
  const [invalidTokenError, setInvalidTokenError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    API.checkReset(appStore.resetToken).then(
      (user) => setRecipientUser(user),
      (err) => setInvalidTokenError(err.message)
    );
  }, []);

  const navigateToScreen = (targetScreen) => {
    setStoreState({
      resetToken: null,
      screen: targetScreen,
      authMsg: "",
      authGood: false
    });
  };

  if (invalidTokenError) {
    return (
      <AuthShell>
        <div className="login-title">This link does not work</div>
        <AlertBox msg={invalidTokenError} />
        <FullWidthButton id="againBtn" iconName="mail" label="Request a new link" onClick={() => navigateToScreen("forgot")} />
        <div className="login-hint">
          <button type="button" className="link" id="toLogin" onClick={() => navigateToScreen("login")}>
            Back to sign in
          </button>
        </div>
      </AuthShell>
    );
  }

  if (!recipientUser) {
    return (
      <AuthShell>
        <div className="login-title">Set a new password</div>
        <div className="login-sub">Almost done</div>
        <div style={{ display: "flex", justifyContent: "center", padding: "24px 0" }}>
          <div className="spinner" />
        </div>
      </AuthShell>
    );
  }

  const handleResetSubmit = async () => {
    const passwordError = validatePasswordStrength(newPassword);
    if (passwordError) {
      return setStatusMessage(passwordError);
    }
    if (newPassword !== confirmPassword) {
      return setStatusMessage("The two passwords do not match.");
    }

    setIsSubmitting(true);
    try {
      await API.resetPassword(appStore.resetToken, newPassword);
      setStoreState({
        resetToken: null,
        screen: "login",
        authMsg: "Your password has been set. Please sign in with the new password.",
        authGood: true
      });
    } catch (err) {
      setIsSubmitting(false);
      setStatusMessage(err.message);
    }
  };

  return (
    <AuthShell>
      <div className="login-title">Set a new password</div>
      <div className="login-sub">{recipientUser.email || ""}</div>
      <AlertBox msg={statusMessage} />

      <div style={{ fontSize: 12.5, color: "var(--text2)", marginTop: 18, lineHeight: 1.6 }}>
        Hi <b>{recipientUser.name}</b>, please choose a new password.
      </div>

      <label className="f" style={{ marginTop: 14 }}>
        <span>New password</span>
        <input
          className="i"
          id="rP1"
          type="password"
          placeholder="Min 10 chars, 1 capital, 1 number"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
      </label>

      <label className="f" style={{ marginTop: 12 }}>
        <span>Confirm password</span>
        <input
          className="i"
          id="rP2"
          type="password"
          placeholder="Type the same password again"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
      </label>

      <FullWidthButton
        id="rBtn"
        iconName="key"
        label="Set password"
        isBusy={isSubmitting}
        busyLabel="Saving..."
        onClick={handleResetSubmit}
      />
    </AuthShell>
  );
}

// ============================================================================
// FORCED PASSWORD CHANGE (FIRST-TIME LOGIN WITH TEMPORARY PASSWORD)
// ============================================================================

export function ForceChange() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    stopPoll();
  }, []);

  const handleForceChangeSubmit = async () => {
    const passwordError = validatePasswordStrength(newPassword);
    if (passwordError) {
      return showToast(passwordError, "err");
    }
    if (newPassword !== confirmPassword) {
      return showToast("The two passwords do not match.", "err");
    }

    setIsSubmitting(true);
    try {
      await API.changePassword(currentPassword, newPassword, confirmPassword);
      showToast("Password saved");
      await enterApp();
    } catch (err) {
      setIsSubmitting(false);
      showErrorToast(err);
    }
  };

  return (
    <AuthShell>
      <div className="login-title">Set your own password</div>
      <div className="login-sub">One required step</div>

      <div style={{ fontSize: 12.7, color: "var(--text2)", lineHeight: 1.65, marginTop: 20 }}>
        Your admin gave you a temporary password. Please replace it with your own password to continue.
      </div>

      <label className="f" style={{ marginTop: 16 }}>
        <span>Current password</span>
        <input
          className="i"
          id="cOld"
          type="password"
          placeholder="The temporary password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />
      </label>

      <label className="f" style={{ marginTop: 12 }}>
        <span>New password</span>
        <input
          className="i"
          id="cNew"
          type="password"
          placeholder="Min 10 chars, 1 capital, 1 number, a symbol helps"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
      </label>

      <label className="f" style={{ marginTop: 12 }}>
        <span>Confirm new password</span>
        <input
          className="i"
          id="cNew2"
          type="password"
          placeholder="Type the same password again"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
      </label>

      <FullWidthButton
        id="cBtn"
        iconName="key"
        label="Save and continue"
        isBusy={isSubmitting}
        busyLabel="Saving..."
        onClick={handleForceChangeSubmit}
      />

      <div className="login-hint">
        <button type="button" className="link" id="cOut" onClick={askSignOut}>
          Sign out
        </button>
      </div>
    </AuthShell>
  );
}

// Backward compatibility exports
export {
  Login as LoginPage,
  Forgot as ForgotPasswordPage,
  Reset as ResetPasswordPage,
  ForceChange as ForceChangePasswordPage,
  enterApp as enterWorkspace,
  askSignOut as promptSignOutConfirmation
};

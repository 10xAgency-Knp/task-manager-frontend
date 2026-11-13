/**
 * Modal Dialog & Confirmation Host System
 *
 * Implements accessible, stacked modal overlays with:
 * - Unsaved changes guard: Prompting before closing modified forms
 * - Stacked confirmation: Ability to layer confirm dialogs over active modals
 * - Error isolation: Showing errors within dialogs without closing them prematurely
 * - Motion-safe transitions respecting user accessibility preferences
 */
import { useState, useEffect, useRef } from "react";
import { appStore, emitStoreChange, showErrorToast } from "../store/appStore.js";

let nextModalKey = 0;

/**
 * Opens a modal dialog.
 * @param {React.ReactNode} element - Modal content component
 * @param {{ form?: boolean, cls?: string }} [options] - Modal configuration options
 */
export function openModal(element, options = {}) {
  appStore.activeModal = {
    key: ++nextModalKey,
    el: element,
    form: Boolean(options.form),
    cls: options.cls || "",
    dirty: null,
    closing: false
  };
  emitStoreChange();
}

/**
 * Closes the active modal dialog with smooth exit animation.
 * @param {boolean} [immediate=false] - If true, skips exit transition
 */
export function closeModal(immediate = false) {
  const currentModal = appStore.activeModal;
  if (!currentModal) return;

  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (immediate || prefersReducedMotion) {
    appStore.activeModal = null;
    emitStoreChange();
    return;
  }

  currentModal.closing = true;
  emitStoreChange();

  setTimeout(() => {
    if (appStore.activeModal === currentModal) {
      appStore.activeModal = null;
      emitStoreChange();
    }
  }, 170);
}

/**
 * Handles close requests triggered by user actions (Cancel button, Escape, backdrop).
 * If the active modal contains unsaved changes, displays a confirmation dialog.
 * @param {() => void} [afterCloseCallback]
 */
export function requestCloseModal(afterCloseCallback) {
  const currentModal = appStore.activeModal;
  if (!currentModal) {
    if (afterCloseCallback) afterCloseCallback();
    return;
  }

  // Check if form is dirty
  if (currentModal.form && currentModal.dirty && currentModal.dirty()) {
    stackedConfirm(
      "Discard changes?",
      <p>You have unsaved changes in this form. Close it and lose them?</p>,
      "Discard changes",
      async () => {
        closeModal();
        if (afterCloseCallback) afterCloseCallback();
      },
      { cancelLabel: "Keep editing" }
    );
    return;
  }

  closeModal();
  if (afterCloseCallback) afterCloseCallback();
}

/* ==========================================================================
   STACKED CONFIRMATION DIALOGS
   ========================================================================== */

let nextStackKey = 0;

/**
 * Opens a secondary confirmation dialog stacked on top of an existing modal.
 * @param {string} title
 * @param {React.ReactNode} body
 * @param {string} okLabel
 * @param {() => Promise<void>} actionFn
 * @param {Object} [options]
 */
export function stackedConfirm(title, body, okLabel, actionFn, options = {}) {
  appStore.confirmModalStack = appStore.confirmModalStack.concat({
    key: ++nextStackKey,
    title,
    body,
    okLabel,
    fn: actionFn,
    opts: options
  });
  emitStoreChange();
}

/**
 * Closes an individual item from the confirmation stack.
 * @param {Object} stackItem
 * @param {boolean} isCancelled
 */
export function closeStack(stackItem, isCancelled) {
  appStore.confirmModalStack = appStore.confirmModalStack.filter(item => item !== stackItem);
  emitStoreChange();

  if (isCancelled && stackItem.opts?.onCancel) {
    stackItem.opts.onCancel();
  }
}

/**
 * Displays a standard confirmation modal dialog.
 * @param {string} title
 * @param {React.ReactNode} body
 * @param {string} okLabel
 * @param {() => Promise<void>} actionFn
 * @param {{ kind?: "primary"|"danger", stack?: boolean }} [options]
 */
export function confirmBox(title, body, okLabel, actionFn, options = {}) {
  if (options.stack) {
    return stackedConfirm(title, body, okLabel, actionFn, options);
  }
  openModal(
    <ConfirmBody
      title={title}
      body={body}
      okLabel={okLabel}
      actionFn={actionFn}
      kind={options.kind}
    />
  );
}

function ConfirmBody({ title, body, okLabel, actionFn, kind }) {
  const [isBusy, setIsBusy] = useState(false);

  const handleConfirm = async () => {
    setIsBusy(true);
    try {
      await actionFn();
      closeModal();
    } catch (error) {
      setIsBusy(false);
      if (error && error.message !== "Cancelled") {
        showErrorToast(error);
      }
    }
  };

  return (
    <ModalFrame
      title={title}
      foot={
        <>
          <button className="btn btn-ghost" onClick={() => requestCloseModal()}>
            Cancel
          </button>
          <button
            className={"btn " + (kind === "primary" ? "btn-primary" : "btn-danger")}
            disabled={isBusy}
            onClick={handleConfirm}
            id="mOk"
          >
            {isBusy ? "Working..." : (okLabel || "Confirm")}
          </button>
        </>
      }
    >
      <div style={{ fontSize: 13.4, lineHeight: 1.6, color: "var(--text2)" }}>
        {body}
      </div>
    </ModalFrame>
  );
}

/**
 * Standard Modal Frame Structure with header, close button, body, and action footer.
 */
export function ModalFrame({ title, sub, subtitle, wide, foot, footer, children }) {
  const actualSub = sub || subtitle;
  const actualFoot = foot || footer;

  return (
    <div className={"modal " + (wide ? "wide" : "")} role="dialog" aria-modal="true">
      <div className="modal-head">
        <div>
          <h3>{title}</h3>
          {actualSub ? <div className="sub">{actualSub}</div> : null}
        </div>
        <button
          className="x"
          id="mX"
          title="Close"
          onClick={() => requestCloseModal()}
        >
          &#10005;
        </button>
      </div>
      <div className="modal-body">{children}</div>
      {actualFoot ? <div className="modal-foot">{actualFoot}</div> : null}
    </div>
  );
}

/**
 * Global Host Component rendering active modal overlays and stacked confirmation dialogs.
 */
export function ModalHost() {
  const currentModal = appStore.activeModal;

  // Auto-focus first input when modal opens
  useEffect(() => {
    if (!currentModal || currentModal.closing) return;
    const timer = setTimeout(() => {
      const firstInput = document.querySelector(
        "#overlay input.i:not([type=date]):not([disabled]), #overlay textarea.i:not([disabled])"
      );
      if (firstInput && !document.querySelector(".overlay.stack2")) {
        firstInput.focus();
      }
    }, 30);
    return () => clearTimeout(timer);
  }, [currentModal?.key]);

  return (
    <>
      {currentModal ? (
        <div
          className={
            "overlay" +
            (currentModal.closing ? " closing" : "") +
            (currentModal.cls ? " " + currentModal.cls : "")
          }
          id={currentModal.closing ? undefined : "overlay"}
          key={currentModal.key}
          style={appStore.currentScreen === "app" ? undefined : { display: "none" }}
        >
          {currentModal.el}
        </div>
      ) : null}

      {appStore.confirmModalStack.map(stackItem => (
        <StackItem key={stackItem.key} item={stackItem} />
      ))}
    </>
  );
}

function StackItem({ item }) {
  const [isBusy, setIsBusy] = useState(false);
  const confirmButtonRef = useRef(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (confirmButtonRef.current) {
        confirmButtonRef.current.focus();
      }
    }, 30);
    return () => clearTimeout(timer);
  }, []);

  const handleConfirm = async () => {
    setIsBusy(true);
    try {
      await item.fn();
      closeStack(item, false);
    } catch (error) {
      setIsBusy(false);
      if (error && error.message !== "Cancelled") {
        showErrorToast(error);
      }
    }
  };

  return (
    <div className="overlay stack2" data-stack={item.key}>
      <div className="modal" role="alertdialog" aria-modal="true">
        <div className="modal-head">
          <div>
            <h3>{item.title}</h3>
          </div>
        </div>
        <div className="modal-body" style={{ fontSize: 13.4, lineHeight: 1.6, color: "var(--text2)" }}>
          {item.body}
        </div>
        <div className="modal-foot">
          <button
            className="btn btn-ghost"
            onClick={() => closeStack(item, true)}
          >
            {item.opts?.cancelLabel || "Cancel"}
          </button>
          <button
            className={"btn " + (item.opts?.kind === "primary" ? "btn-primary" : "btn-danger")}
            disabled={isBusy}
            ref={confirmButtonRef}
            onClick={handleConfirm}
          >
            {isBusy ? "Working..." : (item.okLabel || "Confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}

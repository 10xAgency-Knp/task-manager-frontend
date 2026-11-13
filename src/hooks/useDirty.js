/**
 * Unsaved Changes Dirty Form Guard Hook
 *
 * Registers a dirty-check callback with the currently active modal dialog.
 * When the user attempts to close the modal (via Escape, close button, or backdrop),
 * the modal host invokes this callback and warns the user if unsaved modifications exist.
 */
import { useEffect, useRef } from "react";
import { appStore } from "../store/appStore.js";

/**
 * Registers a dirty checker function for the currently active modal dialog.
 * @param {() => boolean} isDirtyChecker - Function returning true if form has unsaved modifications
 */
export function useDirtyFormGuard(isDirtyChecker) {
  const isDirtyCheckerRef = useRef(isDirtyChecker);
  isDirtyCheckerRef.current = isDirtyChecker;

  useEffect(() => {
    if (appStore.activeModal) {
      appStore.activeModal.dirty = () => isDirtyCheckerRef.current();
    }
  }, []);
}

// Backward-compatible export
export const useDirty = useDirtyFormGuard;

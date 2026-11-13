/**
 * Page Header Title Hook
 *
 * Dynamically updates the top bar header title and subtitle when navigating
 * within detail views (such as TaskDetail, ProjectDetail, or MemberProfile).
 */
import { useEffect } from "react";
import { appStore, emitStoreChange } from "../store/appStore.js";

/**
 * Sets the active page title and subtitle displayed in the CRM Shell top bar.
 * @param {string} title
 * @param {string} [subtitle]
 */
export function usePageHeader(title, subtitle) {
  useEffect(() => {
    if (title) {
      appStore.pageHeader = { title, subtitle };
      emitStoreChange();
    }
  }, [title, subtitle]);
}

// Backward-compatible export
export const useHead = usePageHeader;

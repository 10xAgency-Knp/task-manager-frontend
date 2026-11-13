/**
 * Asynchronous Server Data Fetching Hook
 *
 * Loads data from the API service layer with automated loading, error handling,
 * and reload capabilities. Automatically triggers a refetch whenever dependencies
 * change or after data mutations (via `appStore.refreshTick`).
 */
import { useEffect, useState } from "react";
import { appStore } from "../store/appStore.js";

/**
 * Custom hook to load server data with error handling and reload capability.
 * @param {() => Promise<any>} fetcherFunction - Async function retrieving server data
 * @param {Array<any>} [dependencies=[]] - React dependency array
 * @returns {[any, string, () => void, boolean]} [data, errorMessage, reload, isLoading]
 */
export function useServerData(fetcherFunction, dependencies = []) {
  const [state, setState] = useState({
    data: null,
    errorMessage: "",
    isLoading: true
  });
  const [reloadTrigger, setReloadTrigger] = useState(0);

  useEffect(() => {
    let isMounted = true;
    setState(previousState => ({ ...previousState, isLoading: true }));

    fetcherFunction().then(
      responsePayload => {
        if (isMounted) {
          setState({
            data: responsePayload,
            errorMessage: "",
            isLoading: false
          });
        }
      },
      error => {
        if (isMounted) {
          setState({
            data: null,
            errorMessage: error?.silent ? "" : (error?.message || "An unexpected error occurred"),
            isLoading: false
          });
        }
      }
    );

    return () => {
      isMounted = false;
    };
  }, dependencies.concat(reloadTrigger, appStore.refreshTick));

  const triggerReload = () => setReloadTrigger(count => count + 1);

  return [state.data, state.errorMessage, triggerReload, state.isLoading];
}

// Backward-compatible export
export const useServer = useServerData;

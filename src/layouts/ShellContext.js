/**
 * Shell Layout Context
 *
 * Allows child route components (such as error pages) to determine whether
 * they are currently rendered inside the authenticated CRM workspace Shell
 * or in standalone window mode, completely preventing layout shifts/flicker.
 */
import { createContext, useContext } from "react";

export const ShellContext = createContext(false);

export function useInShell() {
  return useContext(ShellContext);
}

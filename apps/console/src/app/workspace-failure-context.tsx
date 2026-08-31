import { useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";

import { isConsoleAuthenticationRequired } from "../errors";

const WorkspaceAuthenticationContext = createContext(false);

export function WorkspaceFailureProvider({ children }: { readonly children: ReactNode }) {
  const queryClient = useQueryClient();
  const cache = queryClient.getQueryCache();
  const authenticationRequired = useSyncExternalStore(
    (listener) => cache.subscribe(listener),
    () => cache.getAll().some((query) => isConsoleAuthenticationRequired(query.state.error)),
    () => false,
  );

  return (
    <WorkspaceAuthenticationContext.Provider value={authenticationRequired}>
      {children}
    </WorkspaceAuthenticationContext.Provider>
  );
}

export const useWorkspaceAuthenticationRequired = () => useContext(WorkspaceAuthenticationContext);

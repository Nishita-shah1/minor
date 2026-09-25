"use client";

import { createContext, useContext } from "react";

// Hidden workspaces retain drafts and ongoing work, but must not open portals.
export const WorkspaceActiveContext = createContext(true);
export const useWorkspaceActive = () => useContext(WorkspaceActiveContext);

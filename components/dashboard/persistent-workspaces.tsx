"use client";

import { useAuth } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { WorkspaceActiveContext } from "./workspace-activity";

export const workspaceNames = ["dashboard", "upload", "scan", "history", "profile"] as const;
type WorkspaceName = (typeof workspaceNames)[number];

export function workspaceForPath(pathname: string): WorkspaceName | null {
  if (pathname === "/dashboard") return "dashboard";
  const segment = pathname.split("/")[2];
  return pathname.startsWith("/dashboard/") && workspaceNames.some(name => name === segment)
    ? segment as WorkspaceName : null;
}

export function PersistentWorkspaces({ userId, sessionId, views, children }: {
  userId: string;
  sessionId: string;
  views: Record<WorkspaceName, ReactNode>;
  children: ReactNode;
}) {
  const session = useAuth();
  // Drop the entire retained subtree before another account can see its drafts.
  if (!session.isLoaded || session.userId !== userId || session.sessionId !== sessionId) return null;
  return <WorkspaceTabs key={`${userId}:${sessionId}`} views={views}>{children}</WorkspaceTabs>;
}

function WorkspaceTabs({ views, children }: {
  views: Record<WorkspaceName, ReactNode>;
  children: ReactNode;
}) {
  const active = workspaceForPath(usePathname());
  const [visited, setVisited] = useState<WorkspaceName[]>(active ? [active] : []);
  const positions = useRef<Partial<Record<WorkspaceName, number>>>({});
  // Bounded to the five known workspaces; no arbitrary URL or document cache.
  if (active && !visited.includes(active)) setVisited([...visited, active]);

  useLayoutEffect(() => {
    if (!active) return;
    window.scrollTo({ top: positions.current[active] ?? 0, behavior: "instant" });
    const remember = () => { positions.current[active] = window.scrollY; };
    window.addEventListener("scroll", remember, { passive: true });
    return () => { window.removeEventListener("scroll", remember); };
  }, [active]);

  return <>
    {visited.map(name => <div key={name} hidden={active !== name} inert={active !== name} data-workspace={name}>
      <WorkspaceActiveContext value={active === name}>{views[name]}</WorkspaceActiveContext>
    </div>)}
    {children}
  </>;
}

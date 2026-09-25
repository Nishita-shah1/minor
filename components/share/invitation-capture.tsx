"use client";

import { useEffect } from "react";

export const inviteStorageKey = (shareId: string) => `echoleaks:invite:${shareId}`;

export function InvitationCapture({ shareId }: { shareId: string }) {
  useEffect(() => {
    const match = /^#invite=([A-Za-z0-9_-]{43})$/.exec(window.location.hash);
    if (!match) return;
    sessionStorage.setItem(inviteStorageKey(shareId), match[1]);
    history.replaceState(history.state, "", `${window.location.pathname}${window.location.search}`);
  }, [shareId]);
  return null;
}

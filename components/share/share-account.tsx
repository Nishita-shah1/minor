"use client";

import { UserButton, useUser } from "@clerk/nextjs";

export function ShareAccount() {
  const { user } = useUser();
  if (!user) return null;

  const label = user.fullName || user.primaryEmailAddress?.emailAddress || user.id;

  return (
    <div className="fixed right-4 top-4 z-50 flex max-w-[min(20rem,calc(100vw-2rem))] items-center gap-2 rounded-full border-2 border-black bg-card px-2 py-1 shadow-md sm:px-3">
      <span className="hidden min-w-0 sm:block" title={`${label} · ${user.id}`}>
        <span className="block truncate text-xs font-bold">{label}</span>
        <span className="block truncate text-[10px] text-muted-foreground">{user.id}</span>
      </span>
      <UserButton
        appearance={{ elements: { avatarBox: "size-9 rounded-full border-2 border-black" } }}
      />
    </div>
  );
}

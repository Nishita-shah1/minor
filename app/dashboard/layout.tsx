import type { CSSProperties, ReactNode } from "react";
import { auth } from "@clerk/nextjs/server";
import { AppSidebar } from "@/components/dashboard/app-sidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  await auth.protect({ unauthenticatedUrl: "/sign-in" });
  return (
    <SidebarProvider
      style={{ "--sidebar-width": "18rem" } as CSSProperties}
    >
      <AppSidebar />
      <SidebarInset className="min-w-0 overflow-hidden bg-background">
        <header className="flex h-16 shrink-0 items-center justify-between border-b-2 border-black bg-card px-4 md:hidden">
          <span className="font-head text-lg tracking-tight">EchoLeaks</span>
          <SidebarTrigger />
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}

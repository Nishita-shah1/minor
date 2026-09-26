import type { CSSProperties, ReactNode } from "react";
import { auth } from "@clerk/nextjs/server";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { PersistentWorkspaces } from "@/components/dashboard/persistent-workspaces";
import { ComingSoonPage } from "@/components/dashboard/coming-soon-page";
import { UploadWorkspace } from "@/components/dashboard/upload-workspace";
import { ScanWorkspace } from "@/components/fingerprint/scan-workspace";
import { HistoryWorkspace } from "@/components/dashboard/history-workspace";
import { OpenPgpKeyCard } from "@/components/crypto/openpgp-key-card";
import { UserProfile } from "@clerk/nextjs";
import { AppSidebar } from "@/components/dashboard/app-sidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const { userId, sessionId } = await auth.protect({ unauthenticatedUrl: "/sign-in" });
  return (
    <SidebarProvider
      style={{ "--sidebar-width": "18rem" } as CSSProperties}
    >
      <AppSidebar />
      <SidebarInset className="min-w-0 overflow-hidden bg-background">
        <header className="flex h-16 shrink-0 items-center justify-between gap-3 px-5 sm:px-8 md:justify-end lg:px-14 xl:px-20">
          <div className="flex items-center gap-3 md:hidden">
            <SidebarTrigger />
            <span className="font-head text-lg tracking-tight">EchoLeaks</span>
          </div>
          <ThemeToggle />
        </header>
        <PersistentWorkspaces userId={userId} sessionId={sessionId} views={{
          dashboard: <ComingSoonPage label="Dashboard" title="Dashboard"
            description="Your private workspace for protecting files and tracing where leaked copies came from."
            panelDescription="The EchoLeaks foundation is ready. Upload, scanning, and case activity will arrive in the next phases." />,
          upload: <UploadWorkspace />,
          scan: <ScanWorkspace />,
          history: <HistoryWorkspace />,
          profile: <section className="min-h-[calc(100svh-4rem)] w-full overflow-x-auto px-4 pt-2 pb-4 sm:px-6 sm:pb-6 lg:px-8 lg:pb-8">
            <OpenPgpKeyCard />
            <UserProfile routing="path" path="/dashboard/profile" appearance={{
              variables: { borderRadius: "0.75rem" },
              elements: { rootBox: "w-full max-w-none", cardBox: "w-full max-w-none shadow-none", card: "w-full max-w-none shadow-none" },
            }} />
          </section>,
        }}>{children}</PersistentWorkspaces>
      </SidebarInset>
    </SidebarProvider>
  );
}

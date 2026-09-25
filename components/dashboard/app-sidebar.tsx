"use client";

import { SignOutButton, useUser } from "@clerk/nextjs";
import type { LucideIcon } from "lucide-react";
import {
  History,
  LayoutDashboard,
  LogOut,
  ScanSearch,
  UploadCloud,
  UserRound,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { maskEmail } from "@/lib/mask-email";

export type DashboardRoute = {
  label: string;
  href: string;
  icon: LucideIcon;
  iconClassName: string;
};

export const dashboardRoutes: DashboardRoute[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    iconClassName: "bg-primary",
  },
  {
    label: "Upload",
    href: "/dashboard/upload",
    icon: UploadCloud,
    iconClassName: "bg-[#ffaaa0]",
  },
  {
    label: "Scan",
    href: "/dashboard/scan",
    icon: ScanSearch,
    iconClassName: "bg-[#a8ddcf]",
  },
  {
    label: "History",
    href: "/dashboard/history",
    icon: History,
    iconClassName: "bg-[#a9ddef]",
  },
  {
    label: "Profile",
    href: "/dashboard/profile",
    icon: UserRound,
    iconClassName: "bg-[#d9c5f4]",
  },
];

function isRouteActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function SidebarAccount() {
  const { isLoaded, isSignedIn, user } = useUser();
  const { isMobile, setOpenMobile } = useSidebar();

  const closeMobileSidebar = () => {
    if (isMobile) setOpenMobile(false);
  };

  if (!isLoaded) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3 rounded-xl border-2 border-black bg-card p-3 shadow-sm group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0">
          <Skeleton className="size-8 shrink-0 rounded-full border-2 border-black" />
          <div className="min-w-0 flex-1 space-y-2 group-data-[collapsible=icon]:hidden">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-36" />
          </div>
        </div>
        <Skeleton className="h-12 w-full rounded-full border-2 border-black group-data-[collapsible=icon]:size-9" />
      </div>
    );
  }

  if (!isSignedIn || !user) return null;

  const displayName =
    user?.fullName || user?.firstName || user?.username || "EchoLeaks user";
  const maskedEmail = maskEmail(user?.primaryEmailAddress?.emailAddress);
  const status = maskedEmail ? `Signed in · ${maskedEmail}` : "Signed in securely";

  return (
    <div className="flex flex-col gap-3">
      <Link
        href="/dashboard/profile"
        scroll={false}
        onClick={closeMobileSidebar}
        aria-label={`Open profile for ${displayName}`}
        className="flex min-w-0 items-center gap-3 rounded-2xl border-2 border-black bg-card p-3 shadow-sm transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:bg-accent hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:rounded-full group-data-[collapsible=icon]:p-0"
      >
        <Avatar className="border-black bg-primary text-primary-foreground shadow-xs">
          <AvatarImage src={user.imageUrl} alt={`${displayName} profile photo`} />
          <AvatarFallback className="bg-primary text-primary-foreground ">
            {getInitials(displayName) || "E"}
          </AvatarFallback>
        </Avatar>
        <span className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
          <span className="block truncate font-head text-sm">{displayName}</span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {status}
          </span>
        </span>
      </Link>
      <SignOutButton redirectUrl="/">
        <button
          type="button"
          className="flex h-12 w-full items-center justify-center gap-2 rounded-full border-2 border-black bg-card px-4 font-head text-sm shadow-sm transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:bg-primary hover:text-primary-foreground hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none group-data-[collapsible=icon]:size-9 group-data-[collapsible=icon]:p-0"
        >
          <LogOut aria-hidden="true" className="size-4 shrink-0" />
          <span className="group-data-[collapsible=icon]:sr-only">Sign out</span>
        </button>
      </SignOutButton>
    </div>
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();

  const closeMobileSidebar = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b-2 border-black p-3 group-data-[collapsible=icon]:p-2">
        <div className="flex h-12 items-center justify-between gap-2 group-data-[collapsible=icon]:justify-center">
          <Link
            href="/dashboard"
            scroll={false}
            onClick={closeMobileSidebar}
            className="flex min-w-0 items-center gap-2 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 group-data-[collapsible=icon]:hidden"
            aria-label="EchoLeaks dashboard"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full border-2 border-black bg-primary text-primary-foreground shadow-xs">
              <Image
                src="/io.github.lo2dev.Echo.svg"
                alt=""
                width={22}
                height={22}
                aria-hidden="true"
              />
            </span>
            <span className="truncate font-head text-xl tracking-tight">
              EchoLeaks
            </span>
          </Link>
          <SidebarTrigger className="group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:shadow-[0_4px_0_#000] group-data-[collapsible=icon]:hover:shadow-[0_5px_0_#000]" />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup className="px-3 py-6 group-data-[collapsible=icon]:px-2">
          <SidebarGroupLabel className="mb-3 px-2 text-[0.68rem] tracking-[0.22em]">
            Workspace
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-3">
              {dashboardRoutes.map((route) => {
                const Icon = route.icon;
                const isActive = isRouteActive(pathname, route.href);

                return (
                  <SidebarMenuItem key={route.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={route.label}
                      className="h-14 gap-3 rounded-full px-2.5 font-sans font-bold hover:border-black hover:shadow-sm group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-0!"
                    >
                      <Link
                        href={route.href}
                        scroll={false}
                        onClick={closeMobileSidebar}
                        aria-current={isActive ? "page" : undefined}
                      >
                        <span
                          className={`flex size-9 shrink-0 items-center justify-center rounded-full border-2 border-black text-black group-data-[collapsible=icon]:size-8 ${route.iconClassName}`}
                        >
                          <Icon aria-hidden="true" strokeWidth={2.3} />
                        </span>
                        <span>{route.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="gap-3 border-t-2 border-black p-3 group-data-[collapsible=icon]:p-1.5">
        <SidebarAccount />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

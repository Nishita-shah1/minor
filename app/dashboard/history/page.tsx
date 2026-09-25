import { auth } from "@clerk/nextjs/server";
import { HistoryWorkspace } from "@/components/dashboard/history-workspace";

export default async function HistoryPage() {
  await auth.protect({ unauthenticatedUrl: "/sign-in" });
  return <HistoryWorkspace />;
}

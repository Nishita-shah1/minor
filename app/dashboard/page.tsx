import { auth } from "@clerk/nextjs/server";
import { ComingSoonPage } from "@/components/dashboard/coming-soon-page";

export default async function DashboardPage() {
  await auth.protect({ unauthenticatedUrl: "/sign-in" });
  return (
    <ComingSoonPage
      label="Dashboard"
      title="Dashboard"
      description="Your private workspace for protecting files and tracing where leaked copies came from."
      panelDescription="The EchoLeaks foundation is ready. Upload, scanning, and case activity will arrive in the next phases."
    />
  );
}

import { auth } from "@clerk/nextjs/server";
import { ScanWorkspace } from "@/components/fingerprint/scan-workspace";

export default async function ScanPage() {
  await auth.protect({ unauthenticatedUrl: "/sign-in" });
  return <ScanWorkspace />;
}

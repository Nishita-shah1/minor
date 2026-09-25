import { auth } from "@clerk/nextjs/server";
import { UploadWorkspace } from "@/components/dashboard/upload-workspace";

export default async function UploadPage() {
  await auth.protect({ unauthenticatedUrl: "/sign-in" });
  return <UploadWorkspace />;
}

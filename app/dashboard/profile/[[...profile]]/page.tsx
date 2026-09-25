import { auth } from "@clerk/nextjs/server";

export default async function ProfilePage() {
  await auth.protect({ unauthenticatedUrl: "/sign-in" });
  // The shared dashboard layout owns this workspace so navigation retains it.
  return null;
}

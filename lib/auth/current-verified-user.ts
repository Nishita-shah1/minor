import "server-only";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { normalizeEmail } from "@/lib/auth/email";

export class AuthenticationError extends Error {}

export type VerifiedUser = {
  userId: string;
  verifiedEmails: string[];
  primaryEmail: string | null;
};

export async function requireVerifiedUser(): Promise<VerifiedUser> {
  const session = await auth();
  if (!session.isAuthenticated || !session.userId) {
    throw new AuthenticationError("Authentication required");
  }

  const client = await clerkClient();
  const user = await client.users.getUser(session.userId);
  const verifiedEmails = user.emailAddresses
    .filter((email) => email.verification?.status === "verified")
    .map((email) => normalizeEmail(email.emailAddress));
  const primary = user.emailAddresses.find(
    (email) => email.id === user.primaryEmailAddressId && email.verification?.status === "verified",
  );

  return {
    userId: user.id,
    verifiedEmails,
    primaryEmail: primary ? normalizeEmail(primary.emailAddress) : verifiedEmails[0] ?? null,
  };
}

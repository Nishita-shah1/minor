import "server-only";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { normalizeEmail } from "@/lib/auth/email";

export class AuthenticationError extends Error {}
export class IdentityProviderUnavailableError extends Error {
  constructor() {
    super("Account verification is temporarily unavailable. Please try again.");
  }
}

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

  let user;
  try {
    const client = await clerkClient();
    user = await client.users.getUser(session.userId);
  } catch (error) {
    // Never accept an email from the browser when Clerk cannot verify it.
    console.error("Clerk account lookup failed", error instanceof Error ? error.name : typeof error);
    throw new IdentityProviderUnavailableError();
  }
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

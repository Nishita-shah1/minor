import { auth } from "@clerk/nextjs/server";
import { LockKeyhole } from "lucide-react";
import Link from "next/link";
import { SecureShareClient } from "@/components/share/secure-share-client";

export default async function SharePage({ params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params;
  const session = await auth();
  if (!session.isAuthenticated) {
    return (
      <main className="flex min-h-svh flex-col items-center justify-center gap-5 bg-background px-5">
        <LockKeyhole className="size-12" />
        <h1 className="font-head text-3xl">Protected file</h1>
        <p className="max-w-md text-center text-muted-foreground">
          Sign in with the exact email address authorized by the sender.
        </p>
        <Link
          href={`/sign-in?redirect_url=${encodeURIComponent(`/share/${shareId}`)}`}
          className="rounded-full border-2 border-black bg-primary px-6 py-3 font-head shadow-md"
        >
          Sign in to continue
        </Link>
      </main>
    );
  }
  return <SecureShareClient shareId={shareId} />;
}

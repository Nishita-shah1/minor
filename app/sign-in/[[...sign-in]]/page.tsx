import { SignIn } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Navbar } from "@/components/landing/navbar";

export default async function SignInPage() {
  const { isAuthenticated } = await auth();
  if (isAuthenticated) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-svh bg-background">
      <Navbar />
      <div className="flex min-h-svh items-center justify-center px-4 pt-16 pb-12">
        <SignIn fallbackRedirectUrl="/dashboard" />
      </div>
    </div>
  );
}

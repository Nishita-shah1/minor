import { auth } from "@clerk/nextjs/server";
import { UserProfile } from "@clerk/nextjs";

export default async function ProfilePage() {
  await auth.protect({ unauthenticatedUrl: "/sign-in" });
  return (
    <section className="min-h-[calc(100svh-4rem)] w-full overflow-x-auto p-4 sm:p-6 md:min-h-svh lg:p-8">
      <UserProfile
        routing="path"
        path="/dashboard/profile"
        appearance={{
          variables: {
            borderRadius: "0",
          },
          elements: {
            rootBox: "w-full max-w-none",
            cardBox: "w-full max-w-none shadow-none",
            card: "w-full max-w-none shadow-none",
          },
        }}
      />
    </section>
  );
}

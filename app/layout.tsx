import { ClerkProvider } from "@clerk/nextjs";
import { shadcn } from "@clerk/ui/themes";
import type { Metadata } from "next";
import { Archivo_Black, Space_Grotesk } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ServiceWorkerRegistration } from "@/components/pwa/service-worker-registration";
import "./globals.css";

const archivoBlack = Archivo_Black({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-head",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "EchoLeaks — Share confidential files. Know when they leak.",
  description:
    "Protect sensitive documents with invisible leak attribution and trace leaked content back to its source.",
  applicationName: "EchoLeaks",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "EchoLeaks", statusBarStyle: "default" },
  icons: {
    icon: "/io.github.lo2dev.Echo.svg",
    shortcut: "/io.github.lo2dev.Echo.svg",
    apple: "/pwa/apple-touch-icon.png",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${archivoBlack.variable} ${spaceGrotesk.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ClerkProvider
          signInFallbackRedirectUrl="/dashboard"
          signUpFallbackRedirectUrl="/dashboard"
          appearance={{
            theme: shadcn,
            elements: {
              modalBackdrop: "clerk-modal-backdrop",
              modalContent: "clerk-modal-content",
            },
          }}
        >
          <ServiceWorkerRegistration />
          <TooltipProvider>{children}</TooltipProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}

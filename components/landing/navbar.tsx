import { ThemeToggle } from "@/components/theme/theme-toggle";
import Link from "next/link";
import Image from "next/image";
import { AuthControls } from "@/components/landing/auth-controls";

export function Navbar() {
  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-50">
      <nav className="flex h-16 items-center justify-between gap-2 px-3 sm:px-8">
        <Link
          href="/"
          className="pointer-events-auto inline-flex shrink-0 items-center"
          aria-label="EchoLeaks home"
        >
          <Image
            src="/io.github.lo2dev.Echo.svg"
            alt="EchoLeaks"
            width={36}
            height={36}
            priority
            className="h-7 w-7 sm:h-9 sm:w-9"
          />
        </Link>

        <div className="pointer-events-auto flex items-center gap-2 sm:gap-3">
          <AuthControls />
          <ThemeToggle />
        </div>
      </nav>
    </header>
  );
}

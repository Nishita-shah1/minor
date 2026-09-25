"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const reduceMotion = useReducedMotion();
  const dark = mounted && resolvedTheme === "dark";

  return (
    <motion.button
      type="button"
      role="switch"
      aria-label="Dark mode"
      aria-checked={dark}
      disabled={!mounted}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => setTheme(dark ? "light" : "dark")}
      whileHover={reduceMotion ? undefined : { y: -2 }}
      whileTap={reduceMotion ? undefined : { scale: 0.96, y: 1 }}
      className="relative inline-flex h-9 w-[4.25rem] sm:w-[4.5rem] shrink-0 items-center rounded-full border-2 border-black bg-card p-1 text-muted-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background disabled:cursor-wait after:absolute after:inset-x-0 after:-inset-y-1 after:rounded-full"
    >
      <motion.span
        aria-hidden="true"
        initial={false}
        animate={{ left: dark ? "calc(100% - 1.75rem)" : "0.25rem", rotate: dark ? 180 : 0 }}
        transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 360, damping: 28 }}
        className="absolute left-1 top-1 size-6 rounded-full border-2 border-black bg-primary shadow-xs"
      />
      <span aria-hidden="true" className="relative flex w-full items-center justify-between px-1">
        <Sun className={`size-4 transition-colors motion-reduce:transition-none ${dark ? "text-muted-foreground" : "text-primary-foreground"}`} strokeWidth={2.3} />
        <Moon className={`size-4 transition-colors motion-reduce:transition-none ${dark ? "text-primary-foreground" : "text-muted-foreground"}`} strokeWidth={2.3} />
      </span>
    </motion.button>
  );
}

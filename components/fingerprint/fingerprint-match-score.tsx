"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Check } from "lucide-react";

/** Exact identifier equality, not a calibrated attribution probability. */
export function FingerprintMatchScore() {
  const reduceMotion = useReducedMotion();

  return (
    <div className="flex flex-col items-center gap-3 border-b-2 border-black pb-5 text-center">
      <p className="text-sm font-bold">Fingerprint ID match</p>
      <div className="relative size-36" role="img" aria-label="100 percent fingerprint ID match: recovered ID matches this copy exactly">
        <svg viewBox="0 0 144 144" className="size-full -rotate-90" aria-hidden="true">
          <circle cx="72" cy="72" r="60" fill="none" strokeWidth="14" className="stroke-muted" />
          <motion.circle
            cx="72"
            cy="72"
            r="60"
            fill="none"
            strokeWidth="14"
            strokeLinecap="round"
            className="stroke-primary"
            initial={reduceMotion ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: reduceMotion ? 0 : 0.7, ease: "easeOut" }}
          />
        </svg>
        <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center font-head text-3xl">100%</span>
      </div>
      <span className="inline-flex items-center gap-2 rounded-full border-2 border-black bg-primary px-3 py-1 text-sm font-bold text-primary-foreground shadow-xs">
        <Check aria-hidden="true" className="size-4" /> Exact match
      </span>
      <p className="max-w-64 text-xs text-muted-foreground">The recovered fingerprint ID matches this shared copy exactly.</p>
    </div>
  );
}

/** Credit at most 15s between consecutive marked+visible+fullscreen+authorized observations; gaps over 30s credit 0. */
export const MAX_VISIBLE_CREDIT_MS = 15_000;
export const MAX_VISIBLE_GAP_MS = 30_000;

export function creditVisibleInterval(
  previousCreditAt: Date | null,
  now: Date,
  observationCreditsTime: boolean,
): { creditMs: number; nextCreditAt: Date | null } {
  if (!observationCreditsTime) {
    return { creditMs: 0, nextCreditAt: previousCreditAt };
  }
  if (!previousCreditAt) {
    return { creditMs: 0, nextCreditAt: now };
  }
  const gap = now.getTime() - previousCreditAt.getTime();
  if (gap <= 0) return { creditMs: 0, nextCreditAt: previousCreditAt };
  if (gap > MAX_VISIBLE_GAP_MS) return { creditMs: 0, nextCreditAt: now };
  return { creditMs: Math.min(gap, MAX_VISIBLE_CREDIT_MS), nextCreditAt: now };
}

export function observationCreditsVisibleTime(flags: {
  marked: boolean;
  visible: boolean;
  fullscreen: boolean;
  authorized: boolean;
}) {
  return flags.marked && flags.visible && flags.fullscreen && flags.authorized;
}

export type ShareSchedule = { availableFrom: Date | null; expiresAt: Date | null };

export function validateShareSchedule(schedule: ShareSchedule, now = new Date()) {
  if (schedule.availableFrom && schedule.availableFrom <= now) return "Opening time must be in the future.";
  if (schedule.expiresAt && schedule.expiresAt <= now) return "Expiry must be in the future.";
  if (schedule.availableFrom && schedule.expiresAt && schedule.expiresAt <= schedule.availableFrom) {
    return "Expiry must be later than opening.";
  }
  return null;
}

const SLOT_MS = 15 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

const formatters = new Map<string, Intl.DateTimeFormat>();

function weekdayIn(date: Date, timezone: string): string {
  let f = formatters.get(timezone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" });
    formatters.set(timezone, f);
  }
  return f.format(date);
}

function isWorkday(date: Date, timezone: string): boolean {
  const day = weekdayIn(date, timezone);
  return day !== "Sat" && day !== "Sun";
}

/**
 * Hours between two times, skipping Saturday and Sunday in the team timezone.
 * Counted in 15 minute slots, so the result is accurate to 15 minutes.
 */
export function workingHoursBetween(from: Date, to: Date, timezone: string): number {
  if (to <= from) return 0;
  let ms = 0;
  for (let t = from.getTime(); t < to.getTime(); t += SLOT_MS) {
    if (isWorkday(new Date(t), timezone)) ms += Math.min(SLOT_MS, to.getTime() - t);
  }
  return ms / HOUR_MS;
}

/** Go back `hours` working hours from `to`. Used for the standup window. */
export function subtractWorkingHours(to: Date, hours: number, timezone: string): Date {
  let left = hours * HOUR_MS;
  let t = to.getTime();
  // Hard stop after 30 days, in case of a bad timezone.
  const floor = t - 30 * 24 * HOUR_MS;
  while (left > 0 && t > floor) {
    t -= SLOT_MS;
    if (isWorkday(new Date(t), timezone)) left -= SLOT_MS;
  }
  return new Date(t);
}

/** "52h", or "3d" once it is 72h or more (working days of 24h). */
export function formatAge(hours: number): string {
  if (hours >= 72) return `${Math.floor(hours / 24)}d`;
  return `${Math.floor(hours)}h`;
}

/** YYYY-MM-DD in the team timezone. */
export function localDate(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

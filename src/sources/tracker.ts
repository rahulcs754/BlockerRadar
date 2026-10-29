import type { Member } from "../config.js";

/**
 * Return the team's own tracker id for a user if any id matches
 * (so config can use email or accountId), else the first known id.
 */
export function canonicalId(ids: (string | null | undefined)[], team: Member[]): string | null {
  const known = ids.filter((x): x is string => !!x);
  for (const id of known) {
    const m = team.find((t) => t.tracker?.toLowerCase() === id.toLowerCase());
    if (m?.tracker) return m.tracker;
  }
  return known[0] ?? null;
}

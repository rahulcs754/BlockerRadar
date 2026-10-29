import type { Config } from "../config.js";
import type { Digest, Snapshot } from "../types.js";
import { localDate, subtractWorkingHours } from "./clock.js";
import { findBlockers } from "./rules.js";
import { buildStandups } from "./standup.js";

/** Standup window: the last 24 working hours, so Monday covers Friday. */
export const WINDOW_HOURS = 24;

export function buildDigest(snapshot: Snapshot, config: Config, now: Date): Digest {
  const since = subtractWorkingHours(now, WINDOW_HOURS, config.timezone);
  return {
    date: localDate(now, config.timezone),
    blockers: findBlockers(snapshot, config, now),
    people: buildStandups(snapshot, config, since, now),
  };
}

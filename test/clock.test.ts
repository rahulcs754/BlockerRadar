import { describe, expect, it } from "vitest";
import { formatAge, localDate, subtractWorkingHours, workingHoursBetween } from "../src/core/clock.js";

const IST = "Asia/Kolkata";

describe("workingHoursBetween", () => {
  it("counts plain weekday hours", () => {
    expect(workingHoursBetween(new Date("2026-10-27T04:00:00Z"), new Date("2026-10-28T04:00:00Z"), IST)).toBe(24);
  });

  it("skips the weekend in the team timezone", () => {
    // Fri 09:30 IST -> Mon 09:30 IST is 72h of clock time, 24h of working time.
    expect(workingHoursBetween(new Date("2026-10-23T04:00:00Z"), new Date("2026-10-26T04:00:00Z"), IST)).toBe(24);
  });

  it("returns 0 when the end is before the start", () => {
    expect(workingHoursBetween(new Date("2026-10-28T04:00:00Z"), new Date("2026-10-27T04:00:00Z"), IST)).toBe(0);
  });

  it("uses the team timezone, not UTC, for the weekend edge", () => {
    // Fri 20:00 UTC is already Sat 01:30 IST, so this whole range is weekend in IST.
    expect(workingHoursBetween(new Date("2026-10-23T20:00:00Z"), new Date("2026-10-23T22:00:00Z"), IST)).toBe(0);
    expect(workingHoursBetween(new Date("2026-10-23T20:00:00Z"), new Date("2026-10-23T22:00:00Z"), "UTC")).toBe(2);
  });
});

describe("subtractWorkingHours", () => {
  it("goes back to Friday from Monday morning", () => {
    const monday = new Date("2026-10-26T04:00:00Z");
    expect(subtractWorkingHours(monday, 24, IST).toISOString()).toBe("2026-10-23T04:00:00.000Z");
  });

  it("goes back one day mid week", () => {
    expect(subtractWorkingHours(new Date("2026-10-29T04:00:00Z"), 24, IST).toISOString()).toBe("2026-10-28T04:00:00.000Z");
  });
});

describe("formatAge / localDate", () => {
  it("shows hours under 3 days, then days", () => {
    expect(formatAge(52.5)).toBe("52h");
    expect(formatAge(80)).toBe("3d");
  });

  it("prints the local date", () => {
    expect(localDate(new Date("2026-10-28T20:00:00Z"), IST)).toBe("2026-10-29");
  });
});

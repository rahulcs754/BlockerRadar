import type { Config, Member } from "../config.js";
import type { PersonStandup, PullRequest, Snapshot, WorkItem } from "../types.js";
import { prRef } from "./team.js";

function inWindow(iso: string | null, since: Date, now: Date): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= since.getTime() && t <= now.getTime();
}

function same(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

/** Build "yesterday" and "today" lines for one person, from data only. */
export function standupFor(member: Member, snapshot: Snapshot, since: Date, now: Date, multiRepo: boolean): PersonStandup {
  const ref = (pr: PullRequest) => prRef(pr, multiRepo);
  const mine = (pr: PullRequest) => same(pr.author, member.github);
  const yesterday: string[] = [];
  const today: string[] = [];

  const merged = snapshot.pulls.filter((pr) => mine(pr) && pr.state === "merged" && inWindow(pr.mergedAt, since, now));
  if (merged.length) yesterday.push(`merged ${merged.map(ref).join(", ")}`);

  const opened = snapshot.pulls.filter((pr) => mine(pr) && pr.state === "open" && inWindow(pr.createdAt, since, now));
  if (opened.length) yesterday.push(`opened ${opened.map(ref).join(", ")}`);

  const reviewed = snapshot.pulls.filter(
    (pr) => !mine(pr) && pr.reviews.some((r) => same(r.author, member.github) && r.state !== "PENDING" && inWindow(r.submittedAt, since, now)),
  );
  if (reviewed.length) yesterday.push(`reviewed ${reviewed.map(ref).join(", ")}`);

  for (const pr of snapshot.pulls) {
    // A PR opened in the window already has its own line.
    if (!mine(pr) || pr.state !== "open" || opened.includes(pr)) continue;
    const n = pr.commits.filter((c) => same(c.author, member.github) && inWindow(c.date, since, now)).length;
    if (n) yesterday.push(`${n} commit${n === 1 ? "" : "s"} on ${ref(pr)}`);
  }

  const moved = new Map<string, string>();
  for (const item of snapshot.items) {
    for (const t of item.transitions) {
      if (same(t.by, member.tracker) && t.category !== "todo" && inWindow(t.at, since, now)) moved.set(item.key, t.to);
    }
  }
  for (const [key, to] of moved) yesterday.push(`${key} → ${to}`);

  for (const pr of snapshot.pulls) {
    if (mine(pr) && pr.state === "open") today.push(`${ref(pr)} ${pr.title}${pr.isDraft ? " (draft)" : ""}`);
  }
  const toReview = snapshot.pulls.filter((pr) => pr.state === "open" && pr.reviewRequests.some((r) => same(r, member.github)));
  if (toReview.length) today.push(`review ${toReview.map(ref).join(", ")}`);

  const working: WorkItem[] = snapshot.items.filter((i) => i.category === "in_progress" && same(i.assignee, member.tracker));
  for (const item of working) today.push(`${item.key} ${item.title}`);

  return { name: member.name, yesterday, today };
}

export function buildStandups(snapshot: Snapshot, config: Config, since: Date, now: Date): PersonStandup[] {
  const multiRepo = config.repos.length > 1;
  return config.team.map((m) => standupFor(m, snapshot, since, now, multiRepo));
}

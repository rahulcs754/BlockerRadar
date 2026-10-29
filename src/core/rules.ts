import type { Config } from "../config.js";
import type { Blocker, BranchStatus, PullRequest, Review, Snapshot, WorkItem } from "../types.js";
import { formatAge, workingHoursBetween } from "./clock.js";
import { prRef, Team } from "./team.js";

interface Ctx {
  config: Config;
  team: Team;
  now: Date;
  multiRepo: boolean;
}

function hoursSince(iso: string, ctx: Ctx): number {
  return workingHoursBetween(new Date(iso), ctx.now, ctx.config.timezone);
}

/** Reviews that count: from someone other than the author, and submitted. */
function realReviews(pr: PullRequest): Review[] {
  return pr.reviews.filter((r) => r.author !== pr.author && r.state !== "PENDING" && r.state !== "DISMISSED");
}

/** Latest APPROVED / CHANGES_REQUESTED per reviewer. */
function decisiveReviews(pr: PullRequest): Review[] {
  const latest = new Map<string, Review>();
  for (const r of realReviews(pr)) {
    if (r.state !== "APPROVED" && r.state !== "CHANGES_REQUESTED") continue;
    const prev = latest.get(r.author);
    if (!prev || prev.submittedAt < r.submittedAt) latest.set(r.author, r);
  }
  return [...latest.values()];
}

function lastCommitAt(pr: PullRequest): string {
  if (!pr.commits.length) return pr.createdAt;
  return pr.commits.reduce((max, c) => (c.date > max ? c.date : max), pr.commits[0]!.date);
}

function label(pr: PullRequest, ctx: Ctx): string {
  return `PR ${prRef(pr, ctx.multiRepo)} "${pr.title}"`;
}

export function reviewWait(pr: PullRequest, ctx: Ctx): Blocker | null {
  if (pr.state !== "open" || pr.isDraft || realReviews(pr).length > 0) return null;
  const age = hoursSince(pr.readyAt, ctx);
  if (age < ctx.config.rules["review-wait"].hours) return null;
  const owners = ctx.team.namesForLogins(pr.reviewRequests);
  return {
    rule: "review-wait",
    severity: "high",
    title: label(pr, ctx),
    url: pr.url,
    reason: owners.length ? `waiting for review ${formatAge(age)}` : `waiting for review ${formatAge(age)}, no reviewer assigned`,
    owners,
    ageHours: age,
  };
}

export function prCiRed(pr: PullRequest, ctx: Ctx): Blocker | null {
  if (!ctx.config.rules["ci-red"].enabled || pr.state !== "open" || pr.isDraft || pr.ci !== "failure") return null;
  const age = hoursSince(lastCommitAt(pr), ctx);
  return {
    rule: "ci-red",
    severity: "high",
    title: label(pr, ctx),
    url: pr.url,
    reason: `CI failing (last push ${formatAge(age)} ago)`,
    owners: ctx.team.namesForLogins([pr.author]),
    ageHours: age,
  };
}

export function branchCiRed(branch: BranchStatus, ctx: Ctx): Blocker | null {
  if (!ctx.config.rules["ci-red"].enabled || branch.ci !== "failure") return null;
  const where = ctx.multiRepo ? `${branch.repo.split("/")[1]}/${branch.branch}` : branch.branch;
  const checks = branch.failing.length ? ` (${branch.failing.slice(0, 3).join(", ")})` : "";
  return {
    rule: "ci-red",
    severity: "high",
    title: `${where} CI red${checks}`,
    url: branch.url,
    reason: "default branch is failing",
    // The last committer is the best first person to look.
    owners: branch.commitAuthor ? ctx.team.namesForLogins([branch.commitAuthor]) : [],
    // Main red is always the most urgent.
    ageHours: Number.MAX_SAFE_INTEGER,
  };
}

export function changesStale(pr: PullRequest, ctx: Ctx): Blocker | null {
  if (pr.state !== "open") return null;
  const requested = decisiveReviews(pr).filter((r) => r.state === "CHANGES_REQUESTED");
  if (!requested.length) return null;
  const latest = requested.reduce((a, b) => (a.submittedAt > b.submittedAt ? a : b));
  if (lastCommitAt(pr) > latest.submittedAt) return null;
  const age = hoursSince(latest.submittedAt, ctx);
  if (age < ctx.config.rules["changes-stale"].hours) return null;
  return {
    rule: "changes-stale",
    severity: "warn",
    title: label(pr, ctx),
    url: pr.url,
    reason: `changes requested ${formatAge(age)} ago, no new commits`,
    owners: ctx.team.namesForLogins([pr.author]),
    ageHours: age,
  };
}

export function prTooBig(pr: PullRequest, ctx: Ctx): Blocker | null {
  if (pr.state !== "open" || pr.isDraft) return null;
  const lines = pr.additions + pr.deletions;
  if (lines <= ctx.config.rules["pr-too-big"].lines) return null;
  if (decisiveReviews(pr).some((r) => r.state === "APPROVED")) return null;
  return {
    rule: "pr-too-big",
    severity: "warn",
    title: label(pr, ctx),
    url: pr.url,
    reason: `${lines} lines changed, hard to review; think about splitting it`,
    owners: ctx.team.namesForLogins([pr.author]),
    ageHours: hoursSince(pr.readyAt, ctx),
  };
}

export function ticketStuck(item: WorkItem, ctx: Ctx): Blocker | null {
  if (item.category !== "in_progress") return null;
  const age = hoursSince(item.statusSince, ctx);
  if (age < ctx.config.rules["ticket-stuck"].days * 24) return null;
  const owner = ctx.team.byTracker(item.assignee);
  return {
    rule: "ticket-stuck",
    severity: "warn",
    title: `${item.key} "${item.title}"`,
    url: item.url,
    reason: `${item.status} for ${Math.floor(age / 24)} working days`,
    owners: owner ? [owner.name] : item.assignee ? [item.assignee] : [],
    ageHours: age,
  };
}

/** Run every rule. Only PRs by team members are checked, so bot PRs stay out. */
export function findBlockers(snapshot: Snapshot, config: Config, now: Date): Blocker[] {
  const team = new Team(config.team);
  const ctx: Ctx = { config, team, now, multiRepo: config.repos.length > 1 };
  const out: Blocker[] = [];

  for (const branch of snapshot.branches) {
    const b = branchCiRed(branch, ctx);
    if (b) out.push(b);
  }
  for (const pr of snapshot.pulls) {
    if (!team.byGithub(pr.author)) continue;
    // One blocker per PR: the most useful one wins.
    const b = prCiRed(pr, ctx) ?? changesStale(pr, ctx) ?? reviewWait(pr, ctx) ?? prTooBig(pr, ctx);
    if (b) out.push(b);
  }
  for (const item of snapshot.items) {
    const b = ticketStuck(item, ctx);
    if (b) out.push(b);
  }

  const rank = { high: 0, warn: 1 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity] || b.ageHours - a.ageHours);
}

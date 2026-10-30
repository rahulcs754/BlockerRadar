import { describe, expect, it } from "vitest";
import { findBlockers } from "../src/core/rules.js";
import type { PullRequest, Snapshot, WorkItem } from "../src/types.js";
import { NOW, testConfig } from "./helpers.js";

function pr(over: Partial<PullRequest>): PullRequest {
  return {
    repo: "acme/web",
    number: 1,
    title: "A change",
    url: "https://github.com/acme/web/pull/1",
    author: "asha-dev",
    state: "open",
    isDraft: false,
    createdAt: "2026-10-28T10:00:00Z",
    readyAt: "2026-10-28T10:00:00Z",
    mergedAt: null,
    additions: 10,
    deletions: 5,
    reviewRequests: [],
    reviews: [],
    commits: [{ author: "asha-dev", date: "2026-10-28T10:00:00Z" }],
    ci: "success",
    ...over,
  };
}

function item(over: Partial<WorkItem>): WorkItem {
  return {
    key: "FS-1",
    title: "A ticket",
    url: "https://acme.atlassian.net/browse/FS-1",
    status: "In Progress",
    category: "in_progress",
    assignee: "asha@acme.com",
    statusSince: "2026-10-28T10:00:00Z",
    transitions: [],
    ...over,
  };
}

const snap = (s: Partial<Snapshot>): Snapshot => ({ pulls: [], branches: [], items: [], ...s });
const config = testConfig();

describe("review-wait", () => {
  it("flags a PR with no review after 24 working hours, with the reviewer as owner", () => {
    const [b] = findBlockers(snap({ pulls: [pr({ readyAt: "2026-10-27T04:00:00Z", reviewRequests: ["vikram-dev"] })] }), config, NOW);
    expect(b).toMatchObject({ rule: "review-wait", reason: "waiting for review 48h", owners: ["Vikram"] });
  });

  it("says when nobody is asked to review", () => {
    const [b] = findBlockers(snap({ pulls: [pr({ readyAt: "2026-10-27T04:00:00Z" })] }), config, NOW);
    expect(b!.reason).toBe("waiting for review 48h, no reviewer assigned");
  });

  it("does not count the weekend", () => {
    // Ready Fri 09:30 IST, now Mon 09:30 IST: only 24 working hours.
    const monday = new Date("2026-10-26T04:00:00Z");
    const p = pr({ readyAt: "2026-10-23T04:30:00Z" });
    expect(findBlockers(snap({ pulls: [p] }), config, monday)).toEqual([]);
  });

  it("ignores self-reviews, drafts and PRs from outside the team", () => {
    const pulls = [
      pr({ number: 1, readyAt: "2026-10-20T04:00:00Z", reviews: [{ author: "asha-dev", state: "COMMENTED", submittedAt: "2026-10-21T04:00:00Z" }] }),
      pr({ number: 2, readyAt: "2026-10-20T04:00:00Z", isDraft: true }),
      pr({ number: 3, readyAt: "2026-10-20T04:00:00Z", author: "dependabot" }),
    ];
    expect(findBlockers(snap({ pulls }), config, NOW).map((b) => b.title)).toEqual(['PR #1 "A change"']);
  });
});

describe("changes-stale", () => {
  const review = { author: "vikram-dev", state: "CHANGES_REQUESTED" as const, submittedAt: "2026-10-26T04:00:00Z" };

  it("flags requested changes with no new commit after 48h", () => {
    const [b] = findBlockers(snap({ pulls: [pr({ reviews: [review], commits: [{ author: "asha-dev", date: "2026-10-25T04:00:00Z" }] })] }), config, NOW);
    expect(b).toMatchObject({ rule: "changes-stale", owners: ["Asha"], reason: "changes requested 3d ago, no new commits" });
  });

  it("is quiet once the author pushes again", () => {
    const p = pr({ reviews: [review], commits: [{ author: "asha-dev", date: "2026-10-27T04:00:00Z" }] });
    expect(findBlockers(snap({ pulls: [p] }), config, NOW)).toEqual([]);
  });

  it("is quiet when the same reviewer approved later", () => {
    const p = pr({
      reviews: [review, { author: "vikram-dev", state: "APPROVED", submittedAt: "2026-10-26T05:00:00Z" }],
      commits: [{ author: "asha-dev", date: "2026-10-25T04:00:00Z" }],
    });
    expect(findBlockers(snap({ pulls: [p] }), config, NOW)).toEqual([]);
  });
});

describe("ci-red", () => {
  it("flags a failing PR and the failing default branch, main first", () => {
    const blockers = findBlockers(
      snap({
        pulls: [pr({ ci: "failure", author: "rohit-dev" })],
        branches: [
          { repo: "acme/web", branch: "main", ci: "failure", failing: ["e2e", "lint"], commitAuthor: "rohit-dev", commitDate: "2026-10-29T02:00:00Z", url: "https://x" },
        ],
      }),
      config,
      NOW,
    );
    expect(blockers.map((b) => [b.rule, b.title, b.owners])).toEqual([
      ["ci-red", "main CI red (e2e, lint)", ["Rohit"]],
      ["ci-red", 'PR #1 "A change"', ["Rohit"]],
    ]);
  });

  it("can be turned off", () => {
    const off = { ...config, rules: { ...config.rules, "ci-red": { enabled: false } } };
    expect(findBlockers(snap({ pulls: [pr({ ci: "failure" })] }), off, NOW)).toEqual([]);
  });

  it("names the repo when there is more than one", () => {
    const multi = { ...config, repos: ["acme/web", "acme/api"] };
    const [b] = findBlockers(
      snap({ branches: [{ repo: "acme/api", branch: "main", ci: "failure", failing: [], commitAuthor: null, commitDate: "", url: "https://x" }] }),
      multi,
      NOW,
    );
    expect(b).toMatchObject({ title: "api/main CI red", reason: "default branch is failing", owners: [] });
  });
});

describe("pr-too-big", () => {
  it("warns on big PRs that are not approved yet", () => {
    const [b] = findBlockers(snap({ pulls: [pr({ additions: 700, deletions: 200 })] }), config, NOW);
    expect(b).toMatchObject({ rule: "pr-too-big", severity: "warn", reason: "900 lines changed, hard to review; think about splitting it" });
  });

  it("is quiet once approved", () => {
    const p = pr({ additions: 900, reviews: [{ author: "vikram-dev", state: "APPROVED", submittedAt: "2026-10-28T11:00:00Z" }] });
    expect(findBlockers(snap({ pulls: [p] }), config, NOW)).toEqual([]);
  });
});

describe("ticket-stuck", () => {
  it("flags tickets in progress for 3+ working days", () => {
    const [b] = findBlockers(snap({ items: [item({ statusSince: "2026-10-23T04:00:00Z" })] }), config, NOW);
    expect(b).toMatchObject({ rule: "ticket-stuck", reason: "In Progress for 4 working days", owners: ["Asha"] });
  });

  it("ignores todo and done tickets", () => {
    const items = [item({ category: "todo", statusSince: "2026-10-01T00:00:00Z" }), item({ category: "done", statusSince: "2026-10-01T00:00:00Z" })];
    expect(findBlockers(snap({ items }), config, NOW)).toEqual([]);
  });
});

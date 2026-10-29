export type CiState = "success" | "failure" | "pending";

export interface Review {
  author: string;
  state: "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "DISMISSED" | "PENDING";
  submittedAt: string;
}

export interface Commit {
  author: string | null;
  date: string;
}

export interface PullRequest {
  repo: string;
  number: number;
  title: string;
  url: string;
  author: string;
  state: "open" | "merged" | "closed";
  isDraft: boolean;
  createdAt: string;
  /** When the PR left draft, or createdAt if it never was a draft. */
  readyAt: string;
  mergedAt: string | null;
  additions: number;
  deletions: number;
  reviewRequests: string[];
  reviews: Review[];
  commits: Commit[];
  ci: CiState | null;
}

export interface BranchStatus {
  repo: string;
  branch: string;
  ci: CiState | null;
  /** Failing check names, if any. */
  failing: string[];
  commitAuthor: string | null;
  commitDate: string;
  url: string;
}

export type StatusCategory = "todo" | "in_progress" | "done";

export interface WorkItem {
  key: string;
  title: string;
  url: string;
  status: string;
  category: StatusCategory;
  /** Tracker id of the assignee (Jira email/accountId, Linear email). */
  assignee: string | null;
  /** When the item entered its current status. */
  statusSince: string;
  /** Status changes, newest last. `by` is a tracker id. */
  transitions: { by: string | null; to: string; category: StatusCategory; at: string }[];
}

export interface Snapshot {
  pulls: PullRequest[];
  branches: BranchStatus[];
  items: WorkItem[];
}

export type RuleId = "review-wait" | "ci-red" | "changes-stale" | "ticket-stuck" | "pr-too-big";

export interface Blocker {
  rule: RuleId;
  severity: "high" | "warn";
  title: string;
  url: string;
  /** Human reason, e.g. "waiting for review 52h". */
  reason: string;
  /** Team member names who can unblock it. */
  owners: string[];
  /** Hours (working) used to sort: oldest first. */
  ageHours: number;
}

export interface PersonStandup {
  name: string;
  yesterday: string[];
  today: string[];
}

export interface Digest {
  date: string;
  blockers: Blocker[];
  people: PersonStandup[];
}

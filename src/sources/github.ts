import type { BranchStatus, CiState, PullRequest, Review } from "../types.js";
import { type FetchLike, requestJson } from "./http.js";

const PR_FIELDS = `
  number title url isDraft createdAt mergedAt state additions deletions
  author { login }
  timelineItems(itemTypes: [READY_FOR_REVIEW_EVENT], last: 1) { nodes { ... on ReadyForReviewEvent { createdAt } } }
  reviewRequests(first: 10) { nodes { requestedReviewer { ... on User { login } ... on Team { slug } } } }
  reviews(last: 30) { nodes { state submittedAt author { login } } }
  commits(last: 30) { nodes { commit { committedDate author { user { login } } statusCheckRollup { state } } } }
`;

export const REPO_QUERY = `
query ($owner: String!, $name: String!, $merged: String!) {
  repository(owner: $owner, name: $name) {
    defaultBranchRef {
      name
      target {
        ... on Commit {
          url committedDate
          author { user { login } }
          statusCheckRollup {
            state
            contexts(first: 50) {
              nodes {
                __typename
                ... on CheckRun { name conclusion }
                ... on StatusContext { context state }
              }
            }
          }
        }
      }
    }
    pullRequests(states: OPEN, first: 50, orderBy: { field: UPDATED_AT, direction: DESC }) { nodes { ${PR_FIELDS} } }
  }
  merged: search(query: $merged, type: ISSUE, first: 50) { nodes { ... on PullRequest { ${PR_FIELDS} } } }
}`;

interface Login { login: string }
interface RawPr {
  number: number;
  title: string;
  url: string;
  isDraft: boolean;
  createdAt: string;
  mergedAt: string | null;
  state: "OPEN" | "MERGED" | "CLOSED";
  additions: number;
  deletions: number;
  author: Login | null;
  timelineItems: { nodes: ({ createdAt?: string } | null)[] };
  reviewRequests: { nodes: { requestedReviewer: { login?: string; slug?: string } | null }[] };
  reviews: { nodes: { state: Review["state"]; submittedAt: string | null; author: Login | null }[] };
  commits: {
    nodes: { commit: { committedDate: string; author: { user: Login | null } | null; statusCheckRollup: { state: string } | null } }[];
  };
}
interface RawContext { __typename: string; name?: string; conclusion?: string | null; context?: string; state?: string }
interface RawRepo {
  data?: {
    repository: {
      defaultBranchRef: {
        name: string;
        target: {
          url: string;
          committedDate: string;
          author: { user: Login | null } | null;
          statusCheckRollup: { state: string; contexts: { nodes: (RawContext | null)[] } } | null;
        };
      } | null;
      pullRequests: { nodes: RawPr[] };
    } | null;
    merged: { nodes: (RawPr | Record<string, never>)[] };
  };
  errors?: { message: string }[];
}

export function toCi(state: string | null | undefined): CiState | null {
  switch (state) {
    case "SUCCESS":
      return "success";
    case "FAILURE":
    case "ERROR":
      return "failure";
    case "PENDING":
    case "EXPECTED":
      return "pending";
    default:
      return null;
  }
}

const FAILED_CONCLUSIONS = new Set(["FAILURE", "TIMED_OUT", "STARTUP_FAILURE", "ACTION_REQUIRED"]);

export function normalizePr(repo: string, raw: RawPr): PullRequest {
  const commits = raw.commits.nodes.map((n) => n.commit);
  const last = commits.at(-1);
  return {
    repo,
    number: raw.number,
    title: raw.title,
    url: raw.url,
    author: raw.author?.login ?? "ghost",
    state: raw.state === "OPEN" ? "open" : raw.state === "MERGED" ? "merged" : "closed",
    isDraft: raw.isDraft,
    createdAt: raw.createdAt,
    readyAt: raw.timelineItems.nodes.find((n) => n?.createdAt)?.createdAt ?? raw.createdAt,
    mergedAt: raw.mergedAt,
    additions: raw.additions,
    deletions: raw.deletions,
    reviewRequests: raw.reviewRequests.nodes
      .map((n) => n.requestedReviewer?.login ?? n.requestedReviewer?.slug)
      .filter((x): x is string => !!x),
    reviews: raw.reviews.nodes
      .filter((r) => r.submittedAt && r.author)
      .map((r) => ({ author: r.author!.login, state: r.state, submittedAt: r.submittedAt! })),
    commits: commits.map((c) => ({ author: c.author?.user?.login ?? null, date: c.committedDate })),
    ci: toCi(last?.statusCheckRollup?.state),
  };
}

export function normalizeRepo(repo: string, raw: RawRepo): { pulls: PullRequest[]; branch: BranchStatus | null } {
  if (raw.errors?.length) throw new Error(`GitHub GraphQL error for ${repo}: ${raw.errors.map((e) => e.message).join("; ")}`);
  const r = raw.data?.repository;
  if (!r) throw new Error(`GitHub repo not found or no access: ${repo}`);

  const pulls = [
    ...r.pullRequests.nodes,
    ...(raw.data!.merged.nodes.filter((n) => "number" in n) as RawPr[]),
  ].map((p) => normalizePr(repo, p));

  let branch: BranchStatus | null = null;
  const ref = r.defaultBranchRef;
  if (ref) {
    const rollup = ref.target.statusCheckRollup;
    const failing = (rollup?.contexts.nodes ?? [])
      .filter((c): c is RawContext => !!c)
      .filter((c) => (c.conclusion && FAILED_CONCLUSIONS.has(c.conclusion)) || c.state === "FAILURE" || c.state === "ERROR")
      .map((c) => c.name ?? c.context ?? "check");
    branch = {
      repo,
      branch: ref.name,
      ci: toCi(rollup?.state),
      failing,
      commitAuthor: ref.target.author?.user?.login ?? null,
      commitDate: ref.target.committedDate,
      url: ref.target.url,
    };
  }
  return { pulls, branch };
}

export async function fetchGithub(
  repos: string[],
  token: string,
  since: Date,
  fetchFn: FetchLike = fetch,
): Promise<{ pulls: PullRequest[]; branches: BranchStatus[] }> {
  const pulls: PullRequest[] = [];
  const branches: BranchStatus[] = [];
  const sinceIso = since.toISOString().replace(/\.\d{3}Z$/, "Z");
  for (const repo of repos) {
    const [owner, name] = repo.split("/");
    const raw = await requestJson<RawRepo>(
      fetchFn,
      "https://api.github.com/graphql",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "User-Agent": "blockerradar" },
        body: JSON.stringify({
          query: REPO_QUERY,
          variables: { owner, name, merged: `repo:${repo} is:pr is:merged merged:>=${sinceIso}` },
        }),
      },
      "GitHub",
    );
    const out = normalizeRepo(repo, raw);
    pulls.push(...out.pulls);
    if (out.branch) branches.push(out.branch);
  }
  return { pulls, branches };
}

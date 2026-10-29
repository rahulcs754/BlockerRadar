import type { Member } from "../config.js";
import type { StatusCategory, WorkItem } from "../types.js";
import { type FetchLike, requestJson } from "./http.js";
import { canonicalId } from "./tracker.js";

export const ISSUES_QUERY = `
query ($team: String!, $since: DateTimeOrDuration!) {
  issues(
    first: 100
    filter: { team: { key: { eq: $team } }, or: [{ updatedAt: { gte: $since } }, { state: { type: { eq: "started" } } }] }
  ) {
    nodes {
      identifier title url updatedAt startedAt
      state { name type }
      assignee { email }
      history(first: 30) { nodes { createdAt actor { email } toState { name type } } }
    }
  }
}`;

interface RawIssue {
  identifier: string;
  title: string;
  url: string;
  updatedAt: string;
  startedAt: string | null;
  state: { name: string; type: string };
  assignee: { email: string } | null;
  history: { nodes: { createdAt: string; actor: { email: string } | null; toState: { name: string; type: string } | null }[] };
}
interface RawResponse { data?: { issues: { nodes: RawIssue[] } }; errors?: { message: string }[] }

export function toCategory(type: string): StatusCategory {
  if (type === "started") return "in_progress";
  if (type === "completed" || type === "canceled") return "done";
  return "todo";
}

export function normalizeIssue(raw: RawIssue, team: Member[]): WorkItem {
  const transitions = raw.history.nodes
    .filter((h) => h.toState)
    .map((h) => ({
      by: canonicalId([h.actor?.email], team),
      to: h.toState!.name,
      category: toCategory(h.toState!.type),
      at: h.createdAt,
    }))
    .sort((a, b) => a.at.localeCompare(b.at));
  return {
    key: raw.identifier,
    title: raw.title,
    url: raw.url,
    status: raw.state.name,
    category: toCategory(raw.state.type),
    assignee: canonicalId([raw.assignee?.email], team),
    statusSince: transitions.at(-1)?.at ?? raw.startedAt ?? raw.updatedAt,
    transitions,
  };
}

export async function fetchLinear(
  opts: { team: string; token: string; members: Member[]; since: Date },
  fetchFn: FetchLike = fetch,
): Promise<WorkItem[]> {
  const res = await requestJson<RawResponse>(
    fetchFn,
    "https://api.linear.app/graphql",
    {
      method: "POST",
      headers: { Authorization: opts.token, "Content-Type": "application/json" },
      body: JSON.stringify({ query: ISSUES_QUERY, variables: { team: opts.team, since: opts.since.toISOString() } }),
    },
    "Linear",
  );
  if (res.errors?.length) throw new Error(`Linear GraphQL error: ${res.errors.map((e) => e.message).join("; ")}`);
  return (res.data?.issues.nodes ?? []).map((i) => normalizeIssue(i, opts.members));
}

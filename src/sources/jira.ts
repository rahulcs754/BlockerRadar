import type { Member } from "../config.js";
import type { StatusCategory, WorkItem } from "../types.js";
import { type FetchLike, requestJson } from "./http.js";
import { canonicalId } from "./tracker.js";

interface JiraUser { accountId?: string; emailAddress?: string }
interface RawStatus { id: string; name: string; statusCategory: { key: string } }
interface RawIssue {
  key: string;
  fields: {
    summary: string;
    status: RawStatus;
    assignee: JiraUser | null;
    statuscategorychangedate?: string;
    updated: string;
  };
  changelog?: {
    histories: { author?: JiraUser; created: string; items: { field: string; to: string | null; toString: string | null }[] }[];
  };
}
interface RawSearch { issues: RawIssue[]; nextPageToken?: string }

export function toCategory(key: string | undefined): StatusCategory {
  if (key === "indeterminate") return "in_progress";
  if (key === "done") return "done";
  return "todo";
}

export function normalizeIssue(raw: RawIssue, baseUrl: string, statuses: Map<string, StatusCategory>, team: Member[]): WorkItem {
  const userId = (u: JiraUser | null | undefined) => (u ? canonicalId([u.emailAddress, u.accountId], team) : null);
  const transitions: WorkItem["transitions"] = [];
  for (const h of raw.changelog?.histories ?? []) {
    for (const item of h.items) {
      if (item.field !== "status" || !item.to) continue;
      const category = statuses.get(item.to);
      // Unknown status id: skip it rather than guess its category.
      if (!category) continue;
      transitions.push({ by: userId(h.author), to: item.toString ?? item.to, category, at: h.created });
    }
  }
  transitions.sort((a, b) => a.at.localeCompare(b.at));
  return {
    key: raw.key,
    title: raw.fields.summary,
    url: `${baseUrl.replace(/\/$/, "")}/browse/${raw.key}`,
    status: raw.fields.status.name,
    category: toCategory(raw.fields.status.statusCategory.key),
    assignee: userId(raw.fields.assignee),
    statusSince: transitions.at(-1)?.at ?? raw.fields.statuscategorychangedate ?? raw.fields.updated,
    transitions,
  };
}

export async function fetchJira(
  opts: { baseUrl: string; project: string; email: string; token: string; team: Member[] },
  fetchFn: FetchLike = fetch,
): Promise<WorkItem[]> {
  const base = opts.baseUrl.replace(/\/$/, "");
  const headers = {
    Authorization: `Basic ${Buffer.from(`${opts.email}:${opts.token}`).toString("base64")}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  const rawStatuses = await requestJson<RawStatus[]>(fetchFn, `${base}/rest/api/3/status`, { headers }, "Jira");
  const statuses = new Map(rawStatuses.map((s) => [s.id, toCategory(s.statusCategory.key)]));

  const jql = `project = "${opts.project.replace(/"/g, "")}" AND (updated >= -7d OR statusCategory = "In Progress") ORDER BY updated DESC`;
  const items: WorkItem[] = [];
  let nextPageToken: string | undefined;
  for (let page = 0; page < 5; page++) {
    const res = await requestJson<RawSearch>(
      fetchFn,
      `${base}/rest/api/3/search/jql`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          jql,
          fields: ["summary", "status", "assignee", "statuscategorychangedate", "updated"],
          expand: "changelog",
          maxResults: 100,
          ...(nextPageToken ? { nextPageToken } : {}),
        }),
      },
      "Jira",
    );
    items.push(...res.issues.map((i) => normalizeIssue(i, base, statuses, opts.team)));
    nextPageToken = res.nextPageToken;
    if (!nextPageToken) break;
  }
  return items;
}

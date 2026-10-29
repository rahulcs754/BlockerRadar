import { describe, expect, it } from "vitest";
import { fetchJira } from "../src/sources/jira.js";
import { fetchLinear } from "../src/sources/linear.js";
import { fakeFetch, fixture, testConfig } from "./helpers.js";

describe("fetchJira", () => {
  const routes = {
    "https://acme.atlassian.net/rest/api/3/status": fixture("jira-statuses.json"),
    "https://acme.atlassian.net/rest/api/3/search/jql": fixture("jira-search.json"),
  };

  it("uses basic auth and the new search endpoint", async () => {
    const { fetchFn, calls } = fakeFetch(routes);
    const { team } = testConfig();
    await fetchJira({ baseUrl: "https://acme.atlassian.net/", project: "FS", email: "bot@acme.com", token: "jira-secret", team }, fetchFn);

    expect(calls.map((c) => c.url)).toEqual([
      "https://acme.atlassian.net/rest/api/3/status",
      "https://acme.atlassian.net/rest/api/3/search/jql",
    ]);
    const headers = calls[1]!.init!.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Basic ${Buffer.from("bot@acme.com:jira-secret").toString("base64")}`);
    expect(JSON.parse(String(calls[1]!.init!.body)).jql).toBe(
      'project = "FS" AND (updated >= -7d OR statusCategory = "In Progress") ORDER BY updated DESC',
    );
  });

  it("normalizes issues and maps people to the team's ids", async () => {
    const { fetchFn } = fakeFetch(routes);
    const { team } = testConfig();
    const items = await fetchJira({ baseUrl: "https://acme.atlassian.net", project: "FS", email: "e", token: "t", team }, fetchFn);

    const [fs118, fs120, fs121] = items;
    expect(fs118).toMatchObject({
      key: "FS-118",
      url: "https://acme.atlassian.net/browse/FS-118",
      category: "in_progress",
      // Config uses accountId for Meera because her email is hidden.
      assignee: "acc-meera",
      statusSince: "2026-10-22T05:00:00.000+0000",
    });
    expect(fs120!.assignee).toBe("asha@acme.com");
    expect(fs120!.transitions.map((t) => t.to)).toEqual(["In Progress", "In Review"]);
    // The unknown status id 999 is skipped, not guessed.
    expect(fs121!.transitions).toEqual([{ by: "rohit@acme.com", to: "Done", category: "done", at: "2026-10-28T13:00:00.000+0000" }]);
  });
});

describe("fetchLinear", () => {
  it("normalizes issues from history", async () => {
    const { fetchFn, calls } = fakeFetch({ "https://api.linear.app/graphql": fixture("linear-issues.json") });
    const { team } = testConfig();
    const items = await fetchLinear({ team: "WEB", token: "lin_secret", members: team, since: new Date("2026-10-22T04:00:00Z") }, fetchFn);

    expect((calls[0]!.init!.headers as Record<string, string>).Authorization).toBe("lin_secret");
    expect(JSON.parse(String(calls[0]!.init!.body)).variables).toEqual({ team: "WEB", since: "2026-10-22T04:00:00.000Z" });
    expect(items[0]).toMatchObject({ key: "WEB-12", category: "in_progress", assignee: "asha@acme.com", statusSince: "2026-10-21T04:00:00.000Z" });
    expect(items[1]).toMatchObject({ key: "WEB-15", category: "done", assignee: null });
    expect(items[1]!.transitions[0]!.by).toBe("rohit@acme.com");
  });

  it("fails clearly on GraphQL errors", async () => {
    const { fetchFn } = fakeFetch({ "https://api.linear.app/graphql": { errors: [{ message: "Authentication required" }] } });
    await expect(fetchLinear({ team: "WEB", token: "x", members: [], since: new Date() }, fetchFn)).rejects.toThrow(/Authentication required/);
  });
});

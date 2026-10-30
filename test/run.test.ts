import { describe, expect, it } from "vitest";
import { run } from "../src/run.js";
import { postToSlack } from "../src/slack.js";
import { fakeFetch, fixture, NOW, testConfig } from "./helpers.js";

const WEBHOOK = "https://hooks.slack.com/services/T000/B000/secret";
const routes = {
  "https://api.github.com/graphql": fixture("github-repo.json"),
  "https://acme.atlassian.net/rest/api/3/status": fixture("jira-statuses.json"),
  "https://acme.atlassian.net/rest/api/3/search/jql": fixture("jira-search.json"),
  "https://hooks.slack.com/": { ok: true },
};
const env = { GITHUB_TOKEN: "t", JIRA_EMAIL: "e", JIRA_API_TOKEN: "j", SLACK_WEBHOOK_URL: WEBHOOK };

describe("run", () => {
  it("dry run reads data and posts nothing", async () => {
    const { fetchFn, calls } = fakeFetch(routes);
    const result = await run(testConfig(), { dryRun: true, now: NOW, env, fetchFn });
    expect(result.posted).toBe(false);
    expect(calls.some((c) => c.url.startsWith("https://hooks.slack.com/"))).toBe(false);
    expect(result.text).toContain("Blockers (6)");
  });

  it("posts one message to Slack", async () => {
    const { fetchFn, calls } = fakeFetch(routes);
    const result = await run(testConfig(), { dryRun: false, now: NOW, env, fetchFn });
    const slack = calls.filter((c) => c.url === WEBHOOK);
    expect(result.posted).toBe(true);
    expect(slack).toHaveLength(1);
    expect(JSON.parse(String(slack[0]!.init!.body)).blocks[0].text.text).toBe("Standup · 2026-10-29");
  });

  it("only writes to Slack: every other call is a read", async () => {
    const { fetchFn, calls } = fakeFetch(routes);
    await run(testConfig(), { dryRun: false, now: NOW, env, fetchFn });
    // GraphQL and Jira search use POST but are queries; nothing else is called.
    expect(new Set(calls.map((c) => new URL(c.url).host))).toEqual(
      new Set(["api.github.com", "acme.atlassian.net", "hooks.slack.com"]),
    );
  });

  it("names the missing env var", async () => {
    const { fetchFn } = fakeFetch(routes);
    await expect(run(testConfig(), { dryRun: true, now: NOW, env: {}, fetchFn })).rejects.toThrow("Missing env var GITHUB_TOKEN");
  });
});

describe("postToSlack", () => {
  it("refuses non-Slack URLs", async () => {
    await expect(postToSlack("https://evil.example.com/hook", { text: "x", blocks: [] })).rejects.toThrow(/hooks.slack.com/);
  });

  it("does not print the webhook URL on failure", async () => {
    const fetchFn = async () => new Response("invalid_payload", { status: 400 });
    const err = await postToSlack(WEBHOOK, { text: "x", blocks: [] }, fetchFn).catch((e: Error) => e);
    expect(String(err)).toContain("Slack post failed: 400 invalid_payload");
    expect(String(err)).not.toContain("secret");
  });
});

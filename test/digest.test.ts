import { describe, expect, it } from "vitest";
import { buildDigest } from "../src/core/digest.js";
import { toSlack, toText } from "../src/core/render.js";
import { collect } from "../src/run.js";
import { fakeFetch, fixture, NOW, testConfig } from "./helpers.js";

const routes = {
  "https://api.github.com/graphql": fixture("github-repo.json"),
  "https://acme.atlassian.net/rest/api/3/status": fixture("jira-statuses.json"),
  "https://acme.atlassian.net/rest/api/3/search/jql": fixture("jira-search.json"),
};
const env = { GITHUB_TOKEN: "t", JIRA_EMAIL: "e", JIRA_API_TOKEN: "j" };

async function digest() {
  const config = testConfig();
  const { fetchFn } = fakeFetch(routes);
  return { config, digest: buildDigest(await collect(config, NOW, env, fetchFn), config, NOW) };
}

describe("digest from recorded data", () => {
  it("matches the expected terminal output", async () => {
    const { digest: d } = await digest();
    await expect(toText(d)).toMatchFileSnapshot("fixtures/expected-digest.txt");
  });

  it("lists blockers high first, oldest first", async () => {
    const { digest: d } = await digest();
    expect(d.blockers.map((b) => `${b.rule} ${b.title}`)).toEqual([
      "ci-red main CI red (e2e)",
      'review-wait PR #42 "Checkout retry"',
      'ci-red PR #44 "Fix flaky payment test"',
      'ticket-stuck FS-118 "Payment webhook"',
      'changes-stale PR #40 "Order history page"',
      'pr-too-big PR #46 "New design tokens"',
    ]);
  });

  it("builds each person's standup from data", async () => {
    const { digest: d } = await digest();
    const byName = Object.fromEntries(d.people.map((p) => [p.name, p]));
    expect(byName.Asha).toEqual({
      name: "Asha",
      yesterday: ["merged #39", "FS-120 → In Review"],
      today: ["#42 Checkout retry", "review #46", "FS-120 Coupon field"],
    });
    expect(byName.Rohit!.yesterday).toEqual(["2 commits on #44", "FS-121 → Done"]);
    expect(byName.Vikram!.yesterday).toEqual(["reviewed #39"]);
    expect(byName.Meera!.yesterday).toEqual(["opened #46, #48"]);
    expect(byName.Meera!.today).toEqual(["#46 New design tokens", "#48 Spike: offline cart (draft)", "FS-118 Payment webhook"]);
  });

  it("renders Slack blocks with mentions and escaped text", async () => {
    const { config, digest: d } = await digest();
    d.people[0]!.today.push("fix <script> & stuff");
    const msg = toSlack(d, config);
    const json = JSON.stringify(msg.blocks);
    expect(msg.text).toBe("Standup 2026-10-29: 6 blocker(s)");
    expect(json).toContain("<https://github.com/acme/web/pull/42|PR #42 \\\"Checkout retry\\\">: waiting for review 56h → <@U01VIK>");
    expect(json).toContain("fix &lt;script&gt; &amp; stuff");
  });

  it("says when there are no blockers", () => {
    const config = testConfig();
    const msg = toSlack({ date: "2026-10-29", blockers: [], people: [] }, config);
    expect(JSON.stringify(msg.blocks)).toContain("No blockers found");
  });
});

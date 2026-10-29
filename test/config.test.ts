import { describe, expect, it } from "vitest";
import { parseConfig } from "../src/config.js";

describe("parseConfig", () => {
  it("fills in default rules and env names", () => {
    const c = parseConfig("repos: [acme/web]\nteam:\n  - { name: Asha, github: asha-dev }\n");
    expect(c.timezone).toBe("UTC");
    expect(c.rules["review-wait"].hours).toBe(24);
    expect(c.rules["ticket-stuck"].days).toBe(3);
    expect(c.rules["pr-too-big"].lines).toBe(800);
    expect(c.slack.webhookEnv).toBe("SLACK_WEBHOOK_URL");
    expect(c.githubTokenEnv).toBe("GITHUB_TOKEN");
  });

  it("keeps custom thresholds", () => {
    const c = parseConfig("repos: [a/b]\nteam: [{ name: A, github: a }]\nrules:\n  review-wait: { hours: 8 }\n");
    expect(c.rules["review-wait"].hours).toBe(8);
    expect(c.rules["changes-stale"].hours).toBe(48);
  });

  it("explains what is wrong", () => {
    expect(() => parseConfig("repos: [not-a-repo]\nteam: []\n")).toThrow(/repos.0: use owner\/name[\s\S]*team/);
  });

  it("checks the tracker type", () => {
    expect(() => parseConfig("repos: [a/b]\nteam: [{ name: A, github: a }]\ntracker: { type: trello }\n")).toThrow(/tracker/);
  });
});

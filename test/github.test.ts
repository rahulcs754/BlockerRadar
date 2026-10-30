import { describe, expect, it } from "vitest";
import { fetchGithub, toCi } from "../src/sources/github.js";
import { fakeFetch, fixture } from "./helpers.js";

describe("fetchGithub", () => {
  it("sends one GraphQL query per repo with the merged-since search", async () => {
    const { fetchFn, calls } = fakeFetch({ "https://api.github.com/graphql": fixture("github-repo.json") });
    await fetchGithub(["acme/web"], "ghp_secret", new Date("2026-10-28T04:00:00Z"), fetchFn);

    expect(calls).toHaveLength(1);
    const headers = calls[0]!.init!.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer ghp_secret");
    const body = JSON.parse(String(calls[0]!.init!.body));
    expect(body.variables).toEqual({ owner: "acme", name: "web", merged: "repo:acme/web is:pr is:merged merged:>=2026-10-28T04:00:00Z" });
  });

  it("normalizes PRs and the default branch", async () => {
    const { fetchFn } = fakeFetch({ "https://api.github.com/graphql": fixture("github-repo.json") });
    const { pulls, branches } = await fetchGithub(["acme/web"], "t", new Date("2026-10-28T04:00:00Z"), fetchFn);

    expect(pulls.map((p) => p.number)).toEqual([42, 44, 40, 46, 47, 48, 39]);
    const p42 = pulls.find((p) => p.number === 42)!;
    expect(p42).toMatchObject({ author: "asha-dev", state: "open", readyAt: "2026-10-26T20:00:00Z", reviewRequests: ["vikram-dev"], ci: "success" });
    expect(pulls.find((p) => p.number === 44)!.ci).toBe("failure");
    expect(pulls.find((p) => p.number === 39)!.state).toBe("merged");
    expect(pulls.find((p) => p.number === 47)!.commits[0]!.author).toBeNull();

    expect(branches).toEqual([
      {
        repo: "acme/web",
        branch: "main",
        ci: "failure",
        failing: ["e2e"],
        commitAuthor: "rohit-dev",
        commitDate: "2026-10-29T02:40:00Z",
        url: "https://github.com/acme/web/commit/abc123",
      },
    ]);
  });

  it("fails clearly on GraphQL errors", async () => {
    const { fetchFn } = fakeFetch({ "https://api.github.com/graphql": { errors: [{ message: "Could not resolve to a Repository" }] } });
    await expect(fetchGithub(["acme/nope"], "t", new Date(), fetchFn)).rejects.toThrow(/acme\/nope: Could not resolve/);
  });

  it("does not put the token in HTTP errors", async () => {
    const { fetchFn } = fakeFetch({});
    const err = await fetchGithub(["acme/web"], "ghp_secret", new Date(), fetchFn).catch((e: Error) => e);
    expect(String(err)).toMatch(/GitHub request failed: 404/);
    expect(String(err)).not.toContain("ghp_secret");
  });

  it("maps rollup states", () => {
    expect(toCi("ERROR")).toBe("failure");
    expect(toCi("EXPECTED")).toBe("pending");
    expect(toCi(undefined)).toBeNull();
  });
});

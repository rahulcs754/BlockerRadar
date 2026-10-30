import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseConfig } from "../src/config.js";
import type { FetchLike } from "../src/sources/http.js";

export const NOW = new Date("2026-10-29T04:00:00Z"); // Thursday 09:30 IST

export function fixture<T = unknown>(name: string): T {
  return JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8")) as T;
}

export function testConfig() {
  return parseConfig(readFileSync(fileURLToPath(new URL("./fixtures/blockerradar.yml", import.meta.url)), "utf8"));
}

export interface Call { url: string; init?: RequestInit }

/** Fake fetch: answers from recorded fixtures by URL, records every call. */
export function fakeFetch(routes: Record<string, unknown>): { fetchFn: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  const fetchFn: FetchLike = async (url, init) => {
    calls.push({ url, init });
    const key = Object.keys(routes).find((k) => url.startsWith(k));
    if (!key) return new Response("not found", { status: 404, statusText: "Not Found" });
    return new Response(JSON.stringify(routes[key]), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  return { fetchFn, calls };
}

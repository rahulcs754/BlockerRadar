import type { Config } from "./config.js";
import { buildDigest, WINDOW_HOURS } from "./core/digest.js";
import { subtractWorkingHours } from "./core/clock.js";
import { toSlack, toText } from "./core/render.js";
import { postToSlack } from "./slack.js";
import { fetchGithub } from "./sources/github.js";
import type { FetchLike } from "./sources/http.js";
import { fetchJira } from "./sources/jira.js";
import { fetchLinear } from "./sources/linear.js";
import type { Digest, Snapshot, WorkItem } from "./types.js";

export interface RunOptions {
  dryRun: boolean;
  now?: Date;
  env?: NodeJS.ProcessEnv;
  fetchFn?: FetchLike;
}

function need(env: NodeJS.ProcessEnv, name: string): string {
  const v = env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

export async function collect(config: Config, now: Date, env: NodeJS.ProcessEnv, fetchFn: FetchLike): Promise<Snapshot> {
  const since = subtractWorkingHours(now, WINDOW_HOURS, config.timezone);
  const { pulls, branches } = await fetchGithub(config.repos, need(env, config.githubTokenEnv), since, fetchFn);

  let items: WorkItem[] = [];
  const t = config.tracker;
  if (t?.type === "jira") {
    items = await fetchJira(
      { baseUrl: t.baseUrl, project: t.project, email: need(env, t.emailEnv), token: need(env, t.tokenEnv), team: config.team },
      fetchFn,
    );
  } else if (t?.type === "linear") {
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    items = await fetchLinear({ team: t.team, token: need(env, t.tokenEnv), members: config.team, since: weekAgo }, fetchFn);
  }
  return { pulls, branches, items };
}

export async function run(config: Config, opts: RunOptions): Promise<{ digest: Digest; text: string; posted: boolean }> {
  const now = opts.now ?? new Date();
  const env = opts.env ?? process.env;
  const fetchFn = opts.fetchFn ?? fetch;

  const snapshot = await collect(config, now, env, fetchFn);
  const digest = buildDigest(snapshot, config, now);
  const text = toText(digest);

  if (opts.dryRun) return { digest, text, posted: false };
  await postToSlack(need(env, config.slack.webhookEnv), toSlack(digest, config), fetchFn);
  return { digest, text, posted: true };
}

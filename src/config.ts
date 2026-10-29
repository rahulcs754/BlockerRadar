import { readFile } from "node:fs/promises";
import { parse } from "yaml";
import { z } from "zod";

const member = z.object({
  name: z.string().min(1),
  github: z.string().min(1),
  /** Jira email or accountId, or Linear email. */
  tracker: z.string().optional(),
  slack: z.string().optional(),
});

const tracker = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("jira"),
    baseUrl: z.string().url(),
    project: z.string().min(1),
    emailEnv: z.string().default("JIRA_EMAIL"),
    tokenEnv: z.string().default("JIRA_API_TOKEN"),
  }),
  z.object({
    type: z.literal("linear"),
    team: z.string().min(1),
    tokenEnv: z.string().default("LINEAR_API_KEY"),
  }),
]);

export const configSchema = z.object({
  timezone: z.string().default("UTC"),
  repos: z.array(z.string().regex(/^[\w.-]+\/[\w.-]+$/, "use owner/name")).min(1),
  tracker: tracker.optional(),
  team: z.array(member).min(1),
  rules: z
    .object({
      "review-wait": z.object({ hours: z.number().positive().default(24) }).default({}),
      "ci-red": z.object({ enabled: z.boolean().default(true) }).default({}),
      "changes-stale": z.object({ hours: z.number().positive().default(48) }).default({}),
      "ticket-stuck": z.object({ days: z.number().positive().default(3) }).default({}),
      "pr-too-big": z.object({ lines: z.number().int().positive().default(800) }).default({}),
    })
    .default({}),
  slack: z.object({ webhookEnv: z.string().default("SLACK_WEBHOOK_URL") }).default({}),
  githubTokenEnv: z.string().default("GITHUB_TOKEN"),
});

export type Config = z.infer<typeof configSchema>;
export type Member = z.infer<typeof member>;

export function parseConfig(text: string): Config {
  const result = configSchema.safeParse(parse(text));
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`);
    throw new Error(`Invalid config:\n${lines.join("\n")}`);
  }
  return result.data;
}

export async function loadConfig(path: string): Promise<Config> {
  return parseConfig(await readFile(path, "utf8"));
}

#!/usr/bin/env node
import { Command } from "commander";
import { loadConfig } from "./config.js";
import { run } from "./run.js";

const program = new Command()
  .name("blockerradar")
  .description("Draft the team standup from GitHub + Jira/Linear and post blockers to Slack")
  .option("-c, --config <path>", "config file", "blockerradar.yml")
  .option("--dry-run", "print the digest, do not post to Slack", false)
  .option("--json", "print the digest as JSON", false)
  .option("--now <iso>", "pretend it is this time (for testing)")
  .action(async (opts: { config: string; dryRun: boolean; json: boolean; now?: string }) => {
    const config = await loadConfig(opts.config);
    const now = opts.now ? new Date(opts.now) : undefined;
    if (now && Number.isNaN(now.getTime())) throw new Error(`Bad --now value: ${opts.now}`);
    const result = await run(config, { dryRun: opts.dryRun, now });
    console.log(opts.json ? JSON.stringify(result.digest, null, 2) : result.text);
    if (result.posted) console.log("\nPosted to Slack.");
  });

program.parseAsync().catch((err: unknown) => {
  console.error(`blockerradar: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});

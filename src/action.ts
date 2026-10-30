import { appendFileSync } from "node:fs";
import { loadConfig } from "./config.js";
import { run } from "./run.js";

/** GitHub passes action inputs as INPUT_<NAME> env vars. */
function input(name: string, fallback: string): string {
  return process.env[`INPUT_${name.toUpperCase()}`]?.trim() || fallback;
}

async function main(): Promise<void> {
  const config = await loadConfig(input("config", "blockerradar.yml"));
  // The github-token input fills the token env var when the workflow did not set it.
  const token = input("github-token", "");
  if (token && !process.env[config.githubTokenEnv]) process.env[config.githubTokenEnv] = token;
  const dryRun = input("dry-run", "false") === "true";
  const result = await run(config, { dryRun });

  console.log(result.text);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\`\`\`\n${result.text}\n\`\`\`\n`);
  }
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `blockers=${result.digest.blockers.length}\n`);
  }
}

main().catch((err: unknown) => {
  console.log(`::error::${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});

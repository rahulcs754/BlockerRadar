# BlockerRadar

[![CI](https://github.com/rahulcs754/BlockerRadar/actions/workflows/ci.yml/badge.svg)](https://github.com/rahulcs754/BlockerRadar/actions/workflows/ci.yml)

A bot that **writes your team's standup for you** from GitHub and Jira/Linear data, and **finds blockers before anyone says them out loud**. It posts one short Slack digest every morning.

Website: https://rahulcs754.github.io/BlockerRadar/

```
Standup · 2026-10-29

Blockers (6)
  !! main CI red (e2e): default branch is failing → Rohit
  !! PR #42 "Checkout retry": waiting for review 56h → Vikram
  !! PR #44 "Fix flaky payment test": CI failing (last push 16h ago) → Rohit
   ! FS-118 "Payment webhook": In Progress for 4 working days → Meera
   ! PR #40 "Order history page": changes requested 70h ago, no new commits → Vikram
   ! PR #46 "New design tokens": 1000 lines changed, hard to review; think about splitting it → Meera

Standup
  Asha: merged #39 · FS-120 → In Review
    today: #42 Checkout retry · review #46 · FS-120 Coupon field
  Rohit: 2 commits on #44 · FS-121 → Done
    today: #44 Fix flaky payment test
```

## Why use it
- **Shorter standups.** Everyone already sees what was done. The meeting is only for blockers.
- **Blockers come out on day 1, not day 4.** A PR waiting 2 days for review or a red `main` shows up with a link and a name.
- **Nobody has to type an update.** Unlike Geekbot or Standuply, it reads the data.
- **Fair to remote teams.** Wait time counts only working days in your timezone, so Monday is not full of fake alarms.
- **Free and self-hosted.** Runs as a GitHub Action. Read-only on GitHub and Jira/Linear. The only write is the Slack post.

## What it checks

| Rule | Flags when | Default | Who is named |
|---|---|---|---|
| `ci-red` | default branch or an open PR is failing CI | on | last committer / PR author |
| `review-wait` | PR is ready but has no review | 24 working hours | requested reviewers |
| `changes-stale` | changes requested, no new commit since | 48 working hours | PR author |
| `ticket-stuck` | ticket is "in progress" in the same status | 3 working days | assignee |
| `pr-too-big` | PR is not approved and is very large (warning) | 800 lines | PR author |

Each PR gets at most one blocker (the most useful one). Bot PRs (authors not in `team`) are skipped.

## How to use it

### 1. Get the tokens
1. **GitHub:** create a [fine-grained token](https://github.com/settings/personal-access-tokens/new) with read access to your repos: *Contents*, *Pull requests*, *Commit statuses*, *Checks*: **Read-only**.
2. **Slack:** create an [incoming webhook](https://api.slack.com/messaging/webhooks) for the channel that should get the digest.
3. **Jira (optional):** an [API token](https://id.atlassian.com/manage-profile/security/api-tokens) and the email of the account that owns it.
   **Linear (optional):** a personal [API key](https://linear.app/settings/account/security).

### 2. Add the config
Copy [`examples/blockerradar.yml`](examples/blockerradar.yml) to the root of the repo that will run the workflow, and fill in your repos and team. Each person needs a `github` login; add `tracker` (Jira/Linear email) and `slack` (member id) to get ticket lines and @mentions.

### 3. Try it locally
```bash
git clone https://github.com/rahulcs754/BlockerRadar && cd BlockerRadar
npm ci && npm run build
export GITHUB_TOKEN=github_pat_...   # plus JIRA_EMAIL / JIRA_API_TOKEN or LINEAR_API_KEY
node dist/cli.js --config /path/to/blockerradar.yml --dry-run
```
`--dry-run` prints the digest and posts nothing. Add `--json` to see the raw data. Remove `--dry-run` and set `SLACK_WEBHOOK_URL` to post.

### 4. Run it every morning
Add the secrets (`BLOCKERRADAR_GITHUB_TOKEN`, `SLACK_WEBHOOK_URL`, and the Jira/Linear ones) under **Settings → Secrets and variables → Actions**, then copy [`examples/standup.yml`](examples/standup.yml) to `.github/workflows/standup.yml`. It runs at 09:30 IST on weekdays; change the cron for your timezone. Use **Run workflow** to test it once with `dry-run: true`.

## How it works
1. **Collect:** one GitHub GraphQL query per repo (open PRs, PRs merged in the window, default branch checks), plus Jira REST or Linear GraphQL for tickets.
2. **Standup:** for the last 24 working hours, per person: merged, opened, reviewed, commits, tickets moved. "Today" is open PRs, review requests and in-progress tickets.
3. **Blockers:** the rules above, pure functions with a fixed clock in tests.
4. **Post:** one Slack Block Kit message. Blockers first, then one line per person.

Code: `src/sources/` fetch and normalize, `src/core/` is pure logic, `src/cli.ts` and `src/action.ts` are the entry points.

## Develop
```bash
npm ci
npm test          # vitest, uses recorded API responses, no network
npm run typecheck
npm run build     # bundles dist/ (committed, the Action runs it)
```

## License
MIT

# BlockerRadar

A bot that **writes your team's standup for you** from GitHub and Jira/Linear data, and **finds blockers before anyone says them out loud**. It posts one short Slack digest every morning.

> Status: planning. See [docs/MVP-PLAN.md](docs/MVP-PLAN.md).

## Why
- Standups eat 15-30 minutes a day, and most of it is people reading what is already in GitHub and Jira.
- Real blockers stay hidden: a PR waits 3 days for review, CI is red on main, a ticket sits "In Progress" for a week.
- Async standup bots (Geekbot, Standuply) still ask people to type. They do not read the data.

## What it will do
- Draft "Yesterday / Today" per person from merged PRs, commits, reviews and ticket moves
- Detect blockers from data: PR waiting for review, red CI, PR with changes requested and no update, ticket stuck too long
- Post one Slack digest: blockers first, then one line per person
- Run as a GitHub Action on a schedule, or as a CLI (`npx blockerradar`)

## Planned flow
1. Add `blockerradar.yml` with your repos, team and rules
2. Add tokens as secrets: `GITHUB_TOKEN`, `SLACK_WEBHOOK_URL`, and `JIRA_*` or `LINEAR_API_KEY`
3. Run `npx blockerradar --dry-run` to see the digest in the terminal
4. Add the scheduled workflow; the digest lands in Slack every weekday morning

# BlockerRadar: MVP plan

**One line:** A scheduled bot that reads GitHub + Jira/Linear, writes each person's standup, flags blockers, and posts one Slack digest.

## How it works
1. **Collect** (last 24 working hours, team timezone):
   - GitHub: PRs opened/merged/reviewed, commits, review requests, CI status on PR heads and default branch.
   - Jira or Linear: tickets each person moved, commented on, or has in progress.
2. **Standup per person:**
   - *Yesterday:* merged PRs, reviews given, tickets moved to Done/Review.
   - *Today:* open PRs and in-progress tickets assigned to them.
3. **Blocker rules** (each has a threshold in config):
   - `review-wait`: PR ready for review with no review for > 24 working hours
   - `ci-red`: PR head or default branch failing
   - `changes-stale`: changes requested, no new commit for > 48h
   - `ticket-stuck`: ticket in the same status for > 3 working days
   - `pr-too-big`: PR > 800 changed lines waiting for review (soft warning)
4. **Digest:** Slack Block Kit message. Blockers first (with reason, age, link, and who can unblock), then one line per person. Thread replies hold the full details.
5. **Run:** GitHub Action on cron (e.g. 9:30 IST weekdays) or `npx blockerradar`.

## Example digest
```
🚧 Blockers (3)
• PR #42 "Checkout retry" waiting for review 52h → @asha, @vikram
• main CI red since 08:10 (build: e2e) → last commit by @rohit
• FS-118 "Payment webhook" In Progress 5 days → @meera

👥 Standup
• Asha: merged #39, reviewed #40 · today: #42, FS-120
• Rohit: 4 commits on #44 · today: fix main CI
```

## Config: `blockerradar.yml`
```yaml
timezone: Asia/Kolkata
repos: [acme/web, acme/api]
tracker: { type: jira, baseUrl: https://acme.atlassian.net, project: FS }
team:
  - { name: Asha, github: asha-dev, jira: asha@acme.com, slack: U012ABC }
rules:
  review-wait: { hours: 24 }
  ticket-stuck: { days: 3 }
slack: { webhookEnv: SLACK_WEBHOOK_URL }
```

## Stack
Node 22, TypeScript, ESM, commander, zod, vitest. Plain `fetch` (GitHub GraphQL, Jira REST v3, Linear GraphQL, Slack webhook). No AI in the MVP. Optional later: Claude turns raw lines into a friendlier summary.

## Build order (~2 weeks)
1. Config schema + types + working-hours clock helper (with tests)
2. GitHub source + recorded fixtures
3. Blocker rules + standup builder (pure, fully tested)
4. Slack Block Kit renderer + `--dry-run` terminal output
5. Jira source, then Linear source
6. GitHub Action (`action.yml`, bundled `dist/`), example workflow, README + GitHub Pages page

## Later
- Slack app with `/standup` and "I'm blocked" button
- Weekly trend (avg review wait), without per-person ranking
- Microsoft Teams webhook

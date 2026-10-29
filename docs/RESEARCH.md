# Research notes (Oct 2026)

From round 3 idea research (team workflow tools: standups).

## The problem
- Daily standups take 15-30 min for the whole team. Most updates repeat what GitHub and Jira already show.
- People do not like to say "I'm blocked". Blockers come out late, often days later.
- Remote and cross-timezone teams (common in India service and product teams) run async standups that people forget to fill in.
- AI coding tools make more PRs, so review queues and waiting time grow.

## Nearby tools
- **Geekbot / Standuply / DailyBot**: async standup in Slack. People still type answers. Little or no data reading.
- **LinearB / Swarmia / Jellyfish**: engineering metrics dashboards. Paid, manager-focused, heavy setup.
- **GitHub "Scheduled reminders"**: pings about pending reviews only. No standup, no Jira, no CI.
- **Jira / Linear Slack apps**: notify on every change. Noisy, not a summary.

**Gap:** a small, free, self-hosted tool that reads the data, writes the standup, and points at real blockers with a reason and a link, in one message.

## Risks
- Noise: too many "blockers" and people mute it. Keep thresholds configurable and the digest short.
- Identity mapping: GitHub login vs Jira account vs Slack user. Needs a simple `team` map in config.
- Feels like surveillance if framed badly. Frame it as "save time, unblock faster"; no rankings, no scores.

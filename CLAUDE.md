# CLAUDE.md

## Project
BlockerRadar: a TypeScript CLI + GitHub Action that drafts a daily standup per person from GitHub + Jira/Linear data, detects blockers from that data, and posts one Slack digest. Plan: docs/MVP-PLAN.md. Research: docs/RESEARCH.md.

## Stack
Node 22, ESM, TypeScript strict. commander, zod (config), vitest. Plain `fetch` for GitHub GraphQL, Jira REST, Linear GraphQL, Slack webhook. tsup/ncc bundle for the Action. No AI in the MVP.

## Layout
- `src/sources/`: GitHub, Jira, Linear fetchers. Each returns normalized `Activity[]` and `WorkItem[]`.
- `src/core/`: pure logic (activity -> standup lines, items -> blockers, digest -> Slack blocks). No network here.
- `src/cli.ts`, `src/action.ts`: entry points.

## Rules
- Blockers come from data only, with the reason and a link (e.g. "PR #42 waiting for review 52h"). Never guess.
- Every blocker rule has unit tests with fixed clock and fixture data.
- Business hours: count wait time in working hours (team timezone, skip weekends), so Monday mornings do not look red.
- Tokens come from env vars only. Never log them. Tests use recorded API responses, no network.
- Read-only on GitHub/Jira/Linear. The only write is the Slack post.
- `--dry-run` prints the digest and posts nothing.

## Commands
- `npm test`, `npm run typecheck`, `npm run build` (commit `dist/`), `npm run dev -- --dry-run`

## Owner
Senior React/Next.js dev, India. Wants short, simple English and a clean portfolio-grade repo.

import type { Config } from "../config.js";
import type { Blocker, Digest, PersonStandup } from "../types.js";

/** Slack mrkdwn needs &, < and > escaped in text. */
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function slackOwner(name: string, config: Config): string {
  const m = config.team.find((t) => t.name === name);
  return m?.slack ? `<@${m.slack}>` : esc(name);
}

function slackBlocker(b: Blocker, config: Config): string {
  const icon = b.severity === "high" ? "🔴" : "🟡";
  const owners = b.owners.length ? ` → ${b.owners.map((o) => slackOwner(o, config)).join(", ")}` : "";
  return `${icon} <${b.url}|${esc(b.title)}>: ${esc(b.reason)}${owners}`;
}

function personLine(p: PersonStandup): { did: string; next: string } {
  return {
    did: p.yesterday.length ? p.yesterday.join(" · ") : "no activity found",
    next: p.today.length ? p.today.join(" · ") : "nothing open",
  };
}

export interface SlackMessage {
  text: string;
  blocks: unknown[];
}

const MAX_BLOCKERS = 10;

export function toSlack(digest: Digest, config: Config): SlackMessage {
  const blocks: unknown[] = [
    { type: "header", text: { type: "plain_text", text: `Standup · ${digest.date}` } },
  ];

  if (digest.blockers.length) {
    const shown = digest.blockers.slice(0, MAX_BLOCKERS).map((b) => slackBlocker(b, config));
    const more = digest.blockers.length - shown.length;
    if (more > 0) shown.push(`_…and ${more} more_`);
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*🚧 Blockers (${digest.blockers.length})*\n${shown.join("\n")}` },
    });
  } else {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: "*✅ No blockers found*" } });
  }

  blocks.push({ type: "divider" });
  const people = digest.people.map((p) => {
    const { did, next } = personLine(p);
    return `*${esc(p.name)}*: ${esc(did)}\n    _today:_ ${esc(next)}`;
  });
  blocks.push({ type: "section", text: { type: "mrkdwn", text: `*👥 Standup*\n${people.join("\n")}` } });
  blocks.push({
    type: "context",
    elements: [{ type: "mrkdwn", text: "Drafted by BlockerRadar from GitHub and tracker data. Reply in thread to add context." }],
  });

  const text = `Standup ${digest.date}: ${digest.blockers.length} blocker(s)`;
  return { text, blocks };
}

export function toText(digest: Digest): string {
  const out: string[] = [`Standup · ${digest.date}`, ""];
  if (digest.blockers.length) {
    out.push(`Blockers (${digest.blockers.length})`);
    for (const b of digest.blockers) {
      const owners = b.owners.length ? ` → ${b.owners.join(", ")}` : "";
      out.push(`  ${b.severity === "high" ? "!!" : " !"} ${b.title}: ${b.reason}${owners}`);
      out.push(`     ${b.url}`);
    }
  } else {
    out.push("No blockers found");
  }
  out.push("", "Standup");
  for (const p of digest.people) {
    const { did, next } = personLine(p);
    out.push(`  ${p.name}: ${did}`, `    today: ${next}`);
  }
  return out.join("\n");
}

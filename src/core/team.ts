import type { Member } from "../config.js";
import type { PullRequest } from "../types.js";

export class Team {
  constructor(readonly members: Member[]) {}

  byGithub(login: string | null | undefined): Member | undefined {
    if (!login) return undefined;
    const l = login.toLowerCase();
    return this.members.find((m) => m.github.toLowerCase() === l);
  }

  byTracker(id: string | null | undefined): Member | undefined {
    if (!id) return undefined;
    const l = id.toLowerCase();
    return this.members.find((m) => m.tracker?.toLowerCase() === l);
  }

  /** Names for GitHub logins that are on the team, unknown logins are kept as is. */
  namesForLogins(logins: string[]): string[] {
    return logins.map((l) => this.byGithub(l)?.name ?? l);
  }
}

/** "#42", or "web#42" when the digest covers more than one repo. */
export function prRef(pr: PullRequest, multiRepo: boolean): string {
  return multiRepo ? `${pr.repo.split("/")[1]}#${pr.number}` : `#${pr.number}`;
}

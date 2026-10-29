import type { SlackMessage } from "./core/render.js";
import type { FetchLike } from "./sources/http.js";

export async function postToSlack(webhookUrl: string, message: SlackMessage, fetchFn: FetchLike = fetch): Promise<void> {
  if (!webhookUrl.startsWith("https://hooks.slack.com/")) {
    throw new Error("Slack webhook URL must start with https://hooks.slack.com/");
  }
  const res = await fetchFn(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message),
  });
  // Do not print the URL: the webhook URL is a secret.
  if (!res.ok) throw new Error(`Slack post failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
}

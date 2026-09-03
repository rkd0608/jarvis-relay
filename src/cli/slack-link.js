import fs from "node:fs";
import * as p from "@clack/prompts";
import { WebClient } from "@slack/web-api";
import { pc } from "./ui.js";

export const SLACK_MANIFEST = `display_information:
  name: Jarvis
  description: Your team's AI build agent
  background_color: "#0d1526"
features:
  bot_user:
    display_name: jarvis
    always_online: true
oauth_config:
  scopes:
    bot:
      - app_mentions:read
      - channels:history
      - chat:write
      - files:read
      - groups:history
      - im:history
      - im:read
      - mpim:history
socket_mode:
  enabled: true
settings:
  event_config:
    event_subscriptions:
      bot_events:
        - message.channels
        - message.groups
        - message.im
        - message.mpim
  org_deploy_permissions:
    enabled: false
  token_rotation_checks:
    enabled: true
`;

export async function runSlackLink(config, { save } = {}) {
  p.log.step("Linking Slack — 4 steps, ~2 minutes");

  p.note(
    [
      "1. Open  " +
        pc.cyan("https://api.slack.com/apps") +
        "  →  Create New App",
      "2. Choose  " + pc.bold("From an app manifest") +
        "  →  pick your workspace",
      "3. Replace the YAML with the manifest saved to  " +
        pc.cyan("slack-app-manifest.yml") +
        "  (printed below)",
      "4. Create → Install to Workspace → copy the  " +
        pc.bold("Bot Token (xoxb-…)"),
      "5. Then:  " + pc.bold("Socket Mode") + "  in the sidebar → create an " +
        pc.bold("app-level token (xapp-…)") +
        "  with connections:write",
    ].join("\n"),
    "Create the Slack app"
  );

  fs.writeFileSync("slack-app-manifest.yml", SLACK_MANIFEST);
  console.log(pc.dim(SLACK_MANIFEST));

  const botToken = await p.text({
    message: "Bot token (starts with xoxb-)",
    validate: (v) =>
      /^xoxb-/.test(v || "") ? undefined : "must start with xoxb-",
  });
  if (p.isCancel(botToken)) p.cancel("Cancelled.");

  const s = p.spinner();
  s.start("Validating bot token…");
  let botUserId;
  try {
    const client = new WebClient(botToken);
    const auth = await client.auth.test();
    botUserId = auth.user_id;
    s.stop(`Validated — bot user ${botUserId} in workspace ${auth.team}`);
  } catch (err) {
    s.stop(`Token invalid: ${err.message}`);
    p.outro("Fix the token and re-run `jarvis slack`.");
    process.exit(1);
  }

  const appToken = await p.text({
    message: "App-level token for Socket Mode (starts with xapp-)",
    validate: (v) =>
      /^xapp-/.test(v || "") ? undefined : "must start with xapp-",
  });
  if (p.isCancel(appToken)) p.cancel("Cancelled.");

  config.slack = { botToken, appToken, botUserId };
  if (save !== false) {
    fs.writeFileSync("jarvis.config.json", JSON.stringify(config, null, 2) + "\n");
    p.log.success("Slack config saved to jarvis.config.json");
  }

  p.note(
    [
      "Last step in Slack: invite the bot into a channel or thread you want it in:",
      "",
      `  ${pc.cyan("/invite @jarvis")}`,
      "",
      `Then send ${pc.cyan("@jarvis id")} in that channel and paste the id into`,
      `an agent's ${pc.bold("groups")} in jarvis.config.json, and restart.`,
    ].join("\n"),
    "Invite Jarvis"
  );

  return config;
}

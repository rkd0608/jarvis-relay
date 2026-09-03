import * as p from "@clack/prompts";
import { header, kv, pc } from "./ui.js";
import { checkClaude, checkCodex, checkNode, whatsappLinked } from "./env-checks.js";

export async function runDoctor() {
  p.intro(header());

  const node = checkNode();
  p.log.info(pc.bold("Environment"));
  console.log(kv("Node.js", `v${node.version}`, node.ok));

  p.log.info(pc.bold("Coding agent backends"));
  const s = p.spinner();
  s.start("Checking Claude Code CLI…");
  const claude = await checkClaude();
  s.stop(`Claude Code: ${claude.detail}`);
  console.log(kv("claude-code backend", claude.detail, claude.installed && claude.authed));

  s.start("Checking Codex CLI…");
  const codex = await checkCodex();
  s.stop(`Codex: ${codex.detail}`);
  console.log(kv("codex backend", codex.detail, codex.installed && codex.authed));

  p.log.info(pc.bold("WhatsApp session"));
  const linked = whatsappLinked();
  console.log(
    kv(
      "baileys session",
      linked ? "linked (credentials on disk)" : "not linked yet — first start shows a QR",
      linked
    )
  );

  p.log.info(pc.bold("Slack"));
  try {
    const { loadConfig } = await import("../config.js");
    const cfg = await loadConfig();
    if (cfg.slack?.botToken) {
      const s2 = p.spinner();
      s2.start("Validating Slack bot token…");
      try {
        const { WebClient } = await import("@slack/web-api");
        const auth = await new WebClient(cfg.slack.botToken).auth.test();
        s2.stop(`Validated — bot user ${auth.user_id} in workspace ${auth.team}`);
        console.log(kv("slack", "linked + token valid", true));
      } catch (err) {
        s2.stop(`token invalid: ${err.message}`);
        console.log(kv("slack", "configured but token invalid", false));
      }
    } else {
      console.log(kv("slack", "not configured (optional — `jarvis slack`)", true));
    }
  } catch {
    console.log(kv("slack", "skipped (config invalid)", false));
  }

  p.log.info(pc.bold("Config"));
  try {
    const { loadConfig } = await import("../config.js");
    const config = await loadConfig();
    console.log(
      kv("jarvis.config.json", `valid — agents: ${Object.keys(config.agents).join(", ")}`, true)
    );
  } catch (err) {
    console.log(kv("jarvis.config.json", err.message, false));
  }

  if (!claude.installed) console.log(pc.dim(`\n  tip: ${claude.installHint}`));
  if (claude.installed && !claude.authed) console.log(pc.dim(`  tip: ${claude.loginHint}`));
  if (!codex.installed) console.log(pc.dim(`  tip: ${codex.installHint}`));
  if (codex.installed && !codex.authed) console.log(pc.dim(`  tip: ${codex.loginHint}`));

  p.outro("Doctor done.");
}

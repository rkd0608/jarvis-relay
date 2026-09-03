#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root); // config/state/session resolve from the project dir

const [cmd, ...args] = process.argv.slice(2);

function usage() {
  console.log(`jarvis — WhatsApp ⇄ Claude Code / Codex relay

Usage
  jarvis                 start the bot (runs setup first if unconfigured)
  jarvis setup           interactive onboarding wizard
  jarvis start           start the bot
  jarvis doctor          preflight: node, backends, auth, whatsapp session
  jarvis slack           link a Slack workspace (creates app via manifest)
  jarvis agent list      show agent profiles
  jarvis agent add       add an agent profile
  jarvis agent remove    remove an agent profile
  jarvis --help          this message
  jarvis --version       version
`);
}

async function configExists() {
  return fs.existsSync(path.join(root, "jarvis.config.json"));
}

async function main() {
  if (cmd === "--version" || cmd === "-v") {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    console.log(pkg.version);
    return;
  }
  if (cmd === "--help" || cmd === "-h" || cmd === "help") {
    usage();
    return;
  }

  if (cmd === "doctor") {
    const { runDoctor } = await import("../src/cli/doctor.js");
    await runDoctor();
    return;
  }

  if (cmd === "agent") {
    const { runAgentCmd } = await import("../src/cli/agent-cmd.js");
    await runAgentCmd(args[0], args.slice(1));
    return;
  }

  if (cmd === "slack") {
    const { runSlackLink } = await import("../src/cli/slack-link.js");
    const { loadConfig } = await import("../src/config.js");
    let config;
    try {
      config = await loadConfig();
    } catch (err) {
      // linking Slack on a fresh install — build a minimal config
      config = JSON.parse(fs.readFileSync(path.join(root, "jarvis.config.example.json"), "utf8"));
      config.agents = {};
    }
    await runSlackLink(config);
    return;
  }

  const { runBot } = await import("../src/index.js");
  const { loadConfig } = await import("../src/config.js");
  const { runSetup } = await import("../src/cli/setup.js");

  if (cmd === "setup" || (!(await configExists()) && !cmd)) {
    const config = await runSetup();
    await runBot(config);
    return;
  }

  // default: start (or explicit `start`)
  let config;
  try {
    config = await loadConfig();
  } catch (err) {
    console.error(err.message);
    console.error("Run `jarvis setup` to fix configuration.");
    process.exit(1);
  }
  await runBot(config);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

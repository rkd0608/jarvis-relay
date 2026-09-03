import fs from "node:fs/promises";
import path from "node:path";

const DEFAULTS = {
  botNumber: "",
  inboxDir: "inbox",
  openGroups: false,
  selfTrigger: true,
  agents: {},
};

const APPROVALS = ["read-only", "approve-edits", "full-auto"];
const BACKENDS = ["claude-code", "codex"];

export async function loadConfig(file = "jarvis.config.json") {
  let raw;
  try {
    raw = JSON.parse(await fs.readFile(file, "utf8"));
  } catch (err) {
    throw new Error(`Cannot read ${file}: ${err.message}`);
  }

  const config = { ...DEFAULTS, ...raw };
  config.inboxDir = path.resolve(config.inboxDir);

  if (!config.botNumber || !config.botNumber.endsWith("@c.us")) {
    throw new Error(
      'botNumber must be the bot WhatsApp id in full format, e.g. "15551234567@c.us"'
    );
  }
  const agentNames = Object.keys(config.agents);
  if (!agentNames.length) {
    throw new Error("Define at least one agent in jarvis.config.json");
  }
  for (const name of agentNames) {
    const a = config.agents[name];
    if (!BACKENDS.includes(a.backend)) {
      throw new Error(
        `agent "${name}": backend must be one of ${BACKENDS.join(", ")}`
      );
    }
    if (!a.projectDir) {
      throw new Error(`agent "${name}": projectDir is required`);
    }
    if (a.approval && !APPROVALS.includes(a.approval)) {
      throw new Error(
        `agent "${name}": approval must be one of ${APPROVALS.join(", ")}`
      );
    }
    const stat = await fs.stat(a.projectDir).catch(() => null);
    if (!stat || !stat.isDirectory()) {
      throw new Error(
        `agent "${name}": projectDir does not exist: ${a.projectDir}`
      );
    }
  }

  await fs.mkdir(config.inboxDir, { recursive: true });
  return config;
}

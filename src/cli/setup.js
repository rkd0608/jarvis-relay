import fs from "node:fs";
import path from "node:path";
import * as p from "@clack/prompts";
import { header, pc } from "./ui.js";
import { checkClaude, checkCodex, checkNode } from "./env-checks.js";
import { startWhatsApp } from "../whatsapp.js";

const APPROVALS = [
  {
    value: "approve-edits",
    label: "approve-edits",
    hint: "agent edits files freely, asks before risky shell work — recommended",
  },
  {
    value: "read-only",
    label: "read-only",
    hint: "can read and advise, cannot modify anything",
  },
  {
    value: "full-auto",
    label: "full-auto",
    hint: "no approval prompts at all — only for repos you can afford to lose",
  },
];

const BACKENDS = [
  {
    value: "claude-code",
    label: "Claude Code",
    hint: "Anthropic — best session resume, group-voted permissions",
  },
  {
    value: "codex",
    label: "Codex",
    hint: "OpenAI — non-interactive exec, pre-set sandbox level",
  },
];

const DEFAULT_SYSTEM_PROMPT =
  "You are Jarvis, a build agent receiving tasks from a WhatsApp group. Work autonomously in this repo, verify with tests/builds before claiming done, and keep final summaries short - they are pasted into a group chat.";

async function ensureBackend(name, check, s) {
  if (!check.installed) {
    s.stop(`${name}: not installed`);
    const proceed = await p.confirm({
      message: `Install ${name} globally now? (${check.installHint})`,
      initialValue: true,
    });
    if (p.isCancel(proceed)) p.cancel("Setup cancelled.");
    if (proceed) {
      const i = p.spinner();
      i.start(`Installing ${name}…`);
      try {
        const { execSync } = await import("node:child_process");
        execSync(check.installHint, { stdio: "inherit" });
        i.stop(`${name} installed`);
        return true;
      } catch (err) {
        i.stop(`Install failed — run \`${check.installHint}\` manually later`);
        return false;
      }
    }
    return false;
  }

  if (!check.authed) {
    s.stop(`${name}: not logged in`);
    p.note(
      `Open another terminal and run:\n\n  ${pc.cyan(check.loginHint)}\n\nComplete the login, then come back here.`,
      `${name} login required`
    );
    await p.confirm({ message: "Done logging in? I'll verify." , initialValue: true });
    const s2 = p.spinner();
    s2.start(`Verifying ${name}…`);
    const re = name === "Claude Code" ? await checkClaude() : await checkCodex();
    s2.stop(re.authed ? `${name}: authenticated` : `${name}: still not logged in`);
    return re.authed;
  }

  s.stop(`${name}: installed + authenticated`);
  return true;
}

export async function askProfile(existingNames = [], defaultDir = process.cwd()) {
  const name = await p.text({
    message: "Agent name (used for switching in chat: @jarvis use <name>)",
    placeholder: "jarvis",
    defaultValue: "jarvis",
    validate: (v) => {
      const n = (v || "jarvis").trim();
      if (!/^[a-z0-9_-]+$/i.test(n)) return "letters, numbers, - and _ only";
      if (existingNames.includes(n)) return `profile "${n}" already exists`;
      return undefined;
    },
  });
  if (p.isCancel(name)) p.cancel("Setup cancelled.");

  const backend = await p.select({
    message: "Which coding agent should power it?",
    options: BACKENDS,
  });
  if (p.isCancel(backend)) p.cancel("Setup cancelled.");

  const projectDir = await p.text({
    message: "Project directory (the repo this agent works in)",
    placeholder: defaultDir,
    defaultValue: defaultDir,
    validate: (v) => {
      const d = path.resolve((v || defaultDir).trim());
      try {
        if (!fs.statSync(d).isDirectory()) return "not a directory";
      } catch {
        return "directory does not exist";
      }
      return undefined;
    },
  });
  if (p.isCancel(projectDir)) p.cancel("Setup cancelled.");

  const approval = await p.select({
    message: "Approval level (how much the agent can do without asking)",
    options: APPROVALS,
    initialValue: "approve-edits",
  });
  if (p.isCancel(approval)) p.cancel("Setup cancelled.");

  const systemPrompt = await p.text({
    message: "System prompt (the agent's persona — Enter to accept default)",
    placeholder: DEFAULT_SYSTEM_PROMPT,
    defaultValue: DEFAULT_SYSTEM_PROMPT,
  });
  if (p.isCancel(systemPrompt)) p.cancel("Setup cancelled.");

  const maxTurnsRaw = await p.text({
    message: "Max agent turns per request",
    placeholder: "40",
    defaultValue: "40",
    validate: (v) => {
      const n = Number(v || 40);
      if (!Number.isInteger(n) || n < 1 || n > 200) return "1–200";
      return undefined;
    },
  });
  if (p.isCancel(maxTurnsRaw)) p.cancel("Setup cancelled.");

  const profile = {
    backend,
    projectDir: path.resolve((projectDir || defaultDir).trim()),
    approval,
    maxTurns: Number(maxTurnsRaw || 40),
    systemPrompt: (systemPrompt || DEFAULT_SYSTEM_PROMPT).trim(),
    groups: [],
  };
  return { name: (name || "jarvis").trim(), profile };
}

export async function runSetup() {
  p.intro(header());

  // 1. Node
  const node = checkNode();
  if (!node.ok) {
    p.log.error(`Node.js >= 20 required (you have v${node.version})`);
    p.outro("Install Node 20+ from https://nodejs.org and re-run setup.");
    process.exit(1);
  }
  p.log.success(`Node.js v${node.version}`);

  // 2. Backends (both optional; at least one needed)
  const s = p.spinner();
  s.start("Checking Claude Code CLI…");
  const claude = await checkClaude();
  const claudeOk = await ensureBackend("Claude Code", claude, s);

  s.start("Checking Codex CLI…");
  const codex = await checkCodex();
  const codexOk = await ensureBackend("Codex", codex, s);

  if (!claudeOk && !codexOk) {
    p.log.error("No usable backend — install or log into at least one of Claude Code / Codex.");
    p.outro("Re-run `jarvis setup` when ready.");
    process.exit(1);
  }

  // 3. Agent profiles
  const agents = {};
  let addMore = true;
  while (addMore) {
    const { name, profile } = await askProfile(Object.keys(agents));
    if (!claudeOk && profile.backend === "claude-code") profile.backend = "codex";
    if (!codexOk && profile.backend === "codex") profile.backend = "claude-code";
    agents[name] = profile;
    addMore = await p.confirm({
      message: "Add another agent profile (e.g. a second repo)?",
      initialValue: false,
    });
    if (p.isCancel(addMore)) p.cancel("Setup cancelled.");
  }

  // 4. Write config
  const configPath = path.resolve("jarvis.config.json");
  const config = {
    botNumber: "", // filled after WhatsApp link
    inboxDir: "inbox",
    openGroups: false,
    selfTrigger: true,
    agents,
  };
  const fs = await import("node:fs");
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
  await fs.promises.mkdir(path.resolve(config.inboxDir), { recursive: true });
  p.log.success(`Config written to ${configPath}`);

  // 5. Link WhatsApp (QR inline)
  p.log.step("Linking WhatsApp — scan the QR below with the phone that owns this bot");
  const linkClient = startWhatsApp(config, () => {});
  const timeout = new Promise((_, rej) =>
    setTimeout(() => rej(new Error("timeout")), 180_000)
  );
  try {
    await Promise.race([linkClient.whenReady, timeout]);
    p.log.success("WhatsApp linked! Session saved — you won't need to scan again.");
    const botNumber = `${(linkClient.user?.id ?? "").split(":")[0]}@c.us`;
    if (botNumber.startsWith("@")) throw new Error("could not read number");
    config.botNumber = botNumber;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
  } catch (err) {
    await linkClient.destroy();
    p.log.error(err.message === "timeout" ? "QR scan timed out." : err.message);
    p.outro("Re-run `jarvis` to retry linking.");
    process.exit(1);
  }
  await linkClient.destroy();

  p.note(
    [
      `Agents: ${Object.keys(agents).join(", ")}`,
      `Trigger: type ${pc.cyan("@jarvis <request>")} in a WhatsApp chat`,
      `Groups: send any ${pc.cyan("@jarvis id")} in a group, then paste the id into`,
      `        jarvis.config.json → agents.<name>.groups and restart.`,
    ].join("\n"),
    "You're all set"
  );

  p.outro("Starting Jarvis…");
  return config;
}

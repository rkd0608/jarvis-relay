import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { getState, updateChat } from "./state.js";
import { queueInfo } from "./queue.js";

const COMMANDS = ["help", "status", "id", "new", "use", "sessions"];

export function parseCommand(text) {
  const [first, ...rest] = text.split(/\s+/);
  return { name: (first ?? "").toLowerCase(), args: rest.join(" ") };
}

export function isCommand(name) {
  return COMMANDS.includes(name);
}

export function helpText(agent, chatId) {
  return [
    "*Jarvis* - WhatsApp relay for coding agents",
    "",
    "@jarvis `<request>` - send work (attach screenshots freely)",
    "@jarvis `help` - this message",
    "@jarvis `status` - active agent, backend, session",
    "@jarvis `id` - this chat's id (for jarvis.config.json)",
    "@jarvis `new` - start a fresh session",
    "@jarvis `use <profile|session-id>` - switch agent or attach a session",
    "@jarvis `sessions` - list recent sessions for the current project",
    "",
    `Active agent: *${agent.name}* (${agent.backend})`,
    `Chat id: \`${chatId}\``,
  ].join("\n");
}

function shortId(id) {
  return id ? String(id).slice(0, 8) : "none";
}

function timeAgo(ms) {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

async function listSessions(agent) {
  if (agent.backend === "claude-code") {
    const dir = path.join(
      os.homedir(),
      ".claude",
      "projects",
      agent.projectDir.replaceAll("/", "-")
    );
    const files = await fs.readdir(dir).catch(() => []);
    const entries = await Promise.all(
      files
        .filter((f) => f.endsWith(".jsonl"))
        .map(async (f) => ({
          id: f.replace(/\.jsonl$/, ""),
          mtime: (await fs.stat(path.join(dir, f)).catch(() => ({ mtimeMs: 0 })))
            .mtimeMs,
        }))
    );
    return entries.sort((a, b) => b.mtime - a.mtime).slice(0, 8);
  }

  // codex: ~/.codex/sessions/YYYY/MM/DD/rollout-...-<uuid>.jsonl
  const base = path.join(os.homedir(), ".codex", "sessions");
  const out = [];
  async function walk(dir, depth) {
    if (depth > 4 || out.length >= 40) return;
    let items;
    try {
      items = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const it of items) {
      const full = path.join(dir, it.name);
      if (it.isDirectory()) await walk(full, depth + 1);
      else if (it.isFile() && it.name.endsWith(".jsonl")) {
        const m = it.name.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
        if (m) {
          out.push({
            id: m[1],
            mtime: (await fs.stat(full).catch(() => ({ mtimeMs: 0 }))).mtimeMs,
          });
        }
      }
    }
  }
  await walk(base, 0);
  return out.sort((a, b) => b.mtime - a.mtime).slice(0, 8);
}

export async function handleCommand({ chat, chatId, agent, config, command, args }) {
  const send = async (text) => {
    for (const part of String(text).match(/[\s\S]{1,3500}/g) ?? []) {
      await chat.sendMessage(part);
    }
  };

  switch (command) {
    case "help":
      await send(helpText(agent, chatId));
      break;

    case "id":
      await send(`Chat id: \`${chatId}\``);
      break;

    case "status": {
      const { active, queued } = queueInfo();
      const entry = getState()[chatId] ?? {};
      await send(
        [
          `Agent: *${agent.name}*`,
          `Backend: ${agent.backend}${entry.backendOverride ? " (overridden)" : ""}`,
          `Approval: ${agent.approval ?? "approve-edits"}`,
          `Project: ${agent.projectDir}`,
          `Session: \`${shortId(agent.sessionId)}\`${agent.sessionId ? "" : " (fresh on next request)"}`,
          `Queue: ${active} running, ${queued} waiting`,
        ].join("\n")
      );
      break;
    }

    case "new":
      await updateChat(chatId, { agent: agent.name, sessionId: null });
      await send("Session cleared. Next request starts a fresh conversation.");
      break;

    case "use": {
      const target = args.trim();
      if (!target) {
        await send("Usage: `@jarvis use <profile-name>` or `@jarvis use <session-id>`");
        break;
      }
      if (config.agents[target]) {
        const profile = config.agents[target];
        await updateChat(chatId, {
          agent: target,
          sessionId: profile.sessionId ?? null,
          backendOverride: null,
        });
        await send(
          `Switched to agent *${target}* (${profile.backend}). Session reset.`
        );
      } else if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(target)) {
        await updateChat(chatId, { agent: agent.name, sessionId: target });
        await send(`Attached session \`${shortId(target)}\` to agent *${agent.name}*.`);
      } else {
        await send(
          `Unknown profile or malformed session id: \`${target}\`\n` +
          `Known profiles: ${Object.keys(config.agents).join(", ")}`
        );
      }
      break;
    }

    case "sessions": {
      const rows = await listSessions(agent);
      if (!rows.length) {
        await send(`No sessions found for \`${agent.projectDir}\` (${agent.backend}).`);
        break;
      }
      await send(
        [
          `Recent sessions for \`${agent.projectDir}\`:`,
          ...rows.map((r, i) => `${i + 1}. \`${r.id}\` - ${timeAgo(r.mtime)}`),
          "",
          "Attach one with `@jarvis use <id>`",
        ].join("\n")
      );
      break;
    }

    default:
      await send(`Unknown command. ${helpText(agent, chatId)}`);
  }
}

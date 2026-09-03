import path from "node:path";
import fs from "node:fs/promises";
import { getState, updateChat, setMeta } from "./state.js";
import { isTriggered, stripTrigger, isUserAllowed } from "./auth.js";
import { parseCommand, isCommand, handleCommand, helpText } from "./commands.js";
import { runAgent } from "./backends/index.js";
import { splitMessage } from "./backends/shared.js";
import { enqueue } from "./queue.js";

const PROGRESS_MIN_INTERVAL_MS = 5000;
const PROGRESS_MAX_CHARS = 3000;

export function makeRouter(config) {
  const BOT_PREFIX = "🤖";

  async function send(chat, text, emoji = BOT_PREFIX) {
    const parts = splitMessage(text);
    parts[0] = emoji ? `${emoji} ${parts[0]}` : parts[0];
    for (const part of parts) await chat.sendMessage(part);
  }

  function resolveAgent(chatId, registerId, senderId, isDM) {
    const state = getState();
    const entry = state[chatId] ?? {};

    let name = entry.agent;
    if (!name) {
      name = Object.keys(config.agents).find((k) =>
        (config.agents[k].groups ?? []).some(
          (g) => g === registerId || g === chatId
        )
      );
    }
    if (!name && (config.openGroups || isDM)) {
      name = Object.keys(config.agents)[0]; // default = first profile
    }
    if (!name) return null;

    const base = config.agents[name];
    return {
      ...base,
      name,
      inboxDir: config.inboxDir,
      sessionId: entry.sessionId ?? base.sessionId ?? null,
      backend: entry.backendOverride ?? base.backend,
      _sender: senderId,
    };
  }

  async function downloadImages(msg) {
    if (!msg.hasMedia) return [];
    const media = await msg.downloadMedia();
    const ext = (media.mimetype?.split("/")[1] ?? "bin").split(";")[0];
    const file = path.join(
      config.inboxDir,
      `${Date.now()}-${msg.id.id}.${ext}`
    );
    await fs.writeFile(file, media.data, "base64");
    return [file];
  }

  function makeProgressSender(chat) {
    let lastSent = 0;
    let pending = "";
    const delivered = [];

    async function deliver(text) {
      await chat.sendMessage(`🤖 ${text}`.slice(0, 4000));
      delivered.push(String(text).trim());
    }

    async function send(text) {
      const now = Date.now();
      if (now - lastSent < PROGRESS_MIN_INTERVAL_MS) {
        pending = (pending + "\n\n" + text).slice(-2500);
        return;
      }
      lastSent = now;
      try {
        if (pending) {
          const p = pending;
          pending = "";
          await deliver(p);
        }
        await deliver(text);
      } catch {
        // progress updates are best-effort
      }
    }

    async function flush() {
      if (!pending) return;
      const text = pending;
      pending = "";
      try {
        await deliver(text);
      } catch {}
    }

    return {
      send,
      flush,
      wasSent: (t) => delivered.includes(String(t).trim()),
      pendingText: () => pending,
    };
  }

  async function onMessage(msg) {
    try {
      if (msg.isStatus) return;

      const chatId = msg.from; // transport-prefixed: wa:… / slk:…
      const registerId = msg.registerId ?? chatId.replace(/^\w+:/, "");

      console.log(
        `[msg] ${msg.transport} chat=${chatId} author=${msg.author ?? "-"} ` +
          `fromMe=${!!msg.fromMe} ` +
          `mentions=${JSON.stringify(msg.mentionedIds ?? [])} ` +
          `body=${JSON.stringify((msg.body ?? "").slice(0, 80))}`
      );

      // learn the bot account's lid (WhatsApp migrated mentions to lid ids)
      const ownLid = getState()._meta?.ownLid ?? null;
      if (
        msg.fromMe &&
        msg.transport === "whatsapp" &&
        msg.isGroup &&
        msg.author?.endsWith("@lid") &&
        ownLid !== msg.author
      ) {
        await setMeta({ ownLid: msg.author });
      }

      if (!isTriggered(msg, config, getState()._meta?.ownLid ?? null)) return;

      const sender = msg.fromMe
        ? config.botNumber || config.slack?.botUserId
        : (msg.author ?? msg.from);
      const agent = resolveAgent(chatId, registerId, sender, msg.isDM);

      if (!agent) {
        await msg.reply(
          `🤖 Unregistered chat \`${registerId}\`.\n` +
            "Add this id to an agent's `groups` in jarvis.config.json " +
            "(or set openGroups: true), then restart."
        );
        return;
      }
      if (!isUserAllowed(agent, sender, config)) return;

      const chat = await msg.getChat();
      const text = stripTrigger(msg, config);
      if (!text) {
        await send(chat, helpText(agent, registerId));
        return;
      }

      const cmd = parseCommand(text);
      if (isCommand(cmd.name)) {
        await handleCommand({
          chat,
          chatId,
          registerId,
          agent,
          config,
          command: cmd.name,
          args: cmd.args,
        });
        return;
      }

      await chat.sendStateTyping();

      let images = [];
      if (msg.hasMedia) {
        try {
          images = await downloadImages(msg);
        } catch (err) {
          await send(chat, `Could not download attachment: ${err.message}`);
        }
      }

      enqueue(async () => {
        const live = resolveAgent(chatId, registerId, sender, msg.isDM); // fresh state at run time
        const progress = makeProgressSender(chat);
        try {
          await chat.sendStateTyping();
          const { summary, sessionId } = await runAgent(
            live,
            text,
            images,
            progress.send
          );

          if (sessionId && sessionId !== live.sessionId) {
            await updateChat(chatId, { agent: live.name, sessionId });
          }

          // skip duplicates: pending == summary → drop it (final covers it)
          const summaryText = String(summary ?? "").trim();
          if (progress.pendingText().trim() !== summaryText) {
            await progress.flush().catch(() => {});
          }
          if (!progress.wasSent(summaryText)) {
            await send(chat, `✅ ${summary}`);
          }
        } catch (err) {
          console.error("Job failed:", err);
          await send(chat, `❌ ${err.message ?? String(err)}`);
        } finally {
          try {
            await chat.clearState();
          } catch {}
        }
      }).catch(() => {});
    } catch (err) {
      console.error("Handler error:", err);
    }
  }

  return onMessage;
}

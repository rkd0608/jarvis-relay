import bolt from "@slack/bolt";

const { App } = bolt;

const MENTION_RE = /<@([A-Z0-9]+)(?:\|[^>]*)?>/g;

// Slack thread = one resumable agent session.
//   chat id  slk:C123456            → channel-level
//   chat id  slk:C123456:t<ts>      → thread-scoped session
export function startSlack(config, onMessage) {
  const { botToken, appToken } = config.slack;

  const app = new App({
    token: botToken,
    appToken,
    socketMode: true,
    processBeforeResponse: true,
  });

  let resolveReady;
  const whenReady = app.start().then(() => {
    console.log("Slack connected (Socket Mode)");
    resolveReady?.();
  });

  function normalize(event) {
    // ignore edits/deletes/bot echoes/our own messages
    if (event.subtype) return null;
    if (event.bot_id || event.bot_profile) return null;
    if (!event.user || !event.channel) return null;

    const isThread = !!event.thread_ts;
    const channel = event.channel;
    const registerId = channel; // bare id for config.groups
    const chatId = isThread
      ? `slk:${channel}:t${event.thread_ts}`
      : `slk:${channel}`;
    const isDM = channel.startsWith("D");

    const rawBody = event.text ?? "";
    const mentionedIds = [...rawBody.matchAll(MENTION_RE)].map((m) => m[1]);

    const files = Array.isArray(event.files) ? event.files : [];
    const mediaRef = files.find((f) => f.url_private_download || f.url_private);

    const msg = {
      transport: "slack",
      from: chatId,
      registerId,
      isGroup: !isDM,
      isDM,
      body: rawBody,
      fromMe: false,
      author: event.user,
      mentionedIds,
      hasMedia: !!mediaRef,
      id: { id: event.ts ?? `${Date.now()}` },
      _raw: event,
    };

    msg.downloadMedia = async () => {
      if (!mediaRef) throw new Error("no media on message");
      const res = await fetch(mediaRef.url_private_download ?? mediaRef.url_private, {
        headers: { Authorization: `Bearer ${botToken}` },
      });
      if (!res.ok) throw new Error(`Slack file download failed: ${res.status}`);
      const buffer = Buffer.from(await res.arrayBuffer());
      return {
        data: buffer.toString("base64"),
        mimetype: mediaRef.mimetype ?? "application/octet-stream",
      };
    };

    const post = (text) =>
      app.client.chat.postMessage({
        channel,
        thread_ts: event.thread_ts ?? event.ts, // always keep conversation in-thread
        text,
      });

    msg.getChat = async () => ({
      async sendStateTyping() {}, // Slack API has no typing indicator
      async clearState() {},
      async sendMessage(text) {
        return post(text);
      },
    });

    msg.reply = (text) => post(text);

    return msg;
  }

  app.event("message", async ({ event }) => {
    const msg = normalize(event);
    if (msg) await onMessage(msg);
  });
  // app_mention also fires for mentions; dedupe by ignoring it since the
  // message event carries the same text with <@U…> markup
  app.event("app_mention", async () => {});

  return {
    whenReady,
    get user() {
      return null;
    },
    async destroy() {
      try {
        await app.stop();
      } catch {}
    },
  };
}

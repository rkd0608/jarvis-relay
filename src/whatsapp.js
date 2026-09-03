import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  downloadContentFromMessage,
} from "@whiskeysockets/baileys";
import qrcode from "qrcode-terminal";

const AUTH_DIR = "session-baileys";

// Baileys uses @s.whatsapp.net for individuals; the rest of the bot
// (config, auth, state) speaks @c.us. LIDs and group ids pass through.
const toWweb = (jid) =>
  typeof jid === "string" && jid.endsWith("@s.whatsapp.net")
    ? jid.replace("@s.whatsapp.net", "@c.us")
    : jid;

const toBaileys = (jid) =>
  typeof jid === "string" && jid.endsWith("@c.us")
    ? jid.replace("@c.us", "@s.whatsapp.net")
    : jid;

function extractContent(message) {
  let m = message;
  if (m?.ephemeralMessage) m = m.ephemeralMessage.message;
  if (m?.viewOnceMessage) m = m.viewOnceMessage.message;
  if (m?.documentWithCaptionMessage) m = m.documentWithCaptionMessage.message;
  return m ?? {};
}

const MEDIA_KINDS = {
  imageMessage: "image",
  videoMessage: "video",
  documentMessage: "document",
  audioMessage: "audio",
  stickerMessage: "sticker",
};

function startWhatsApp(config, onMessage) {
  let sock = null;
  let shuttingDown = false;
  let resolveReady;
  const whenReady = new Promise((r) => (resolveReady = r));

  async function connect() {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    let version;
    try {
      ({ version } = await fetchLatestBaileysVersion());
    } catch {
      version = undefined; // baileys falls back to its baked-in version
    }

    sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      syncFullHistory: false,
      markOnlineOnConnect: false,
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        console.log("\nScan this QR in WhatsApp > Settings > Linked Devices:\n");
        qrcode.generate(qr, { small: true });
      }
      if (connection === "open") {
        console.log(
          `WhatsApp connected. Bot id: ${sock.user?.id?.split(":")[0]}@c.us`
        );
        resolveReady?.();
        resolveReady = null;
      }
      if (connection === "close") {
        const code = lastDisconnect?.error?.output?.statusCode;
        if (code === DisconnectReason.loggedOut || shuttingDown) {
          console.error("WhatsApp logged out — delete session-baileys and re-scan.");
          return;
        }
        console.warn(`Connection closed (${code}); reconnecting in 3s…`);
        setTimeout(() => connect().catch(console.error), 3000);
      }
    });

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return;
      for (const raw of messages) {
        try {
          const msg = normalize(raw, sock);
          if (msg) await onMessage(msg);
        } catch (err) {
          console.error("normalize/handler error:", err);
        }
      }
    });
  }

  function normalize(raw, sock) {
    const jid = toWweb(raw.key.remoteJid);
    if (!jid || jid === "status@broadcast") return null;

    const content = extractContent(raw.message);
    const isGroup = jid.endsWith("@g.us");
    const fromMe = !!raw.key.fromMe;

    const body =
      content.conversation ??
      content.extendedTextMessage?.text ??
      content.imageMessage?.caption ??
      content.videoMessage?.caption ??
      content.documentMessage?.caption ??
      "";

    const mentionedIds = [
      ...(content.extendedTextMessage?.contextInfo?.mentionedJid ?? []),
      ...(content.imageMessage?.contextInfo?.mentionedJid ?? []),
      ...(content.videoMessage?.contextInfo?.mentionedJid ?? []),
    ].map(toWweb);

    let mediaKind = null;
    let mediaNode = null;
    for (const [key, node] of Object.entries(content)) {
      if (MEDIA_KINDS[key] && node?.url) {
        mediaKind = MEDIA_KINDS[key];
        mediaNode = node;
        break;
      }
    }

    const author = isGroup ? toWweb(raw.key.participant) : undefined;

    const msg = {
      isStatus: false,
      transport: "whatsapp",
      from: `wa:${jid}`,
      registerId: jid,
      isGroup,
      isDM: !isGroup,
      body: body ?? "",
      fromMe,
      author,
      mentionedIds,
      hasMedia: !!mediaKind,
      id: { id: raw.key.id ?? `${Date.now()}` },
      _raw: raw,
    };

    msg.downloadMedia = async () => {
      if (!mediaKind) throw new Error("no media on message");
      const stream = await downloadContentFromMessage(mediaNode, mediaKind);
      let buffer = Buffer.alloc(0);
      for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
      return {
        data: buffer.toString("base64"),
        mimetype: mediaNode.mimetype ?? "application/octet-stream",
      };
    };

    msg.getChat = async () => ({
      async sendStateTyping() {
        await sock
          .sendPresenceUpdate("composing", toBaileys(jid))
          .catch(() => {});
      },
      async clearState() {
        await sock.sendPresenceUpdate("paused", toBaileys(jid)).catch(() => {});
      },
      async sendMessage(text) {
        return sock.sendMessage(toBaileys(jid), { text });
      },
    });

    msg.reply = (text) =>
      sock.sendMessage(toBaileys(jid), { text, quoted: raw });

    return msg;
  }

  connect().catch((err) => {
    console.error("Failed to start WhatsApp:", err);
    process.exit(1);
  });

  return {
    whenReady,
    get user() {
      return sock?.user;
    },
    async destroy() {
      shuttingDown = true;
      try {
        sock?.end(new Error("shutdown"));
      } catch {}
    },
  };
}

export { startWhatsApp };

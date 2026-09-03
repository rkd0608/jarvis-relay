import { startWhatsApp } from "./whatsapp.js";
import { startSlack } from "./slack.js";

// Starts every transport the config enables. Returns a unified handle:
// { whenReady, destroy }
export function startTransports(config, onMessage) {
  const clients = [];

  if (config.whatsapp !== false && config.botNumber) {
    clients.push(startWhatsApp(config, onMessage));
  }
  if (config.slack?.botToken && config.slack?.appToken) {
    clients.push(startSlack(config, onMessage));
  }

  const whenReady = Promise.all(
    clients.map((c) => c.whenReady.catch((err) => console.error(err.message)))
  ).then(() => {});

  return {
    whenReady,
    destroy: async () => {
      for (const c of clients) await c.destroy().catch(() => {});
    },
  };
}

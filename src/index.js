import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadConfig } from "./config.js";
import { loadState } from "./state.js";
import { startWhatsApp } from "./whatsapp.js";
import { makeRouter } from "./router.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root); // session/, inbox/, jarvis.state.json resolve from here

export async function runBot(config) {
  await loadState();
  console.log("Jarvis starting…");

  const client = startWhatsApp(config, makeRouter(config));

  const shutdown = () => {
    console.log("\nShutting down…");
    client
      .destroy()
      .catch(() => {})
      .finally(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

// direct invocation: `node src/index.js`
const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const config = await loadConfig();
  await runBot(config);
}

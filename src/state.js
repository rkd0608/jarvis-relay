import fs from "node:fs/promises";

const FILE = "jarvis.state.json";

let state = {};

export async function loadState() {
  try {
    state = JSON.parse(await fs.readFile(FILE, "utf8"));
  } catch {
    state = {};
  }
  migrateState();
  return state;
}

// v1.0 stored raw WhatsApp ids; v1.1 prefixes by transport (wa:, slk:)
function migrateState() {
  for (const key of Object.keys(state)) {
    if (key === "_meta") continue;
    if (/(^wa:|^slk:)/.test(key)) continue;
    if (/(@g\.us|@c\.us|@lid)$/.test(key)) {
      state[`wa:${key}`] = state[key];
      delete state[key];
    }
  }
}

export function getState() {
  return state;
}

export async function saveState() {
  await fs.writeFile(FILE, JSON.stringify(state, null, 2) + "\n");
}

export async function updateChat(chatId, patch) {
  state[chatId] = { ...(state[chatId] ?? {}), ...patch };
  await saveState();
  return state[chatId];
}

export async function setMeta(patch) {
  state._meta = { ...(state._meta ?? {}), ...patch };
  await saveState();
  return state._meta;
}

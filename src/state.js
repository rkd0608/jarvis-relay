import fs from "node:fs/promises";

const FILE = "jarvis.state.json";

let state = {};

export async function loadState() {
  try {
    state = JSON.parse(await fs.readFile(FILE, "utf8"));
  } catch {
    state = {};
  }
  return state;
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

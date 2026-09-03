import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function hasBinary(cmd) {
  try {
    await execFileAsync("which", [cmd]);
    return true;
  } catch {
    return false;
  }
}

function classifyClaudeOutput(out) {
  if (/not logged in|please run \/login/i.test(out)) {
    return { authed: false, reason: "not logged in — run `claude` and log in" };
  }
  if (/session limit|usage limit|rate.?limit/i.test(out)) {
    return {
      authed: true,
      reason: "authenticated (usage limit reached — resets later)",
    };
  }
  if (/\bOK\b/i.test(out)) return { authed: true, reason: "authenticated" };
  return { authed: false, reason: "could not verify (unexpected response)" };
}

async function claudeAuthed() {
  let out = "";
  try {
    const { stdout, stderr } = await execFileAsync(
      "claude",
      ["-p", "Reply with exactly: OK"],
      { timeout: 90_000 }
    );
    out = `${stdout} ${stderr}`;
  } catch (err) {
    out = `${err.stdout ?? ""} ${err.stderr ?? ""} ${err.message ?? ""}`;
  }
  return classifyClaudeOutput(out);
}

function codexAuthed() {
  return fs.existsSync(path.join(os.homedir(), ".codex", "auth.json"));
}

export async function checkClaude(verbose = true) {
  const installed = await hasBinary("claude");
  if (!installed) {
    return {
      installed: false,
      authed: false,
      detail: "CLI not found",
      installHint: "npm i -g @anthropic-ai/claude-code",
      loginHint: "run `claude` and complete login (subscription or API key)",
    };
  }
  const { authed, reason } = await claudeAuthed();
  return {
    installed: true,
    authed,
    detail: reason,
    loginHint: "run `claude` and complete login",
  };
}

export async function checkCodex() {
  const installed = await hasBinary("codex");
  if (!installed) {
    return {
      installed: false,
      authed: false,
      detail: "CLI not found",
      installHint: "npm i -g @openai/codex",
      loginHint: "run `codex login`",
    };
  }
  const authed = codexAuthed();
  return {
    installed: true,
    authed,
    detail: authed ? "CLI installed + authenticated" : "installed but not logged in",
    loginHint: "run `codex login`",
  };
}

export function checkNode() {
  const major = Number(process.versions.node.split(".")[0]);
  return {
    ok: major >= 20,
    version: process.versions.node,
  };
}

export function whatsappLinked() {
  const dir = path.resolve("session-baileys");
  try {
    return fs.readdirSync(dir).some((f) => f.startsWith("creds"));
  } catch {
    return false;
  }
}

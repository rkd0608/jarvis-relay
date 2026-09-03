import { query } from "@anthropic-ai/claude-agent-sdk";
import { buildPrompt } from "./shared.js";

const APPROVAL_MODES = {
  "read-only": "plan",
  "approve-edits": "acceptEdits",
  "full-auto": "bypassPermissions",
};

export async function runClaude(agent, prompt, images, onProgress) {
  const options = {
    cwd: agent.projectDir,
    maxTurns: agent.maxTurns ?? 40,
    additionalDirectories: agent.inboxDir ? [agent.inboxDir] : undefined,
  };

  const mode = APPROVAL_MODES[agent.approval ?? "approve-edits"];
  if (mode) options.permissionMode = mode;
  if (agent.allowedTools?.length) options.allowedTools = agent.allowedTools;
  if (agent.systemPrompt) options.systemPrompt = agent.systemPrompt;
  if (agent.sessionId) options.resume = agent.sessionId;

  let final = null;
  for await (const message of query({
    prompt: buildPrompt(prompt, images),
    options,
  })) {
    if (message.type === "assistant" && onProgress) {
      const text = (message.message?.content ?? [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      if (text) await onProgress(text);
    }
    if (message.type === "result") final = message;
  }

  return {
    summary: final?.result ?? "Done.",
    sessionId: final?.session_id ?? agent.sessionId ?? null,
  };
}

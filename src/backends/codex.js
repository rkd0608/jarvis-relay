import { spawn } from "node:child_process";
import { buildPrompt } from "./shared.js";

const APPROVAL_FLAGS = {
  "read-only": ["--sandbox", "read-only"],
  "approve-edits": ["--full-auto"],
  "full-auto": ["--dangerously-bypass-approvals-and-sandbox"],
};

function extractAgentText(evt) {
  if (evt?.type === "item.completed" && evt.item?.type === "agent_message") {
    return evt.item.text;
  }
  if (evt?.msg?.type === "agent_message") return evt.msg.message;
  if (evt?.type === "agent_message") return evt.message ?? evt.text;
  return null;
}

export function runCodex(agent, prompt, images, onProgress) {
  return new Promise((resolve, reject) => {
    const args = [
      "exec",
      "--json",
      "--skip-git-repo-check",
      "-C",
      agent.projectDir,
      ...(APPROVAL_FLAGS[agent.approval ?? "approve-edits"] ??
        APPROVAL_FLAGS["approve-edits"]),
    ];
    if (agent.sessionId) args.push("resume", agent.sessionId);
    args.push(buildPrompt(prompt, images));

    const child = spawn("codex", args, { stdio: ["ignore", "pipe", "pipe"] });

    let sessionId = agent.sessionId ?? null;
    let lastMessage = "";
    let stderr = "";

    child.stdout.on("data", async (chunk) => {
      for (const line of chunk.toString().split("\n")) {
        if (!line.trim()) continue;
        let evt;
        try {
          evt = JSON.parse(line);
        } catch {
          continue;
        }
        sessionId =
          evt.session_id ?? evt.thread_id ?? evt.thread?.id ?? sessionId;
        const text = extractAgentText(evt);
        if (typeof text === "string" && text.trim()) {
          lastMessage = text.trim();
          if (onProgress) await onProgress(lastMessage.slice(0, 2000));
        }
      }
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) =>
      reject(new Error(`codex CLI not found / failed to start: ${err.message}`))
    );

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ summary: lastMessage || "Done.", sessionId });
      } else {
        reject(
          new Error(`codex exited with code ${code}\n${stderr.slice(-800)}`)
        );
      }
    });
  });
}
